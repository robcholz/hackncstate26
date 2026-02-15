import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

import { app, BrowserWindow, ipcMain, Notification, screen, shell } from "electron";
import type { Input } from "electron";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_START_URL = process.env.ELECTRON_START_URL ?? "http://127.0.0.1:3000";
const APP_ORIGIN = new URL(DEFAULT_START_URL).origin;
const PREVIEW_ROUTE = "/open";
const CUSTOM_PROTOCOL = "phishinglens";
const PASTE_SHORTCUT_CHANNEL = "clipboard:paste-shortcut-detected";
const SHOW_OVERLAY_CHANNEL = "clipboard:show-overlay";
const OPEN_EXTERNAL_CHANNEL = "shell:open-external";
const CLIPBOARD_CAPTURE_CHANNEL = "clipboard:capture";
const MAX_CLIPBOARD_EVENTS = 200;
const OVERLAY_HIDE_MS = 1400;
const PASTE_PROMPT_MESSAGE = "Are you sure you want to paste?";
const PASTE_CONFIRM_MESSAGE = "Paste paused. Press paste again within 2.5s to confirm.";
const PASTE_ENTROPY_MESSAGE = "Possible secret detected. Paste paused. Press paste again within 2.5s to confirm.";
const PASTE_MONITOR_RESTART_MS = 2200;
const INPUT_MONITORING_SETTINGS_URL = "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent";
const ACCESSIBILITY_SETTINGS_URL = "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";

interface ClipboardCapturePayload {
  kind: "paste" | "shortcut";
  page: string;
  target_tag: string | null;
  url_context: string | null;
  clipboard_text: string;
  clipboard_text_length: number;
  clipboard_text_truncated: boolean;
  blocked: boolean;
  entropy: number | null;
  captured_at: string;
}

interface ClipboardCaptureEvent extends ClipboardCapturePayload {
  event_id: string;
}

let mainWindow: BrowserWindow | null = null;
let pendingTargetUrl = extractIncomingUrl(process.argv);
let overlayWindows: BrowserWindow[] = [];
let overlayHideTimer: ReturnType<typeof setTimeout> | null = null;
let pasteMonitorProcess: ReturnType<typeof spawn> | null = null;
let pasteMonitorRestartTimer: ReturnType<typeof setTimeout> | null = null;
let didOpenPermissionSettings = false;
let didLogPasteMonitorReady = false;
let isAppQuitting = false;
let lastSystemNotificationAt = 0;
const clipboardEvents: ClipboardCaptureEvent[] = [];

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

app.on("second-instance", (_event, argv) => {
  const incomingUrl = extractIncomingUrl(argv);
  if (incomingUrl) {
    routeIncomingUrl(incomingUrl);
  }

  focusMainWindow();
});

app.on("open-url", (event, incomingUrl) => {
  event.preventDefault();
  routeIncomingUrl(incomingUrl);
});

app.whenReady().then(() => {
  registerProtocolClients();
  registerIpcHandlers();
  registerDisplayWatchers();
  rebuildOverlayWindows();
  createMainWindow();
  void startMacPasteMonitor();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
      return;
    }

    focusMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  isAppQuitting = true;
});

app.on("will-quit", () => {
  stopMacPasteMonitor();
  destroyOverlayWindows();
});

function createMainWindow() {
  const startUrl = pendingTargetUrl ? buildPreviewUrl(pendingTargetUrl) : buildShellUrl();

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 900,
    minHeight: 560,
    backgroundColor: "#05080d",
    title: "Phishing Lens",
    titleBarStyle: "hiddenInset",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js")
    }
  });

  mainWindow.loadURL(startUrl).catch((error) => {
    console.error("Failed to load renderer URL:", error);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openInRealBrowser(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isInternalUrl(url)) return;

    event.preventDefault();
    openInRealBrowser(url);
  });

  mainWindow.webContents.on("before-input-event", (_event, input) => {
    if (!isPasteShortcutInput(input)) return;
    handlePasteShortcutDetected("app-window");
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function openInRealBrowser(url: string) {
  if (typeof url !== "string" || url.length === 0) return;

  // Cheap guard: only open http(s) externally.
  if (!/^https?:/i.test(url)) return;

  console.info(`[shell] open external: ${url}`);

  // macOS: explicitly use Safari (not the system default browser) to avoid
  // recursion when Phishing Lens is set as the default handler for http/https.
  if (process.platform === "darwin") {
    try {
      showPasteNotification("Opening in Safari.");
      const child = spawn("/usr/bin/open", ["-a", "Safari", url], {
        stdio: "ignore",
        detached: true
      });
      child.unref();
      return;
    } catch {
      // fall through
    }
  }

  shell.openExternal(url).catch(() => {});
}

function registerIpcHandlers() {
  ipcMain.on(SHOW_OVERLAY_CHANNEL, () => {
    showSystemPasteOverlay();
  });

  ipcMain.on(OPEN_EXTERNAL_CHANNEL, (_event, url) => {
    openInRealBrowser(typeof url === "string" ? url : "");
  });

  ipcMain.on(CLIPBOARD_CAPTURE_CHANNEL, (_event, payload) => {
    const parsed = parseClipboardCapturePayload(payload);
    if (!parsed) return;

    clipboardEvents.unshift(parsed);
    if (clipboardEvents.length > MAX_CLIPBOARD_EVENTS) {
      clipboardEvents.length = MAX_CLIPBOARD_EVENTS;
    }
  });
}

function registerDisplayWatchers() {
  screen.on("display-added", rebuildOverlayWindows);
  screen.on("display-removed", rebuildOverlayWindows);
  screen.on("display-metrics-changed", rebuildOverlayWindows);
}

function rebuildOverlayWindows() {
  destroyOverlayWindows();

  for (const display of screen.getAllDisplays()) {
    const overlayWindow = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      frame: false,
      type: "toolbar",
      transparent: true,
      show: false,
      focusable: false,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      hasShadow: false,
      fullscreenable: false,
      backgroundColor: "#00000000",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    overlayWindow.setAlwaysOnTop(true, "screen-saver", 999);
    overlayWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true
    });
    overlayWindow.setHiddenInMissionControl(true);

    // On macOS fullscreen Spaces, we sometimes need to show the window once to
    // ensure it joins all workspaces (including fullscreen) before future show/hide.
    overlayWindow.once("ready-to-show", () => {
      overlayWindow.setAlwaysOnTop(true, "screen-saver", 999);
      overlayWindow.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true,
        skipTransformProcessType: true
      });
      overlayWindow.showInactive();
      overlayWindow.hide();
    });

    overlayWindow.loadURL(buildOverlayWindowHtml()).catch((error) => {
      console.error("Failed to load overlay window:", error);
    });

    overlayWindows.push(overlayWindow);
  }
}

function destroyOverlayWindows() {
  if (overlayHideTimer) {
    clearTimeout(overlayHideTimer);
    overlayHideTimer = null;
  }

  for (const overlayWindow of overlayWindows) {
    if (!overlayWindow.isDestroyed()) {
      overlayWindow.destroy();
    }
  }

  overlayWindows = [];
}

function buildOverlayWindowHtml() {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: transparent;
      }
      body {
        display: grid;
        place-items: center;
        pointer-events: none;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .backdrop {
        position: fixed;
        inset: 0;
        background: radial-gradient(circle at center, rgba(8, 14, 22, 0.26), rgba(8, 14, 22, 0.56));
        backdrop-filter: blur(1px);
      }
      .pill {
        position: relative;
        z-index: 1;
        border: 1px solid rgba(127, 150, 165, 0.5);
        border-radius: 999px;
        padding: 11px 18px;
        font-size: 15px;
        color: #edf2f6;
        background: linear-gradient(180deg, rgba(10, 18, 27, 0.9), rgba(8, 13, 20, 0.9));
        box-shadow: 0 14px 36px rgba(0, 0, 0, 0.44), 0 0 0 1px rgba(74, 210, 217, 0.13) inset;
      }
    </style>
  </head>
  <body>
    <div class="backdrop"></div>
    <div class="pill" id="overlay-message">Are you sure you want to paste?</div>
    <script>
      window.setOverlayMessage = (message) => {
        const messageNode = document.getElementById("overlay-message");
        if (!messageNode) return;
        if (typeof message !== "string" || message.length === 0) return;
        messageNode.textContent = message;
      };
    </script>
  </body>
</html>`;

  return `data:text/html;charset=UTF-8,${encodeURIComponent(html)}`;
}

function showSystemPasteOverlay(message: string = PASTE_PROMPT_MESSAGE) {
  if (overlayWindows.length === 0) {
    rebuildOverlayWindows();
  }

  for (const overlayWindow of overlayWindows) {
    if (!overlayWindow.isDestroyed()) {
      const escapedMessage = JSON.stringify(message);
      overlayWindow.webContents
        .executeJavaScript(`window.setOverlayMessage?.(${escapedMessage});`, true)
        .catch(() => {});
      overlayWindow.setAlwaysOnTop(true, "screen-saver", 999);
      overlayWindow.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true,
        skipTransformProcessType: true
      });
      overlayWindow.showInactive();
      overlayWindow.moveTop();
    }
  }

  if (overlayHideTimer) {
    clearTimeout(overlayHideTimer);
  }

  overlayHideTimer = setTimeout(() => {
    for (const overlayWindow of overlayWindows) {
      if (!overlayWindow.isDestroyed()) {
        overlayWindow.hide();
      }
    }

    overlayHideTimer = null;
  }, OVERLAY_HIDE_MS);

  showPasteNotification(message);
}

function showPasteNotification(message: string) {
  if (process.platform !== "darwin") return;
  if (!Notification?.isSupported?.()) return;
  if (typeof message !== "string" || message.length === 0) return;

  const now = Date.now();
  if (now - lastSystemNotificationAt < 1100) return;
  lastSystemNotificationAt = now;

  try {
    new Notification({
      title: "Phishing Lens",
      body: message,
      silent: true
    }).show();
  } catch {
    // ignore: notifications can be disabled/unsupported
  }
}

function handlePasteShortcutDetected(source = "unknown", details: Record<string, unknown> = {}) {
  const blocked = details?.blocked === true;
  const reason = typeof details?.reason === "string" ? details.reason : null;
  const entropy = typeof details?.entropy === "number" ? details.entropy : null;
  const clipboardLength = Number.isInteger(details?.clipboardLength) ? details.clipboardLength : null;
  const prompt = details?.prompt !== false;

  console.info(`[paste] shortcut detected via ${source}${blocked ? " (blocked)" : ""}`);
  const message = blocked
    ? reason === "entropy"
      ? PASTE_ENTROPY_MESSAGE
      : PASTE_CONFIRM_MESSAGE
    : PASTE_PROMPT_MESSAGE;

  if (prompt) {
    showSystemPasteOverlay(message);
  }

  mainWindow?.webContents.send(PASTE_SHORTCUT_CHANNEL, {
    source,
    blocked,
    reason,
    entropy,
    clipboard_length: clipboardLength
  });
}

async function startMacPasteMonitor() {
  if (process.platform !== "darwin") return;
  if (pasteMonitorProcess && !pasteMonitorProcess.killed) return;

  // In packaged builds, the app runs from an ASAR. External tools like `swiftc`
  // cannot read source files inside ASAR paths, so we copy the Swift source to
  // a real filesystem location first.
  const bundledSourcePath = path.join(__dirname, "../macos-paste-monitor.swift");
  const extractedSourcePath = path.join(app.getPath("userData"), "phishinglens-paste-monitor.swift");
  const sourcePath = await ensurePasteMonitorSource(bundledSourcePath, extractedSourcePath);
  if (!sourcePath) return;

  const binaryPath = path.join(app.getPath("userData"), "phishinglens-paste-monitor");

  const ready = await ensurePasteMonitorBinary(sourcePath, binaryPath);
  if (!ready) {
    showPasteNotification(
      "Paste monitor failed to start. If packaged, ensure Xcode CLT is installed and permissions are granted."
    );
    return;
  }

  const child = spawn(binaryPath, [], {
    stdio: ["ignore", "pipe", "pipe"]
  });

  pasteMonitorProcess = child;

  const stdoutReader = readline.createInterface({ input: child.stdout });
  stdoutReader.on("line", (line) => {
    const parsed = parsePasteMonitorLine(line);
    if (!parsed) return;

    if (parsed.type === "paste-shortcut") {
      handlePasteShortcutDetected("mac-monitor");
      return;
    }

    if (parsed.type === "paste-blocked") {
      handlePasteShortcutDetected("mac-monitor", {
        blocked: true,
        reason: parsed.reason,
        entropy: parsed.entropy,
        clipboardLength: parsed.clipboard_length,
        prompt: true
      });
      return;
    }

    if (parsed.type === "paste-allowed") {
      handlePasteShortcutDetected("mac-monitor", {
        blocked: false,
        reason: parsed.reason,
        entropy: parsed.entropy,
        clipboardLength: parsed.clipboard_length,
        prompt: false
      });
      return;
    }

    if (parsed.type === "monitor-ready" && !didLogPasteMonitorReady) {
      didLogPasteMonitorReady = true;
      console.info("Paste monitor ready: global Cmd+V interception active.");
      showPasteNotification("Paste monitor active. Press paste twice to confirm.");
    }
  });

  const stderrReader = readline.createInterface({ input: child.stderr });
  stderrReader.on("line", (line) => {
    handlePasteMonitorStderr(line);
  });

  child.on("exit", (code, signal) => {
    pasteMonitorProcess = null;
    stdoutReader.close();
    stderrReader.close();

    if (isAppQuitting) return;

    if (code !== 0) {
      console.warn(`Paste monitor exited (code=${code ?? "null"}, signal=${signal ?? "null"})`);
    }

    schedulePasteMonitorRestart();
  });
}

async function ensurePasteMonitorSource(
  bundledSourcePath: string,
  extractedSourcePath: string
): Promise<string | null> {
  try {
    const data = await fs.readFile(bundledSourcePath);
    await fs.writeFile(extractedSourcePath, data);
    return extractedSourcePath;
  } catch (error) {
    console.warn("Unable to extract macOS paste monitor source:", error);
    return null;
  }
}

function stopMacPasteMonitor() {
  if (pasteMonitorRestartTimer) {
    clearTimeout(pasteMonitorRestartTimer);
    pasteMonitorRestartTimer = null;
  }

  if (!pasteMonitorProcess || pasteMonitorProcess.killed) return;
  pasteMonitorProcess.kill("SIGTERM");
  pasteMonitorProcess = null;
}

function schedulePasteMonitorRestart() {
  if (isAppQuitting) return;
  if (pasteMonitorRestartTimer) return;

  pasteMonitorRestartTimer = setTimeout(() => {
    pasteMonitorRestartTimer = null;
    void startMacPasteMonitor();
  }, PASTE_MONITOR_RESTART_MS);
}

function parsePasteMonitorLine(line: string) {
  if (typeof line !== "string" || line.length === 0) return null;

  try {
    const parsed = JSON.parse(line);
    if (!parsed || typeof parsed !== "object") return null;

    const candidate = parsed;

    if (candidate.type === "paste-shortcut" || candidate.type === "monitor-ready") {
      return candidate;
    }

    if (candidate.type === "paste-blocked" || candidate.type === "paste-allowed") {
      const reason = typeof candidate.reason === "string" ? candidate.reason : null;
      const entropy = typeof candidate.entropy === "number" ? candidate.entropy : null;
      const clipboardLength =
        typeof candidate.length === "number" && Number.isFinite(candidate.length)
          ? Math.max(0, Math.trunc(candidate.length))
          : null;

      return {
        type: candidate.type,
        reason,
        entropy,
        clipboard_length: clipboardLength
      };
    }

    return null;
  } catch {
    return null;
  }
}

function handlePasteMonitorStderr(line: string) {
  const text = line.trim();
  if (text.length === 0) return;

  if (text === "monitor_permission_required") {
    if (!didOpenPermissionSettings) {
      didOpenPermissionSettings = true;
      console.warn("Global paste monitoring needs macOS Input Monitoring/Accessibility permission.");
      shell.openExternal(INPUT_MONITORING_SETTINGS_URL).catch(() => {});
      shell.openExternal(ACCESSIBILITY_SETTINGS_URL).catch(() => {});
      showPasteNotification("Enable Input Monitoring + Accessibility for Phishing Lens to intercept paste.");
    }

    return;
  }

  console.warn("[paste-monitor]", text);
}

async function ensurePasteMonitorBinary(sourcePath: string, binaryPath: string): Promise<boolean> {
  try {
    const [sourceStat, binaryStat] = await Promise.all([statSafe(sourcePath), statSafe(binaryPath)]);
    const needsCompile =
      !binaryStat ||
      !sourceStat ||
      sourceStat.mtimeMs > binaryStat.mtimeMs ||
      sourceStat.size === 0 ||
      binaryStat.size === 0;

    if (!needsCompile) {
      return true;
    }

    return await compilePasteMonitor(sourcePath, binaryPath);
  } catch (error) {
    console.warn("Unable to initialize macOS paste monitor:", error);
    return false;
  }
}

async function compilePasteMonitor(sourcePath: string, binaryPath: string): Promise<boolean> {
  return await new Promise((resolve) => {
    const compiler = spawn("xcrun", ["swiftc", "-O", sourcePath, "-o", binaryPath], {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stderrText = "";
    compiler.stderr.on("data", (chunk) => {
      stderrText += chunk.toString();
    });

    compiler.on("error", (error) => {
      console.warn("Failed to launch Swift compiler for paste monitor:", error);
      resolve(false);
    });

    compiler.on("exit", (code) => {
      if (code === 0) {
        resolve(true);
        return;
      }

      console.warn("Failed to compile macOS paste monitor:", stderrText.trim());
      resolve(false);
    });
  });
}

async function statSafe(filePath: string): Promise<Awaited<ReturnType<typeof fs.stat>> | null> {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;
  }
}

function isPasteShortcutInput(input: Input) {
  if (!input || input.type !== "keyDown") return false;
  if (input.alt || input.shift) return false;
  if (!(input.meta || input.control)) return false;
  return typeof input.key === "string" && input.key.toLowerCase() === "v";
}

function routeIncomingUrl(rawUrl: string) {
  const targetUrl = normalizeIncomingUrl(rawUrl);
  if (!targetUrl) return false;

  pendingTargetUrl = targetUrl;
  if (mainWindow) {
    mainWindow.loadURL(buildPreviewUrl(targetUrl)).catch((error) => {
      console.error("Failed to route incoming URL:", error);
    });
    focusMainWindow();
  }

  return true;
}

function focusMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
}

function registerProtocolClients() {
  if (process.defaultApp) {
    app.setAsDefaultProtocolClient(CUSTOM_PROTOCOL, process.execPath, [path.resolve(__filename)]);
  } else {
    app.setAsDefaultProtocolClient(CUSTOM_PROTOCOL);
  }

  // Attempt browser-protocol registration in all modes; OS policy may ignore
  // this for unsigned/dev builds, but packaged app can still be selected later.
  app.setAsDefaultProtocolClient("http");
  app.setAsDefaultProtocolClient("https");
}

function buildShellUrl() {
  return new URL(PREVIEW_ROUTE, DEFAULT_START_URL).toString();
}

function buildPreviewUrl(targetUrl: string) {
  const url = new URL(PREVIEW_ROUTE, DEFAULT_START_URL);
  url.searchParams.set("url", targetUrl);
  return url.toString();
}

function isInternalUrl(urlString: string) {
  try {
    return new URL(urlString).origin === APP_ORIGIN;
  } catch {
    return false;
  }
}

function extractIncomingUrl(argv: string[]) {
  for (const arg of argv) {
    const normalized = normalizeIncomingUrl(arg);
    if (normalized) return normalized;
  }

  return null;
}

function normalizeIncomingUrl(rawUrl: string) {
  if (typeof rawUrl !== "string" || rawUrl.length === 0) return null;

  const directUrl = normalizeHttpUrl(rawUrl);
  if (directUrl) return directUrl;

  if (!rawUrl.startsWith(`${CUSTOM_PROTOCOL}:`)) return null;

  try {
    const protocolUrl = new URL(rawUrl);
    const embeddedUrl = protocolUrl.searchParams.get("url") ?? protocolUrl.searchParams.get("u");
    const normalizedEmbedded = normalizeHttpUrl(embeddedUrl);
    if (normalizedEmbedded) return normalizedEmbedded;
  } catch {
    // no-op, fall back to inline parse
  }

  const inlineValue = rawUrl.replace(/^phishinglens:\/*/i, "");
  return normalizeHttpUrl(inlineValue);
}

function normalizeHttpUrl(candidate: string | null) {
  if (typeof candidate !== "string" || candidate.length === 0) return null;
  const decoded = decodeURIComponentSafe(candidate);

  try {
    const url = new URL(decoded);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function decodeURIComponentSafe(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseClipboardCapturePayload(payload: unknown): ClipboardCaptureEvent | null {
  if (!payload || typeof payload !== "object") return null;

  const candidate = payload as Record<string, unknown>;
  const kind = candidate.kind;
  const page = candidate.page;
  const targetTag = candidate.target_tag;
  const urlContext = candidate.url_context;
  const clipboardText = candidate.clipboard_text;
  const clipboardTextLength = candidate.clipboard_text_length;
  const clipboardTextTruncated = candidate.clipboard_text_truncated;
  const blocked = candidate.blocked;
  const entropy = candidate.entropy;
  const capturedAt = candidate.captured_at;

  if (kind !== "paste" && kind !== "shortcut") return null;
  if (typeof page !== "string" || page.trim().length === 0 || page.length > 256) return null;
  if (targetTag !== null && targetTag !== undefined && (typeof targetTag !== "string" || targetTag.length > 64)) {
    return null;
  }
  if (urlContext !== null && urlContext !== undefined && !isValidHttpUrl(urlContext)) return null;
  if (typeof clipboardText !== "string" || clipboardText.length > 4000) return null;
  if (typeof clipboardTextLength !== "number" || !Number.isInteger(clipboardTextLength) || clipboardTextLength < 0) {
    return null;
  }
  if (typeof clipboardTextTruncated !== "boolean") return null;
  if (typeof blocked !== "boolean") return null;
  if (entropy !== null && entropy !== undefined) {
    if (typeof entropy !== "number" || !Number.isFinite(entropy) || entropy < 0 || entropy > 10) return null;
  }
  if (typeof capturedAt !== "string" || Number.isNaN(Date.parse(capturedAt))) return null;

  return {
    event_id: crypto.randomUUID(),
    kind,
    page: page.trim(),
    target_tag: typeof targetTag === "string" ? targetTag : null,
    url_context: typeof urlContext === "string" ? urlContext : null,
    clipboard_text: clipboardText,
    clipboard_text_length: clipboardTextLength,
    clipboard_text_truncated: clipboardTextTruncated,
    blocked,
    entropy: typeof entropy === "number" ? entropy : null,
    captured_at: capturedAt
  };
}

function isValidHttpUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

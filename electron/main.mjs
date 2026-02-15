import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { app, BrowserWindow, shell } = require("electron");

const __filename = fileURLToPath(import.meta.url);

const DEFAULT_START_URL = process.env.ELECTRON_START_URL ?? "http://127.0.0.1:3001";
const APP_ORIGIN = new URL(DEFAULT_START_URL).origin;
const PREVIEW_ROUTE = "/open";
const CUSTOM_PROTOCOL = "nightlane";

let mainWindow = null;
let pendingTargetUrl = extractIncomingUrl(process.argv);

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
  createMainWindow();

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

function createMainWindow() {
  const startUrl = pendingTargetUrl ? buildPreviewUrl(pendingTargetUrl) : buildShellUrl();

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 900,
    minHeight: 560,
    backgroundColor: "#05080d",
    titleBarStyle: "hiddenInset",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadURL(startUrl).catch((error) => {
    console.error("Failed to load renderer URL:", error);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch(() => {});
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isInternalUrl(url)) return;

    event.preventDefault();
    shell.openExternal(url).catch(() => {});
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function routeIncomingUrl(rawUrl) {
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

  if (app.isPackaged) {
    app.setAsDefaultProtocolClient("http");
    app.setAsDefaultProtocolClient("https");
  }
}

function buildShellUrl() {
  return new URL(PREVIEW_ROUTE, DEFAULT_START_URL).toString();
}

function buildPreviewUrl(targetUrl) {
  const url = new URL(PREVIEW_ROUTE, DEFAULT_START_URL);
  url.searchParams.set("url", targetUrl);
  return url.toString();
}

function isInternalUrl(urlString) {
  try {
    return new URL(urlString).origin === APP_ORIGIN;
  } catch {
    return false;
  }
}

function extractIncomingUrl(argv) {
  for (const arg of argv) {
    const normalized = normalizeIncomingUrl(arg);
    if (normalized) return normalized;
  }

  return null;
}

function normalizeIncomingUrl(rawUrl) {
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

  const inlineValue = rawUrl.replace(/^nightlane:\/*/i, "");
  return normalizeHttpUrl(inlineValue);
}

function normalizeHttpUrl(candidate) {
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

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

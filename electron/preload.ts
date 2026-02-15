import { contextBridge, ipcRenderer } from "electron";

const PASTE_SHORTCUT_CHANNEL = "clipboard:paste-shortcut-detected";
const SHOW_OVERLAY_CHANNEL = "clipboard:show-overlay";
const OPEN_EXTERNAL_CHANNEL = "shell:open-external";
const CLIPBOARD_CAPTURE_CHANNEL = "clipboard:capture";

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

interface PasteShortcutPayload {
  source?: string;
  blocked?: boolean;
  entropy?: number | null;
  clipboard_length?: number | null;
}

contextBridge.exposeInMainWorld("phishingLensBridge", {
  showPasteOverlay: () => {
    ipcRenderer.send(SHOW_OVERLAY_CHANNEL);
  },
  openExternal: (url: string) => {
    ipcRenderer.send(OPEN_EXTERNAL_CHANNEL, url);
  },
  captureClipboardEvent: (payload: ClipboardCapturePayload) => {
    ipcRenderer.send(CLIPBOARD_CAPTURE_CHANNEL, payload);
  },
  onPasteShortcutDetected: (callback: (payload: PasteShortcutPayload | null) => void) => {
    const listener = (_event: unknown, payload: PasteShortcutPayload | null | undefined) => {
      callback(payload ?? null);
    };

    ipcRenderer.on(PASTE_SHORTCUT_CHANNEL, listener);

    return () => {
      ipcRenderer.removeListener(PASTE_SHORTCUT_CHANNEL, listener);
    };
  }
});

import { contextBridge, ipcRenderer } from "electron";

const PASTE_SHORTCUT_CHANNEL = "clipboard:paste-shortcut-detected";
const SHOW_OVERLAY_CHANNEL = "clipboard:show-overlay";
const OPEN_EXTERNAL_CHANNEL = "shell:open-external";

contextBridge.exposeInMainWorld("phishingLensBridge", {
  showPasteOverlay: () => {
    ipcRenderer.send(SHOW_OVERLAY_CHANNEL);
  },
  openExternal: (url) => {
    ipcRenderer.send(OPEN_EXTERNAL_CHANNEL, url);
  },
  onPasteShortcutDetected: (callback) => {
    const listener = (_event, payload) => {
      callback(payload ?? null);
    };

    ipcRenderer.on(PASTE_SHORTCUT_CHANNEL, listener);

    return () => {
      ipcRenderer.removeListener(PASTE_SHORTCUT_CHANNEL, listener);
    };
  }
});

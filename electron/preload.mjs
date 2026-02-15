import { contextBridge, ipcRenderer } from "electron";

const PASTE_SHORTCUT_CHANNEL = "clipboard:paste-shortcut-detected";
const SHOW_OVERLAY_CHANNEL = "clipboard:show-overlay";

contextBridge.exposeInMainWorld("nightlaneBridge", {
  showPasteOverlay: () => {
    ipcRenderer.send(SHOW_OVERLAY_CHANNEL);
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

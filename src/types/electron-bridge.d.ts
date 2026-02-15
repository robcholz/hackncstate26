export {};

declare global {
  interface Window {
    nightlaneBridge?: {
      showPasteOverlay: () => void;
      onPasteShortcutDetected: (
        callback: (
          payload: {
            source?: string;
            blocked?: boolean;
            entropy?: number | null;
            clipboard_length?: number | null;
          } | null
        ) => void
      ) => () => void;
    };
  }
}

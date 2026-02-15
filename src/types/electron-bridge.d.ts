export {};

declare global {
  interface Window {
    phishingLensBridge?: {
      showPasteOverlay: () => void;
      openExternal: (url: string) => void;
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

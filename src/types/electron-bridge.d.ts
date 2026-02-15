export {};

declare global {
  interface Window {
    phishingLensBridge?: {
      showPasteOverlay: () => void;
      openExternal: (url: string) => void;
      captureClipboardEvent: (payload: {
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
      }) => void;
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

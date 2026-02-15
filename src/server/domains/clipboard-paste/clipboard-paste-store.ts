export interface ClipboardPasteCaptureInput {
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

export interface ClipboardPasteCapture extends ClipboardPasteCaptureInput {
  event_id: string;
}

declare global {
  var __clipboardPasteEvents__: ClipboardPasteCapture[] | undefined;
}

const MAX_EVENTS = 200;

function getStore(): ClipboardPasteCapture[] {
  if (!globalThis.__clipboardPasteEvents__) {
    globalThis.__clipboardPasteEvents__ = [];
  }

  return globalThis.__clipboardPasteEvents__;
}

export function addClipboardPasteEvent(input: ClipboardPasteCaptureInput): ClipboardPasteCapture {
  const event: ClipboardPasteCapture = {
    event_id: crypto.randomUUID(),
    ...input
  };

  const store = getStore();
  store.unshift(event);
  if (store.length > MAX_EVENTS) {
    store.length = MAX_EVENTS;
  }

  return event;
}

export function listClipboardPasteEvents(limit: number): ClipboardPasteCapture[] {
  return getStore().slice(0, limit);
}

export function __resetClipboardPasteEventsForTests(): void {
  globalThis.__clipboardPasteEvents__ = [];
}

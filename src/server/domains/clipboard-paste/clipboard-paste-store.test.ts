import { describe, expect, it } from "vitest";

import {
  __resetClipboardPasteEventsForTests,
  addClipboardPasteEvent,
  listClipboardPasteEvents
} from "./clipboard-paste-store";

describe("clipboard paste store", () => {
  it("initializes the global store lazily", () => {
    globalThis.__clipboardPasteEvents__ = undefined;

    const event = addClipboardPasteEvent({
      kind: "shortcut",
      page: "/open",
      target_tag: null,
      url_context: null,
      clipboard_text: "",
      clipboard_text_length: 0,
      clipboard_text_truncated: false,
      blocked: false,
      entropy: null,
      captured_at: "2026-02-16T01:00:00.000Z"
    });

    const events = listClipboardPasteEvents(5);
    expect(events).toHaveLength(1);
    expect(events[0].event_id).toBe(event.event_id);
    expect(Array.isArray(globalThis.__clipboardPasteEvents__)).toBe(true);
  });

  it("caps the store size to 200 events", () => {
    __resetClipboardPasteEventsForTests();

    for (let idx = 0; idx < 210; idx += 1) {
      addClipboardPasteEvent({
        kind: "shortcut",
        page: "/open",
        target_tag: null,
        url_context: null,
        clipboard_text: "",
        clipboard_text_length: 0,
        clipboard_text_truncated: false,
        blocked: false,
        entropy: null,
        captured_at: "2026-02-16T01:00:00.000Z"
      });
    }

    const events = listClipboardPasteEvents(999);
    expect(events).toHaveLength(200);
  });
});

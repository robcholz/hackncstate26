import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { __resetClipboardPasteEventsForTests } from "../../../../../server/domains/clipboard-paste/clipboard-paste-store";
import { GET, POST } from "./route";

describe("clipboard paste intercept route", () => {
  beforeEach(() => {
    __resetClipboardPasteEventsForTests();
  });

  it("stores an intercepted paste payload", async () => {
    const request = new NextRequest("http://localhost/api/v1/clipboard/paste", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "paste",
        page: "/open",
        target_tag: "INPUT",
        url_context: "https://example.com",
        clipboard_text: "mock-secret-123",
        clipboard_text_length: 15,
        clipboard_text_truncated: false,
        blocked: false,
        entropy: null,
        captured_at: "2026-02-16T01:00:00.000Z"
      })
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("success");
    expect(payload.data.event_id).toEqual(expect.any(String));

    const listResponse = await GET(new NextRequest("http://localhost/api/v1/clipboard/paste?limit=5"));
    const listPayload = await listResponse.json();

    expect(listResponse.status).toBe(200);
    expect(listPayload.data.events).toHaveLength(1);
    expect(listPayload.data.events[0]).toEqual(
      expect.objectContaining({
        kind: "paste",
        page: "/open",
        target_tag: "INPUT",
        url_context: "https://example.com",
        clipboard_text: "mock-secret-123",
        clipboard_text_length: 15,
        clipboard_text_truncated: false
      })
    );
  });

  it("accepts shortcut-only payloads with empty clipboard text", async () => {
    const request = new NextRequest("http://localhost/api/v1/clipboard/paste", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
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
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
  });

  it("stores entropy metric when provided", async () => {
    const request = new NextRequest("http://localhost/api/v1/clipboard/paste", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "shortcut",
        page: "/open",
        target_tag: null,
        url_context: null,
        clipboard_text: "",
        clipboard_text_length: 0,
        clipboard_text_truncated: false,
        blocked: true,
        entropy: 4.5,
        captured_at: "2026-02-16T01:00:00.000Z"
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const listResponse = await GET(new NextRequest("http://localhost/api/v1/clipboard/paste?limit=5"));
    const listPayload = await listResponse.json();
    expect(listPayload.data.events[0]).toEqual(expect.objectContaining({ entropy: 4.5, blocked: true }));
  });

  it("returns invalid_request for malformed payload", async () => {
    const request = new NextRequest("http://localhost/api/v1/clipboard/paste", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "paste",
        page: "/open",
        target_tag: "INPUT",
        url_context: "javascript:alert(1)",
        clipboard_text: "x",
        clipboard_text_length: 1,
        clipboard_text_truncated: false,
        blocked: false,
        entropy: null,
        captured_at: "2026-02-16T01:00:00.000Z"
      })
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload).toEqual({
      status: "error",
      error: {
        code: "invalid_request",
        message: "Validation failed"
      }
    });
  });

  it("returns invalid_request when captured_at is invalid", async () => {
    const request = new NextRequest("http://localhost/api/v1/clipboard/paste", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "paste",
        page: "/open",
        target_tag: null,
        url_context: null,
        clipboard_text: "x",
        clipboard_text_length: 1,
        clipboard_text_truncated: false,
        blocked: false,
        entropy: null,
        captured_at: "not-a-date"
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(422);
  });

  it("returns invalid_request when url_context is not a URL", async () => {
    const request = new NextRequest("http://localhost/api/v1/clipboard/paste", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "paste",
        page: "/open",
        target_tag: "INPUT",
        url_context: "not-a-url",
        clipboard_text: "x",
        clipboard_text_length: 1,
        clipboard_text_truncated: false,
        blocked: false,
        entropy: null,
        captured_at: "2026-02-16T01:00:00.000Z"
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(422);
  });

  it("GET defaults the limit when it is not a number", async () => {
    const response = await GET(new NextRequest("http://localhost/api/v1/clipboard/paste?limit=abc"));
    expect(response.status).toBe(200);
  });

  it("GET uses the default limit when none is provided", async () => {
    const response = await GET(new NextRequest("http://localhost/api/v1/clipboard/paste"));
    expect(response.status).toBe(200);
  });

  it("returns invalid_request when clipboard_text_length is invalid", async () => {
    const request = new NextRequest("http://localhost/api/v1/clipboard/paste", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "paste",
        page: "/open",
        target_tag: null,
        url_context: null,
        clipboard_text: "x",
        clipboard_text_length: -1,
        clipboard_text_truncated: false,
        blocked: false,
        entropy: null,
        captured_at: "2026-02-16T01:00:00.000Z"
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(422);
  });

  it("returns invalid_request when target_tag is invalid", async () => {
    const request = new NextRequest("http://localhost/api/v1/clipboard/paste", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "paste",
        page: "/open",
        target_tag: 123,
        url_context: null,
        clipboard_text: "x",
        clipboard_text_length: 1,
        clipboard_text_truncated: false,
        blocked: false,
        entropy: null,
        captured_at: "2026-02-16T01:00:00.000Z"
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(422);
  });

  it("returns invalid_request when clipboard_text is invalid", async () => {
    const request = new NextRequest("http://localhost/api/v1/clipboard/paste", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "paste",
        page: "/open",
        target_tag: null,
        url_context: null,
        clipboard_text: 123,
        clipboard_text_length: 0,
        clipboard_text_truncated: false,
        blocked: false,
        entropy: null,
        captured_at: "2026-02-16T01:00:00.000Z"
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(422);
  });

  it("returns invalid_request when clipboard_text_truncated is invalid", async () => {
    const request = new NextRequest("http://localhost/api/v1/clipboard/paste", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "paste",
        page: "/open",
        target_tag: null,
        url_context: null,
        clipboard_text: "x",
        clipboard_text_length: 1,
        clipboard_text_truncated: "no",
        blocked: false,
        entropy: null,
        captured_at: "2026-02-16T01:00:00.000Z"
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(422);
  });

  it("returns invalid_request when blocked is invalid", async () => {
    const request = new NextRequest("http://localhost/api/v1/clipboard/paste", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "paste",
        page: "/open",
        target_tag: null,
        url_context: null,
        clipboard_text: "x",
        clipboard_text_length: 1,
        clipboard_text_truncated: false,
        blocked: "false",
        entropy: null,
        captured_at: "2026-02-16T01:00:00.000Z"
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(422);
  });

  it("returns invalid_request when entropy is out of range", async () => {
    const request = new NextRequest("http://localhost/api/v1/clipboard/paste", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "paste",
        page: "/open",
        target_tag: null,
        url_context: null,
        clipboard_text: "x",
        clipboard_text_length: 1,
        clipboard_text_truncated: false,
        blocked: false,
        entropy: 99,
        captured_at: "2026-02-16T01:00:00.000Z"
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(422);
  });

  it("returns invalid_json when JSON parsing fails", async () => {
    const request = new NextRequest("http://localhost/api/v1/clipboard/paste", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ bad-json "
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      status: "error",
      error: {
        code: "invalid_json",
        message: "Malformed JSON body"
      }
    });
  });
});

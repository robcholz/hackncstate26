import { NextRequest, NextResponse } from "next/server";

import {
  addClipboardPasteEvent,
  listClipboardPasteEvents
} from "../../../../../server/domains/clipboard-paste/clipboard-paste-store";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

type ClipboardPasteKind = "paste" | "shortcut";

interface ClipboardPasteInput {
  kind: ClipboardPasteKind;
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

function jsonError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json(
    {
      status: "error",
      error: {
        code,
        message
      }
    },
    { status }
  );
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function parseInput(body: unknown): ClipboardPasteInput | null {
  if (!body || typeof body !== "object") return null;

  const candidate = body as Record<string, unknown>;
  const kind = candidate.kind;
  const page = candidate.page;
  const targetTag = candidate.target_tag;
  const urlContext = candidate.url_context;
  const clipboardText = candidate.clipboard_text;
  const clipboardTextLength = candidate.clipboard_text_length;
  const clipboardTextTruncated = candidate.clipboard_text_truncated;
  const blocked = candidate.blocked;
  const entropy = candidate.entropy;
  const capturedAt = candidate.captured_at;

  if (kind !== "paste" && kind !== "shortcut") return null;
  if (typeof page !== "string" || page.trim().length === 0 || page.length > 256) return null;

  if (targetTag !== null && targetTag !== undefined) {
    if (typeof targetTag !== "string" || targetTag.length > 64) return null;
  }

  if (urlContext !== null && urlContext !== undefined) {
    if (typeof urlContext !== "string" || !isValidHttpUrl(urlContext)) return null;
  }

  if (typeof clipboardText !== "string" || clipboardText.length > 4000) return null;
  if (typeof clipboardTextLength !== "number" || !Number.isInteger(clipboardTextLength) || clipboardTextLength < 0) {
    return null;
  }
  if (typeof clipboardTextTruncated !== "boolean") return null;

  if (typeof blocked !== "boolean") return null;

  if (entropy !== null && entropy !== undefined) {
    if (typeof entropy !== "number" || !Number.isFinite(entropy) || entropy < 0 || entropy > 10) {
      return null;
    }
  }

  if (typeof capturedAt !== "string" || Number.isNaN(Date.parse(capturedAt))) return null;

  return {
    kind,
    page: page.trim(),
    target_tag: typeof targetTag === "string" ? targetTag : null,
    url_context: typeof urlContext === "string" ? urlContext : null,
    clipboard_text: clipboardText,
    clipboard_text_length: clipboardTextLength,
    clipboard_text_truncated: clipboardTextTruncated,
    blocked,
    entropy: typeof entropy === "number" ? entropy : null,
    captured_at: capturedAt
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_json", "Malformed JSON body");
  }

  const parsed = parseInput(body);
  if (!parsed) {
    return jsonError(422, "invalid_request", "Validation failed");
  }

  const event = addClipboardPasteEvent(parsed);

  return NextResponse.json({
    status: "success",
    data: {
      event_id: event.event_id
    }
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(MAX_LIMIT, Math.trunc(requestedLimit)))
    : DEFAULT_LIMIT;

  return NextResponse.json({
    status: "success",
    data: {
      events: listClipboardPasteEvents(limit)
    }
  });
}

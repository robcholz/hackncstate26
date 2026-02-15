const SUPPORTED_PROTOCOLS = new Set(["http:", "https:"]);

export interface ParsedTargetUrl {
  normalizedUrl: string;
  hostname: string;
  protocol: "http:" | "https:";
}

export type TargetUrlResult =
  | { ok: true; value: ParsedTargetUrl }
  | { ok: false; error: string };

export function parseTargetUrl(input: string | null | undefined): TargetUrlResult {
  if (typeof input !== "string" || input.trim().length === 0) {
    return { ok: false, error: "Enter a URL to preview." };
  }

  const trimmedInput = input.trim();
  const decodedInput = safeDecode(trimmedInput);
  const candidate = hasProtocol(decodedInput) ? decodedInput : `https://${decodedInput}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, error: "Enter a valid HTTP or HTTPS URL." };
  }

  if (!SUPPORTED_PROTOCOLS.has(parsed.protocol)) {
    return { ok: false, error: "Only HTTP and HTTPS links are supported." };
  }

  if (!parsed.hostname) {
    return { ok: false, error: "The URL must include a hostname." };
  }

  parsed.hash = "";

  return {
    ok: true,
    value: {
      normalizedUrl: parsed.toString(),
      hostname: parsed.hostname.toLowerCase(),
      protocol: parsed.protocol as "http:" | "https:"
    }
  };
}

function hasProtocol(url: string): boolean {
  return /^[a-zA-Z][\w+.-]*:/.test(url);
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

import { toUnicode } from "node:punycode";

export type Score1To10 = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface SusIndex {
  rate: Score1To10;
  redirectMatch: Score1To10;
  redirectCount: number;
  domainSimilarity: Score1To10;
  keywordMatch: Score1To10;
  passwordInputMatch: Score1To10;
}

export interface GetSusIndexInput {
  url: string;
  timeout?: number;
  maxRedirects?: number;
}

const DEFAULT_TIMEOUT_MS = 4_000;
const DEFAULT_MAX_REDIRECTS = 10;

const TRUSTED_DOMAINS = ["microsoft.com", "google.com", "apple.com", "paypal.com", "amazon.com", "github.com"];

const SUSPICIOUS_KEYWORDS = [
  "verify your account",
  "confirm password",
  "password expired",
  "security alert",
  "unusual activity",
  "unlock account",
  "sign in now",
  "billing update",
  "payment failed",
  "suspended",
  "urgent action required",
  "click here",
  "reset password",
  "2fa disabled"
];

const SINGLE_CHAR_CONFUSABLES: Record<string, string[]> = {
  a: ["4", "@", "а", "Α", "α"],
  b: ["8", "Β"],
  e: ["3", "е", "Ε"],
  g: ["9"],
  i: ["1", "|", "!", "і", "Ι"],
  l: ["1", "|", "!", "І"],
  o: ["0", "о", "Ο"],
  p: ["р", "Ρ"],
  s: ["5", "$", "с"],
  t: ["7", "Τ"],
  u: ["у", "Υ"],
  x: ["х", "Χ"],
  y: ["у", "Υ"],
  z: ["2", "Ζ"],
  j: ["ј"],
  k: ["Κ"],
  m: ["Μ"],
  n: ["Ν"]
};

const MULTI_CHAR_LOOKALIKES: Array<[string, string]> = [
  ["rn", "m"],
  ["cl", "d"],
  ["vv", "w"],
  ["li", "h"],
  ["00", "o0"]
];

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

interface RedirectResolution {
  redirectCount: number;
  finalUrl: string;
  html: string | null;
}

function toScore(value: number): Score1To10 {
  const clamped = Math.max(1, Math.min(10, Math.round(value)));
  return clamped as Score1To10;
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function stripWww(hostname: string): string {
  return hostname.replace(/^www\./i, "");
}

function normalizeHostFromUrl(urlString: string): string {
  const url = new URL(urlString);
  return stripWww(toUnicode(url.hostname)).toLowerCase();
}

function isTrustedHost(host: string): boolean {
  return TRUSTED_DOMAINS.some((trusted) => host === trusted || host.endsWith(`.${trusted}`));
}

function levenshteinDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;

  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));

  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }

  return matrix[left.length][right.length];
}

function normalizedEditSimilarity(left: string, right: string): number {
  const maxLength = Math.max(left.length, right.length);
  if (maxLength === 0) return 1;
  return 1 - levenshteinDistance(left, right) / maxLength;
}

function canonicalizeHost(host: string): string {
  let normalized = host;

  for (const [canonical, variants] of Object.entries(SINGLE_CHAR_CONFUSABLES)) {
    const matcher = new RegExp(`[${variants.map((v) => escapeRegExp(v)).join("")}]`, "giu");
    normalized = normalized.replace(matcher, canonical);
  }

  for (const [first, second] of MULTI_CHAR_LOOKALIKES) {
    normalized = normalized.replace(new RegExp(escapeRegExp(first), "giu"), second);
  }

  return normalized;
}

function hasMultiPatternSimilarity(candidate: string, trusted: string): boolean {
  return MULTI_CHAR_LOOKALIKES.some(([first, second]) => {
    const firstInCandidate = candidate.includes(first) && trusted.includes(second);
    const secondInCandidate = candidate.includes(second) && trusted.includes(first);
    return firstInCandidate || secondInCandidate;
  });
}

function getDomainSimilarityScore(finalUrl: string): Score1To10 {
  let host: string;

  try {
    host = normalizeHostFromUrl(finalUrl);
  } catch {
    return 1;
  }

  if (isTrustedHost(host)) return 1;

  const hostBase = host.split(".")[0] ?? host;
  const hostTokens = host
    .split(/[.-]/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  let bestEditScore = 0;
  let bestHomoglyphScore = 0;
  let brandPrefixBonus = 0;
  let highConfidenceImpersonation = false;

  for (const trustedDomain of TRUSTED_DOMAINS) {
    const trustedHost = normalizeHostFromUrl(`https://${trustedDomain}`);
    const trustedBase = trustedHost.split(".")[0] ?? trustedHost;

    const editScore = normalizedEditSimilarity(host, trustedHost);
    const tokenEditScore = hostTokens.reduce(
      (max, token) => Math.max(max, normalizedEditSimilarity(token, trustedBase)),
      0
    );
    bestEditScore = Math.max(bestEditScore, editScore, tokenEditScore);

    const candidateCanonical = canonicalizeHost(host);
    const trustedCanonical = canonicalizeHost(trustedHost);
    const hasConfusableChars = /[0-9@$|!]|[^\u0000-\u007f]/u.test(host);
    const confusableTokenSimilarity = tokenEditScore >= 0.8 && hasConfusableChars;
    const tokenCanonicalMatch = hostTokens.some((token) => {
      const canonicalToken = canonicalizeHost(token);
      return canonicalToken === trustedBase && token !== trustedBase;
    });

    if (candidateCanonical === trustedCanonical && host !== trustedHost) {
      bestHomoglyphScore = Math.max(bestHomoglyphScore, 1);
      highConfidenceImpersonation = true;
    } else if (tokenCanonicalMatch || confusableTokenSimilarity) {
      bestHomoglyphScore = Math.max(bestHomoglyphScore, 1);
      highConfidenceImpersonation = true;
    } else if (hasMultiPatternSimilarity(hostBase, trustedBase)) {
      bestHomoglyphScore = Math.max(bestHomoglyphScore, 0.8);
    } else if (candidateCanonical.includes(trustedBase) || trustedCanonical.includes(hostBase)) {
      bestHomoglyphScore = Math.max(bestHomoglyphScore, 0.6);
    }

    if (
      (hostBase.startsWith(trustedBase) || hostTokens.some((token) => token.startsWith(trustedBase))) &&
      host !== trustedHost
    ) {
      brandPrefixBonus = 1;
    }
  }

  const rawScore = 0.5 * clamp01(bestEditScore) + 0.35 * clamp01(bestHomoglyphScore) + 0.15 * brandPrefixBonus;
  const baseScore = toScore(1 + rawScore * 9);
  if (highConfidenceImpersonation) {
    return baseScore < 8 ? 8 : baseScore;
  }

  return baseScore;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractVisibleText(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/giu, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/giu, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getKeywordMatchScore(html: string | null): Score1To10 {
  if (!html) return 1;

  const text = extractVisibleText(html);
  if (!text) return 1;

  let uniqueHits = 0;
  let totalHits = 0;

  for (const keyword of SUSPICIOUS_KEYWORDS) {
    const matches = text.match(new RegExp(escapeRegExp(keyword), "giu"));
    const count = matches?.length ?? 0;
    if (count > 0) {
      uniqueHits += 1;
      totalHits += count;
    }
  }

  if (uniqueHits === 0) return 1;

  if (uniqueHits <= 2) {
    return toScore(Math.min(5, 2 + uniqueHits + Math.min(2, totalHits - uniqueHits)));
  }

  if (uniqueHits <= 5) {
    return toScore(Math.min(8, 5 + (uniqueHits - 2) + Math.min(1, totalHits - uniqueHits)));
  }

  return toScore(Math.min(10, 8 + Math.min(2, Math.floor((uniqueHits - 5) / 2) + Math.min(1, totalHits - uniqueHits))));
}

function getOriginSafe(urlString: string): string | null {
  try {
    return new URL(urlString).origin;
  } catch {
    return null;
  }
}

function getPasswordInputMatchScore(html: string | null, finalUrl: string): Score1To10 {
  if (!html) return 1;

  const hasPasswordField = /<input[^>]*type\s*=\s*["']?password["']?/iu.test(html);
  if (!hasPasswordField) return 1;

  const finalOrigin = getOriginSafe(finalUrl);
  let suspiciousSignals = 0;

  const formActionMatches = Array.from(html.matchAll(/<form[^>]*action\s*=\s*["']([^"']+)["'][^>]*>/giu));
  for (const match of formActionMatches) {
    const action = match[1];
    if (!action || !finalOrigin) continue;

    try {
      const actionUrl = new URL(action, finalUrl);
      if (actionUrl.origin !== finalOrigin) {
        suspiciousSignals += 1;
        break;
      }
    } catch {
      // ignore malformed action URL values
    }
  }

  const hasHiddenIdentityField =
    /<input[^>]*type\s*=\s*["']?hidden["']?[^>]*name\s*=\s*["'][^"']*(user|email|login)[^"']*["']/iu.test(html);
  if (hasHiddenIdentityField) {
    suspiciousSignals += 1;
  }

  const hasUrgencyPrompt =
    /(verify your account|security alert|urgent action required|unlock account|reset password)/iu.test(html);
  if (hasUrgencyPrompt) {
    suspiciousSignals += 1;
  }

  if (suspiciousSignals === 0) return 7;
  if (suspiciousSignals === 1) return 9;
  return 10;
}

function getRedirectMatchScore(redirectCount: number): Score1To10 {
  if (redirectCount <= 0) return 1;
  if (redirectCount === 1) return 3;
  if (redirectCount === 2) return 5;
  if (redirectCount === 3) return 7;
  return redirectCount >= 5 ? 10 : 9;
}

async function resolveRedirectsAndHtml(input: GetSusIndexInput): Promise<RedirectResolution> {
  const timeoutMs =
    Number.isFinite(input.timeout) && input.timeout && input.timeout > 0 ? input.timeout : DEFAULT_TIMEOUT_MS;
  const maxRedirects =
    Number.isInteger(input.maxRedirects) && input.maxRedirects && input.maxRedirects > 0
      ? input.maxRedirects
      : DEFAULT_MAX_REDIRECTS;

  const visited = new Set<string>([input.url]);
  let redirectCount = 0;
  let currentUrl = input.url;
  const startedAt = Date.now();

  while (true) {
    const elapsed = Date.now() - startedAt;
    const remaining = timeoutMs - elapsed;

    if (remaining <= 0) {
      return { redirectCount, finalUrl: currentUrl, html: null };
    }

    let response: Response;
    try {
      response = await fetch(currentUrl, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(remaining)
      });
    } catch {
      return { redirectCount, finalUrl: currentUrl, html: null };
    }

    const location = response.headers.get("location");
    if (REDIRECT_STATUS.has(response.status) && location) {
      if (redirectCount >= maxRedirects) {
        return { redirectCount, finalUrl: currentUrl, html: null };
      }

      let nextUrl: string;

      try {
        nextUrl = new URL(location, currentUrl).toString();
      } catch {
        return { redirectCount, finalUrl: currentUrl, html: null };
      }

      if (visited.has(nextUrl)) {
        return { redirectCount, finalUrl: currentUrl, html: null };
      }

      visited.add(nextUrl);
      redirectCount += 1;
      currentUrl = nextUrl;
      continue;
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    const isHtml =
      contentType.includes("text/html") || contentType.includes("application/xhtml+xml") || contentType === "";

    if (!isHtml) {
      return { redirectCount, finalUrl: currentUrl, html: null };
    }

    try {
      const html = await response.text();
      return { redirectCount, finalUrl: currentUrl, html };
    } catch {
      return { redirectCount, finalUrl: currentUrl, html: null };
    }
  }

  return { redirectCount, finalUrl: currentUrl, html: null };
}

export async function getSusIndex(input: GetSusIndexInput): Promise<SusIndex> {
  if (!input.url || typeof input.url !== "string") {
    throw new Error("input.url must be a non-empty string");
  }

  const { redirectCount, finalUrl, html } = await resolveRedirectsAndHtml(input);

  const domainSimilarity = getDomainSimilarityScore(finalUrl);
  const keywordMatch = getKeywordMatchScore(html);
  const passwordInputMatch = getPasswordInputMatchScore(html, finalUrl);
  const redirectMatch = getRedirectMatchScore(redirectCount);

  const rate = toScore(0.4 * domainSimilarity + 0.25 * keywordMatch + 0.2 * passwordInputMatch + 0.15 * redirectMatch);

  return {
    rate,
    redirectMatch,
    redirectCount,
    domainSimilarity,
    keywordMatch,
    passwordInputMatch
  };
}

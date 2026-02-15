export interface SusIndex {
  rate: number;
  redirect_match: number;
  redirect_count: number;
  domain_similarity: number;
  keyword_match: number;
  password_input_match: number;
}

export interface LinkPreview {
  url: string;
  hostname: string;
  title: string;
  summary: string;
  image: string | null;
  sus_index: SusIndex;
  fetchedAt: string;
}

export async function getLinkPreview(normalizedUrl: string): Promise<LinkPreview> {
  const parsed = new URL(normalizedUrl);
  const pathLabel = parsed.pathname === "/" ? "homepage" : parsed.pathname;
  const susIndex = buildMockSusIndex(parsed.hostname);

  return {
    url: normalizedUrl,
    hostname: parsed.hostname,
    title: `Preview: ${parsed.hostname}`,
    summary: `Temporary preview for ${pathLabel}. Backend screenshot generation is still in progress.`,
    image: null,
    sus_index: susIndex,
    fetchedAt: new Date().toISOString()
  };
}

function buildMockSusIndex(hostname: string): SusIndex {
  const hash = [...hostname].reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) % 100000, 7);
  const clampScore = (value: number): number => Math.max(1, Math.min(10, value));

  const domainSimilarity = clampScore((hash % 10) + 1);
  const keywordMatch = clampScore(((hash >> 1) % 10) + 1);
  const passwordInputMatch = clampScore(((hash >> 2) % 10) + 1);
  const redirectCount = hash % 5;
  const redirectMatch = clampScore(redirectCount === 0 ? 1 : redirectCount * 2 + 1);
  const rate = clampScore(
    Math.round(
      0.4 * domainSimilarity +
        0.25 * keywordMatch +
        0.2 * passwordInputMatch +
        0.15 * redirectMatch
    )
  );

  return {
    rate,
    redirect_match: redirectMatch,
    redirect_count: redirectCount,
    domain_similarity: domainSimilarity,
    keyword_match: keywordMatch,
    password_input_match: passwordInputMatch
  };
}

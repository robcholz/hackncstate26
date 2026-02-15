import type { SusIndex } from "../domains/fishing-checker/fishing-checker";

export interface SusIndexApi {
  rate: SusIndex["rate"];
  redirect_match: SusIndex["redirectMatch"];
  redirect_count: SusIndex["redirectCount"];
  domain_similarity: SusIndex["domainSimilarity"];
  keyword_match: SusIndex["keywordMatch"];
  password_input_match: SusIndex["passwordInputMatch"];
}

export function mapSusIndexToApi(susIndex: SusIndex): SusIndexApi {
  return {
    rate: susIndex.rate,
    redirect_match: susIndex.redirectMatch,
    redirect_count: susIndex.redirectCount,
    domain_similarity: susIndex.domainSimilarity,
    keyword_match: susIndex.keywordMatch,
    password_input_match: susIndex.passwordInputMatch
  };
}

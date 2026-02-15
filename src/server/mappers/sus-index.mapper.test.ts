import { describe, expect, it } from "vitest";

import type { SusIndex } from "../domains/fishing-checker/fishing-checker";
import { mapSusIndexToApi } from "./sus-index.mapper";

describe("mapSusIndexToApi", () => {
  it("maps camelCase SusIndex fields to snake_case API fields", () => {
    const input: SusIndex = {
      rate: 7,
      redirectMatch: 4,
      redirectCount: 2,
      domainSimilarity: 6,
      keywordMatch: 5,
      passwordInputMatch: 8
    };

    const mapped = mapSusIndexToApi(input);

    expect(mapped).toEqual({
      rate: 7,
      redirect_match: 4,
      redirect_count: 2,
      domain_similarity: 6,
      keyword_match: 5,
      password_input_match: 8
    });
  });

  it("does not mutate the input object", () => {
    const input: SusIndex = {
      rate: 3,
      redirectMatch: 1,
      redirectCount: 0,
      domainSimilarity: 2,
      keywordMatch: 1,
      passwordInputMatch: 1
    };

    const snapshot = { ...input };
    mapSusIndexToApi(input);

    expect(input).toEqual(snapshot);
  });
});

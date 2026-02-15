import { describe, expect, it } from "vitest";

import { getLinkPreview } from "./link-preview";

describe("getLinkPreview", () => {
  it("returns mock sus_index payload with API snake_case fields", async () => {
    const preview = await getLinkPreview("https://example.com/login");

    expect(preview.sus_index).toEqual({
      rate: expect.any(Number),
      redirect_match: expect.any(Number),
      redirect_count: expect.any(Number),
      domain_similarity: expect.any(Number),
      keyword_match: expect.any(Number),
      password_input_match: expect.any(Number)
    });
  });

  it("keeps score values in expected ranges", async () => {
    const preview = await getLinkPreview("https://accounts.fake-portal.test/reset");
    const { sus_index: index } = preview;

    expect(index.rate).toBeGreaterThanOrEqual(1);
    expect(index.rate).toBeLessThanOrEqual(10);
    expect(index.redirect_match).toBeGreaterThanOrEqual(1);
    expect(index.redirect_match).toBeLessThanOrEqual(10);
    expect(index.redirect_count).toBeGreaterThanOrEqual(0);
    expect(index.domain_similarity).toBeGreaterThanOrEqual(1);
    expect(index.domain_similarity).toBeLessThanOrEqual(10);
    expect(index.keyword_match).toBeGreaterThanOrEqual(1);
    expect(index.keyword_match).toBeLessThanOrEqual(10);
    expect(index.password_input_match).toBeGreaterThanOrEqual(1);
    expect(index.password_input_match).toBeLessThanOrEqual(10);
  });

  it("updates summary text using path labels", async () => {
    const homepage = await getLinkPreview("https://example.com/");
    const nested = await getLinkPreview("https://example.com/security/check");

    expect(homepage.summary).toContain("homepage");
    expect(nested.summary).toContain("/security/check");
  });
});

import { getOrCreateRendererClient, type RendererClient } from "../../clients/renderer/renderer-client";
import { getSusIndex, type GetSusIndexInput, type SusIndex } from "../../domains/fishing-checker/fishing-checker";
import { getOrCreateImageCache, type ImageCacheApi } from "../../domains/image-cache/image-cache";

export interface BackendRenderInput {
  url: string;
  timeout: number;
}

export interface BackendRenderOutput {
  image: string;
  susIndex: SusIndex;
}

export interface BackendRenderDependencies {
  cache: ImageCacheApi;
  rendererClient: RendererClient;
  checker: (input: GetSusIndexInput) => Promise<SusIndex>;
}

const SAFE_DEFAULT_SUS_INDEX: SusIndex = {
  rate: 1,
  redirectMatch: 1,
  redirectCount: 0,
  domainSimilarity: 1,
  keywordMatch: 1,
  passwordInputMatch: 1
};

const DEFAULT_CHECKER_TIMEOUT_MS = 3_000;

function getCheckerTimeoutMs(input: BackendRenderInput): number {
  if (!Number.isFinite(input.timeout) || input.timeout <= 0) {
    return DEFAULT_CHECKER_TIMEOUT_MS;
  }

  return Math.floor(input.timeout);
}

async function getSusIndexSafe(
  input: BackendRenderInput,
  checker: BackendRenderDependencies["checker"]
): Promise<SusIndex> {
  const timeoutMs = getCheckerTimeoutMs(input);
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const checkerPromise = checker({ url: input.url, timeout: input.timeout }).catch(() => SAFE_DEFAULT_SUS_INDEX);
    const timeoutPromise = new Promise<SusIndex>((resolve) => {
      timer = setTimeout(() => resolve(SAFE_DEFAULT_SUS_INDEX), timeoutMs);
    });

    return await Promise.race([checkerPromise, timeoutPromise]);
  } catch {
    return SAFE_DEFAULT_SUS_INDEX;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export async function getBackendRenderResult(
  input: BackendRenderInput,
  deps: Partial<BackendRenderDependencies> = {}
): Promise<BackendRenderOutput> {
  const cache = deps.cache ?? getOrCreateImageCache();
  const checker = deps.checker ?? getSusIndex;

  const susIndexPromise = getSusIndexSafe(input, checker);

  const cached = cache.getImage(input.url);
  if (cached) {
    const susIndex = await susIndexPromise;
    return { image: cached.image, susIndex };
  }

  const rendererClient = deps.rendererClient ?? getOrCreateRendererClient();
  const image = await rendererClient.getImage({
    url: input.url,
    timeout: input.timeout
  });
  cache.putImage({ link: input.url, image });

  const susIndex = await susIndexPromise;
  return { image, susIndex };
}

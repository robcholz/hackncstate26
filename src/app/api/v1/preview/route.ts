import { NextRequest, NextResponse } from "next/server";

import { getLinkPreview } from "@/lib/link-preview";
import { parseTargetUrl } from "@/lib/url-target";

import { mapSusIndexToApi } from "../../../../server/mappers/sus-index.mapper";
import { getBackendRenderResult } from "../../../../server/services/backend/backend-render.service";

interface ApiError {
  code: string;
  message: string;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rawUrl = request.nextUrl.searchParams.get("url");
  const parsedTarget = parseTargetUrl(rawUrl);

  if (!parsedTarget.ok) {
    const error: ApiError = {
      code: "invalid_request",
      message: parsedTarget.error
    };

    return NextResponse.json(
      {
        status: "error",
        error
      },
      { status: 422 }
    );
  }

  const normalizedUrl = parsedTarget.value.normalizedUrl;
  const hostname = parsedTarget.value.hostname;

  // Prefer the backend renderer when available; fall back to the deterministic stub
  // so the UI keeps working even when the renderer isn't configured yet.
  const preview = await (async () => {
    try {
      const { image, susIndex } = await getBackendRenderResult({ url: normalizedUrl, timeout: 3000 });

      return {
        url: normalizedUrl,
        hostname,
        title: `Preview: ${hostname}`,
        summary: "Rendered by Phishing Lens.",
        image: image ? `data:image/png;base64,${image}` : null,
        sus_index: mapSusIndexToApi(susIndex),
        fetchedAt: new Date().toISOString()
      };
    } catch (error) {
      if (process.env.NODE_ENV !== "test") {
        console.warn("Preview renderer unavailable; falling back to stub preview.", error);
      }
      return await getLinkPreview(normalizedUrl);
    }
  })();

  return NextResponse.json({
    status: "success",
    data: preview
  });
}

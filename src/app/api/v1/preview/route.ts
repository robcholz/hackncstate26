import { NextRequest, NextResponse } from "next/server";

import { getLinkPreview } from "@/lib/link-preview";
import { parseTargetUrl } from "@/lib/url-target";

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

  const preview = await getLinkPreview(parsedTarget.value.normalizedUrl);
  return NextResponse.json({
    status: "success",
    data: preview
  });
}

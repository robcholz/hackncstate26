"use client";

import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { LinkPreview } from "@/lib/link-preview";
import { parseTargetUrl } from "@/lib/url-target";

interface PreviewApiSuccess {
  status: "success";
  data: LinkPreview;
}

interface PreviewApiError {
  status: "error";
  error: {
    code: string;
    message: string;
  };
}

type PreviewApiResponse = PreviewApiSuccess | PreviewApiError;

type PreviewState =
  | { status: "idle" }
  | { status: "loading"; message: string }
  | { status: "error"; message: string }
  | { status: "success"; data: LinkPreview };

export function LinkGateway() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawQueryUrl = searchParams.get("url") ?? searchParams.get("u");

  const parsedQueryTarget = useMemo(() => parseTargetUrl(rawQueryUrl), [rawQueryUrl]);
  const normalizedTarget = parsedQueryTarget.ok ? parsedQueryTarget.value.normalizedUrl : null;

  const [previewState, setPreviewState] = useState<PreviewState>(() => {
    if (!rawQueryUrl) {
      return { status: "idle" };
    }

    if (!parsedQueryTarget.ok) {
      return { status: "error", message: parsedQueryTarget.error };
    }

    return { status: "loading", message: "Loading preview..." };
  });

  useEffect(() => {
    if (!rawQueryUrl) {
      setPreviewState({ status: "idle" });
      return;
    }

    if (!normalizedTarget) {
      setPreviewState({
        status: "error",
        message: parsedQueryTarget.ok ? "Invalid URL." : parsedQueryTarget.error
      });
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setPreviewState({ status: "loading", message: "Loading preview..." });

    void fetch(`/api/v1/preview?url=${encodeURIComponent(normalizedTarget)}`, {
      method: "GET",
      signal: controller.signal
    })
      .then(async (response) => {
        const payload = (await response.json()) as PreviewApiResponse;
        if (cancelled) return;

        if (!response.ok || payload.status !== "success") {
          const message = payload.status === "error" ? payload.error.message : "Failed to load preview.";
          setPreviewState({ status: "error", message });
          return;
        }

        setPreviewState({ status: "success", data: payload.data });
      })
      .catch((error: unknown) => {
        if (cancelled || controller.signal.aborted) return;
        setPreviewState({
          status: "error",
          message: error instanceof Error ? error.message : "Failed to load preview."
        });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [normalizedTarget, parsedQueryTarget, rawQueryUrl]);

  const openInBrowser = (): void => {
    if (!normalizedTarget) return;
    window.open(normalizedTarget, "_blank", "noopener,noreferrer");
  };

  const onPreviewKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!normalizedTarget) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openInBrowser();
  };

  const clearPreview = (): void => {
    router.push(pathname);
  };

  const addressText = normalizedTarget ?? rawQueryUrl;
  const susIndex = previewState.status === "success" ? previewState.data.sus_index : null;

  const renderPreviewWindow = () => {
    if (previewState.status === "success" && previewState.data.image) {
      return (
        <Image
          src={previewState.data.image}
          alt={`Preview for ${previewState.data.hostname}`}
          width={1280}
          height={720}
          unoptimized
        />
      );
    }

    if (previewState.status === "success") {
      return (
        <>
          <p className="preview-state-title">{previewState.data.title}</p>
          <p className="preview-state-copy">{previewState.data.summary}</p>
        </>
      );
    }

    if (previewState.status === "idle") {
      return (
        <div className="idle-shell">
          <span className="idle-pulse" aria-hidden />
          <p className="preview-state-copy preview-state-muted">Ready</p>
        </div>
      );
    }

    return <p className="preview-state-copy">{previewState.message}</p>;
  };

  return (
    <main className="gateway-shell">
      <section className="noir-panel">
        <section className="preview-stage">
          {rawQueryUrl ? (
            <button
              className="stage-close"
              type="button"
              onClick={clearPreview}
              aria-label="Close preview"
              title="Close preview"
            >
              X
            </button>
          ) : null}
          <div
            className={`preview-window${normalizedTarget ? " is-clickable" : ""}`}
            onClick={openInBrowser}
            onKeyDown={onPreviewKeyDown}
            role={normalizedTarget ? "button" : undefined}
            tabIndex={normalizedTarget ? 0 : undefined}
            aria-label={normalizedTarget ? `Open ${normalizedTarget} in browser` : undefined}
          >
            {renderPreviewWindow()}
            {addressText ? (
              <div className="url-overlay" aria-hidden>
                {addressText}
              </div>
            ) : null}
            <div className="city-skyline" aria-hidden />
          </div>
          <section className="sus-panel">
            <div className="sus-grid">
              <p className="sus-item">
                <span>rate</span>
                <strong>{susIndex ? susIndex.rate : "--"}</strong>
              </p>
              <p className="sus-item">
                <span>domain_similarity</span>
                <strong>{susIndex ? susIndex.domain_similarity : "--"}</strong>
              </p>
              <p className="sus-item">
                <span>keyword_match</span>
                <strong>{susIndex ? susIndex.keyword_match : "--"}</strong>
              </p>
              <p className="sus-item">
                <span>password_input_match</span>
                <strong>{susIndex ? susIndex.password_input_match : "--"}</strong>
              </p>
              <p className="sus-item">
                <span>redirect_match</span>
                <strong>{susIndex ? susIndex.redirect_match : "--"}</strong>
              </p>
              <p className="sus-item">
                <span>redirect_count</span>
                <strong>{susIndex ? susIndex.redirect_count : "--"}</strong>
              </p>
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}

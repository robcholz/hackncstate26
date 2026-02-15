"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
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

type ClipboardInterceptKind = "paste" | "shortcut";

interface ShortcutTelemetry {
  blocked?: boolean;
  entropy?: number | null;
  clipboardLength?: number | null;
}

interface ClipboardInterceptPayload {
  kind: ClipboardInterceptKind;
  page: string;
  target_tag: string | null;
  url_context: string | null;
  clipboard_text: string;
  clipboard_text_length: number;
  clipboard_text_truncated: boolean;
  blocked: boolean;
  entropy: number | null;
  captured_at: string;
}

const CLIPBOARD_INTERCEPT_ENDPOINT = "/api/v1/clipboard/paste";
const MAX_INTERCEPT_TEXT_CHARS = 4000;

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
  const lastShortcutInterceptAt = useRef<number>(0);

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

  useEffect(() => {
    const emitClipboardIntercept = (payload: ClipboardInterceptPayload): void => {
      const body = JSON.stringify(payload);

      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        const blob = new Blob([body], { type: "application/json" });
        const accepted = navigator.sendBeacon(CLIPBOARD_INTERCEPT_ENDPOINT, blob);
        if (accepted) return;
      }

      void fetch(CLIPBOARD_INTERCEPT_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        keepalive: true
      });
    };

    const emitShortcutIntercept = (target: EventTarget | null, telemetry?: ShortcutTelemetry): void => {
      const now = Date.now();
      if (now - lastShortcutInterceptAt.current < 220) return;
      lastShortcutInterceptAt.current = now;

      const blocked = telemetry?.blocked === true;
      const entropy = typeof telemetry?.entropy === "number" ? telemetry.entropy : null;
      const clipboardLength =
        typeof telemetry?.clipboardLength === "number" && Number.isFinite(telemetry.clipboardLength)
          ? Math.max(0, Math.trunc(telemetry.clipboardLength))
          : 0;

      emitClipboardIntercept({
        kind: "shortcut",
        page: window.location.pathname,
        target_tag: getTargetTag(target),
        url_context: normalizedTarget ?? null,
        clipboard_text: "",
        clipboard_text_length: clipboardLength,
        clipboard_text_truncated: false,
        blocked,
        entropy,
        captured_at: new Date(now).toISOString()
      });
    };

    const onPaste = (event: ClipboardEvent): void => {
      const clipboardText = event.clipboardData?.getData("text/plain") ?? "";
      const truncatedText = clipboardText.slice(0, MAX_INTERCEPT_TEXT_CHARS);

      emitClipboardIntercept({
        kind: "paste",
        page: window.location.pathname,
        target_tag: getTargetTag(event.target),
        url_context: normalizedTarget ?? null,
        clipboard_text: truncatedText,
        clipboard_text_length: clipboardText.length,
        clipboard_text_truncated: clipboardText.length > truncatedText.length,
        blocked: false,
        entropy: null,
        captured_at: new Date().toISOString()
      });
    };

    const onPasteShortcut = (event: KeyboardEvent): void => {
      if (event.repeat || event.altKey || event.shiftKey) return;

      const isPasteShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v";
      if (!isPasteShortcut) return;

      emitShortcutIntercept(event.target);
    };

    window.addEventListener("paste", onPaste, true);
    window.addEventListener("keydown", onPasteShortcut, true);

    const removeElectronBridgeListener =
      typeof window.phishingLensBridge?.onPasteShortcutDetected === "function"
        ? window.phishingLensBridge.onPasteShortcutDetected((payload) => {
            const blocked = payload?.blocked === true;
            const entropy = typeof payload?.entropy === "number" ? payload.entropy : null;
            const clipboardLength = typeof payload?.clipboard_length === "number" ? payload.clipboard_length : null;

            emitShortcutIntercept(document.activeElement, {
              blocked,
              entropy,
              clipboardLength
            });
          })
        : () => {};

    return () => {
      window.removeEventListener("paste", onPaste, true);
      window.removeEventListener("keydown", onPasteShortcut, true);
      removeElectronBridgeListener();
    };
  }, [normalizedTarget]);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest("a[href]");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href) return;

      let resolved: URL;
      try {
        resolved = new URL(href, window.location.href);
      } catch {
        return;
      }

      if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return;
      if (resolved.origin === window.location.origin) return;

      event.preventDefault();
      event.stopPropagation();

      const url = resolved.toString();

      if (typeof window.phishingLensBridge?.openExternal === "function") {
        window.phishingLensBridge.openExternal(url);
        return;
      }

      // Fallback: Electron's main process will intercept the open.
      window.open(url, "_blank", "noopener,noreferrer");
    };

    document.addEventListener("click", onDocumentClick, true);
    return () => {
      document.removeEventListener("click", onDocumentClick, true);
    };
  }, []);

  const openInBrowser = (): void => {
    if (!normalizedTarget) return;
    if (typeof window.phishingLensBridge?.openExternal === "function") {
      window.phishingLensBridge.openExternal(normalizedTarget);
      return;
    }

    // Fallback: Electron's main process intercepts this and routes it to Safari.
    window.open(normalizedTarget, "_blank", "noopener,noreferrer");
  };

  const onPreviewKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
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

function getTargetTag(target: EventTarget | null): string | null {
  if (!target || !(target instanceof Element)) return null;
  return target.tagName || null;
}

import { useEffect, useRef, useState } from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
  type RenderTask,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "../../lib/i18n";
import { Button } from "../portal/ui";

GlobalWorkerOptions.workerSrc = workerUrl;

export default function PdfPreview({ url, filename }: { url: string; filename: string }) {
  const { t, lang } = useI18n();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const [text, setText] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    let loading: ReturnType<typeof getDocument> | undefined;
    setPdf(null);
    setPage(1);
    setBusy(true);
    setError(false);
    void (async () => {
      const response = await fetch(url, {
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        if (response.status === 401) window.dispatchEvent(new Event("lapnet:unauthorized"));
        throw new Error("PDF_PREVIEW_UNAVAILABLE");
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (controller.signal.aborted) return;
      loading = getDocument({ data: bytes });
      const document = await loading.promise;
      if (!controller.signal.aborted) setPdf(document);
    })().catch(() => {
      if (!controller.signal.aborted) {
        setError(true);
        setBusy(false);
      }
    });
    return () => {
      controller.abort();
      void loading?.destroy();
    };
  }, [url, attempt]);

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    let render: RenderTask | undefined;
    setBusy(true);
    setError(false);
    setText("");
    void (async () => {
      const documentPage = await pdf.getPage(page);
      if (cancelled || !canvas.current) return;
      const dimensions = documentPage.getViewport({ scale: 1 });
      const viewport = documentPage.getViewport({
        scale: Math.min(1.5, 1600 / dimensions.width, 2400 / dimensions.height),
      });
      canvas.current.width = Math.ceil(viewport.width);
      canvas.current.height = Math.ceil(viewport.height);
      render = documentPage.render({ canvas: canvas.current, viewport });
      await render.promise;
      const content = await documentPage.getTextContent();
      if (!cancelled) {
        setText(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
        setBusy(false);
      }
    })().catch(() => {
      if (!cancelled) {
        setError(true);
        setBusy(false);
      }
    });
    return () => {
      cancelled = true;
      render?.cancel();
    };
  }, [pdf, page]);

  return (
    <div className="flex flex-col gap-3" aria-label={filename}>
      {busy && <Skeleton variant="detail" />}
      {error && (
        <div role="alert" className="flex flex-col gap-2">
          <p>{t("error_hint")}</p>
          <Button onClick={() => setAttempt((value) => value + 1)}>{t("retry")}</Button>
        </div>
      )}
      <div className="max-h-[60vh] overflow-auto rounded-lg">
        <canvas
          ref={canvas}
          hidden={busy || error}
          role="img"
          aria-label={`${filename} · ${lang === "lo" ? "ໜ້າ" : "Page"} ${page}`}
          className="h-auto w-full bg-white"
        />
      </div>
      <p className="sr-only">{text}</p>
      {pdf && (
        <div className="flex items-center justify-between gap-2">
          <Button
            size="sm"
            disabled={busy || page === 1}
            onClick={() => setPage((value) => value - 1)}
          >
            {t("back")}
          </Button>
          <span className="t-caption" aria-live="polite">
            {page} / {pdf.numPages}
          </span>
          <Button
            size="sm"
            disabled={busy || page === pdf.numPages}
            onClick={() => setPage((value) => value + 1)}
          >
            {t("next")}
          </Button>
        </div>
      )}
    </div>
  );
}

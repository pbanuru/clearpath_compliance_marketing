import { useCallback, useEffect, useRef, useState } from 'react';
import { FiExternalLink, FiMaximize, FiMinus, FiPlus, FiRefreshCw } from 'react-icons/fi';
import type { PDFDocumentLoadingTask, PDFPageProxy } from 'pdfjs-dist';
import type { Finding } from './model';
import { PdfPage } from './PdfPage';
import './pdf.css';

type Loaded = { runtime: typeof import('pdfjs-dist'); pages: PDFPageProxy[] };

export function PdfViewer({
  url,
  name,
  selected,
  reload,
  findings,
  onSelect,
}: {
  url: string;
  name: string;
  selected?: Finding;
  reload: () => void;
  findings?: Finding[];
  onSelect?: (finding: Finding) => void;
}) {
  const [loaded, setLoaded] = useState<Loaded>();
  const [failed, setFailed] = useState(false);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [current, setCurrent] = useState(1);
  const container = useRef<HTMLDivElement>(null);
  const fail = useCallback(() => setFailed(true), []);
  useEffect(() => {
    let cancelled = false;
    const active = () => !cancelled;
    let task: PDFDocumentLoadingTask | undefined;
    async function load() {
      const runtime = await import('pdfjs-dist');
      if (!active()) return;
      const assets = `/pdfjs/${runtime.version}/`;
      runtime.GlobalWorkerOptions.workerSrc = `${assets}build/pdf.worker.min.mjs`;
      task = runtime.getDocument({
        url,
        cMapUrl: `${assets}cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${assets}standard_fonts/`,
        wasmUrl: `${assets}wasm/`,
      });
      // No password prompt: encrypted documents use the same recoverable failure state.
      const pdf = await task.promise;
      const pages = await Promise.all(
        Array.from({ length: pdf.numPages }, (_, index) => pdf.getPage(index + 1)),
      );
      if (active()) setLoaded({ runtime, pages });
    }
    void load().catch((error: unknown) => {
      if (!cancelled && error) setFailed(true);
    });
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [url]);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const resize = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(0, entry.contentRect.width - 10));
    });
    resize.observe(element);
    return () => resize.disconnect();
  }, []);
  useEffect(() => {
    const element = container.current;
    if (!element || !loaded) return;
    let scheduled = 0;
    function update() {
      cancelAnimationFrame(scheduled);
      scheduled = requestAnimationFrame(() => {
        if (!element) return;
        const panel = element.closest('.cp-material-panel');
        const frame = panel?.getBoundingClientRect();
        const controls = element.querySelector('.cp-pdf-controls')?.getBoundingClientRect();
        const top = Math.max(0, frame?.top ?? 0, controls?.bottom ?? 0);
        const bottom = Math.min(window.innerHeight, frame?.bottom ?? window.innerHeight);
        const pages = Array.from(element.querySelectorAll<HTMLElement>('[data-page]'));
        const visible = pages.reduce<HTMLElement | undefined>((best, page) => {
          const area = (entry: HTMLElement) => {
            const rect = entry.getBoundingClientRect();
            return Math.max(0, Math.min(bottom, rect.bottom) - Math.max(top, rect.top));
          };
          return area(page) > (best ? area(best) : 0) ? page : best;
        }, undefined);
        if (visible) setCurrent(Number(visible.dataset.page));
      });
    }
    window.addEventListener('scroll', update, true);
    update();
    return () => {
      window.removeEventListener('scroll', update, true);
      cancelAnimationFrame(scheduled);
    };
  }, [loaded, width, zoom]);
  const selectedPage = selected ? (selected.location?.page ?? 1) : undefined;
  return (
    <div className="cp-pdf-viewer" ref={container} aria-label={name}>
      <div className="cp-pdf-controls" role="group" aria-label="PDF controls">
        <span className="cp-pdf-count" aria-live="polite">
          {loaded ? `Page ${current} of ${loaded.pages.length}` : 'PDF preview'}
        </span>
        <button type="button" title="Fit width" aria-label="Fit width" onClick={() => setZoom(1)}>
          <FiMaximize /> <span>Fit width</span>
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          disabled={zoom <= 0.5 || !loaded}
          onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
        >
          <FiMinus />
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          disabled={zoom >= 2 || !loaded}
          onClick={() => setZoom((z) => Math.min(2, z + 0.25))}
        >
          <FiPlus />
        </button>
        <a href={url} target="_blank" rel="noreferrer">
          Open PDF <FiExternalLink />
        </a>
      </div>
      {failed ? (
        <div className="cp-error" role="alert">
          This browser could not preview this file. Open the original, or reload the preview.
          <button className="cp-button" onClick={reload}>
            <FiRefreshCw /> Reload preview
          </button>
        </div>
      ) : loaded ? (
        <div className="cp-pdf-pages">
          {loaded.pages.map((page) => (
            <PdfPage
              key={page.pageNumber}
              page={page}
              runtime={loaded.runtime}
              width={width * zoom}
              finding={selectedPage === page.pageNumber ? selected : undefined}
              findings={(findings ?? (selected ? [selected] : [])).filter(
                (finding) => (finding.location?.page ?? 1) === page.pageNumber,
              )}
              onSelect={onSelect}
              onError={fail}
            />
          ))}
        </div>
      ) : (
        <p className="cp-preview-loading" role="status">
          Loading PDF…
        </p>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import type { PDFPageProxy, TextLayer, RenderTask } from 'pdfjs-dist';
import type { Finding } from './model';
import { PdfHighlights } from './PdfHighlights';

export function PdfPage({
  page,
  runtime,
  width,
  finding,
  findings,
  onSelect,
  onError,
}: {
  page: PDFPageProxy;
  runtime: typeof import('pdfjs-dist');
  width: number;
  finding?: Finding;
  findings: Finding[];
  onSelect?: (finding: Finding) => void;
  onError: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [nearby, setNearby] = useState(false);
  const [rendered, setRendered] = useState<{ layer: TextLayer; page: HTMLDivElement }>();
  const viewport = page.getViewport({ scale: 1 });
  const selected = Boolean(finding);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setNearby(true);
          observer.disconnect();
        }
      },
      { rootMargin: '800px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const element = host.current;
    if (!element || !width || (!nearby && !selected)) return;
    let cancelled = false;
    const active = () => !cancelled;
    let task: RenderTask | undefined;
    let layer: TextLayer | undefined;
    const canvas = document.createElement('canvas');
    const text = document.createElement('div');
    text.className = 'cp-pdf-text';
    element.replaceChildren(canvas, text);
    const scaled = page.getViewport({ scale: (width - 2) / viewport.width });
    element.style.setProperty('--total-scale-factor', String(scaled.scale));
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.ceil(scaled.width * dpr);
    canvas.height = Math.ceil(scaled.height * dpr);
    async function render(pageElement: HTMLDivElement) {
      const content = await page.getTextContent();
      if (!active()) return;
      task = page.render({
        canvas,
        viewport: scaled,
        transform: [dpr, 0, 0, dpr, 0, 0],
        background: '#ffffff',
      });
      layer = new runtime.TextLayer({
        container: text,
        textContentSource: content,
        viewport: scaled,
      });
      await Promise.all([task.promise, layer.render()]);
      if (active()) setRendered({ layer, page: pageElement });
    }
    void render(element).catch((error: unknown) => {
      if (!cancelled && !(error instanceof Error && error.name === 'RenderingCancelledException'))
        onError();
    });
    return () => {
      cancelled = true;
      task?.cancel();
      layer?.cancel();
    };
  }, [page, runtime, width, viewport.width, nearby, selected, onError]);
  return (
    <section
      className={`cp-pdf-page ${finding ? `cp-pdf-page-selected ${finding.severity}` : ''}`}
      aria-label={`Page ${page.pageNumber}`}
      data-page={page.pageNumber}
      style={{ width, aspectRatio: `${viewport.width} / ${viewport.height}` }}
    >
      <div className="cp-pdf-render" ref={host} />
      {rendered && (
        <PdfHighlights {...rendered} finding={finding} findings={findings} onSelect={onSelect} />
      )}
    </section>
  );
}

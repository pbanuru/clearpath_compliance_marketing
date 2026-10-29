import { useEffect, useEffectEvent, useState, type RefObject } from 'react';
import type { PDFDocumentLoadingTask, RenderTask } from 'pdfjs-dist';
import type { Id } from '@clearpath/backend/convex/_generated/dataModel';
import { useAssetAccess } from '@/features/assets/useAssetAccess';

export function usePdfThumbnail(
  assetId: Id<'assets'> | undefined,
  host: RefObject<HTMLElement | null>,
) {
  const [visible, setVisible] = useState(false);
  const [thumbnail, setThumbnail] = useState<{ source: string; bitmap: string }>();
  const access = useAssetAccess(visible ? assetId : undefined);
  const url = access.failed ? undefined : access.urls?.original;
  const retry = useEffectEvent(() => access.retry('image'));

  useEffect(() => {
    const element = host.current;
    if (!assetId || !element) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [assetId, host]);

  useEffect(() => {
    if (!url) return;
    const source = url;
    let cancelled = false;
    const active = () => !cancelled;
    let task: PDFDocumentLoadingTask | undefined;
    let render: RenderTask | undefined;
    let bitmap: string | undefined;
    const canvas = document.createElement('canvas');

    async function load() {
      const runtime = await import('pdfjs-dist');
      if (!active()) return;
      const assets = `/pdfjs/${runtime.version}/`;
      runtime.GlobalWorkerOptions.workerSrc = `${assets}build/pdf.worker.min.mjs`;
      task = runtime.getDocument({
        url: source,
        cMapUrl: `${assets}cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${assets}standard_fonts/`,
        wasmUrl: `${assets}wasm/`,
      });
      const pdf = await task.promise;
      if (!active()) return;
      const page = await pdf.getPage(1);
      if (!active()) return;
      const viewport = page.getViewport({ scale: 640 / page.getViewport({ scale: 1 }).width });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      render = page.render({ canvas, viewport, background: '#ffffff' });
      await render.promise;
      if (!active()) return;
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve));
      if (!active()) return;
      if (!blob) throw new Error('PDF thumbnail could not be encoded.');
      bitmap = URL.createObjectURL(blob);
      setThumbnail({ source, bitmap });
    }

    void load()
      .catch((error: unknown) => {
        if (!cancelled && error) retry();
      })
      .finally(() => {
        canvas.width = 0;
        canvas.height = 0;
        void task?.destroy();
      });
    return () => {
      cancelled = true;
      render?.cancel();
      void task?.destroy();
      if (bitmap) URL.revokeObjectURL(bitmap);
    };
  }, [url]);

  return {
    url: thumbnail && thumbnail.source === url ? thumbnail.bitmap : undefined,
    onError: () => access.retry('image'),
    onLoad: () => access.loaded('image'),
  };
}

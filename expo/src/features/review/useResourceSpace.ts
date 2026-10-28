import { useEffect, useRef } from 'react';

/** Fit previews into the visible page space without adding a scrolling panel. */
export function useResourceSpace() {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = panel.current;
    const page = element?.closest('.app-shell-content');
    if (!element || !page) return;
    let frame = 0;
    function measure() {
      frame = 0;
      if (!element || !page) return;
      const pageBox = page.getBoundingClientRect();
      const top = Math.max(element.getBoundingClientRect().top, pageBox.top);
      const bar = page.querySelector('.cp-decision-bar')?.getBoundingClientRect().height ?? 0;
      const toolbar =
        element.querySelector('.cp-material-toolbar')?.getBoundingClientRect().height ?? 0;
      element.style.setProperty(
        '--cp-resource-space',
        `${Math.max(160, pageBox.bottom - top - bar - toolbar)}px`,
      );
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(measure);
    }
    const resize = new ResizeObserver(schedule);
    resize.observe(page);
    const review = element.closest('main');
    if (review) resize.observe(review);
    const header = page.querySelector('.cp-review-header');
    if (header) resize.observe(header);
    const toolbar = element.querySelector('.cp-material-toolbar');
    if (toolbar) resize.observe(toolbar);
    page.addEventListener('scroll', schedule, { passive: true });
    schedule();
    return () => {
      resize.disconnect();
      page.removeEventListener('scroll', schedule);
      cancelAnimationFrame(frame);
    };
  }, []);
  return panel;
}

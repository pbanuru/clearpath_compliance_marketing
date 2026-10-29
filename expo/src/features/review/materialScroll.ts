export function revealMaterialHighlight(element: Element | null | undefined) {
  if (!element) return;
  requestAnimationFrame(() => {
    // PDF.js callers used to pass the nested page scroller. It is now flattened.
    const target = element.matches('.cp-pdf-pages')
      ? (element.querySelector('.selected') ??
        element.querySelector('.cp-pdf-page-selected') ??
        element)
      : element;
    const desktop = window.matchMedia('(min-width: 701px)').matches;
    if (!desktop && target.closest('.cp-review')?.getAttribute('data-mobile-panel') === 'findings')
      return;
    const scroller = target.closest<HTMLElement>(
      desktop ? '.cp-material-panel' : '.cp-review-columns',
    );
    if (!scroller) return;
    const box = target.getBoundingClientRect();
    const frame = scroller.getBoundingClientRect();
    const controls =
      target.closest('.cp-pdf-viewer')?.querySelector('.cp-pdf-controls')?.getBoundingClientRect()
        .height ?? 0;
    const top = frame.top + controls + 12;
    const bottom = frame.bottom - 12;
    scroller.scrollBy({
      top:
        box.top < top || box.bottom > bottom
          ? box.top - top - Math.max(0, (bottom - top - box.height) / 2)
          : 0,
      left:
        box.left < frame.left + 8 || box.right > frame.right - 8
          ? box.left - frame.left - Math.max(8, (scroller.clientWidth - box.width) / 2)
          : 0,
    });
  });
}

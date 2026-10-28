export function revealMaterialHighlight(element: Element | null | undefined) {
  if (!element || !window.matchMedia('(min-width: 1024px)').matches) return;
  requestAnimationFrame(() => {
    const viewer = element.closest<HTMLElement>('.cp-material-panel');
    if (!viewer) return;
    const target = element.getBoundingClientRect();
    const frame = viewer.getBoundingClientRect();
    const bar = document.querySelector('.cp-decision-bar')?.getBoundingClientRect();
    const bottom = Math.min(frame.bottom, bar?.top ?? window.innerHeight);
    if (target.top < frame.top + 16 || target.bottom > bottom - 16) {
      viewer.scrollBy({
        top: target.top - frame.top - Math.max(16, (bottom - frame.top - target.height) / 2),
      });
    }
  });
}

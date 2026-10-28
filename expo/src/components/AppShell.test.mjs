import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';

const path = vi.hoisted(() => ({ current: '/' }));
vi.mock('expo-router', () => ({ usePathname: () => path.current }));
function shell(route) {
  path.current = route;
  return renderToStaticMarkup(createElement(AppShell, { header: 'ClearPath' }, 'Screen'));
}
describe('shell scrolling contract', () => {
  it('assigns scrolling to the panes on a review route', () => {
    expect(shell('/reviews/review-id')).toContain('data-scroll="panes"');
  });
  it.each(['/', '/submit', '/policies', '/notifications'])(
    'keeps page scrolling on %s',
    (route) => {
      expect(shell(route)).toContain('data-scroll="page"');
    },
  );
});

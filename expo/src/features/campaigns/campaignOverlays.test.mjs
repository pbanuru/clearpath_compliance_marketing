// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { getFunctionName } from 'convex/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CampaignPicker } from './CampaignPicker';
import { ReviewCampaign } from './ReviewCampaign';

const mocks = vi.hoisted(() => ({ create: vi.fn(), move: vi.fn(), path: '/submit' }));
const campaign = { _id: 'campaign', name: 'Launch', counts: { approved: 1, total: 2 } };
vi.mock('expo-router', () => ({
  Link: ({ children }) => children,
  usePathname: () => mocks.path,
  useGlobalSearchParams: () => ({}),
}));
vi.mock('convex/react', () => ({
  useQuery: () => ({ campaign }),
  usePaginatedQuery: () => ({ results: [campaign], status: 'Exhausted', loadMore: vi.fn() }),
  useMutation: (reference) =>
    getFunctionName(reference) === 'campaigns:create' ? mocks.create : mocks.move,
}));
let root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  mocks.path = '/submit';
  mocks.create.mockReset();
  mocks.move.mockReset();
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}]);
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function () {
    this.setAttribute('open', '');
  });
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function () {
    this.removeAttribute('open');
  });
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
const click = (selector) => act(() => document.querySelector(selector).click());
const escape = () =>
  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
const outside = () =>
  act(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
const button = (label) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent === label);
function moveDialog() {
  return createElement(ReviewCampaign, { review: { _id: 'review', campaignId: campaign._id } });
}
async function openMove() {
  await act(() => root.render(moveDialog()));
  document.querySelector('[aria-label="Move to campaign"]').focus();
  await click('[aria-label="Move to campaign"]');
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it('standalone picker dismisses outside, on Escape, and on route changes', async () => {
  const picker = () => createElement(CampaignPicker, { onChange: vi.fn() });
  await act(() => root.render(picker()));
  await click('.cp-campaign-picker-toggle');
  expect(document.querySelector('.cp-campaign-options')).not.toBeNull();
  await outside();
  expect(document.querySelector('.cp-campaign-options')).toBeNull();
  expect(document.activeElement.className).toBe('cp-campaign-picker-toggle');
  await click('.cp-campaign-picker-toggle');
  await escape();
  expect(document.querySelector('.cp-campaign-options')).toBeNull();
  await click('.cp-campaign-picker-toggle');
  mocks.path = '/campaigns';
  await act(() => root.render(picker()));
  expect(document.querySelector('.cp-campaign-options')).toBeNull();
  expect(mocks.create).not.toHaveBeenCalled();
});

it('embedded picker stays in the modal and harmless dismissal never moves a submission', async () => {
  await openMove();
  await click('.cp-campaign-picker-toggle');
  const dialog = document.querySelector('dialog[open]');
  expect(dialog).not.toBeNull();
  expect(dialog.querySelector('.cp-campaign-options')).not.toBeNull();
  expect(document.querySelectorAll('[data-overlay-open]')).toHaveLength(1);
  await escape();
  expect(document.querySelector('dialog')).toBeNull();
  expect(document.activeElement.getAttribute('aria-label')).toBe('Move to campaign');
  expect(mocks.move).not.toHaveBeenCalled();
});

it('pending campaign move blocks Escape, backdrop and visible cancellation until saved', async () => {
  const pending = deferred();
  mocks.move.mockReturnValue(pending.promise);
  await openMove();
  await act(() => button('Save campaign').click());
  expect(document.querySelector('dialog').getAttribute('aria-busy')).toBe('true');
  expect(document.querySelector('[aria-label="Close campaign picker"]').disabled).toBe(true);
  expect(button('Cancel').disabled).toBe(true);
  await outside();
  await escape();
  expect(document.querySelector('dialog[open]')).not.toBeNull();
  expect(mocks.move).toHaveBeenCalledWith({ reviewId: 'review', campaignId: 'campaign' });
  await act(async () => pending.resolve(null));
  expect(document.querySelector('dialog')).toBeNull();
  expect(document.activeElement.getAttribute('aria-label')).toBe('Move to campaign');
});

it('inline creation protects the parent modal and never saves membership implicitly', async () => {
  const pending = deferred();
  mocks.create.mockReturnValue(pending.promise);
  await openMove();
  await click('.cp-campaign-picker-toggle');
  await act(() => button('New campaign').click());
  const name = document.querySelector('.cp-campaign-inline-new input');
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(
      name,
      'New launch',
    );
    name.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(() => button('Create campaign').click());
  expect(document.querySelector('dialog').getAttribute('aria-busy')).toBe('true');
  expect(button('Save campaign').disabled).toBe(true);
  await outside();
  await escape();
  expect(document.querySelector('dialog[open]')).not.toBeNull();
  await act(async () => pending.resolve('new-campaign'));
  expect(document.querySelector('#campaign-selection').textContent).toBe('New launch');
  expect(document.querySelector('dialog[open]')).not.toBeNull();
  expect(mocks.move).not.toHaveBeenCalled();
  await outside();
  expect(document.querySelector('dialog')).toBeNull();
});

// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerDismissable } from './dismissable';
const cleanups = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()();
  document.body.replaceChildren();
});
function overlay({ modal = false, blocked = () => false } = {}) {
  const trigger = document.createElement('button');
  const content = document.createElement('div');
  const inside = document.createElement('button');
  content.append(inside);
  document.body.append(trigger, content);
  vi.spyOn(trigger, 'getClientRects').mockReturnValue([{}]);
  const dismiss = vi.fn();
  const cleanup = registerDismissable({ trigger, content, modal, blocked, dismiss });
  cleanups.push(cleanup);
  inside.focus();
  return { trigger, content, inside, dismiss, cleanup };
}

describe('shared overlay dismissal contract', () => {
  it('closes on an outside pointer press, returns focus and leaves the next action usable', () => {
    const item = overlay();
    const next = document.createElement('button');
    document.body.append(next);
    const action = vi.fn();
    next.addEventListener('click', action);
    const event = new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      pointerType: 'touch',
    });
    next.dispatchEvent(event);
    expect(item.dismiss).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(item.trigger);
    expect(event.defaultPrevented).toBe(false);
    next.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch' }));
    next.click();
    expect(action).toHaveBeenCalledOnce();
  });
  it('leaves an inside press and the trigger available for normal interaction', () => {
    const item = overlay();
    item.inside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    item.trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(item.dismiss).not.toHaveBeenCalled();
  });
  it('restores focus after a touch on blank space completes its mouse compatibility events', async () => {
    const item = overlay();
    document.body.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }),
    );
    // A browser's compatibility mousedown blurs the trigger after pointerup.
    item.trigger.blur();
    document.body.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.activeElement).toBe(item.trigger);
  });
  it('closes on Escape and returns focus to the trigger', () => {
    const item = overlay();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(item.dismiss).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(item.trigger);
  });
  it('replaces another overlay without its cleanup stealing the new focus', () => {
    const first = overlay(),
      second = overlay();
    expect(first.dismiss).toHaveBeenCalledOnce();
    first.cleanup();
    expect(document.activeElement).toBe(second.inside);
  });
  it('keeps a busy dialog open, then allows harmless dismissal', () => {
    let busy = true;
    const item = overlay({ modal: true, blocked: () => busy });
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(item.dismiss).not.toHaveBeenCalled();
    busy = false;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(item.dismiss).toHaveBeenCalledOnce();
  });
  it('locks background scrolling for a dialog and restores the existing overflow on close', async () => {
    document.body.style.overflow = 'auto';
    const item = overlay({ modal: true });
    expect(document.body.style.overflow).toBe('hidden');
    const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true });
    document.body.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    item.cleanup();
    cleanups.pop();
    expect(document.body.style.overflow).toBe('auto');
    await Promise.resolve();
    expect(document.activeElement).toBe(item.trigger);
  });
});

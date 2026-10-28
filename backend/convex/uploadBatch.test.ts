import { describe, expect, it, vi } from 'vitest';
import { UploadBatch } from '../../expo/src/features/assets/uploadBatch';

type Upload = {
  key: string;
  assetId?: string;
  replacementFor?: string;
  replacingAssetId?: string;
};

function setup() {
  const changed = vi.fn<(items: Upload[]) => void>();
  const busy = vi.fn<(value: boolean) => void>();
  const batch = new UploadBatch(changed, busy);
  const send = vi.fn((item: Upload) => {
    if (item.key === 'failed') return Promise.reject(new Error('Network interrupted'));
    item.assetId = `asset-${item.key}`;
    batch.publish();
    return Promise.resolve(item.assetId);
  });
  return { batch, send, changed, busy };
}

describe('upload call ownership', () => {
  it('shares exclusion and readiness between non-file captures and file batches', async () => {
    const { batch, send, changed, busy } = setup();
    let finishCapture: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      finishCapture = resolve;
    });
    const capture = batch.exclusive(async () => {
      const item: Upload = { key: 'webpage' };
      batch.add(item);
      await pending;
      item.assetId = 'asset-webpage';
      batch.publish();
      return item.assetId;
    });
    expect(changed.mock.lastCall?.[0].every((item) => !!item.assetId)).toBe(false);
    expect(busy.mock.lastCall).toEqual([true]);
    await expect(batch.upload([{ key: 'blocked' }], send)).rejects.toThrow('Wait for');
    expect(send).not.toHaveBeenCalled();
    finishCapture?.();
    await expect(capture).resolves.toBe('asset-webpage');
    await expect(batch.upload([{ key: 'file' }], send)).resolves.toEqual(['asset-file']);
    expect(changed.mock.lastCall?.[0]).toEqual([
      { key: 'webpage', assetId: 'asset-webpage' },
      { key: 'file', assetId: 'asset-file' },
    ]);
    expect(busy.mock.lastCall).toEqual([false]);
  });

  it('does not retry a failed file when a new upload starts; retry is per item', async () => {
    const { batch, send, busy } = setup();
    const failed = { key: 'failed' };
    await expect(batch.upload([failed], send)).rejects.toThrow('Network interrupted');
    await expect(batch.upload([{ key: 'new' }], send)).resolves.toEqual(['asset-new']);
    expect(send.mock.calls.map(([item]) => item.key)).toEqual(['failed', 'new']);

    const retry = vi.fn((item: Upload) => {
      expect(item).toBe(failed);
      item.assetId = 'asset-retried';
      batch.publish();
      return Promise.resolve(item.assetId);
    });
    await expect(batch.retry('failed', retry)).resolves.toBe('asset-retried');
    expect(retry).toHaveBeenCalledTimes(1);
    expect(busy.mock.calls.map(([value]) => value)).toEqual([
      true,
      false,
      true,
      false,
      true,
      false,
    ]);
  });

  it('replaces a failed replacement with exactly one successor', async () => {
    const { batch, send, changed } = setup();
    await expect(
      batch.upload([{ key: 'failed', replacementFor: 'original' }], send),
    ).rejects.toThrow('Network interrupted');
    await expect(
      batch.upload([{ key: 'successor', replacementFor: 'original' }], send),
    ).resolves.toEqual(['asset-successor']);
    expect(send.mock.calls.map(([item]) => item.key)).toEqual(['failed', 'successor']);
    expect(changed.mock.lastCall?.[0]).toEqual([
      { key: 'successor', replacementFor: 'original', assetId: 'asset-successor' },
    ]);
    await expect(batch.retry('failed', send)).rejects.toThrow('no longer selected');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('attempts every file in its batch without retaining an implicit retry queue', async () => {
    const { batch, send } = setup();
    await expect(batch.upload([{ key: 'failed' }, { key: 'second' }], send)).rejects.toThrow(
      'Network interrupted',
    );
    await expect(batch.upload([{ key: 'third' }], send)).resolves.toEqual(['asset-third']);
    expect(send.mock.calls.map(([item]) => item.key)).toEqual(['failed', 'second', 'third']);
  });
});

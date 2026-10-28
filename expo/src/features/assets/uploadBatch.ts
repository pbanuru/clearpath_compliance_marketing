type Item = {
  key: string;
  assetId?: string;
  replacementFor?: string;
  replacingAssetId?: string;
};

/** Visible upload history is separate from the files owned by an upload call. */
export class UploadBatch<T extends Item> {
  private items = new Map<string, T>();
  private active = false;

  constructor(
    private changed: (items: T[]) => void,
    private busy: (value: boolean) => void,
  ) {}

  publish() {
    this.changed([...this.items.values()].map((item) => ({ ...item })));
  }

  add(item: T) {
    for (const [key, previous] of this.items) {
      if (
        (item.replacementFor && previous.replacementFor === item.replacementFor) ||
        (item.replacingAssetId && previous.assetId === item.replacingAssetId)
      )
        this.items.delete(key);
    }
    this.items.set(item.key, item);
    this.publish();
  }

  async exclusive<R>(operation: () => Promise<R>): Promise<R> {
    if (this.active) throw new Error('Wait for the current upload to finish.');
    this.active = true;
    this.busy(true);
    try {
      return await operation();
    } finally {
      this.active = false;
      this.busy(false);
    }
  }

  upload<R>(items: T[], send: (item: T) => Promise<R>): Promise<R[]> {
    return this.exclusive(async () => {
      for (const item of items) this.add(item);
      const results: R[] = [];
      let failure: { error: unknown } | undefined;
      // Process this selection only, including the remaining files if one fails.
      for (const item of items) {
        try {
          results.push(await send(item));
        } catch (error) {
          failure ??= { error };
        }
      }
      if (failure) throw failure.error;
      return results;
    });
  }

  retry<R>(key: string, send: (item: T) => Promise<R>): Promise<R> {
    return this.exclusive(async () => {
      const item = this.items.get(key);
      if (!item) throw new Error('This upload is no longer selected.');
      return send(item);
    });
  }

  remove(key: string) {
    if (this.active) return;
    this.items.delete(key);
    this.publish();
  }
}

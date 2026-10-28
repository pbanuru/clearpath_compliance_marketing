import type { ActionCtx } from '../_generated/server';
import { internal } from '../_generated/api';
import type { Library } from './sourceLibrary';
import type { Infer } from 'convex/values';
import type { monitor } from './tables';

export async function loadMonitors(
  ctx: ActionCtx,
  sourceKey: string,
): Promise<Infer<typeof monitor>[]> {
  const monitors = new Map<string, Infer<typeof monitor>>();
  let cursor: string | null = null,
    done = false;
  while (!done) {
    const page: { monitors: Infer<typeof monitor>[]; isDone: boolean; cursor: string } =
      await ctx.runQuery(internal.policy.sourceLibrary.monitors, { sourceKey, cursor });
    for (const value of page.monitors) monitors.set(JSON.stringify(value), value);
    cursor = page.cursor;
    done = page.isDone;
  }
  return [...monitors.values()];
}

export async function loadLibraries(ctx: ActionCtx, sourceKey: string): Promise<Library[]> {
  const grouped = new Map<string, Library>();
  let cursor: string | null = null,
    done = false;
  while (!done) {
    const page: { libraries: Library[]; isDone: boolean; cursor: string } = await ctx.runQuery(
      internal.policy.sourceLibrary.rules,
      { sourceKey, cursor },
    );
    for (const library of page.libraries) {
      const key = JSON.stringify({ keys: library.keys, rules: library.rules });
      const existing = grouped.get(key);
      if (existing) existing.owners.push(...library.owners);
      else grouped.set(key, library);
    }
    cursor = page.cursor;
    done = page.isDone;
  }
  return [...grouped.values()];
}

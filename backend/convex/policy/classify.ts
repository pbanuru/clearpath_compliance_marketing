import type { Infer } from 'convex/values';
import type { Span } from '../review/openai';
import { readableError } from '../review/openai';
import type { Signal } from './sources';
import type { Library } from './sourceLibrary';
import type { sourceDraft } from './tables';
import { triage } from './triage';

export async function classify(signals: Signal[], spans: Span[], libraries: Library[]) {
  const merged = new Map<string, { fingerprint: string; drafts: Infer<typeof sourceDraft>[] }>(
    signals.map((signal) => [signal.fingerprint, { fingerprint: signal.fingerprint, drafts: [] }]),
  );
  for (const library of libraries) {
    // A provider request sees one library and only its policy keys. Identical
    // libraries may share a result, while distinct workspace material stays apart.
    const scoped = signals.map((signal) => ({
      ...signal,
      keys: signal.keys.filter((key) => library.rules.some((p) => p.id === key)),
    }));
    let results: { fingerprint: string; drafts: Infer<typeof sourceDraft>[] }[] = [];
    try {
      for (let index = 0; index < scoped.length; index += 25)
        results.push(...(await triage(scoped.slice(index, index + 25), spans, library)));
    } catch (cause) {
      const triageError = readableError(cause);
      results = scoped.map((signal) => ({
        fingerprint: signal.fingerprint,
        drafts: (signal.keys.length ? signal.keys : [null]).map((key) => ({
          owners: library.owners,
          key,
          title:
            library.rules.find((p) => p.id === key)?.title ??
            signal.evidence.documentTitle ??
            'New source publication',
          appliesTo: library.rules.find((p) => p.id === key)?.appliesTo ?? {},
          kind: signal.kind,
          evidence: signal.evidence,
          aiSummary: 'Source change detected. Review the evidence and write the updated check.',
          proposedCheck: '',
          triageError,
        })),
      }));
    }
    for (const result of results) merged.get(result.fingerprint)?.drafts.push(...result.drafts);
  }
  return [...merged.values()];
}

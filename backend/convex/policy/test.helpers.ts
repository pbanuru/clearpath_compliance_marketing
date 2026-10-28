import { vi } from 'vitest';
import { api } from '../_generated/api';
import { aliceIdentity, setup } from '../reviewTest.helpers';
import { response } from '../pipelineTest.helpers';
import { record, string } from '../review/parsing';
export async function workspace() {
  const t = setup(),
    alice = t.withIdentity(aliceIdentity),
    bob = t.withIdentity({
      ...aliceIdentity,
      subject: 'bob',
      tokenIdentifier: 'https://auth.example|bob',
    });
  await alice.mutation(api.policies.initialize, {});
  return { t, alice, bob };
}
export async function job(t: ReturnType<typeof setup>, sourceKey: string) {
  return t.run((ctx) => ctx.db.insert('sourceJobs', { sourceKey, status: 'queued', attempts: 0 }));
}
export function triaged(key: string | null = 'fair-lending', signalIndex = 0, libraryIndex = 0) {
  return {
    signalIndex,
    libraryIndex,
    relevant: true,
    key,
    title: 'Updated rule',
    products: [],
    channels: [],
    aiSummary: 'The source now clarifies the marketing requirement.',
    proposedCheck: 'include a representative payment example alongside every advertised rate.',
  };
}
export const pageText =
  '<main><h1>Marketing guidance</h1><p>' +
  'Lenders should explain the representative payment for advertised rates. '.repeat(4) +
  '</p></main>';
export const feed = (urls: string[]) =>
  `<rss><channel>${urls.map((url) => `<item><title>New lender guidance</title><link>${url}</link></item>`).join('')}</channel></rss>`;
export function mockTriage(decisions: ReturnType<typeof triaged>[]) {
  return response(JSON.stringify({ decisions }));
}
export function requestLibraries(init?: RequestInit) {
  if (typeof init?.body !== 'string') throw new Error('Expected a JSON model request.');
  const input = record(JSON.parse(string(record(JSON.parse(init.body)).input)));
  if (!Array.isArray(input.libraries)) throw new Error('Expected workspace libraries.');
  return input.libraries.map((value: unknown) => {
    const library = record(value);
    if (!Array.isArray(library.rules)) throw new Error('Expected library rules.');
    return { rules: library.rules.map((rule: unknown) => ({ id: string(record(rule).id) })) };
  });
}
export function fetcher(handler: (url: string, init?: RequestInit) => Response) {
  const fn = vi.fn((input: string, init?: RequestInit) => Promise.resolve(handler(input, init)));
  vi.stubGlobal('fetch', fn);
  return fn;
}
export async function fanouts(t: ReturnType<typeof setup>) {
  const signals = await t.run((ctx) => ctx.db.query('sourceSignals').collect());
  const { internal } = await import('../_generated/api');
  for (const s of signals)
    await t.mutation(internal.policy.monitorState.fanout, { signalId: s._id, cursor: null });
}
export function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('Missing test fixture value.');
  return value;
}

export function requestQuestions(init?: RequestInit) {
  if (typeof init?.body !== 'string') throw new Error('Expected a JSON model request.');
  const questions = record(JSON.parse(init.body)).questions;
  if (!Array.isArray(questions)) throw new Error('Expected quick-check questions.');
  return questions.map((q: unknown) => ({
    name: string(record(q).name),
    instructions: string(record(q).instructions),
  }));
}

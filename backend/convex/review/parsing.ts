import type { Infer } from 'convex/values';
import type { Doc } from '../_generated/dataModel';
import type { analysisResult, analysisFinding } from './output';
import type { location } from './types';
import { normalizePolicy } from './policies';
import { validateLocation } from './helpers';
import { webpageAnchor } from './webpageAnchor';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('Expected an object in OpenAI output.');
  return value;
}
export function string(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected text in OpenAI output.');
  return value;
}
function nullableNumber(value: unknown): number | undefined {
  if (value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error('Invalid number in OpenAI output.');
  return value;
}
function nullableString(value: unknown): string | undefined {
  return value === null ? undefined : string(value);
}
function parseLocation(
  value: unknown,
  assets: Doc<'assets'>[],
): Infer<typeof location> | undefined {
  const loc = record(value);
  if (loc.assetId === null) return undefined;
  const asset = assets.find((a) => a._id === loc.assetId);
  if (!asset) throw new Error('OpenAI cited an asset outside this version.');
  const region = loc.region === null ? undefined : record(loc.region);
  const parsed = {
    assetId: asset._id,
    quote: nullableString(loc.quote),
    startSeconds: nullableNumber(loc.startSeconds),
    endSeconds: nullableNumber(loc.endSeconds),
    page: nullableNumber(loc.page),
    region: region
      ? {
          x: requiredNumber(region.x),
          y: requiredNumber(region.y),
          width: requiredNumber(region.width),
          height: requiredNumber(region.height),
        }
      : undefined,
  };
  validateLocation(
    parsed,
    assets.map((a) => a._id),
  );
  return parsed;
}
function requiredNumber(value: unknown): number {
  const n = nullableNumber(value);
  if (n === undefined) throw new Error('Expected a numeric region.');
  return n;
}
export function parseAnalysis(
  raw: string,
  assets: Doc<'assets'>[],
  previous: Doc<'findings'>[],
  texts: Map<string, string>,
): Infer<typeof analysisResult> {
  const output: unknown = JSON.parse(raw);
  const obj = record(output);
  if (!Array.isArray(obj.findings) || obj.findings.length > 100 || !Array.isArray(obj.previous))
    throw new Error('Invalid findings or previous findings in OpenAI output.');
  const findings: Infer<typeof analysisFinding>[] = obj.findings.map((value: unknown) => {
    const f = record(value);
    if (f.severity !== 'required' && f.severity !== 'recommended' && f.severity !== 'needs_context')
      throw new Error('Invalid finding severity.');
    if (f.confidence !== 'high' && f.confidence !== 'medium' && f.confidence !== 'low')
      throw new Error('Invalid finding confidence.');
    const location = parseLocation(f.location, assets);
    const asset = assets.find((a) => a._id === location?.assetId);
    const anchored = asset ? webpageAnchor(asset, location?.quote) : undefined;
    if (anchored && location) location.region = anchored;
    const text = location ? texts.get(location.assetId) : undefined;
    return {
      severity: f.severity,
      confidence: f.confidence,
      policyId: normalizePolicy(string(f.policyId)),
      title: string(f.title),
      explanation: string(f.explanation),
      suggestedFix: string(f.suggestedFix),
      location,
      quoteFound: anchored
        ? true
        : asset?.kind === 'webpage' && location?.quote
          ? false
          : text !== undefined && location?.quote
            ? text.includes(location.quote)
            : undefined,
    };
  });
  const seen = new Set<string>();
  const checked: Infer<typeof analysisResult>['previous'] = obj.previous.map((value: unknown) => {
    const p = record(value);
    const old = previous.find((f) => f._id === p.findingId);
    if (!old || seen.has(old._id) || (p.status !== 'resolved' && p.status !== 'still_present'))
      throw new Error('Invalid or duplicate previous finding.');
    seen.add(old._id);
    if (p.status === 'still_present') {
      const match = findings.find(
        (f) =>
          !f.previousFindingId &&
          f.policyId === old.policyId &&
          (f.title === old.title ||
            Boolean(old.location?.quote && f.location?.quote === old.location.quote)),
      );
      if (match) match.previousFindingId = old._id;
      else
        findings.push({
          severity: old.severity,
          confidence: 'medium',
          policyId: old.policyId,
          title: old.title,
          explanation: string(p.note),
          suggestedFix: old.suggestedFix ?? 'Address the issue requested in the previous decision.',
          previousFindingId: old._id,
        });
    }
    return { findingId: old._id, status: p.status, note: string(p.note) };
  });
  if (seen.size !== previous.length)
    throw new Error('OpenAI did not recheck every accepted finding.');
  if (findings.length > 100) throw new Error('Too many findings after linking the recheck.');
  return { summary: string(obj.summary), findings, previous: checked };
}

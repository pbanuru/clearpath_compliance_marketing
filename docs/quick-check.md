# Instant rule checks

The submitter sees an estimate after uploads finish and product/channel are set.
The reviewer sees the same rule picture while the detailed review runs. These
estimates never decide a submission or prevent submitting it.

## API and storage

`quickCheck.forAssets({assetIds, product, channel, jurisdictions, offerTerms?, notes?})`
is an authenticated action. `quickCheck.get({id})` is an owner-checked reactive
query. The action validates ownership of every input asset and captured webpage
part, including on cache hits. It returns a `quickChecks` document with status,
rule snapshots, probabilities, bands, refusals, and unsupported-material notes.
Pre-submit questions use `policies.list`; the shared runner also accepts a library
snapshot so the policy branch can pass the same versions used by detailed review.
Concurrent callers share the in-flight document; clients subscribe to `get` to
receive its completion.

The cache key is a SHA-256 hash of ordered asset IDs, product, channel, sorted
jurisdictions, offer terms, notes, and the complete applicable questions (including
ClearPath facts), sources, and band thresholds. Empty optional strings normalize to absent values. Asset bytes
are immutable. Changing rules, facts, material, or context invalidates the cache.
A transactional five-minute lease prevents duplicate concurrent requests; failed
checks can be attempted again after 30 seconds. Successful results persist.

At the start of analysis, `review/analysis.run` runs or reuses the quick check and
attaches its ID to the version before starting the detailed request. If the submitter submits during an in-flight
check, analysis awaits that shared result before building the detailed request.
`reviews.get` includes `versions[].quickCheck` (nullable); `reviews.list` adds
`quickRisk: {likely, possible} | null` for the current version. Queue presentation
is left for the queue rebuild. A failed quick check leaves detailed review free
to run. Successful speech extraction is shared with detailed review.

## Provider contract

Implementation follows the official [Decisions guide](https://developers.openai.com/api/docs/guides/decisions)
and [create reference](https://developers.openai.com/api/reference/resources/decisions/methods/create),
read 2026-10-28. One `POST /v1/decisions` request uses `gpt-6-luna` and one named
predicate per applicable policy. Empty applicability lists mean all products or
channels. User content contains context as `input_json`, labeled text/transcripts
as `input_text`, and images/frames/screenshots as base64 `input_image` parts.
Captured webpage text parts are included. PDFs are skipped with `unsupported`
notes; a PDF-only bundle makes no model call and produces no probabilities.
Audio/video speech uses the existing transcription path, never raw audio input.
If transcription fails, quick check can still assess video frames and records
that speech was not checked. Audio without a usable transcript remains
unsupported. Detailed review retains its existing transcription failure behavior.

Answers must cover every question exactly once. A refusal stores null probability
and band with `refusal: true`; it is never treated as a low-risk answer. Malformed
answers fail the check and retain any billed usage. Provider transport/429/5xx and
parse errors use the existing single retry; other HTTP errors fail immediately.

Thresholds live in `review/quickCheckLogic.ts`: likely ≥0.70; possible ≥0.35 and
<0.70; low <0.35. `review/quickCheckConfig.ts` exposes the evaluation switch
`QUICK_CHECK_AS_CONTEXT` (true by default). When enabled, the detailed request
receives probabilities explicitly labeled as leads to verify, not conclusions.

## Cost

Every request attempt records an `aiSpans` entry and updates `aiUsageDaily` with
operation `quick_check`. Spans link to the quick check; automatic runs also link
to the review/version and update its cost total. Pre-submit spans have no review
ID because no review exists yet; their costs remain in the owner's daily usage.
Reusing a pre-submit result makes no additional paid call.

`review/pricing.ts` pins rates and sources as of 2026-10-28: $0.10/M uncached
input, $0.01/M cache reads, $0.125/M cache writes, free Decisions output; the
published long-context input multiplier is accounted for. This request disables
provider prompt caching; exact repeats use the Convex cache. All available token
counts are recorded, and unknown usage remains unknown cost.

## Presentation and integration

`QuickGauge` is shared by the headline, authority groups, and rule rows. The nine
fixed scale segments are muted; one full-strength marker and caret show the
reading. Right means clearer. Headline/group readings are the share of applicable
rules banded low. Rule readings are `1 - probability`; the adjacent text states,
for example, `92% likely conflict`. Refusals count in the denominator but never
as clear, and have no invented gauge reading. The meter has text and ARIA values;
reduced-motion preferences disable the marker animation and loading shimmer.

`SubmitQuickCheck` mounts once after the form fields. It debounces context
changes, ignores stale responses, shows a quiet unavailable state, and never
changes submission eligibility. `ReviewQuickCheck` mounts in `FindingsPanel`
before detailed findings. It starts expanded during analysis and collapses to a
summary when analysis finishes. Likely rules without a detailed finding are
marked `Flagged by quick check, no detailed finding` after successful analysis.
All-low authority groups start collapsed. Rule titles and sources are snapshots
from the check, preserving the rule picture if the library later changes.

Two platform rules remain in the static policy list for the policy branch to
migrate. Google's [official financial services policy](https://support.google.com/adspolicy/answer/2464998?hl=en)
requires maximum APR separately from the representative example; destination
requirements and the 61-day minimum are global, while the 36% APR restriction is
US-specific. The Meta rule links to its [personal attributes policy](https://transparency.meta.com/policies/ad-standards/objectionable-content/privacy-violations-personal-attributes/).

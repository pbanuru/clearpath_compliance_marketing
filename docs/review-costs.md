# Review cost accounting

Gemini pricing is pinned from the [official Gemini pricing page](https://ai.google.dev/gemini-api/docs/pricing),
read 2026-10-28: `gemini-3.1-pro-preview` Standard input/output are $2/$12 per
million tokens at up to 200K input, $4/$18 above; output includes thinking.
The [Files API](https://ai.google.dev/gemini-api/docs/generate-content/files) is
free, so upload/poll/delete spans have known zero cost; generation without
required usage remains unknown. Extraction spans are attributed to assets and
counted once in daily usage, before any review exists. Review detail includes
that asset's stored extraction estimates once across versions alongside review
call costs; reusing an asset does not generate another daily charge.
Decision exports combine each version's review calls with the extraction histories
of its unique assets, including failed attempts. Removed assets do not contribute
to later versions. Any unknown extraction charge leaves the exported total unknown.

AssemblyAI Standard pay-as-you-go pricing is pinned from
[its official pricing page](https://www.assemblyai.com/pricing), read 2026-10-28:
`universal-3-5-pro` is $0.21/hour and `universal-2` is $0.15/hour (no add-ons).
The completed job's `audio_duration` and actual `speech_model_used` determine the
estimate. Missing duration or an unrecognized model remains unknown. See the
[async API](https://www.assemblyai.com/docs/pre-recorded-audio/api-reference/transcripts/submit)
and [US endpoint documentation](https://www.assemblyai.com/docs/pre-recorded-audio/select-the-region).

`aiSpans` records provider, operation, model, attempt, run/version, request ID,
latency, status, usage, pricing version, and optional error. `assetId` and
`reviewId` are optional: browser captures are asset-scoped and precede a review.
The capture transaction records one `cloudflare` / `page_capture` / `browser-run`
span and updates daily usage. Review cost totals continue to represent the AI
check's version/run spans; capture estimates are tracked separately by asset. Failed HTTP requests
without usage have unknown cost, and successful completions rejected by the
structured parser still retain billed usage. `aiUsageDaily` groups by owner, UTC
start day, provider, model, and operation. Calls, failed calls, known cost, and
unknown-cost calls are updated in the same mutation as span insertion.

`review/pricing.ts` pins Standard pricing read on 2026-10-28 from the
[OpenAI pricing page](https://developers.openai.com/api/docs/pricing):

| Model / input size                | Input / 1M | Cached input / 1M | Output / 1M |
| --------------------------------- | ---------- | ----------------- | ----------- |
| `gpt-6.1-sol`, ≤272K input tokens | $2.00      | $0.10             | $10.00      |
| `gpt-6.1-sol`, >272K input tokens | $4.00      | $0.20             | $15.00      |

Cached tokens are subtracted from ordinary input before pricing. Reasoning tokens
are already included in output. Missing required usage, an unknown model, or an
unknown unit produces `costUsd: null`, `costBasis: 'unknown'`, and increments
`unknownCostCalls`; it never becomes a zero-cost call. Known amounts are rate
estimates, not invoice charges. There are no spending caps or paywalls.

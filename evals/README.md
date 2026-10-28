# AI first-read evals

Eleven fixed cases exercise the deployed review pipeline with planted compliance
issues, one fully clean control, and three partly clean cases. The lead's v3
answer key is in `answer-key/` (see [lead judgments](answer-key/README.md)),
separate from the model. Nothing in the key is sent to the model. Review titles
and text asset names do not reveal holdout/clean labels. Demo inputs are read
from `expo/public/examples/`; the three holdout texts are in `cases/` verbatim.
These are fictional materials, not an independent legal assessment.

## Run

Use Node 24, the existing Convex CLI login, and Chrome/Chromium:

```sh
npm ci
npm install --prefix evals --ignore-scripts --no-package-lock
# Optional if Chrome is not at a standard Linux path:
export EVALS_CHROME=/path/to/chrome
node --experimental-test-module-mocks --test evals/test/*.test.mjs
npm run evals -- --case loan-social-v1 --runs 1
npm run evals -- --runs 3 --budget 198
```

Default: one run per case. The full baseline is eleven cases × three runs (including the lead addendum).
Each invocation defaults to a 198-paid-attempt ceiling. Use `--budget <attempts>`
for the allowance authorized for your run. It counts review rounds, quick checks,
transcriptions, timeline generation, and their retries. Free Gemini Files requests
and Cloudflare capture accounting spans stay in the costs but do not consume
paid attempts. The historical baseline used its own 39-attempt allowance.
The lead separately authorized the v3 rerun of all 33 reviews.

The runner reserves the production path's maximum attempts before each new
review: four normally, two for PDF-only bundles, and 28 for video (including
11 Responses rounds with one retry each). A ceiling of 198 covers the full
33-review suite even if every operation consumes its retry allowance. It never
creates additional reviews to fill that ceiling. Budgets never disable stages.
There is no automatic retry of a failed review. A failed video analysis or
incomplete video extraction stops the invocation immediately after saving its
raw response, spans, and error, including when resuming. Diagnose it before
starting another invocation. Video runs last so independent cases complete first.
Other operational failures return a nonzero status;
scoring misses and extras do not have a pass/fail threshold.

Target is pinned to DEV `affable-skunk-990`, in both the CLI deployment argument
and child environment. A supplied `CONVEX_DEPLOY_KEY` is rejected to avoid an
ambiguous credential target. No deployment, prompt override, policy edit, or
backend hook is used. The dedicated identity is
`https://clearpath-dev-harness.example|clearpath-review-evals`, following the
backend smoke harness's `convex run --identity` approach. It needs the existing
admin CLI login; this is not a client impersonation API.

Every repetition creates fresh immutable assets and a fresh review via
`assets.createText` or `assetUploads.begin` → signed R2 PUTs →
`assetUploads.finalize`, then `reviews.create`. Video capture executes the app's
actual `videoPoster` and visibility helpers in Puppeteer, including its current
frame sampling, a real poster, and the original MP4. The current backend generates
AssemblyAI transcription (OpenAI fallback) and a Gemini visual timeline. The timing file is answer-key evidence, never an input
transcript. No supplied poster, hand-picked frame, or cached extraction is used.
The submitted context is exactly the manifest's product, channel, jurisdiction,
offer terms, and notes; the generic title adds no compliance hints.

The runner polls `reviews.get` for up to ten minutes per review and reads that
review's `aiSpans` through an admin-only read-only indexed inline query, after
checking its owner. The CLI disallows combining inline queries with `--identity`,
so only that read omits identity impersonation. DEV assets and reviews remain available for inspection; no cleanup or
production mutations occur. Shared DEV code changes must follow the lead’s
union-worktree instructions in `~/.local/state/52/tasks/DEV-UNION.md`; the harness
never deploys.

## Reports and interrupted runs

`evals/results/<UTC timestamp>/report.md` and `report.json` are updated after each
completed review. The directory also holds each full raw review response and
video sampling metadata. Reports preserve full unmatched findings, all issue
matches, optional observations, confusion matrices per run and per case, spans,
provider errors, known and unknown costs, and input hashes. JSON is compact to
keep large records on one line. Results are gitignored.

```sh
npm run evals -- --runs 3 --resume evals/results/<timestamp>
```

Resume requires identical cases, run count, inputs, and local pipeline hashes.
It polls an existing review again and skips completed runs, so an interruption
while waiting does not schedule another analysis. If interruption leaves a
review-create outcome unknown, it stops for inspection instead of creating a
potential duplicate paid review. Terminal failures remain scored and visible.
Do not delete a result directory to evade the task's call budget.

To recalculate saved findings with the current scorer and the report's frozen
answer key, without any provider calls:

```sh
npm run evals -- --rescore evals/results/<timestamp>
```

To apply the current answer key and its current clean/partial-clean flags to
historical responses, write separate reports while preserving the original:

```sh
npm run evals -- --rescore evals/results/<timestamp> --key current
```

This writes `report-key-v3.md` and `report-key-v3.json` for the current v3 key.
The report records the key version and key hashes separately from original
run/input hashes. No raw responses, provider spans, costs, or original reports
are changed. `--key` applies only to rescoring; new submissions use the current key.

Reports record this checkout's Git commit, dirty status, hashes of local review
code and inputs, plus the DEV policy library at start and end. A changed policy
snapshot flags a mixed baseline. The CLI cannot attest to the deployed prompt's
source hash: coordinate DEV changes during comparisons, and use the checkout
hashes as local provenance. Cost is the sum of every span, including failed
attempts; unknown costs remain separate. Latency is backend analysis
`finishedAt - startedAt`; provider duration sums are also retained. It excludes
upload and CLI polling time. Estimates are not invoice charges.

Use `--suite original` or `--suite addendum` to select a historical subset.
Each invocation has its own attempt counter; track any task-wide allowance
across invocations yourself.

When testing a product deployed from the union, pass its path explicitly:

```sh
npm run evals -- --runs 3 --budget 198 --product-source /path/to/dev-integration
```

`--product-source` executes that checkout's actual video capture helpers and
records its Git head, status, and backend/media SHA-256 hashes in `product`.
Fixture files and answer keys still come from this eval checkout. The default
product source is this checkout. Resume also requires unchanged product provenance.
Asset-scoped extraction and capture spans are included once by stored span ID.

The [v2 baseline](baseline-v2.md) regrades the saved original and addendum
responses under the lead's revised judgments. No provider calls were made.

The lead chooses which run to summarize in a committed `evals/baseline.md`.
Copy its summary table, timestamp, provenance, and caveats; keep raw results
ignored. Compare new prompt runs against the same answer key and input hashes.

## Scoring rules

Required recall is the headline: caught required issues / planted required
issues, pooled across runs. A catch requires an accepted policy ID and a matching
location at **any severity**. `requiredAtRequired` separately records whether
those issues were raised at required severity. Clean cases have no recall
denominator; required findings are false positives unless a matching optional
issue explicitly permits them with `allowRequired: true`. Other optional
observations do not grant that exception. A missing or failed analysis never becomes a clean pass.
Failed analyses with a terminal response contribute misses, with errors retained.

Location matches use the correct asset and **any** of:

- Nonempty quote: case-insensitive substring containment in either direction.
- Time: inclusive interval overlap, with a missing end treated as a point.
- Region: intersection-over-union (IoU) ≥ 0.1; PDF regions must be on key page 1.
- No anchor in the key: accepted policy ID alone (for missing disclosures).

PDF quote matches remain independent of region/page localization. Each finding
may match multiple issues, and an issue may match multiple findings. This lets a
combined finding cover both occurrences of guaranteed approval and lets separate
postal-address/opt-out or NMLS/Equal Housing findings count without extras.
Every match is retained. To give each issue one severity-confusion vote, its
primary finding has the most location methods, then the highest IoU, then the
original finding order. Severity does not influence primary selection.

Severity agreement is exact agreement among caught, nonoptional issues; misses
have their own confusion column. The video end-disclosure accepts recommended
or required. Banner fine-print accepts required or recommended; advertorial
urgency accepts all three severities, as specified by the lead. For the social-v1 advertised-rate issue, required is recorded as
agreement-adjacent separately, preserving strict recommended agreement.
All other disagreements remain visible. Aggregate rates pool counts rather than
averaging case percentages. No expected findings are inferred from the model. For `landing-page`, every required
finding outside an issue that explicitly accepts required severity is a false
positive for manual judgment. In v2, the footer rate-qualification issue accepts
recommended or required; escalation of the soft-inquiry issue remains a false positive.

Optional observations never count as misses and are excluded from recall,
severity agreement, and confusion. Where the lead specified only an optional
claim and no policy ID, any policy ID may match that claim. Specified optional
severity (such as speed as `needs_context`) is enforced unless the key explicitly
sets `matchAnySeverity`; the advertorial’s optional lender-identity issue uses
that exception and retains recommended as its expected severity. Any unmatched finding
is an extra, printed in full for manual judgment; extras are not automatically
called wrong. Clean-case required findings are false positives by the fixed key; required
extras on flawed cases remain manual judgments and are counted separately.

The video's typicality exception accepts any `endorsements` finding that
explicitly discusses typical/representative results, generally expected results,
or results varying/not being guaranteed, regardless of its quote. This is an
inspectable keyword rule, not a second model judge. Every match remains in JSON
for the lead to inspect. The consent optional observation similarly requires
consent/permission/opt-in wording. The v2 advertorial footer exception accepts a
`native-advertising` or `endorsements` finding whose title, explanation, or quote
explicitly states that the advertising/compensation disclosure appears only at
the bottom/footer. Suggested fixes alone cannot trigger it. The finding must
refer to the same asset (or an unambiguous single-asset bundle). This grants an
issue catch while retaining the actual box IoU, including zero for a byline box.

`quoteFound` rate uses only findings with a backend boolean `quoteFound` field;
images/PDFs without extracted text are not counted as failures. Mean visual IoU
uses caught nonoptional issues whose primary match is a visual anchor. A quote
match without a predicted box contributes zero; a caption-only match contributes
no visual observation. Multiple matches for one issue do not multiply its weight.

## Visual answer-key provenance

Each visual anchor stores a normalized region and its source HTML, selector,
canvas size, and HTML SHA-256. These were measured with Puppeteer's element
`boundingBox()` after fonts loaded, divided by the original canvas dimensions:
1080 × 1350 for social images and 816 × 1056 for mortgage PDF page 1. Shared
paragraph boxes intentionally cover the whole HTML element, not estimated glyph
bounds. To regenerate from the examples task's source work directory:

```sh
npm run evals -- --boxes /home/yn/.local/state/52/tasks/clearpath-examples/work
```

Review regenerated key diffs before comparing baselines. Video time anchors come
from `cases/affiliate-video-timing.json`: approval 6.88–10.71s, interest
13.31–15.18s, typicality 15.18–17.82s or 13.31–15.18s, and end disclosure
20.5–22s. The file preserves the examples task's complete timing metadata.

## Addendum webpage fixtures

`advertorial` and `landing-page` use real `webpage` assets, not image stand-ins.
The local fixture preparation executes the DEV union's actual `renderCapture`
(and its `limitBlocks` helper) against the supplied self-contained HTML sites.
It freezes the full-page JPEG, visible DOM text blocks, dimensions, capture
metadata, and capture-source hashes in `cases/addendum/`. The `.capture` files
are compact JSON, keeping each frozen snapshot within the 300-line limit. During each repetition,
the runner uploads the JPEG through `assetUploads.begin` and calls
`assets.createWebpage` with that measured metadata. The usual review pipeline
then reads the webpage and anchors quotes with its normal DOM-block code.
No transcript, special prompt, or extra compliance context is added.

The source URL records the actual local HTTP capture origin, which need not
remain running: the backend reads the frozen owned bytes. Preparing fixtures
uses local Chrome, not paid Cloudflare Browser Run. The backend's `page_capture`
span still estimates Cloudflare browser cost from the supplied browser duration;
reports retain this estimate separately from OpenAI attempts and invoice claims.
Every repetition creates a fresh asset, so capture spans are counted once each.

```sh
npm run evals -- --prepare-pages /path/to/clearpath-examples-2/out --capture-source /path/to/dev-integration
npm run evals -- --case advertorial --boxes /path/to/clearpath-examples-2/out
npm run evals -- --case landing-page --boxes /path/to/clearpath-examples-2/out
npm run evals -- --case banners --boxes /path/to/clearpath-examples-2/work
```

Webpage boxes use the rendered 1440px canvas and 900px capture viewport; banner
boxes use their 300×250 and 728×90 CSS canvases (the PNGs have 2× pixel density).
The full lead addendum remains in the task directory; its accepted policy IDs
and severity alternatives are preserved in the three new key files.

Round 2 corrections are logged with their policy basis in `answer-key/README.md`.
[Baseline v3b](baseline-v3b.md) regrades the saved v3 run without paid calls.
An optional issue with explicit `allowRequired: true` permits a matching required
finding without counting it as a clean/partly-clean false positive. Other
optional issues and unrelated required findings retain their original treatment.

Use `--case id1,id2,id3 --runs 3` for an experiment and its held-out controls.
Unknown IDs fail before upload. `--usd-budget <remaining allowance>` adds a
per-invocation admission guard: reserve $0.50 before starting another review,
and stop new submissions if a completed run has unknown cost. This is an
estimate guard, not provider-side enforcement. Track spend across invocations;
Resume retains the saved dollar ceiling, even if the flag is omitted.
Round 2's ledger includes every control, kept candidate, and rejected candidate.

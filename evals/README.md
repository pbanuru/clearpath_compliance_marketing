# AI first-read evals

Eight fixed cases exercise the deployed review pipeline with planted compliance
issues and three clean controls. The lead's answer key is in `answer-key/`,
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
npm run evals -- --runs 3
```

Default: one run per case. The full baseline is eight cases × three runs.
Each invocation has a 30-provider-attempt budget, counting review calls,
transcriptions, and the pipeline's own retries. Before each new review, the
runner reserves two attempts (four for video). It stops when the next review's
worst case would exceed the budget. There is no automatic retry of a failed
review. Keep the task's budget across separate invocations yourself.

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
actual `videoPoster` and visibility helpers in Puppeteer: at most 16 real JPEG
frames, a real poster, and the original MP4. The backend generates its real
Whisper transcript. The timing file is answer-key evidence, never an input
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

Reports record this checkout's Git commit, dirty status, hashes of local review
code and inputs, plus the DEV policy library at start and end. A changed policy
snapshot flags a mixed baseline. The CLI cannot attest to the deployed prompt's
source hash: coordinate DEV changes during comparisons, and use the checkout
hashes as local provenance. Cost is the sum of every span, including failed
attempts; unknown costs remain separate. Latency is backend analysis
`finishedAt - startedAt`; provider duration sums are also retained. It excludes
upload and CLI polling time. Estimates are not invoice charges.

The lead chooses which run to summarize in a committed `evals/baseline.md`.
Copy its summary table, timestamp, provenance, and caveats; keep raw results
ignored. Compare new prompt runs against the same answer key and input hashes.

## Scoring rules

Required recall is the headline: caught required issues / planted required
issues, pooled across runs. A catch requires an accepted policy ID and a matching
location at **any severity**. `requiredAtRequired` separately records whether
those issues were raised at required severity. Clean cases have no recall
denominator; every required finding is a false positive, even if an optional
observation matches it. A missing or failed analysis never becomes a clean pass.
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
or required. For the social-v1 advertised-rate issue, required is recorded as
agreement-adjacent separately, preserving strict recommended agreement.
All other disagreements remain visible. Aggregate rates pool counts rather than
averaging case percentages. No expected findings are inferred from the model.

Optional observations never count as misses and are excluded from recall,
severity agreement, and confusion. Where the lead specified only an optional
claim and no policy ID, any policy ID may match that claim. Specified optional
severity (such as speed as `needs_context`) is enforced. Any unmatched finding
is an extra, printed in full for manual judgment; extras are not automatically
called wrong. Clean-case required findings are false positives by the fixed key; required
extras on flawed cases remain manual judgments and are counted separately.

The video's typicality exception accepts any `endorsements` finding that
explicitly discusses typical/representative results, generally expected results,
or results varying/not being guaranteed, regardless of its quote. This is an
inspectable keyword rule, not a second model judge. Every match remains in JSON
for the lead to inspect. The consent optional observation similarly requires
consent/permission/opt-in wording.

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

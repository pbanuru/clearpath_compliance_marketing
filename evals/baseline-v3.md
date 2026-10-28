# Baseline v3 — current DEV product, answer key v2

Started 2026-10-28T15:54:49.146Z; stopped 2026-10-28T16:27:29.682Z. DEV affable-skunk-990; 31 attempted reviews out of 33 planned: all detailed analyses succeeded, with one failed video timeline. Key v2.

| Metric                                             | Baseline v2   | Baseline v3   | Delta from v2 |
| -------------------------------------------------- | ------------- | ------------- | ------------- |
| Required recall, including failed analyses         | 71/84 (84.5%) | 72/78 (92.3%) | +7.8 pp       |
| Required recall on successful analyses             | 71/75 (94.7%) | 72/78 (92.3%) | -2.4 pp       |
| Severity agreement among caught nonoptional issues | 72/90 (80.0%) | 75/91 (82.4%) | +2.4 pp       |
| Extra findings (required)                          | 3 (2)         | 18 (16)       | 15 total      |
| Required false positives under the key             | 2             | 8             | 6             |

| Case                     | Succeeded / attempted | Required recall | Severity agreement | Extras (required) | Required FP | Mean latency | Known estimated cost | Recall delta from v2 |
| ------------------------ | --------------------- | --------------- | ------------------ | ----------------- | ----------- | ------------ | -------------------- | -------------------- |
| loan-social-v1           | 3/3                   | 14/15 (93.3%)   | 14/18 (77.8%)      | 3 (3)             | 0           | 83.7s        | $0.16480             | -6.7 pp              |
| loan-social-v2           | 3/3                   | —               | —                  | 3 (3)             | 3           | 34.4s        | $0.06312             | —                    |
| card-email               | 3/3                   | 9/9 (100.0%)    | 9/9 (100.0%)       | 0 (0)             | 0           | 48.5s        | $0.09136             | +0.0 pp              |
| mortgage-page            | 3/3                   | 12/12 (100.0%)  | 9/15 (60.0%)       | 0 (0)             | 0           | 57.2s        | $0.11238             | +0.0 pp              |
| affiliate-video          | 1/1                   | 3/3 (100.0%)    | 4/5 (80.0%)        | 2 (2)             | 0           | 82.9s        | $0.07882 + 1 unknown | +100.0 pp            |
| holdout-card-email-clean | 3/3                   | 0/3 (0.0%)      | —                  | 1 (0)             | 0           | 18.2s        | $0.02679             | -33.3 pp             |
| holdout-search-ad-clean  | 3/3                   | 2/3 (66.7%)     | 2/2 (100.0%)       | 0 (0)             | 0           | 30.1s        | $0.04583             | -33.3 pp             |
| holdout-sms              | 3/3                   | 6/6 (100.0%)    | 6/6 (100.0%)       | 4 (3)             | 0           | 47.3s        | $0.07785             | +0.0 pp              |
| advertorial              | 3/3                   | 15/15 (100.0%)  | 19/21 (90.5%)      | 0 (0)             | 0           | 94.0s        | $0.18587             | +0.0 pp              |
| landing-page             | 3/3                   | 3/3 (100.0%)    | 4/4 (100.0%)       | 5 (5)             | 5           | 58.6s        | $0.11780             | +0.0 pp              |
| banners                  | 3/3                   | 8/9 (88.9%)     | 8/11 (72.7%)       | 0 (0)             | 0           | 59.3s        | $0.09994             | +11.1 pp             |

Non-video required recall: 69/75 (92.0%), versus 71/75 (94.7%) in v2 (-2.7 pp). Read this alongside overall recall because v2’s three video runs failed before review.

Required-at-required: 70/78 (89.7%). Severity-adjacent observations: 3. quoteFound: 73/76 (96.1%). Mean matched-visual IoU: 0.751.

Total new known estimated spend: **$1.06456 + 1 unknown**. Paid provider attempts: 63; 75 total accounting spans, including free Gemini Files requests and frozen-page capture estimates. Upload time is excluded from analysis latency; asset extraction costs are included. These are rate estimates, not invoice charges.

| Provider / operation     | Attempts / requests | Failed | Known estimated cost | Unknown cost |
| ------------------------ | ------------------- | ------ | -------------------- | ------------ |
| openai/quick_check       | 28                  | 0      | $0.01189             | 0            |
| openai/review            | 33                  | 0      | $1.05107             | 0            |
| cloudflare/page_capture  | 6                   | 0      | $0.00026             | 0            |
| assemblyai/transcription | 1                   | 0      | $0.00134             | 0            |
| gemini/video_upload      | 6                   | 0      | $0.00000             | 0            |
| gemini/video_analysis    | 1                   | 1      | $0.00000             | 1            |

Video: run 1: succeeded; 1 extraction errors; 2 frame-tool rounds / 22 frames. Runs 2 and 3 were not started after the first Gemini extraction failure. Their six required-issue opportunities are excluded from the 78 attempted opportunities; this is a partial baseline, not a completed 33-review suite.

## Video failure and diagnosis

AssemblyAI succeeded (8 segments, 50 timestamped words). Gemini file upload and processing succeeded, but timeline generation returned HTTP 400 INVALID_ARGUMENT before parsing. The detailed review used the production transcript/frame fallback and caught all three required issues; the harness then stopped. Full error: `Gemini video_analysis failed (400): {"code":400,"message":"Request contains an invalid argument.","status":"INVALID_ARGUMENT"}`.

The failing boundary is Gemini request validation. Its nested structured-output schema with `events.maxItems: 400` is a plausible cause: [Google documents schema complexity and large array bounds as causes of rejection](https://ai.google.dev/gemini-api/docs/structured-output.md?example=recipe). The generic error does not establish which field is invalid. No diagnostic provider call or post-run pipeline change was made. The task’s video-diagnosis.md records evidence and the uncertainty.

## Every missed required issue

- loan-social-v1/1: {"id":"rate-apr","policyIds":["closed-end-rate-as-apr"],"severity":"required","anchors":[{"asset":"image","quote":"Rates as low as 5.99%","source":{"html":"social-v1.html","selector":".big span","canvas":{"width":1080,"height":1350},"sha256":"8092696edf2b8e7582d4a4ca4b59d57cf97223b5bf2031e4e06ea76fd8e74d0f"},"region":{"x":0.05185185185185185,"y":0.6415625,"width":0.45688657407407407,"height":0.042222222222222223}}],"caught":false,"matches":[],"predictedSeverity":"missed","agreement":null,"adjacent":false}
- holdout-card-email-clean/1: {"id":"balance-transfer-apr","policyIds":["open-end-trigger-terms"],"severity":"required","anchors":[],"note":"The balance-transfer APR is not stated although a balance-transfer fee is stated. This case has exactly this one issue; its historical id is retained.","caught":false,"matches":[],"predictedSeverity":"missed","agreement":null,"adjacent":false}
- holdout-card-email-clean/2: {"id":"balance-transfer-apr","policyIds":["open-end-trigger-terms"],"severity":"required","anchors":[],"note":"The balance-transfer APR is not stated although a balance-transfer fee is stated. This case has exactly this one issue; its historical id is retained.","caught":false,"matches":[],"predictedSeverity":"missed","agreement":null,"adjacent":false}
- holdout-card-email-clean/3: {"id":"balance-transfer-apr","policyIds":["open-end-trigger-terms"],"severity":"required","anchors":[],"note":"The balance-transfer APR is not stated although a balance-transfer fee is stated. This case has exactly this one issue; its historical id is retained.","caught":false,"matches":[],"predictedSeverity":"missed","agreement":null,"adjacent":false}
- holdout-search-ad-clean/3: {"id":"repayment-period-trigger","policyIds":["closed-end-trigger-terms"],"severity":"required","anchors":[{"asset":"text","quote":"24–60 months"}],"note":"A stated repayment period is a triggering term; Reg Z comment 24(d)(1)-2. This case has exactly this one issue; its historical id is retained.","caught":false,"matches":[],"predictedSeverity":"missed","agreement":null,"adjacent":false}
- banners/1: {"id":"square-prominence","policyIds":["card-promo-rate","clear-conspicuous"],"severity":"required","anchors":[{"asset":"square","quote":"Then 19.24%-29.24% variable APR.","source":{"html":"banner-300x250.html","selector":".fine-print","canvas":{"width":300,"height":250},"sha256":"fbc95c3c365f777d0cbea58ff5294ab882957ff14b8a3322f91b44e77d7cefbe"},"region":{"x":0.056666666666666664,"y":0.916,"width":0.49145833333333333,"height":0.036}}],"acceptedSeverities":["required","recommended"],"note":"9px light-gray fine print, not prominent near the intro rate.","caught":false,"matches":[],"predictedSeverity":"missed","agreement":null,"adjacent":false}

## Provenance and comparison limits

The three requested branch heads (0597bcc, d71d435, c26d86f) were merged additively under the shared flock and deployed only from codex/dev-union. Union merge commits: 0545985, e261c17, 198d6f1; generated bindings: ef4c761. No bespoke prompt, rule, or answer-key edits were made for this rerun; the requested incoming branch changes are retained. All three required DEV key names were present; their values were never displayed.

Harness: 0a0aea7525aa76fa1a874bbfdd9faa0caab78bfa. Product source at start: c0217ccd2d67a958ea6c656231a2aaa30fd42fd3; at end: c0217ccd2d67a958ea6c656231a2aaa30fd42fd3. Policy snapshots changed: true; product source changed: false. The product hashes and per-review policy versions are saved in JSON. Shared DEV and historical v2 pipeline differences make these descriptive deltas, not a controlled prompt-only A/B test.

The existing eval workspace retains persisted version-1 rules. The current code seed clarifications for APR abbreviation and creditworthiness wording do not replace those saved rule versions: policy/library.ts skips existing keys. The actual policiesStart snapshot therefore still says “using that term” and “creditworthiness and other factors.” No rule migration or identity switch was made mid-run. This baseline measures the current product with that existing workspace library, not newly seeded rule text.

Snapshot metadata changed: 13 policies gained initial citation metadata; 3 of those also received source URL corrections. Title, check text, applicability, kind, and currentVersion are unchanged. Rule content changed: false. The real create flow lazily seeds this metadata before analysis. See the saved policy snapshots and per-review policy versions.

Inputs and lead judgments stay fixed. Frozen webpage captures were reused as fixtures but uploaded as fresh owned webpage assets on each repetition. Video uses the current union upload helper and fresh original bytes; no cached transcript or hand-selected frames were supplied.

[Full report](results/2026-10-28T15-54-49-103Z/report.md) and [JSON](results/2026-10-28T15-54-49-103Z/report.json) contain every finding, match, location, span, and error; raw results remain gitignored.

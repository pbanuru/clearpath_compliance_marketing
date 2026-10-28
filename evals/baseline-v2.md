# Baseline regraded with answer key v2

Regraded on 2026-10-28 from the original eight-case baseline and three-case addendum. **No new paid runs, uploads, deployments, or provider calls.** The lead’s revised judgments change grading only; the material, findings, spans, latency, and cost are identical. See [answer key v2](answer-key/README.md).

| Metric                                             | Key v1        | Key v2        |
| -------------------------------------------------- | ------------- | ------------- |
| Required recall, including failed analyses         | 59/72 (81.9%) | 71/84 (84.5%) |
| Required recall on successful analyses             | 59/63 (93.7%) | 71/75 (94.7%) |
| Severity agreement among caught nonoptional issues | 54/69 (78.3%) | 72/90 (80.0%) |
| Extra findings (required)                          | 25 (23)       | 3 (2)         |
| Required false positives under the key             | 9             | 2             |

## Per-case v2 summary

| Case                     | Succeeded / attempted | Required recall | Severity agreement | Extras (required) | Required FP | Mean latency | Known estimated cost |
| ------------------------ | --------------------- | --------------- | ------------------ | ----------------- | ----------- | ------------ | -------------------- |
| loan-social-v1           | 3/3                   | 15/15 (100.0%)  | 15/19 (78.9%)      | 0 (0)             | 0           | 85.9s        | $0.14722             |
| loan-social-v2           | 3/3                   | —               | —                  | 1 (1)             | 1           | 34.4s        | $0.05579             |
| card-email               | 3/3                   | 9/9 (100.0%)    | 8/9 (88.9%)        | 0 (0)             | 0           | 35.8s        | $0.06800             |
| mortgage-page            | 3/3                   | 12/12 (100.0%)  | 9/15 (60.0%)       | 0 (0)             | 0           | 62.7s        | $0.12027             |
| affiliate-video          | 0/3                   | 0/9 (0.0%)      | —                  | 0 (0)             | 0           | 7.3s         | $0.00000 + 3 unknown |
| holdout-card-email-clean | 3/3                   | 1/3 (33.3%)     | 1/1 (100.0%)       | 1 (1)             | 1           | 20.9s        | $0.03612             |
| holdout-search-ad-clean  | 3/3                   | 3/3 (100.0%)    | 3/3 (100.0%)       | 1 (0)             | 0           | 34.4s        | $0.04962             |
| holdout-sms              | 3/3                   | 6/6 (100.0%)    | 4/6 (66.7%)        | 0 (0)             | 0           | 44.6s        | $0.06621             |
| advertorial              | 3/3                   | 15/15 (100.0%)  | 19/21 (90.5%)      | 0 (0)             | 0           | 82.6s        | $0.18913             |
| landing-page             | 3/3                   | 3/3 (100.0%)    | 6/6 (100.0%)       | 0 (0)             | 0           | 60.6s        | $0.10910             |
| banners                  | 3/3                   | 7/9 (77.8%)     | 7/10 (70.0%)       | 0 (0)             | 0           | 58.8s        | $0.10340             |

Only `loan-social-v2` remains fully clean. The card and search holdouts retain their historical IDs but each now has exactly one required issue. Optional lender-identity findings are excluded from extras and misses; their detected severity remains inspectable in JSON. Three social-v1 advertised-rate severity observations remain agreement-adjacent.

## Misses and remaining false positives

- Video: all nine required-issue misses come from three failed transcriptions, before the first read. The saved OpenAI error is HTTP 401, missing scope `api.model.audio.request`. Those failures remain misses with unknown cost.
- Card holdout: balance-transfer APR was caught in run 1 and missed in runs 2 and 3.
- Banners: square fine-print prominence was missed in run 2; the wide banner’s annual-fee disclosure was missed in run 3.
- Advertorial: all three native-advertising explanations explicitly identify the bottom-only paid disclosure, so that issue is caught under the lead’s v2 exception. Their actual locations point to the byline; footer IoU stays zero. This records issue coverage without inventing a correct location.

The two remaining required false positives are unchanged:

- `loan-social-v2`, run 1: “Spell out ‘annual percentage rate’ in the repayment example,” despite use of `APR` being acceptable under the lead’s judgment.
- `holdout-card-email-clean`, run 3: “Complete the APR qualification,” demanding `and other factors` after `based on your creditworthiness`.

The only other extra is a `needs_context` question in search-holdout run 3 asking whether the advertised APR range is currently available. It remains available for manual judgment. Full finding text and every missed required key record are in the versioned local reports.

## Unchanged observations and provenance

The 33 saved reviews contain 30 successful analyses and 3 failures. Historical OpenAI attempts remain 30 first reads, 3 quick checks, and 3 failed transcriptions: 36 attempts total. Six page-capture accounting spans remain included. Known estimated cost stays $0.94486, plus 3 unknown-cost calls. Regrading adds $0.

quoteFound remains 62/62 (100.0%). Mean matched-visual IoU under v2 is 0.740; its population changes with the new issues and footer-coverage rule.

The original run observed shared-DEV changes: native-advertising was added during the first suite; the later banners runs included the new quick-check stage. Existing rule content stayed unchanged in the captured policy snapshots. These are historical observations, not a frozen-prompt A/B comparison. Original per-review policy versions, model operations and errors are preserved.

Current key SHA-256 values and `keyVersion: 2` are in each versioned JSON report. Original run/input hashes retain their historical meaning. Original v1 reports and saved raw responses were not overwritten.

- [2026-10-28T12-32-27-330Z v2 report](results/2026-10-28T12-32-27-330Z/report-key-v2.md) and [JSON](results/2026-10-28T12-32-27-330Z/report-key-v2.json).
- [2026-10-28T12-49-55-969Z v2 report](results/2026-10-28T12-49-55-969Z/report-key-v2.md) and [JSON](results/2026-10-28T12-49-55-969Z/report-key-v2.json).

The raw reports stay gitignored. This committed summary records the requested v2 regrade; the lead can choose a future `baseline.md` after the rule fixes, AssemblyAI transcription, and Gemini video layer are on DEV. Further paid runs wait for the lead.

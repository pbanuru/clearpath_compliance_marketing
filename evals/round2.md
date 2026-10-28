# Round 2 prompt experiments

[The corrected baseline](baseline-v3b.md), [lead judgment log](answer-key/README.md), and [diagnosis](diagnosis-round2.md) remain the reference. Key version 3 was frozen throughout these experiments. No scoring thresholds or output gates changed.

## Kept: neutral summaries

[PR #33](https://github.com/pbanuru/clearpath_compliance_marketing/pull/33) adds only the evaluated summary instruction: describe issues neutrally and leave approval, rejection, revision and other decisions to the human. The instruction stays in its evaluated position. The prompt net diff excludes all writing, citation and card-category experiments.

The same six cases ran three times before and after. All 18 candidate summaries were manually read as neutral; the card email went from three decision/revision directives to zero. Mean explanation length was 39.40 words (2088/53) before and 36.71 (2166/59) after. This small change does not claim to satisfy the broader brevity targets.

| Case                     | Required before → after | Extras before → after |
| ------------------------ | ----------------------- | --------------------- |
| card-email               | 9/9 → 8/9               | 0 → 1                 |
| mortgage-page            | 12/12 → 12/12           | 0 → 0                 |
| holdout-card-email-clean | 0/3 → 0/3               | 0 → 0                 |
| holdout-search-ad-clean  | 3/3 → 3/3               | 0 → 0                 |
| holdout-sms              | 6/6 → 6/6               | 0 → 0                 |
| banners                  | 5/9 → 8/9               | 0 → 0                 |

Strict aggregate recall is 35/42 → 37/42, extras 0 → 1; held-out extras remain zero. **The strict per-case gate fails for the card email.** The lead explicitly accepted manual coverage: candidate run 1 anchors `card-promo-rate` on the subject rather than the keyed body phrase, but its explanation and fix cover the missing introductory label, body 18-month duration, and subsequent APR. All three outputs were reviewed. This is a localization/key-anchor boundary, not a content miss. The frozen key and the strict 8/9 score plus one extra remain unchanged. No automated gate override was added.

Before: “The email needs revisions before approval: it presents pre-approval without qualification, omits key introductory APR disclosures, and lacks a postal address and opt-out method.” After: “The email presents pre-approval without qualification, omits key introductory-rate disclosures, and lacks a postal address and opt-out method. State availability also needs confirmation.”

Required `npm run check` passes. Prose/order-pinning prompt assertions were removed; real product/channel applicability coverage remains. Codex review of PR #33 at `0d84ee3` completed without findings.

## Rejected trials

Broader writing/citation instructions shortened explanations from **41.02 (3569/87) to 25.51 words (2704/106)** on eight identical cases × three runs. Aggregate recall rose 56/63 → 57/63, but card recall fell 9/9 → 7/9, extras rose 1 → 12 (required 1 → 10), and held-out extras rose 0 → 2. All 106 candidate titles were under 12 words and explanations had at most two sentences by segmentation; those mechanical gains do not justify the recall/extras regressions. Rejected and reverted. [Follow-up #34](https://github.com/pbanuru/clearpath_compliance_marketing/issues/34).

A separate card-category paragraph caught balance-transfer APR in all three card holdout runs (0/3 → 3/3), but search-ad recall fell 3/3 → 1/3 and card-email extras rose 1 → 3. On the five identical cases × three runs, recall was 25/30 → 27/30, extras 1 → 3; mean explanation length 36.05 (1514/42) → 37.47 (1611/43). Banners improved 8/9 → 9/9 and SMS stayed 6/6. Rejected and reverted. [Follow-up #35](https://github.com/pbanuru/clearpath_compliance_marketing/issues/35).

## Evidence and limits

C ran from 22:11:44 UTC on 2026-10-28; the final experiment finished at 23:05:31, and neutral-only DEV restoration completed at 23:06:36. All deployments used the union worktree under its flock; no production deployment was performed by this task. The union retains additive history, with the card paragraph reverted in `1656ca4`.

There were 81 real reviews and 154 provider attempts across four arms. Known estimated cost: **$2.36402 plus one unknown-cost failed call**. A $1 reserve puts budgeted exposure at $3.36402, below $8; the reserve is not a measured price. One quick-check 503 retried successfully. Every analysis ultimately succeeded.

Local raw artifacts are ignored and unavailable on GitHub:

- Control: `evals/results/2026-10-28T22-12-51-678Z/` (24 reviews; $0.73583 + one unknown).
- Rejected writing: `evals/results/2026-10-28T22-38-12-626Z-writing/` (24; $0.84631).
- Kept neutral-only: `evals/results/2026-10-28T22-51-31-889Z-neutral/` (18; $0.43995).
- Rejected card: `evals/results/2026-10-28T23-00-37-007Z-card/` (15; $0.34193).

The writing trial's three concurrent runner processes selected the same millisecond directory. Their disjoint case files survived, while report metadata collided. All 24 reviews were recovered read-only from original asset order and DEV spans, with distinct review IDs, raw-file SHA256 checks and an exact cost reconciliation; no paid reruns. Later arms staggered startup until each runner printed its result path. The core harness was not changed. [Track the internal collision in #31](https://github.com/pbanuru/clearpath_compliance_marketing/issues/31).

The control's lone required extra is a footer qualification finding whose quote is not among the optional placement key's anchors. Key changes stayed out of tuning; [#32](https://github.com/pbanuru/clearpath_compliance_marketing/issues/32) records the evidence. [#25](https://github.com/pbanuru/clearpath_compliance_marketing/issues/25) retains the earlier grouping/attribution limitation.

Policies were identical across comparisons; only `backend/convex/review/prompt.ts` changed in the product snapshot. These are three-run observations, not statistical proof. The local task result contains all per-case latency/cost tables, every missed required key record, every extra required finding in full, and errors verbatim.

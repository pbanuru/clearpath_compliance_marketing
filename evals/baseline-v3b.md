# Baseline v3b — corrected lead judgments

Round 2 regrades the 31 saved v3 reviews with answer key version 3. No new uploads, analyses, deployments, or provider calls. The two unattempted video runs remain absent; the historical Gemini timeline error remains recorded. All raw findings, spans, latency, and cost are unchanged.

| Metric                   | v3, key v2    | v3b, key v3   |
| ------------------------ | ------------- | ------------- |
| Required recall          | 72/78 (92.3%) | 76/82 (92.7%) |
| Severity agreement       | 75/91 (82.4%) | 78/94 (83.0%) |
| Extras (required)        | 18 (16)       | 2 (0)         |
| Required false positives | 8             | 0             |

| Case                     | Succeeded / attempted | Required recall | Severity agreement | Extras (required) | Required FP | Mean latency | Known estimated cost |
| ------------------------ | --------------------- | --------------- | ------------------ | ----------------- | ----------- | ------------ | -------------------- |
| loan-social-v1           | 3/3                   | 14/15 (93.3%)   | 14/18 (77.8%)      | 0 (0)             | 0           | 83.7s        | $0.16480             |
| loan-social-v2           | 3/3                   | —               | —                  | 0 (0)             | 0           | 34.4s        | $0.06312             |
| card-email               | 3/3                   | 9/9 (100.0%)    | 9/9 (100.0%)       | 0 (0)             | 0           | 48.5s        | $0.09136             |
| mortgage-page            | 3/3                   | 12/12 (100.0%)  | 9/15 (60.0%)       | 0 (0)             | 0           | 57.2s        | $0.11238             |
| affiliate-video          | 1/1                   | 4/4 (100.0%)    | 5/6 (83.3%)        | 0 (0)             | 0           | 82.9s        | $0.07882 + 1 unknown |
| holdout-card-email-clean | 3/3                   | 0/3 (0.0%)      | —                  | 1 (0)             | 0           | 18.2s        | $0.02679             |
| holdout-search-ad-clean  | 3/3                   | 2/3 (66.7%)     | 2/2 (100.0%)       | 0 (0)             | 0           | 30.1s        | $0.04583             |
| holdout-sms              | 3/3                   | 6/6 (100.0%)    | 6/6 (100.0%)       | 1 (0)             | 0           | 47.3s        | $0.07785             |
| advertorial              | 3/3                   | 15/15 (100.0%)  | 19/21 (90.5%)      | 0 (0)             | 0           | 94.0s        | $0.18587             |
| landing-page             | 3/3                   | 6/6 (100.0%)    | 6/6 (100.0%)       | 0 (0)             | 0           | 58.6s        | $0.11780             |
| banners                  | 3/3                   | 8/9 (88.9%)     | 8/11 (72.7%)       | 0 (0)             | 0           | 59.3s        | $0.09994             |

## What changed and why

The [plain judgment log](answer-key/README.md) cites the deployed policy basis for every change. Both social headlines and SMS/video lender identity are optional. The inspected landing page lacks the Google-required repayment limits and representative loan cost, adding three caught required opportunities. Placement of its footer/FAQ qualifications becomes optional. The inspected video has no credit-dependence qualification beside the spoken rate or on the closing card, adding one caught required opportunity. Optional findings explicitly allowed at required severity no longer become clean-case false positives.

The required denominator rises from 78 to 82 and catches from 72 to 76. No detection improved: this is a key correction. Six required misses remain: social-v1 rate-as-APR in run 1; card-holdout balance-transfer APR in runs 1–3; search-holdout repayment disclosures in run 3; square-banner prominence in run 1. The last two visual misses include output grouping/localization effects, detailed in [the diagnosis](diagnosis-round2.md).

Required-at-required: 74/82 (90.2%). quoteFound: 73/76 (96.1%). Mean matched-visual IoU: 0.747. Historical cost remains $1.06456 plus 1 unknown-cost call. Regrading spend: $0.

## Remaining extras, in full

- holdout-card-email-clean/2: {"_creationTime":1793203713187.7456,"_id":"jx74mb22468s4a072z8y9w2n5s8h5chk","confidence":"medium","createdAt":1793203713187,"explanation":"This US email presents the card offer without any state-availability qualification. That is acceptable if the card and advertised terms are available nationwide; otherwise, the omission could lead consumers to expect an offer unavailable where they live.","location":{"assetId":"j971zt8m46qmczzftsz331017d8h4a56","quote":"Earn 2% cash back on purchases, with no annual fee."},"owner":"https://clearpath-dev-harness.example|clearpath-review-evals","policyId":"state-availability","policyVersion":1,"quoteFound":true,"reviewId":"kd75hs69dbj1bh9w5wd1w5fqx58h44ab","severity":"needs_context","source":"ai","status":"open","suggestedFix":"Confirm that the card and advertised terms are available in every state. If availability is limited, add near the offer: “The ClearPath Rewards Card is not available in [excluded states].” Disclose any state-specific restrictions on the advertised terms there as well.","title":"Are the card and advertised terms available in every state?","updatedAt":1793203713187,"version":1}
- holdout-sms/1: {"_creationTime":1793203891524.6877,"_id":"jx70b05dnhwqcswkfp9bp19wp98h5k6r","confidence":"medium","createdAt":1793203891524,"explanation":"The submission identifies a US audience and includes no state-availability limitation. The policy requires a disclosure if the product or advertised terms are not available in all states, but the submission does not establish their availability.","location":{"assetId":"j9702tr362a4bcqndagz7a8t8d8h4skm","quote":"you're approved for up to $5,000!"},"owner":"https://clearpath-dev-harness.example|clearpath-review-evals","policyId":"state-availability","policyVersion":1,"quoteFound":true,"reviewId":"kd71nmjn0av3f2xvrr0xne1n518h4y4k","severity":"needs_context","source":"ai","status":"open","suggestedFix":"Confirm nationwide availability. If availability is limited, add “Not available in all states” and ensure distribution excludes states where the offer is unavailable.","title":"Are the advertised loan and terms available in all states?","updatedAt":1793203891524,"version":1}

[Saved regrade report](results/2026-10-28T15-54-49-103Z/report-key-v3.md) and [JSON](results/2026-10-28T15-54-49-103Z/report-key-v3.json) retain every match and missed key record. Original report.json and raw responses were not overwritten.

Historical production caveats still apply: existing workspace rules stayed at version 1; source/citation metadata was lazily populated. The video review succeeded using transcript/frames after Gemini HTTP 400. No prompt, rule, matching threshold, or provider result was changed for this regrade.

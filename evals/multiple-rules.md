# Multiple-rule reference verification

Nine detailed reviews verified the multiple-reference output on three fixed cases
on 2026-10-29. All nine analyses succeeded without retries, schema errors, unknown
references, or persistence errors. They saved 14 additional rule references across
11 findings. The lead read every supporting reference and all nine summaries.
This verifies the new output and its supporting citations on this sample; it is
not a new global accuracy baseline.

## Method

The DEV backend source was `02348034fe53c9f495888e879f9060737befa5f8`, equivalent
to the backend merged in [PR #44](https://github.com/pbanuru/clearpath_compliance_marketing/pull/44).
Each selected case ran three times using the same assets, submission context, and
saved quick-check results as the neutral-only trial in [Round 2](round2.md).
The primary-only scorer and corrected v3 answer keys were unchanged.

The classifier cache hash had advanced from version 2 to 3. Before reuse, the
actual questions, facts, sources, context, assets, and bands were compared exactly.
The matching QA-owned results were copied through the existing cache functions,
with no invented provider usage. No new classifier, extraction, capture, or upload
call was made. All applicable policy inputs stayed identical; lazy initialization
changed only unused Google/Meta citation metadata. That metadata change remains
recorded in the raw report rather than being called an unchanged full snapshot.

The system prompt adds guidance for directly supporting references, and the
strict output requests an additional-reference array. The neutral-summary
instruction and other detection, severity, evidence, and revision prose remain
unchanged. Stored findings retain each referenced policy version.

## Frozen primary-only results

| Case                                                   | Required issues before → now | Severity agreement before → now | Unmatched findings before → now |
| ------------------------------------------------------ | ---------------------------- | ------------------------------- | ------------------------------- |
| Credit-card email                                      | 8/9 → 8/9                    | 7/8 → 8/8                       | 1 → 1                           |
| Mortgage page                                          | 12/12 → 10/12                | 9/15 → 8/13                     | 0 → 0                           |
| Card holdout, historical ID `holdout-card-email-clean` | 0/3 → 1/3                    | 0/0 → 1/1                       | 0 → 0                           |

Pooled strict recall is **20/24 → 19/24**. The unchanged scorer counts only the
primary rule and its keyed location. It does not count an additional reference
as a primary match.

Two mortgage runs combined the missing APR label and missing range/qualifications
for “Rates from 5.25%.” under `advertised-rate-available`, with
`closed-end-rate-as-apr` saved as an additional reference. Both explanations
explicitly identify the absent APR label. The scorer therefore misses two keyed
primary-rule matches whose content and supporting rule are present. The third
run emitted separate findings and scored 4/4. This is a scoring limitation for
combined findings, not a reason to rewrite the frozen result.

The card email's unmatched finding is a required promotional-rate finding
anchored to the subject instead of the keyed body rate. Its explanation describes
the missing introductory label and subsequent APR. The same mismatch occurred
in the prior trial. State availability is an optional keyed question and is not
this unmatched finding.

The holdout result is a real detection limitation: it advertises a balance-transfer
fee without the balance-transfer APR. Two runs returned no findings; one caught
that omission. The shipped neutral-only comparison caught it 0/3, not 3/3.
The 3/3 result in Round 2 belongs to a different, rejected card-category trial.
This limitation remains tracked in [issue #35](https://github.com/pbanuru/clearpath_compliance_marketing/issues/35).
Nine runs do not establish a causal improvement or regression in detection.

All nine summaries stayed neutral about the reviewer's decision. The two
incorrect “No issues” summaries still represent detection failures.

## Supporting-reference review

All 14 references used supplied, applicable rule keys and their saved version 1.
No reference duplicated its primary, another reference, or an unknown rule.
The lead accepted their support for the same concrete issue:

| Finding and runs                           | Additional rule             | Count | Reason                                                                                                              |
| ------------------------------------------ | --------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------- |
| Email pre-approval subject, run 1          | `email-can-spam`            | 1     | The same subject claim is assessed against the rule's non-deceptive-subject requirement.                            |
| Promotional card APR, runs 1–3             | `advertised-rate-available` | 3     | The finding also names the missing full APR range and creditworthiness qualification.                               |
| Promotional card APR, runs 1–3             | `open-end-trigger-terms`    | 3     | The advertised rate lacks its applicable subsequent periodic APR.                                                   |
| Mortgage preapproval promise, runs 1–3     | `approval-claims`           | 3     | The same five-minute approval promise is unqualified despite underwriting.                                          |
| Mortgage rate, runs 1 and 3                | `closed-end-rate-as-apr`    | 2     | The same 5.25% claim lacks APR identification.                                                                      |
| All-50-states claim, mortgage runs 1 and 3 | `udaap-misleading`          | 2     | The question asks whether actual coverage supports that same nationwide claim; it does not declare the claim false. |

These are judgments against the supplied exercise library, not a legal opinion
or proof that every applicable rule was found. The all-50-states questions remain
conditional on facts the submission does not establish.

## Usage and evidence

The batch made nine detailed provider attempts, all successful on attempt 1.
New estimated cost from measured token usage was **$0.24120620**, with no unknown
new cost and no new quick-check usage. Prior comparison costs include its original
quick checks, so this is not a like-for-like cost or latency benchmark.

Raw artifacts remain gitignored under
`evals/results/2026-10-29T00-58-10-938Z-multiple-rules/` on the evaluation host:
`report.json`, the nine case/run JSON files, original source-run snapshots, and
usage snapshots. The neutral-only comparison is
`evals/results/2026-10-28T22-51-31-889Z-neutral/`.
The task evidence also preserves exact cache IDs/hashes, policy inputs, all
reference judgments, full summaries, span costs, and prompt/schema diffs.
The applicable-policy input SHA256 is
`f4856009b0a0f216eb654624e6c7dccfabcd3926f10009c16b3c578281cdfd16`.
See [evaluation setup](README.md) to run the fixed cases against a configured DEV
backend; stochastic model output is not expected to reproduce byte for byte.

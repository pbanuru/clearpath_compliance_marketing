# Round 2 recall diagnosis, before tuning

Evidence: the frozen v3 `policiesEnd` snapshot, all twelve relevant raw review
responses, their detailed explanations/summaries, and per-rule quick-check
probabilities. These are observable outputs; private model reasoning was not
recorded. Causal interpretations below are hypotheses to test, not established
by three samples. The scorer and its accepted policy/location rules stay fixed.

## Card holdout: balance-transfer APR, 0/3

`open-end-trigger-terms` says a disclosed account-opening fee triggers disclosure
of **each periodic rate as an APR**, plus specified finance charges and annual
fees. The email gives a balance-transfer fee, but the intro is expressly on
purchases and no balance-transfer APR is stated. The rule's generic wording does
not spell out the purchase/transfer distinction. All three detailed summaries
instead say the APRs and fees are complete; runs 1 and 3 return no findings.
Quick-check conflict probabilities are 0.13, 0.29 and 0.14, all low.

Primary diagnosis: consistent model misapplication, plausibly encouraged by
underspecified transaction categories in the rule. It recognizes the purchase
promotion and fee but treats those as a complete card-cost disclosure. A targeted
instruction to check each transaction category is justified for an experiment.
Quick-check hints may reinforce that error, but they do not select policies out:
`analysis.ts` passes the full applicable workspace library to `systemPrompt`,
and `leads()` labels probabilities as leads to verify, not conclusions.

## Social v1: rate-as-APR, run 1 missed

`closed-end-rate-as-apr` explicitly requires the percentage to be stated as APR.
The classifier assigns 0.97 in run 1 (0.98 in runs 2 and 3), so neither rule
selection nor an absent risk signal explains the miss. The run-1 payment finding
under `closed-end-trigger-terms` explicitly says the nearby 5.99% is not identified
as an annual percentage rate. It is anchored to the payment sentence and emits no
`closed-end-rate-as-apr` finding; the strict key therefore marks the rate issue
missed. Runs 2 and 3 emit both policy findings.

Primary diagnosis: model grouping/policy attribution, not failure to see the
rate. The prompt says not to repeat the same issue and to prefer fewer findings;
that could encourage collapsing distinct policy obligations. Clarifying that
distinct obligations retain their own policy/location is testable. This is an
inference; there is no hidden reasoning trace proving the deduplication cause.

## Banners: square fine-print prominence, run 1 missed

`card-promo-rate` requires the subsequent APR close to the promotional rate;
`clear-conspicuous` requires readable size, contrast and proximity. The classifier
assigns conspicuousness 0.76 in run 1. Its detailed card-promo finding explicitly
mentions the square banner's faint footer, but groups both banners into one
record located on the **wide** banner. The key requires the square asset and its
quote/region, so this is a coverage/localization miss, not an unseen footer.
Runs 2 and 3 create a separate square-banner finding with the correct box.

Primary diagnosis: model output grouping encouraged by the prompt's one-finding
per recurring issue instruction. The rules already state the required visual
assessment. A narrow instruction to separately locate defects in independently
usable variants is more justified than changing conspicuousness thresholds.

## Search holdout: repayment-period trigger, run 3 missed

`closed-end-trigger-terms` expressly includes a repayment period as a trigger.
The search ad states 24–60 months but not a payment amount/schedule. Runs 1 and 2
explain that this period triggers full repayment disclosures; run 3 returns no
findings and discusses only the unavailable Google destination. Quick-check
probabilities for the trigger are 0.06, 0.25 and 0.02, respectively. The classifier
is weak even when the detailed model catches the issue, so it is not a gating
selection failure and a causal classifier explanation is unproven.

Primary diagnosis: inconsistent model application of an explicit trigger, with
some ambiguity in the phrase “terms of repayment” about the required schedule.
A narrow clarification that a period range still triggers disclosure, and that
an APR range alone does not supply a repayment schedule, is testable. No rule or
prompt fix is made in this diagnosis/eval branch.

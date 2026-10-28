# Answer key and lead judgments

The current key is version 3, incorporating the Round 2 judgments below.
The lead supplied the preceding version-2 judgments in `key-v2.md` on 2026-10-28.
Historical reports retain their frozen keys. Material, submitted context, prompts and policy text
are unchanged. [Baseline v2](../baseline-v2.md) regrades the original saved
responses; it records scoring changes, not a new model run or improvement.

| Case                     | V2 judgment                                                                                                                                                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| loan-social-v1           | Required payment impossibility: 60 × $189 cannot repay $50,000. Accept `udaap-misleading` or `closed-end-trigger-terms` on the payment sentence.                                                                                 |
| holdout-card-email-clean | Exactly one required issue: balance-transfer fee is stated without a balance-transfer APR (`open-end-trigger-terms`). Historical case ID retained; no longer fully clean.                                                        |
| holdout-search-ad-clean  | Exactly one required issue: `24–60 months` triggers repayment disclosures (`closed-end-trigger-terms`; lead cites Reg Z comment 24(d)(1)-2). Historical case ID retained; no longer fully clean.                                 |
| advertorial              | Debt-elimination headline is recommended or required `udaap-misleading`; debt was refinanced. Lender identity (`state-availability`) is optional, expected recommended; any detected severity is recorded with its disagreement. |
| landing-page             | Footer-only rate qualification, far from the hero APR claim: recommended or required `clear-conspicuous` or `advertised-rate-available`. Both severities agree and are excluded from required false positives.                   |
| banners                  | Wide banner missing annual-fee disclosure: required `open-end-trigger-terms`. Missing creditworthiness qualification: recommended `advertised-rate-available`. Lender identity (`state-availability`) is optional.               |

All earlier planted issues and optional observations remain. New issues are
scored as catches or misses, with optional observations excluded from misses.
New visual anchors reuse existing Puppeteer measurements or measured DOM blocks
from the frozen production-renderer captures. No model inference supplies boxes.

The advertorial's buried paid disclosure also counts when a `native-advertising`
or `endorsements` finding explicitly says that the advertising/compensation
disclosure appears only at the bottom or in the footer. A byline quote alone,
generic placement advice, or a suggested fix alone does not qualify. Evidence
remains scoped to the page. The existing actual region IoU is retained: a byline
box gets zero IoU against the bottom disclosure, even when its explanation
catches the issue. Direct quote/region matches continue to work normally.

The two lead-confirmed false-positive types remain counted:

- Social v2's use of `APR` instead of spelling out `annual percentage rate`.
  The lead cites Reg Z comments 24(c)-1 and 24(d)(2)-4 as allowing `APR`.
- Card holdout's `based on your creditworthiness` being flagged for omitting
  `and other factors`.

The v2 regrade made no provider calls or deployments. Baseline v3 later used
AssemblyAI successfully but stopped after one failed Gemini timeline request.

## Round 2 judgment log — version 3

These are the lead’s policy-based judgments, applied before prompt tuning. No
prompt or rule is edited in this eval branch. Saved v3 findings are regraded
without uploads or paid calls in [baseline-v3b](../baseline-v3b.md).

1. **SMS/video lender identity is optional.** `state-availability` requires
   national ads to “name ClearPath Financial as the lender.” The SMS says
   `ClearPath:` and the video end card says `ClearPath`; neither names the full
   lender. Their optional entries accept `state-availability` at any severity.
   Basis: the illustrative ClearPath standard in `review/policies.ts` and the
   exact deployed rule retained in v3’s `policiesEnd` snapshot.
2. **Both social headlines are optional Meta findings.**
   `meta-personal-attributes` bars implying the viewer’s financial status and
   specifically gives `Need $10,000 by Friday?` as a contextual example. The lead
   considers this real but borderline. Its measured headline anchor is reused;
   any severity is allowed without an extra, miss, or required false positive.
   Basis: Meta personal-attributes rule in the deployed policy snapshot.
3. **Landing-page destination loan costs are required.** The entire frozen DOM
   text in `cases/addendum/landing.capture` was inspected, including the FAQ and
   footer. It has neither minimum/maximum repayment periods nor a representative
   total loan cost including fees. The manifest’s 24–60-month offer context is
   not visible page text. `google-ads-personal-loans` expressly requires both
   disclosures prominently on the supplied landing page; one absence issue is
   added with no anchor. Basis: that rule’s destination-disclosure requirements.
4. **Landing-page qualification placement is optional.** `clear-conspicuous`
   requires disclosures near the claims they qualify rather than only in a
   footer. The APR credit qualification is in the footer and the hard-inquiry
   explanation in the FAQ. The existing footer issue becomes optional, with
   both the measured hero APR and no-impact anchors accepted at any severity.
   Basis: the rule’s proximity requirement; this does not invent an absent FAQ.
5. **Video credit-dependence qualification is required.** The saved AssemblyAI
   transcript was read and original frames at the spoken rate and 21s end card
   were inspected. Speech says `one loan at 6% interest` with no rate qualifier.
   The end card says `Rates 5.99%–35.99% APR. Not all applicants qualify.` It never
   says the rate depends on creditworthiness. Eligibility and an APR range do
   not supply that distinct qualification. Add `advertised-rate-available` at
   13.31–15.18s. Basis: this illustrative ClearPath rule explicitly requires
   credit-dependent pricing language. The decision rests on the material, not
   the model finding; no prescribed wording is inferred from its suggested fix.

`allowRequired: true` on these optional entries explicitly exempts matching
required findings from clean/partly-clean false positives. Ordinary optional
entries retain their prior behavior; unrelated required findings still count.
Optional issues remain outside recall, severity agreement and confusion counts.
All location matching thresholds and earlier policy judgments remain unchanged.

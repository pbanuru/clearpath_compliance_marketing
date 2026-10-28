# Answer key v2

The lead supplied these judgments in `key-v2.md` on 2026-10-28. Each case JSON
now carries `version: 2`. Material, submitted context, prompts and policy text
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

Rule-text fixes belong to `codex/review-core`. AssemblyAI transcription and the
Gemini video layer are pending DEV work. This regrade makes no provider calls
or deployments; reruns wait for the lead's instruction.

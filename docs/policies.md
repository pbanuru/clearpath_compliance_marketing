# Policy versions and monitoring

An approval records the material version and a snapshot of the workspace’s current
policy keys and versions. Earlier decisions are immutable. Rechecking material
adds a separate record and event; it never rewrites an earlier approval.

## Workspace library

The authenticated workspace calls `policies.initialize` on first access. That
mutation lazily copies the seventeen seed rules into `policies` and immutable
`policyVersions`, once per `tokenIdentifier`. Creation and analysis also ensure
initialization, including for API-only clients. `policies.list` is read-only and
can show the seed library while initialization is pending. Every workspace owns
its versions, sources, updates, usage settings, and rechecks.

The analysis prompt loads current database versions, filters products, channels,
and state jurisdiction, and records the keys/versions used on the material
version and findings. A national submission includes state rules. Unknown usage
is the default for existing and new approvals.

ClearPath standards and reviewer-written state rules can be edited directly.
External regulations and guidance change through a source update. Adding a rule
creates version 1 with its title, kind, jurisdiction, product/channel applicability,
check text, and optional reference link. New analyses use it immediately; adding a
rule does not itself recheck earlier approvals. Applying an update or editing an
existing rule previews matching approved material, then creates a new policy
version with a change summary and schedules rechecks atomically.

`policies.history` returns the latest 100 versions. Rule editing uses an expected
version to reject stale writes. A source update may be applied only once.

## Sources

Sources are subscriptions owned by each workspace. Add source accepts only HTTP
or HTTPS URLs without embedded credentials. It detects eCFR section/part links,
RSS/Atom, sitemap XML, or an ordinary page. “Watch its links” uses the page’s links
as a listing when no feed is available. Optional linked rules scope updates;
without them the source can discover new rules. Labels and federal/state
jurisdiction are kept on the subscription. Pause and Remove affect that
workspace’s subscription, and do not remove another workspace’s alerts or rules.

Adding tests the fetch immediately, reports the number of listing items or the
error, and records a baseline. Existing listing entries are not new updates.
Global `sourceChecks` and `sourceSeen` share snapshots and seen URLs; daily jobs
fetch a distinct subscribed source once and fan relevant results out to its active
workspace subscriptions. A source fetch lease prevents concurrent jobs for the
same source from fetching together. Fanout and update fingerprints are idempotent.

Seeded sources:

| Rules or discovery area                                          | Monitor                                                                                                                          |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Closed-end advertising                                           | eCFR title 12, part 1026, section 1026.24                                                                                        |
| Card advertising                                                 | eCFR title 12, part 1026, section 1026.16                                                                                        |
| Mortgage prequalification                                        | eCFR title 12, part 1014                                                                                                         |
| Fair lending                                                     | eCFR title 12, part 1002, section 1002.4                                                                                         |
| Commercial email                                                 | eCFR title 16, part 316                                                                                                          |
| Marketing texts                                                  | eCFR title 47, part 64, section 64.1200                                                                                          |
| Endorsements                                                     | eCFR title 16, part 255                                                                                                          |
| UDAAP, Credit Karma action, .com Disclosures, native advertising | Their library reference pages                                                                                                    |
| CFPB newsroom                                                    | [Official RSS](https://www.consumerfinance.gov/about-us/newsroom/feed/)                                                          |
| CFPB guidance and circulars                                      | [Official sitemap](https://www.consumerfinance.gov/sitemap.xml), limited to `/compliance/guidance/` and `/compliance/circulars/` |
| FTC press releases                                               | [Official RSS](https://www.ftc.gov/feeds/press-release.xml)                                                                      |
| FTC business guidance                                            | [Official Business Blog RSS](https://www.ftc.gov/feeds/business-blog-gd.xml)                                                     |
| New federal rules/proposals                                      | Federal Register document API, CFPB/FTC/FCC                                                                                      |

The four original ClearPath standards are team managed, with internal monitors.
The [FTC’s feed directory](https://www.ftc.gov/stay-connected/rss) supplies its
feed links. The old CFPB Circulars page now redirects to
[Guidance](https://www.consumerfinance.gov/compliance/guidance/), which has no
working feed; its official sitemap still lists circulars and guidance pages.

## Daily jobs and failures

The Convex cron runs at 06:00 UTC. “Check sources now” is globally rate limited to
one run per ten minutes, or thirty-five minutes while a run remains pending.
`sourceRuns` stores start/completion time, checked-source count, update count,
status, and errors. The page computes staleness from the last stored completion,
including while a new run is pending, and warns after 26 hours.

Each `sourceJobs` row records status, attempts, lastError, and lastSuccessAt.
`sourceAttempts` is the source-fetch span ledger: start, duration, attempt, outcome,
and error for every attempt. A network error, timeout, HTTP 429, or HTTP 5xx retries
via the scheduler after five minutes, then twenty-five more minutes: three total
attempts over about thirty minutes. Permanent errors (including HTTP 404/410,
unparseable responses, and unsupported URLs) stop immediately. Failed attempts
retain the last successful snapshot and timestamp. The compact Sources list shows type, label, jurisdiction, and only a meaningful
status (a linked change, error, or pause), with Pause/Resume, Remove, and Retry.
One status line on Policies reports elapsed time since the completed run, time
until the next 06:00 UTC check, source count, and a link for failing sources.
Per-source attempt times and last-success timestamps remain in backend records.
The sidebar badge adds failing active sources and open/untriaged updates.
Interrupted jobs have a six-minute watchdog; they become visible failures and can
retry rather than remaining silently pending.

The [eCFR versioner API](https://www.ecfr.gov/developers/documentation/api/v1)
provides latest amendment dates with part/section filters. A newer date fetches
XML text at that date. Ordinary pages hash extracted main text, with a short
changed-text excerpt. Page-change occurrences use a stable job identity, so a
return to previously seen text creates a new alert while replaying the same job
does not. Listing formats extract RSS/Atom entries, sitemap locations,
or plain HTML links and compare against the persistent global seen-set. The first
successful listing check records existing URLs without model calls or updates.
Subsequent new URLs fetch a title and text excerpt.
Query parameters that identify a publication remain in its URL and seen-set key.
The initial eCFR check fetches and retains the full extracted text alongside its
amendment date. Date-only legacy baselines are repaired before comparing a new
amendment. Extracted source text is retained without truncation up to 750 KB;
larger sources fail visibly and retain the prior baseline until narrowed.
Page registration uses the same complete baseline retention. Change evidence
removes only identical outer text, retaining every changed region in between.
If that evidence exceeds 14,000 characters, the job stops with a visible error
and keeps the prior baseline; it never classifies only a prefix and advances.

The [Federal Register API](https://www.federalregister.gov/developers/documentation/api/v1)
checks rules and proposed rules for the three agencies from the last stored date
(inclusive to avoid missing documents published during a day). Document-number
fingerprints prevent duplicates. The first run looks back one day. Relevance
triage distinguishes proposals from effective requirements; proposals require
human review and do not automatically alter obligations.

All these APIs, feeds, and pages use plain HTTP fetches; no browser rendering is
needed for seeded sources. A future JS-only listing would need Cloudflare Browser
Run; this implementation reports its missing/unparseable content as a failure
rather than pretending that it contains no new guidance.

`gpt-6.1-sol` assesses new publications and drafts plain summaries and replacement
checks. Shared fetches are classified against each workspace's current applicable
library. Identical libraries share a result; distinct libraries use separate model
requests so one workspace's custom checks never enter another's request. Recipient ownership is attached by
the server and checked during fanout. Missing library decisions fail open to
human triage for those recipients. It never applies a rule. Each model attempt, including errors and rejected
structured output, records an `aiSpans` entry with operation `policy_triage`, plus
the existing daily usage ledger. Shared monitoring costs use owner
`system:policy-monitor` without a fictitious review ID. If triage fails, detected
changes still create **Not triaged** updates with evidence and the error. A person
must write the check before applying. Successful snapshots and URL baselines are
saved with durable signals, so replayed fanout cannot duplicate alerts.
Active subscribers are scanned in pages, including monitor formats and recipient
libraries; planning checks the full active index. Shared sources have no 500-owner
prefix that can silently exclude later subscribers.

The workspace library supports up to 250 rules. Reviewer-written rules and new
rules from source updates share the same capacity guard. Existing rule updates
remain available at capacity. An oversized legacy library fails visibly rather
than returning a partial set to the AI or recreating an omitted seed rule.

## Approved material and rechecks

Approved reviews have In use: Unknown, Live, or Retired. Applying a policy version
rechecks matching approved Live and Unknown material; Retired material is excluded.
Each `policyRechecks` record saves the material version, policy key, from/to policy
versions, old/new check texts, and change summary. A recheck uses the existing
media/transcript pipeline and only the changed rule. It reports no unrelated
findings. Every model attempt is costed as `recheck` (or `transcription` when needed).
Rechecks pass the configured AssemblyAI credential through the media context, so
large recordings without a successful cached transcript retain primary-provider support.
Generated transcripts use the ordinary review's ownership-checked upsert. They
remain available in the review and reusable by later checks even if the following
analysis call fails. A successful extraction clears its earlier error.

Repeated rechecks accumulate findings on the same material version. Counts,
decisions, and resubmission validation include every finding; they never validate
only the first batch. An open rule editor retains the version it started with
and requires reopening if another reviewer changes that policy.

No findings writes `recheck_passed`, for example “Rechecked against Advertised rate
availability v2: no issues”, and keeps the review approved. Findings reopen the
review as `in_review`, add source `recheck` with the policy version, and show the
Recheck badge/banner. Earlier decisions remain visible. The reviewer can request
changes and use normal resubmission, or approve again after triage. A decision
waits until queued rechecks finish. Failed rechecks keep an explicit failure badge,
never write a passed event, and offer Retry. Version history and applied updates
show “Rechecked N of M, K failed” with a retry action. Material retired or superseded
before processing is skipped; an obsolete policy recheck cannot reopen material
once a newer policy version exists.

Current take-home bounds: 500 approved reviews per atomic rollout, 250 rules and
sources per workspace, 500 eligible URLs per listing, 100 newly discovered pages
per check, 100 latest policy versions in history, and ten Federal Register pages
per check. Large backlogs stop with an error rather than silently advancing their
cursor. This is an aid for human compliance review, not a complete legal inventory.

## Verification

`npm run check` includes owner isolation, lazy seeding, shared-source deduplication,
eCFR amendment replay, listing baselines and discovery, scheduled retries,
permanent errors, staleness, failed triage, policy application and matching,
recheck outcomes, preserved decisions, retry recovery, and span accounting.
External requests are stubbed in contracts. A separate authorized DEV run checks
real government APIs; UI QA uses the staging signed-in fixture and a local Worker.

## Recheck showcase

Approved includes material with an earlier approval even when a rule recheck has
reopened it. Such rows say “No longer approved” and give the rule-change reason.
Rechecks navigation counts currently reopened items separately from other work.
Existing approvals are backfilled in owner-scoped batches of 100 with a durable
cursor and scheduled continuation. Until that migration completes, Approved uses
the previous status index so no existing approval disappears behind a partial
backfill. New workspaces start with the history index ready. Initialization and
replayed migration jobs do not count restored history or reopened items twice.
The review banner shows the original approval date, policy versions and change
date, finding count, highlighted rule text change, and links to the policy history
and original decision. It uses persisted decisions and recheck records.

After approving version 2 of the personal-loan example, “See how rechecks work”
appears on the approved review and next to Advertised rate availability on
Policies. “Apply an example standard update” adds the requirement to show the
total amount repaid when an ad shows a representative payment example. It uses
normal reviewer-created versioning and scheduling. The label makes clear this
is an example change to fictional ClearPath’s own standard. It never represents
an invented regulation, and cannot apply the same example text twice.

### Source passages on policy versions

External policy versions store `citation: { url, excerpt, retrievedAt }`. The seed
passages were fetched on October 28, 2026: eCFR versioner metadata and full XML
for the nine CFR rules, Cornell's statutory text for 12 U.S.C. 5531, and official
FTC HTML for the three guidance/action rules. Whitespace is normalized; wording
is never paraphrased. Excerpts are contiguous and at most 600 characters.
ClearPath standards have no citation. Policies, version history, and finding
rule expansions show the saved passage and an **Open at source** link. Findings
read their historical version, so an old finding retains its original passage.

New external versions schedule a plain-fetch citation retrieval. Known CFR
rules select their specific paragraph, including the promotional-rate paragraph
1026.16(g)(3), rather than the first similarly numbered paragraph in the section.
Page citations select a substantive paragraph matching the check and use a text
fragment. If the passage cannot be retrieved, `citationError` is visible; an old
quote is never silently carried into a changed version. A reviewer should verify
the passage's legal support when applying an update; matching text is not legal
interpretation.

The native-advertising seed monitors the corrected official **Commission
Enforcement Policy Statement on Deceptively Formatted Advertisements** page.
Its quotation comes from the accompanying FTC **Native Advertising: A Guide for
Businesses**, which has HTML guidance on disclosure placement; the quote names
that document explicitly. The supplied policy-statement URL omitted
`commission-` and did not resolve. The statement's landing page links a PDF,
whereas the accompanying guide supports a browser text fragment.

FTC's `www` pages and feeds returned 403/404 during live QA. The agency's public
`search.ftc.gov` host served the same official pages and valid RSS XML. The seed
uses that host for FTC feeds, the Credit Karma case summary, .com Disclosures
staff explanation, and the corrected native-advertising statement. Existing
subscriptions migrate to these URLs without recreating removed sources or
resetting a paused source. Their first successful fetch establishes a baseline.

Citation verification artifacts are in the task directory: `citation-checks.json`,
`citation-link-check.log`, `citation-cfr-fetch.json`, and fetched HTML/XML. All
four non-CFR links opened in Chrome and contained their text-fragment phrases.
All nine eCFR links were attempted; the browser redirected to **Federal Register
:: Request Access**, so DOM anchor landing could not be confirmed in this
environment. Exact paragraph text was independently fetched from the eCFR API.
That browser limitation remains open, rather than being reported as a passing
anchor check. No browser rendering is needed for monitoring these sources;
JS-only listing pages would require Cloudflare Browser Run.

### Compact policy screens

The top status line is the only monitoring schedule. Rule cards omit per-rule
check/change timestamps. A current version greater than 1 gets a small
**Changed Oct 28** tag for 30 days after the version change; initial seeds and
initial reviewer-written rules do not get a change tag. When there are no open
or Not triaged updates, the Policy updates section is absent. Applied update
links in Sources open the corresponding rule's version history, which retains
rollout counts and failed-recheck Retry. Policy panels, citations, and rule diffs
use neutral theme surfaces and borders, without semantic tinted panels or
colored edge stripes. Theme defaults remain owned by the shared screens work.

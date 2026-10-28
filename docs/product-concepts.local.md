# ClearPath product concepts

Working discussion document. These are concepts, not an approved build
specification. Commit revisions on the discussion branch as the concept develops.

## What we are solving

Help ClearPath's marketing compliance team review marketing material and complete
more reviews. The assignment establishes an Excel/email bottleneck, but does not
give its cause, review volume, or team size. We assume national US operations.

The core work is examining the actual marketing communication against applicable
rules and policies. Tracking, collaboration, and version history support that work.

## Current concept to discuss

- A review can contain a bundle: video, spoken audio, on-screen text, image,
  caption, CTA, landing page, script, or supporting offer information.
- The intended product, publishing channel, and jurisdictions affect the review.
  Extract what can be inferred; ask for context when it changes the assessment.
- AI examines the material and returns specific potential issues: where each
  appears, why it matters, its source, and a useful suggested correction.
- A responsible reviewer can accept, dismiss, or adjust findings and make the
  final decision. AI assistance is part of the concept, not a proven throughput gain.
- Collaborators can point out problems, request adjustments, revise, and resubmit.
  Make changes and responses easy to understand when a revision comes back.
- Treat the combined presentation as relevant: a transcript alone may omit visual
  context or related copy. We have not chosen the first supported format yet.

## Team model

A one-reviewer workflow with AI assistance is plausible for the prototype.
Submitter, collaborator, and final reviewer describe capabilities; they do not
require a separate employee or a hierarchy for every capability.

We do not know whether one person could handle the fictional company's real
volume. Research does not establish that an officer, analyst, operations manager,
and several approval tiers are necessary. Do not infer those requirements from
the list of possible industry roles.

## Useful interactions to explore

- Start with the content rather than an administrative form.
- Show the precise passage, frame, or visual region behind a finding.
- Let the reviewer inspect the supporting rule and correct the AI.
- Make the next required adjustment clear to the person making it.
- Show what changed between submissions and retain the decision context.
- Record routine history automatically where possible.

## Recurring checks for published content

An article could satisfy the applicable rules when it is published and need a
change three years later. Approval captures the version and rules reviewed at
that time; it should not imply that the material stays compliant forever.

Recheck content that remains published when relevant laws, platform policies, or
internal policies change. Scheduled checks could also catch changes to the live
content or its supporting offer information. Show what changed, which published
assets are affected, and the specific adjustment a reviewer needs to consider.

Keep the earlier decision and its context. A new finding should reopen the
affected material for review rather than silently replace the prior approval.
Recurring checks are a useful product concept; the cadence, sources to monitor,
and place in the take-home build remain open.

### Know what is still in use

Track where an asset is being used and whether those placements are still active.
The same approved material could appear in several places; retiring one placement
does not necessarily retire the asset everywhere. Keep the review history when
material is no longer used, but focus change-triggered reviews on affected active
placements. Unknown usage should be visible rather than assumed inactive.

A simple way to mark content in use or retired could support the first version.
Publishing systems, ad platforms, and affiliate integrations could later report
that state automatically. A reachable URL alone does not establish that a campaign
is still running, and an offline asset may have no URL at all.

### Where an API helps

Reviewers would normally use the app. An API could let other software submit
material, fetch decisions, report publication or retirement, and receive updates
when a rule change creates a new finding. This is an integration hypothesis, not
evidence that the compliance team itself wants to write API calls.

The current foundation already separates the Cloudflare-hosted Expo frontend from
the Convex backend. Convex can expose HTTP endpoints for integrations as needed;
an additional API service on Cloudflare is not required by this concept. The first
integration and any external API contract remain open.

## Friction to challenge

These are UX concerns to test, not universal prohibitions:

- Long mandatory intake before the reviewer can inspect the material.
- Repeated status updates or duplicate information entry.
- Several approval tiers without a concrete need.
- An essay or ceremonial checklist for every straightforward decision.
- Forcing reviewers to resolve false positives through excessive paperwork.
- A dashboard or tracking system that displaces the actual content review.

## What remains open

- First asset format and complete end-to-end example.
- Required context versus information the system can infer.
- Which legal, platform, and internal policies belong in the initial scope.
- How to present uncertain findings, missing context, and proposed corrections.
- Who submits revisions and how the reviewer sees their response.
- Which decisions need additional rationale, and which can be recorded simply.
- What would demonstrate improved throughput within the take-home experience.

## How to use the research

The LYFD research supplies comparable examples and candidate workflow needs; it
does not establish ClearPath's actual process. Its blanket recommendation to
exclude AI is a proposed scope choice, not a finding from an AI effectiveness test.
Its proposed name "ReviewDesk" is not adopted. The agreed product name remains
**ClearPath Marketing Compliance**.

[LYFD research report](</Volumes/Extreme SSD/yn-mac-offload/work/2026-10-28/clearpath-lyfd/workspaces/clearpath-compliance-reviewer-research/outputs/04-research.md>)

[Original assignment](../README.md)

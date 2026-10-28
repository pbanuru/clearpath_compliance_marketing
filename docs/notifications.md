# Attention notifications

`notifications.list({filter: 'all' | 'unread', paginationOpts})` returns native
Convex pagination, newest first. `notifications.unreadCount({})` returns an exact,
transactionally maintained count. `notifications.markRead({id})` is idempotent and
owner-checked. `notifications.markAllRead({})` marks existing unread entries in
batches of 100, scheduling internal continuations for larger inboxes; arrivals
after its start time stay unread. Every endpoint requires a session and derives
the owner with `requireOwner`. Read receipts belong only to that owner.

Feature mutations import the single helper from `convex/notificationModel.ts`:

```ts
await notify(ctx, ownedReview.owner, {
  type: 'recheck_reopened',
  title: `Policy changes need review: ${ownedReview.title}`,
  body: 'An approval was reopened after a policy change.',
  link: { kind: 'review', id: ownedReview._id, findingId },
});
```

Call it **inside the mutation that records the event**, after the event's
idempotency gate. Derive the recipient from an authorized resource, never a
caller-supplied identity. The helper skips the signed-in actor when the recipient
matches `ctx.auth.getUserIdentity().tokenIdentifier`. Background mutations have
no actor; if queuing a person's own action, suppress it before scheduling or
preserve and compare the initiating actor explicitly. There is no public send API.

Types are `analysis_ready`, `analysis_failed`, `revision_received`,
`recheck_reopened`, `policy_update`, and `source_failing`. Titles and optional
bodies are stored on one line. The policy branch can call `notify` for reopened
reviews, newly detected updates needing triage, and a source entering failure.
Gate on the actual transition; repeated monitoring failures should not notify
again until a source recovers and fails anew. Decisions and finding triage never
send notifications. A resubmission calls the helper, but today's personal
workspace suppresses `revision_received` because submitter and reviewer are the
same person. A future shared-review workflow must derive the reviewer recipient
from its permissions model before this notification can be delivered.

Analysis completion sends `analysis_ready` or `analysis_failed` in the same
transaction as the result, only after checking the current version, running
status, and `runKey`. Duplicate, stale, and rolled-back completions cannot produce
duplicates; a fresh retry may produce one new notification. Ready bodies count
the run's findings by severity, or say `No issues found`.

The header inbox previews the newest eight. `/notifications` groups the paginated
history by local calendar day with All/Unread filters. Opening an item marks it
read before navigating. Review links use `/reviews/:id?findingId=:findingId`,
select the finding's version and material, and reveal and focus its card, including
the phone's combined review pane. Policy links use
`/policies?tab=rules&update=:id` or `/policies?tab=sources&source=:id`.
`PolicyNotificationTarget` reveals and focuses `policy-update-:id` / `source-:id`
DOM anchors, including ancestors collapsed in `details`. The policy branch must
honor the `tab` parameter and put these stable IDs on update/source rows.

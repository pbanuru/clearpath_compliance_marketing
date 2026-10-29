# Overlay behavior

Custom overlays share `components/overlays/useDismissable.ts` and its dismissal
controller. The hook closes on a document `pointerdown` outside the content and
trigger, Escape, or an Expo route change. It restores trigger focus and permits
only one active overlay. An outside press does not prevent the next control's
normal action. Native selects keep the browser's picker behavior.

Use `Popover` for floating menus and panels. It renders into `document.body`,
positions against a trigger ref, and follows scrolling/resizing. It stays outside
review-pane overflow. Pass `closeOnSelect` for menus whose buttons and links are
commands. Panels with asynchronous actions close on successful completion.

Use `Modal` for confirmations and editors. It supplies the native modal dialog,
portal, focus containment, harmless backdrop/Escape dismissal, background scroll
lock, and focus restoration. Pass the submission state as `busy`; Escape and
backdrop dismissal are then disabled. Disable visible cancel/close controls with
the same state. Closing a form without submitting never changes backend data.

Inline ephemeral content, including rule passages and optional dismissal reasons,
uses `useDismissable` directly with content and trigger refs. It remains in normal
page flow. Persistent document disclosures such as history, revision responses,
and change lists retain their ordinary disclosure behavior.

## Adoption in feature branches

- Campaign picker and Move to campaign dialog: adopt the shared lifecycle and
  `Modal`. The picker embedded in a dialog must remain part of that dialog's form;
  avoid opening a separate competing overlay that would discard the parent form.
  Campaigns use an anchored `Popover` for the standalone picker and `Modal` for moves.
  Opening the standalone picker leaves the submission form at its existing height.
  The embedded picker shares the move dialog's lifecycle. Moving or creating a
  campaign blocks dismissal and disables cancel/close controls until it finishes.
- Policy Add rule, Edit rule, Apply update, Version history and Add source drawers:
  replace `PolicyDialog`'s one-sided backdrop test with `Modal`, including busy
  state and close-control protection for saves.
- URL capture adds an inline input, not a floating overlay. No new lifecycle is
  needed for that form.
- Quick-check summaries and authority groups are inline reading disclosures.
  They do not obscure content and need no floating-panel dismissal.
- Video's approval confirmation should preserve its evidence-warning content
  while using the shared `Modal` in DecisionBar.

These feature branches were inspected read-only during the overlay task.

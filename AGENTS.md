# ClearPath Marketing Compliance

- This is a take-home project for the fictional ClearPath Financial company.
- Product name: **ClearPath Marketing Compliance**; main screen: **Review Queue**.
- The chosen stack is Expo Router for the web app and Convex for the backend.
- The assignment is preserved verbatim in `README.md`. The app has a branded
  header, account sign-in, light/dark mode, and the review workflow (submit,
  AI first read, triage, request changes, revise, compare, approve); features
  still open as pull requests are listed in the README.
- Deadline, evaluation context, and Pranav's notes are in `docs/project-brief.md`;
  distinguish the original assignment from those notes and working assumptions.
- Live web: https://clearpath-marketing-compliance-web.aera.workers.dev
- Hosting is paused after review: both Convex deployments are paused, the public
  Worker route and `Check` workflow are disabled. Do not resume or deploy unless
  requested; see `docs/development.md#pause-and-resume` for restoration.
- Convex project: `clearpath-marketing-compliance`, existing team `-84ebe`.
  Development: `affable-skunk-990`; production: `befitting-cormorant-173`.
- Node 24 is required (`.nvmrc`). Run `npm run check` from this checkout.
- Deploy only with `npm run deploy:web`; it builds against production Convex.
- Merges to `main` deploy through CI after checks pass; superseded commits are
  skipped. Runtime WorkOS secrets remain in the Worker bindings.
- Live sign-in uses WorkOS Production; local development uses Staging. Both use
  server-sealed sessions; see `docs/authentication.md`. Enterprise SSO and review
  permissions are not configured.
- Local setup and deployment instructions are in `docs/development.md`.
- When changing the local preview server or URL, switch or reload the existing
  52 automation Chrome tab Pranav is reviewing, preserve its current review,
  and verify the new build in that tab before handing it back.
- CI uses the dedicated `clearpath-1` runner on `yn.linux`; see `docs/ci.md`.
- Configure Expo Updates before a future native build; this setup targets web.
- GitHub repository: `pbanuru/clearpath_compliance_marketing` (public).
- Keep project decisions and operating instructions in `docs/`.
- Edit `docs/architecture.dot`; the pre-commit hook generates its SVG.
- For diagram changes, run `npm run diagrams -- docs/architecture.dot`.

## Priorities

- Spend time on what an evaluator will plausibly see in a normal session
  (Pranav, 2026-10-28: if Prompt Armor or Vikram are unlikely to see or notice it
  in their usage, it goes in as an issue instead of work now): open the live URL,
  sign in, try an example or their own file or URL, triage findings, request
  changes, revise, approve, read the policies and notifications, on desktop and
  phone. Everything else (rare edge cases, internals, cost accounting, guards for
  unusual inputs) is left, and becomes a GitHub issue with the evidence only if
  it matters at all (Pranav, 2026-10-28: "if it's important at all"); trivial
  ones are dropped without an issue. A code review finding in that category gets
  a one-line reply (the issue link when there is one) and is resolved without a
  fix.

## Git

- Use judgment about review: substantive code changes should get a pull request
  and Codex review. Review is not a hard requirement for every change; simple
  wording, documentation, and similarly low-impact edits can go directly to `main`.
- When a change goes through review, address actionable findings and run the
  checks applicable to the change before merging.

## Layout

- `expo/`: Expo Router app, Cloudflare Worker, and web deployment configuration.
- `backend/`: Convex schema, generated bindings, and backend instructions.
- `docs/`: architecture source, generated diagram, and development instructions.
- `scripts/`: repository tooling.
- `.agents/skills/`: project-specific skills when needed; `.claude/skills` links here.

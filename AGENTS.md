# ClearPath Marketing Compliance

- This is a take-home project for the fictional ClearPath Financial company.
- Product name: **ClearPath Marketing Compliance**; main screen: **Review Queue**.
- The chosen stack is Expo Router for the web app and Convex for the backend.
- The assignment is preserved verbatim in `README.md`. The deployed app shell
  displays only the product name; review workflows are not built yet.
- Deadline, evaluation context, and Pranav's notes are in `docs/project-brief.md`;
  distinguish the original assignment from those notes and working assumptions.
- Live web: https://clearpath-marketing-compliance-web.aera.workers.dev
- Convex project: `clearpath-marketing-compliance`, existing team `-84ebe`.
  Development: `affable-skunk-990`; production: `befitting-cormorant-173`.
- Node 24 is required (`.nvmrc`). Run `npm run check` from this checkout.
- Deploy only with `npm run deploy:web`; it builds against production Convex.
- Local setup and deployment instructions are in `docs/development.md`.
- CI uses the dedicated `clearpath-1` runner on `yn.linux`; see `docs/ci.md`.
- Configure Expo Updates before a future native build; this setup targets web.
- GitHub repository: `pbanuru/clearpath_compliance_marketing` (private).
- Keep project decisions and operating instructions in `docs/`.
- Edit `docs/architecture.dot`; the pre-commit hook generates its SVG.
- For diagram changes, run `npm run diagrams -- docs/architecture.dot`.

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

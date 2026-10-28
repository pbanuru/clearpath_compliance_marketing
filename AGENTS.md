# ClearPath Marketing Compliance

- This is a take-home project for the fictional ClearPath Financial company.
- Product name: **ClearPath Marketing Compliance**; main screen: **Review Queue**.
- The chosen stack is Expo Router for the web app and Convex for the backend.
- The assignment is preserved in `README.md`. The repository currently contains
  documentation and tooling only; the application and deployment are not built yet.
- GitHub repository: `pbanuru/clearpath_compliance_marketing` (private).
- Keep project decisions and operating instructions in `docs/`.
- Edit `docs/architecture.dot`; the pre-commit hook generates its SVG.
- Run `npm run diagrams -- docs/architecture.dot` and `git diff --check`
  from this checkout for documentation changes.

## Git

- Use judgment about review: substantive code changes should get a pull request
  and Codex review. Review is not a hard requirement for every change; simple
  wording, documentation, and similarly low-impact edits can go directly to `main`.
- When a change goes through review, address actionable findings and run the
  checks applicable to the change before merging.

## Layout

- `docs/`: architecture source, generated diagram, and future project notes.
- `scripts/`: repository tooling.
- `.agents/skills/`: project-specific skills when needed; `.claude/skills` links here.

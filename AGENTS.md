# ClearPath Compliance Marketing

- This is a take-home project for the fictional ClearPath Financial company.
- The assignment is preserved in `README.md`. The repository currently contains
  documentation and tooling only; no application stack or deployment is chosen.
- GitHub repository: `pbanuru/clearpath_compliance_marketing` (private).
- Keep project decisions and operating instructions in `docs/`.
- Edit `docs/architecture.dot`; the pre-commit hook generates its SVG.
- Run `npm run diagrams -- docs/architecture.dot` and `git diff --check`
  from this checkout for documentation changes.

## Layout

- `docs/`: architecture source, generated diagram, and future project notes.
- `scripts/`: repository tooling.
- `.agents/skills/`: project-specific skills when needed; `.claude/skills` links here.

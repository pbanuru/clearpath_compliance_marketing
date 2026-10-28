# ClearPath Marketing Review

A take-home project to increase marketing compliance review throughput for
ClearPath Financial, a fictional consumer finance company.

**Take Home Project - 24h**

- ClearPath Financial (fictional company) is a national consumer finance company that offers personal loans, credit cards, and mortgage prequalification products to consumers online.
- The company markets these products through typical marketing channels, including affiliate partners.
- The compliance marketing team’s review process which is currently done via Excel and email at the company is currently bottlenecking growth
- You are tasked with building a product that increases throughput of the compliance marketing team.
- Feel free to make reasonable assumptions
- Final Deliverable: URL to deployed project and Github Repo

## Architecture

![Current project structure](docs/architecture.svg)

Rendered from [docs/architecture.dot](docs/architecture.dot) by the pre-commit hook.
The repository currently contains the project brief and repository tooling.

## Data flows

1. The README holds the assignment brief; changes are committed to the private GitHub repository.
2. The pre-commit hook renders staged Graphviz sources to SVG for the README.

Not built yet: the compliance marketing product and its deployment.

## Repository map

```text
clearpath_compliance_marketing/
├── README.md                   project brief and overview
├── AGENTS.md                   project-specific instructions
├── CLAUDE.md                   symlink to AGENTS.md
├── .agents/skills/             project skills, when needed
├── .claude/skills              symlink to .agents/skills
├── .aliases.sh                 project shell entry point
├── .githooks/pre-commit        diagram rendering hook
├── docs/
│   ├── architecture.dot        current repository diagram source
│   └── architecture.svg        generated diagram
├── scripts/
│   └── render-diagrams.mjs     Graphviz renderer
├── package.json                documentation tooling
└── package-lock.json           pinned tooling dependencies
```

## Guide

- **Set up:** clone the repository and run `npm ci`; this enables its pre-commit hook.
- **Run:** there is no application yet. Read the assignment above before implementation.
- **Check:** run `npm run diagrams -- docs/architecture.dot` and `git diff --check`.
- **Deploy:** no deployment exists yet; the assignment requires a deployed project URL.
- **Read next:** [AGENTS.md](AGENTS.md) for project instructions and [docs/](docs/) for architecture and future operating notes.

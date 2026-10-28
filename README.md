# ClearPath Marketing Compliance

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

![ClearPath architecture](docs/architecture.svg)

Rendered from [docs/architecture.dot](docs/architecture.dot) by the pre-commit hook.

## Data flows

1. A browser loads the Expo Router app from Cloudflare Workers. Static assets
   are served directly; page requests use Expo's server renderer and Cloudflare's cache.
2. WorkOS hosts sign-in. The Worker exchanges the callback code and keeps a sealed
   session in an HttpOnly cookie. The browser loads account state through private
   auth endpoints; account data never enters the cached shell.
3. The app forwards the WorkOS access token to Convex for identity validation.
   Development uses a separate backend deployment. Review tables and product
   queries or mutations do not exist yet.
4. GitHub Actions checks pushes and pull requests. Ready pull requests receive
   automatic Codex reviews.
5. After checks pass on `main`, GitHub Actions exports the app with Convex's
   production URL, deploys the backend, and publishes the Cloudflare Worker.

Not built yet: submission, compliance review, revision, and approval workflows.

## Repository map

```text
clearpath_compliance_marketing/
├── AGENTS.md                   project instructions (CLAUDE.md links here)
├── README.md                   assignment brief and overview
├── expo/
│   ├── src/                    routes, header, account provider, and themes
│   ├── worker/                 server rendering and WorkOS session endpoints
│   ├── scripts/                web export command
│   └── wrangler.jsonc          hosting configuration
├── backend/
│   └── convex/                 schema, JWT authentication, generated bindings
├── docs/                       architecture and development guide
├── scripts/                    file limits, skill checks, diagram rendering
├── .agents/skills/             vendor Convex skills (.claude/skills links here)
├── .github/workflows/          checks and production deployment
├── .githooks/                  commit checks and diagram generation
├── .aliases.sh                 project development commands
└── package.json                npm workspaces and shared commands
```

## Guide

- **Open:** [live app](https://clearpath-marketing-compliance-web.aera.workers.dev),
  [private repository](https://github.com/pbanuru/clearpath_compliance_marketing).
- **Set up:** use Node from `.nvmrc`, then run `npm ci` at the root.
  Follow [local environment setup](docs/development.md#local-setup).
- **Run:** `npm run dev:backend` and `npm run dev:web` in separate terminals.
- **Check:** `npm run check`.
- **Deploy:** merge into `main`; [CI](docs/ci.md) checks and deploys the tested commit.
- **Read next:** [AGENTS.md](AGENTS.md) and [development and deployment](docs/development.md),
  [account authentication](docs/authentication.md), [appearance](docs/appearance.md),
  and [code review](docs/code-review.md).

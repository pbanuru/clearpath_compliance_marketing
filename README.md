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
   The signed-in workspace saves immutable text and file assets. Convex keeps
   typed metadata and checks ownership; browser uploads go directly to private R2
   using temporary URLs. Video posters and sampled frames are separate private objects. Development
   uses a separate backend deployment and bucket.
4. Submissions create immutable review versions. Convex schedules an AI first read,
   sends signed original audio/video URLs to AssemblyAI for timestamped transcription
   (OpenAI fallback), and sends the material bundle to OpenAI for structured
   multimodal review. Findings, per-attempt costs,
   and daily usage are persisted transactionally. The reviewer triages findings
   and decides; a resubmission preserves the earlier version and rechecks requested
   changes. See [review flow and API](docs/review-flow.md).
5. Workspace policy versions define the rules used by each AI review. Shared
   publications are resolved against each workspace's applicable library. Daily source
   jobs monitor eCFR amendments, reference pages, Federal Register documents, and
   CFPB/FTC guidance listings. Staff manage sources, review proposed updates, and
   apply new rule versions. Matching approved Live/Unknown material is rechecked;
   findings reopen it while preserving the earlier approval. Failures remain visible
   with retry controls. Each external rule version saves a fetched source passage
   and a link to that passage; historical findings display the citation they used.
   See [policy versions and monitoring](docs/policies.md).
6. GitHub Actions checks pushes and pull requests. Ready pull requests receive
   automatic Codex reviews.
7. After checks pass on `main`, GitHub Actions exports the app with Convex's
   production URL, deploys the backend, and publishes the Cloudflare Worker.

Team sharing and separate reviewer permissions are not configured.

## Repository map

```text
clearpath_compliance_marketing/
├── AGENTS.md                   project instructions (CLAUDE.md links here)
├── README.md                   assignment brief and overview
├── expo/
│   ├── src/                    routes, asset workspace, header, auth, and themes
│   ├── worker/                 server rendering and WorkOS session endpoints
│   ├── scripts/                web export command
│   └── wrangler.jsonc          hosting configuration
├── backend/
│   └── convex/                 typed assets, private upload claims, JWT auth
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
  [account authentication](docs/authentication.md), [appearance](docs/appearance.md), [asset storage](docs/assets.md),
  and [code review](docs/code-review.md).

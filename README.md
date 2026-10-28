# ClearPath Marketing Compliance

ClearPath Marketing Compliance replaces a fictional lender's Excel-and-email
review loop with one workspace for submitting marketing, reviewing findings,
requesting changes, revising, and deciding. AI prepares a first read; a person
makes every approval or rejection.

[Open the app](https://clearpath-marketing-compliance-web.aera.workers.dev) ·
[GitHub repository](https://github.com/pbanuru/clearpath_compliance_marketing)

## Architecture

![ClearPath architecture](docs/architecture.svg)

Rendered from [docs/architecture.dot](docs/architecture.dot) by the pre-commit hook.

## Data flows

The product assumes the main delays are collecting context, reading material cold, communicating fixes, and comparing revisions.

| Source of delay                          | Product choice                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| Chasing attachments and missing context  | One submission bundles material, product, channel, states, and offer terms.                 |
| Reading every item from scratch          | An AI first read proposes findings with evidence, a policy reference, and a suggested fix.  |
| Rewriting feedback in email              | Accepted findings become the change list when the reviewer requests changes.                |
| Comparing replacement attachments by eye | A revision retains the earlier version, collects responses, and rechecks accepted findings. |
| Reconstructing a decision later          | Findings, decisions, and review history stay together; the decision log exports as CSV.     |

### How data moves

1. **Open and sign in.** Cloudflare Workers serves the Expo Router app, static
   assets, and server-rendered pages. WorkOS hosts sign-in; the Worker exchanges
   the authorization code and seals the session in an HttpOnly cookie. Private
   account responses stay outside the cached page shell.
2. **Submit material.** The browser passes its WorkOS access token to Convex,
   which validates identity and scopes reads and writes to the owner. Text and
   file metadata live in Convex; files upload directly to private Cloudflare R2
   through temporary signed URLs. Originals and review versions remain available
   when material is revised.
3. **Prepare evidence.** Upload completion starts reusable audio/video
   extractions. AssemblyAI receives a signed original-file URL and returns speech
   with word timings. Convex streams video from R2 to Gemini for a timeline of
   visible text, people, actions, and scenes. The browser also stores a poster
   and sampled video frames in R2.
4. **Read and review.** Convex sends the submission context, applicable policy
   library, and material to OpenAI for a structured review. Images and PDFs are
   read directly; recordings contribute transcripts and visual evidence. The
   reviewer model can request additional stored video frames. Findings return to
   Convex and link back to the relevant words, page, region, or timestamp.
5. **Decide and revise.** The reviewer accepts, dismisses, edits, or adds findings,
   then approves, rejects, or requests changes. A revision includes responses and
   updated material; another AI read checks it with the prior accepted findings
   in context. The reviewer can compare versions before deciding again.
6. **Return when attention is needed.** Finished or failed AI checks update the
   header inbox reactively. Opening a notification marks it read and returns to
   its review, or a specific finding when linked. The full notifications page
   keeps the history. Personal decisions and triage do not notify the actor.
7. **Build and release.** A local checkout runs Expo and a separate Convex DEV
   deployment. Commits and pull requests go to GitHub; GitHub Actions runs checks
   and Codex reviews ready pull requests. After checks pass on `main`, CI deploys
   the production backend and Cloudflare Worker together.

### AI boundary

A person makes every approval or rejection; the AI proposes issues.
Findings use a supplied policy library with source references, including lending,
fair-marketing, email, and affiliate guidance plus illustrative ClearPath
standards.

Speech quotes come from AssemblyAI's transcript. Gemini supplies visual timeline
observations, and the reviewer model can inspect sampled frames.
Missing or shortened evidence is disclosed, and failed analysis can
be retried or reviewed by hand. Approving with unreviewed findings or incomplete
evidence asks for confirmation. Provider usage and estimated costs are recorded;
unknown costs remain unknown.

### Assumptions and limits

- ClearPath is a US national consumer lender offering personal loans, credit
  cards, and mortgage prequalification through its own channels and affiliates.
  Internal standards are written for this exercise, not supplied by a customer.
- Each signed-in person owns a private workspace and acts as both marketer and
  reviewer. This makes the full loop usable by one evaluator.
- The policy library is a selected US starting point, not complete legal or
  state-by-state coverage. The product does not verify that an ad has actually
  been published or withdrawn.
- Videos are limited to three minutes. Longer recordings are refused rather
  than silently receiving a partial review. Upload and analysis limits are
  documented in [asset storage](docs/assets.md) and [review flow](docs/review-flow.md).

**Not built yet:** shared team roles and assignment, email intake, campaign
grouping, URL capture, pre-submit quick checks, and editable policies with source
monitoring and approval rechecks.

### Evaluation

The [eval harness](evals/README.md) uses fixed material and a handwritten answer
key to assess detection, severity, and locations. [Baseline v3](evals/baseline-v3.md)
records misses and provider failures; its [corrected-judgment regrade](evals/baseline-v3b.md)
uses the same saved outputs. These are historical DEV-union runs that included
in-flight features, not a benchmark of every feature on the current main branch.
They do not establish an improvement in team throughput or a guarantee of
compliance coverage.

## Repository map

```text
clearpath_compliance_marketing/
├── AGENTS.md                   project priorities and working instructions
├── README.md                   product, assignment, and system overview
├── expo/
│   ├── src/                    routes, review screens, notifications, and themes
│   ├── worker/                 server rendering and WorkOS session endpoints
│   ├── public/                 brand assets and fictional marketing examples
│   └── scripts/                web export tooling
├── backend/
│   └── convex/                 owned data, AI jobs, review APIs, and storage access
├── evals/
│   ├── cases/                  fixed material and fixture manifest
│   ├── answer-key/             expected issues and lead judgments
│   ├── lib/                    upload, scoring, and reporting helpers
│   └── test/                   harness contract tests
├── docs/                       architecture, product decisions, and setup guides
├── scripts/                    checks and diagram rendering
├── .agents/skills/             project and vendor workflows
├── .github/workflows/          checks and production deployment
├── .githooks/                  commit checks and diagram generation
└── package.json                npm workspaces and shared commands
```

## Guide

### Try it

1. Open the [live app](https://clearpath-marketing-compliance-web.aera.workers.dev)
   and sign in. Choose **New submission**, then **Personal loan social ad** under
   **Try an example**. The examples are fictional marketing with deliberate issues.
   You can also paste text or upload your own material.
2. After the AI read finishes, select findings to inspect their evidence and
   source. Accept the changes you want raised and dismiss those you disagree with.
   The bell lets you return if you leave while analysis runs.
3. Open **More decision options** beside Approve and choose **Request changes**.
   In **Submit a revision**, choose **Use the example revision**, then **Submit
   revision**. Other submissions let you replace material and answer each item.
4. Review the new findings and compare versions, then choose **Approve** when
   ready. Accepted findings block approval; unreviewed findings ask for confirmation.
   Inspect the decision history,
   the **Policies** library, and the notifications page on desktop or phone.

### Develop and understand it

- **Set up:** use Node from `.nvmrc`, run `npm ci`, and follow
  [local environment setup](docs/development.md#local-setup).
- **Run:** `npm run dev:backend` and `npm run dev:web` in separate terminals.
- **Check:** `npm run check`. Evaluation setup is separate in [evals](evals/README.md).
- **Deploy:** after checks pass on `main`, [GitHub Actions](docs/ci.md) deploys
  Convex and publishes a web build pointed at production. Development uses a
  separate backend deployment and bucket.
- **Read next:** [project brief and assumptions](docs/project-brief.md),
  [review flow and API](docs/review-flow.md), [asset storage](docs/assets.md),
  [authentication](docs/authentication.md), [screen layout](docs/review-layout.md),
  [appearance](docs/appearance.md), [overlay behavior](docs/overlays.md),
  [PDF viewing](docs/pdf-viewer.md), [development](docs/development.md), and
  [code review](docs/code-review.md).

### Original assignment

**Take Home Project - 24h**

- ClearPath Financial (fictional company) is a national consumer finance company that offers personal loans, credit cards, and mortgage prequalification products to consumers online.
- The company markets these products through typical marketing channels, including affiliate partners.
- The compliance marketing team’s review process which is currently done via Excel and email at the company is currently bottlenecking growth
- You are tasked with building a product that increases throughput of the compliance marketing team.
- Feel free to make reasonable assumptions
- Final Deliverable: URL to deployed project and Github Repo

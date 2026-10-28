# Continuous integration

The `Check` workflow runs `npm ci` and `npm run check` on pull requests and
pushes to `main`. Documentation-only PRs are skipped. Older PR runs are
cancelled when a newer commit is pushed.

The repository variable `CI_RUNNER=yn` selects its dedicated runner on
`yn.linux`. Its folder is `~/actions-runners/clearpath-1`, its GitHub runner
name is `yn-linux`, and its systemd user service is
`actions-runner@clearpath-1.service`. Jobs use
`~/actions-runners/home` and have no SSH agent or desktop keyring session.
The runner is registered only for this private repository.

GitHub-hosted jobs are currently blocked by the account's Actions billing
status. This runner uses the existing self-hosted CI arrangement without
changing billing. If hosted runners become available and a fallback is needed,
set `CI_RUNNER=ubuntu-latest`. Cancel and rerun queued jobs after changing it.

After a push to `main` passes `check`, the `deploy` job checks out that exact
commit and runs `npm run deploy:web`: Convex supplies its production URL to the
Expo export, deploys the backend, then Cloudflare Workers is published. A production concurrency group
queues deployments without cancelling an earlier one. Immediately before a
deploy, it reads remote `main` and skips the commit if it has been superseded;
checks finishing out of order cannot roll production back. Pull requests run only
checks and receive no deployment secrets. Both jobs use Node 24 and `CI_RUNNER`.
The final step checks that the live site returns successfully.

## Deployment credentials

GitHub repository Actions secrets are the CI credential store:

- `CONVEX_DEPLOY_KEY`: scoped to production `befitting-cormorant-173`, with only
  `deployment:deploy`. Its Convex label is
  `GitHub secret CONVEX_DEPLOY_KEY in pbanuru/clearpath_compliance_marketing`.
- `CLOUDFLARE_API_TOKEN`: the existing Cloudflare account, Workers Scripts Edit
  and Account Settings Read. Its Cloudflare label is
  `GitHub secret CLOUDFLARE_API_TOKEN in pbanuru/clearpath_compliance_marketing`.
  This project uses `workers.dev`, so no zone or route permissions are needed.

CI uses these scoped credentials rather than a developer's CLI sessions.
Cloudflare retains the Worker's encrypted secret bindings when Wrangler
publishes the next version. Nonsecret runtime variables remain in
`expo/wrangler.jsonc`; the browser's Convex URL is supplied by `convex deploy`
during the export. Runtime auth credentials belong in Worker secrets, never in
the Expo bundle or workflow.

To inspect a deployment, use `gh run list --workflow check.yml --branch main`
and `gh run view <run-id> --log-failed`. Retry a failed run with `gh run rerun
<run-id> --failed`; it checks out the same tested commit and skips deployment
if `main` has moved on. An authenticated
local `npm run deploy:web` is available for recovery.

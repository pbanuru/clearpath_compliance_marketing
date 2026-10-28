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

Deployment is manual through `npm run deploy:web` on an authenticated developer
machine; CI checks do not use Convex or Cloudflare deployment credentials.

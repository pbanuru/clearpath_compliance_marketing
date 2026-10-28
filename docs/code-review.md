# Code review

Automatic Codex review is enabled for
`pbanuru/clearpath_compliance_marketing` in ChatGPT's Code Review settings.
The repository follows personal preferences for review scope and trigger;
the account currently has automatic review on and its trigger set to every push.

A ready PR starts review without an `@codex` comment. The product-name change
in [PR #1](https://github.com/pbanuru/clearpath_compliance_marketing/pull/1)
completed automatic review with no findings; its recorded trigger was PR opened.

Use judgment: substantive code changes should receive review. Wording,
documentation, and similar simple edits do not require a review. The project's
`AGENTS.md` holds that policy. GitHub branch protection is not enabled; GitHub
reports that this private repository's account needs Pro for rulesets.

For a reviewed change, wait for completion on its current commit and address
actionable findings before merge. From the 52 workspace, run
`52-merge-when-clean --repo pbanuru/clearpath_compliance_marketing <PR>`.
The helper checks current-head Codex status and CI before it merges.

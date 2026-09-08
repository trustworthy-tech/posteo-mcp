## What changed?

<!-- Describe the behavior change and why it is needed. -->

## Security impact

<!-- Describe changes to credentials, network access, tool permissions, mailbox writes, parsing, or dependencies. Write "None" only after checking. -->

- [ ] No send-email or permanent-delete capability was introduced.
- [ ] The default mode remains read-only.
- [ ] No dependency or install/lifecycle script was added, or the rationale is documented above.
- [ ] New or changed behavior has tests.
- [ ] `npm run check` passes locally.
- [ ] Documentation reflects any changed capability or risk.
- [ ] A clean-context subagent ran `posteo-pre-main-review` against this exact revision and returned `PASS`.
- [ ] The planned merge method preserves a GitHub noreply author and committer identity.

## Testing evidence

<!-- Paste concise results. Never include credentials or private email content. -->

## Independent review

<!-- Record the reviewed base/head revisions, PASS or BLOCKED result, and residual limitations. Re-run after every diff change. -->

---
name: posteo-pre-main-review
description: Independently audit Posteo MCP changes, repository privacy, and release controls before a push or merge to main. Use for every proposed main-branch update and after any platform-generated merge commit.
---

# Posteo Pre-Main Review

Act as an independent, read-only reviewer. Do not edit files, push, merge, approve a pull request, dismiss an alert, or change repository settings. Review evidence, not the implementer's account of the change.

## Independence requirement

Run this review in a newly spawned subagent with `fork_turns="none"`. Give it only:

- the repository path;
- the base branch or revision;
- the proposed head revision or working tree;
- the instruction to use this skill.

Do not provide the implementation discussion, intended conclusion, suspected bugs, or previous review findings. A reviewer that inherited implementation context does not satisfy this gate.

## Review procedure

1. Read the repository instructions, threat model, contribution policy, changed files, and complete diff. Include committed and uncommitted changes in scope.
2. Establish the exact base and head revisions. Note if the remote state cannot be verified.
3. Review for correctness, error handling, protocol behavior, data minimization, and regressions. Trace changed behavior into tests and documentation.
4. Re-check the hard security boundaries: zero runtime/development dependencies, fixed certificate-verified Posteo TLS destination, read-only default, no SMTP/send path, no permanent deletion, bounded input/output, no telemetry, and explicit treatment of email as untrusted data.
5. Audit privacy in both file contents and Git metadata. Inspect author and committer names/emails for every proposed or newly created commit. Look for credentials, tokens, private keys, real mailbox data, message identifiers, local absolute paths, personal names, and non-synthetic email addresses. Redact any discovered secret or private value in the report.
6. Inspect workflow changes for pinned third-party actions, least-privilege permissions, bounded execution, and unsafe triggers or interpolation. Confirm the required checks actually ran for the reviewed revision; a completed scanner with open findings is not a clean result.
7. Run `git diff --check` and `npm run check`. The Posteo live test remains opt-in and must not be run unless separately authorized. Never print a Keychain password or mailbox content.
8. When GitHub CLI access is available, verify the pull request diff, check conclusions, open code/secret-scanning alerts, and active `main` rules. Treat API/UI state as evidence, not as permission to mutate it.
9. If GitHub will synthesize a squash or merge commit, require a verified noreply author/committer plan. Immediately after merge, run the privacy metadata check again against the exact new `main` commit.

## Decision

Return `PASS` only when no unresolved finding could expose private data, weaken a security boundary, break behavior, or invalidate the evidence. Otherwise return `BLOCKED`.

List findings first, ordered by severity, with a tight file/line or Git-object reference and a concrete explanation. Then list checks performed, their results, the exact reviewed revisions, and any residual limitations. Do not claim that a repository is secret-free solely because a pattern scan returned no matches.

The implementing agent must not push or merge to `main` on `BLOCKED`, incomplete evidence, or a review performed with inherited implementation context.

# Contributing

Thank you for helping improve Posteo MCP. Bug reports, threat-model challenges, documentation corrections, tests, and narrowly scoped pull requests are welcome.

## Before opening a pull request

1. Open or reference an issue for substantial behavioral changes.
2. Keep the zero-dependency design unless maintainers have agreed that a dependency is necessary and safer than maintaining equivalent code here.
3. Preserve the hard boundaries: read-only by default, no sending, no permanent deletion, fixed Posteo TLS destination, bounded outputs, and no telemetry.
4. Add tests without real credentials or private mailbox content.
5. Run `npm run check`.
6. Run the project-local `posteo-pre-main-review` skill in a clean-context subagent and include its result in the pull request.

## Pull-request process

- Fork the repository and create a focused branch.
- Complete the security-impact section in the pull-request template.
- All changes to `main` go through a pull request.
- The repository owner is the code owner for every path and must approve external contributions.
- Approvals become stale when the diff changes and must be repeated.
- Force pushes and branch deletion are blocked on `main`.
- A repository administrator can use a PR-only bypass for owner-authored maintenance; command-line bypass is not allowed.
- A passing independent review is required before merge. The reviewer must not inherit the implementation discussion, and the exact platform-generated commit metadata must be checked again after merge.

Review is not a guarantee that a change is risk-free. Security-sensitive changes may require additional tests, a smaller scope, or rejection when they weaken the project's explicit safety boundary.

## Commit and test hygiene

- Never commit credentials, real email bodies, mailbox identifiers, or generated app passwords.
- Use synthetic fixtures.
- Prefer small commits with descriptive messages.
- Update the README when changing tools, configuration, data flow, or security assumptions.

By contributing, you agree that your contribution is licensed under the repository's MIT License.

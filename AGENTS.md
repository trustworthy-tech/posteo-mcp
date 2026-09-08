# Repository agent rules

Before any push or merge to `main`, run `.agents/skills/posteo-pre-main-review/SKILL.md` in a newly spawned subagent with `fork_turns="none"`. Provide only the repository path, base revision, proposed head or working tree, and the instruction to use the skill. Do not pass implementation discussion or an expected conclusion.

Do not push or merge when the independent review returns `BLOCKED`, finds unresolved issues, cannot identify the exact revisions, or lacks required evidence. Resolve findings and repeat the review in another clean-context subagent.

After GitHub or another platform creates a merge or squash commit, verify the exact new `main` commit's author and committer metadata, required CI result, code/secret-scanning alerts, and active branch rules before reporting completion. Platform-generated commit metadata is not covered by a pre-merge diff review.

The review gate does not grant permission to push, merge, approve, rewrite history, access a live mailbox, or alter repository settings. Obtain any authorization those actions require separately.

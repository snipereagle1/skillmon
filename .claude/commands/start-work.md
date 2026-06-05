---
description: Start work on a Github issue — fetch context, pick branch, then grill.
argument-hint: <issue# | github-url>
---

Start work on issue `$ARGUMENTS`.

## 1. Resolve the issue id

If `$ARGUMENTS` is a full Github URL, extract the trailing issue number. Otherwise treat it as the number directly. Error out if empty.

## 2. Fetch the issue

Run `gh issue view <id>` and read the full body. Check for any comments with `gh issue view <id> --comments`.

## 3. Check blockers

Parse any "Blocked by #N" references from the body. For each open blocker, double-check git history before warning — the issue may just be stale:

1. Run **exactly** `git log --all --oneline -n 300 -E --grep="(Closes|Fixes|Resolves) #<N>"`. `-E` must precede `--grep` or git silently treats the pattern as basic regex and the alternation never matches. If it returns any commits, treat the blocker as done-but-not-closed and proceed. **Stop — do not run further searches.**
2. Only if step 1 returned nothing: run `gh issue view <N>` for the title, then one keyword fallback (e.g. `git log main..HEAD --oneline --grep "<distinctive-word>"`). If that also returns nothing, treat as genuinely blocking — surface and ask whether to proceed anyway (default no).

Lazy: one query, short-circuit on first hit. Don't run the fallback when step 1 already answered.

## 4. Branch decision

Ask the user (via `AskUserQuestion`):

- **New branch** — create `<id>-<kebab-slug-of-title>` branched off the **current HEAD** (do not fetch / reset to main). Run `git checkout -b <name>`.
- **Current branch** — stay put, but first:
  - Refuse if current branch is `main` (tell the user and stop).
  - Refuse if working tree is dirty (`git status --porcelain` non-empty). Tell the user to commit/stash and stop.

## 5. No tracker side effects

Do NOT self-assign, comment, or change labels. Local-only.

## 6. Hand off to grill-with-docs

Do not summarise the issue back to the user. Invoke the `grill-with-docs` skill with the minimal prompt: `Grill the plan in issue #<id>.` — the fetched issue body, comments, and blocker resolution are already in conversation context; do not re-pass them.

Grilling is a planning phase — ignore any TaskCreate prompts until the user signals "start implementing".

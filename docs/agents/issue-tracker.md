# Issue tracker: Linear

Issues and PRDs for this repo live in the **Skillmon** team in Linear (`https://linear.app/skillmon`). Use the `linear-skillmon` MCP server for all operations.

GitHub Issues is the former tracker. Every open issue has been copied into Linear; each Linear issue links back to its GitHub source. Do not file new issues on GitHub.

## Conventions

- **Create an issue**: `save_issue` with `team: "Skillmon"`, `title`, `description` (markdown), and `labels`.
- **Read an issue**: `get_issue` with the identifier (e.g. `SKI-23`); `list_comments` for the discussion.
- **List issues**: `list_issues` with `team: "Skillmon"`, filtered by `label`, `state`, or `query`.
- **Comment on an issue**: `save_comment` with `issueId`.
- **Apply / remove labels**: `save_issue` with the identifier and the full `labels` array.
- **Close**: `save_issue` with `state: "Done"` (or `"Canceled"`).

## When a skill says "publish to the issue tracker"

Create a Linear issue in the Skillmon team.

## When a skill says "fetch the relevant ticket"

Run `get_issue` for the identifier, then `list_comments`.

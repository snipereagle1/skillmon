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

## Sizing

Every ticket that is real work carries exactly one size label. Sizes are **relative**: a `size:l` is not four `size:s`, and nothing converts them to hours or points. A size answers "is this bigger than that one" and means nothing on its own.

Sizes are labels, not Linear's estimate field, so they apply with `save_issue` like any other label.

| Label     | Shape                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------- |
| `size:xs` | One line or one config value. No decision to make, no test worth writing.                                                 |
| `size:s`  | One file, known approach, no unknowns. The diff is small and the test is one case.                                        |
| `size:m`  | Several files (for example a Tauri command, its db function and its hook), one open design choice, still one sitting.     |
| `size:l`  | Cross-cutting (backend, generated types and frontend together), needs a plan before an edit, likely splits into children. |
| `size:xl` | Too big to estimate. Split it into children and size those.                                                               |

- **Size the ticket as written**, not the effort behind it. A ticket whose deliverable is a decision (a `wayfinder:grilling`, `wayfinder:research` or `wayfinder:prototype` ticket) is `size:xs` even when the thing it decides is a whole effort.
- **Count the test, not just the diff.** A one-branch fix on a routing or expiry path is `size:s`, because the case that proves it is the work.
- **Unknowns outweigh file count.** Two files with an undecided mechanism is larger than six files of mechanical change.
- **Re-size when new information lands**, and say in a comment what changed it.

**No size:** `wayfinder:map` issues. They are an index of other tickets, not work.

The labels are team labels on Skillmon, created with the `linear-skillmon` MCP server's `save_issue_label`:

```text
save_issue_label  name: "size:xs"  color: "#EDEDED"  description: "One line, no decision"             teamId: <Skillmon team id>
save_issue_label  name: "size:s"   color: "#C2E0C6"  description: "One file, known approach"          teamId: <Skillmon team id>
save_issue_label  name: "size:m"   color: "#FEF2C0"  description: "Several files, one design choice"  teamId: <Skillmon team id>
save_issue_label  name: "size:l"   color: "#F9D0C4"  description: "Cross-cutting, needs a plan"       teamId: <Skillmon team id>
save_issue_label  name: "size:xl"  color: "#E11D21"  description: "Too big to estimate — split it"    teamId: <Skillmon team id>
```

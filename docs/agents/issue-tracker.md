# Issue tracker: GitHub Issues

Issues for this repo live in GitHub Issues on `HugoBar/jeeves`, managed with the `gh` CLI. Specs and design notes live in `docs/<feature-slug>/` (e.g. `docs/v1/spec.md`).

## Conventions

- One issue per ticket. Larger tickets are split into GitHub sub-issues of a parent issue.
- Triage state is a label (see `triage-labels.md` for the role strings).
- A ticket type other than implementation (`research`, `prototype`, `grilling`) is a label of the same name.
- Blocking is a GitHub issue dependency ("blocked by"), also written as a `Blocked by #N` line at the top of the body.
- Conversation happens in issue comments.

## When a skill says "publish to the issue tracker"

`gh issue create --repo HugoBar/jeeves --title ... --body-file ... --label ...`. Add blocking with `gh api -X POST repos/HugoBar/jeeves/issues/<N>/dependencies/blocked_by -F issue_id=<blocking issue's id>` (the numeric `id` from `gh api repos/HugoBar/jeeves/issues/<M>`, not its number).

## When a skill says "fetch the relevant ticket"

`gh issue view <N> --repo HugoBar/jeeves --comments`. The user will normally pass the issue number or URL.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a parent issue with one **child** sub-issue per ticket.

- **Map**: a parent issue whose body holds the Notes / Decisions-so-far / Fog sections.
- **Child ticket**: a sub-issue of the map with the question in the body and a type label (`research`/`prototype`/`grilling`/`task`).
- **Blocking**: issue dependencies. A ticket is unblocked when every issue blocking it is closed.
- **Frontier**: open, unblocked, unassigned sub-issues of the map; lowest number wins.
- **Claim**: assign the issue to yourself (`gh issue edit <N> --add-assignee @me`) before any work.
- **Resolve**: post the answer as a comment headed `## Answer`, close the issue as completed, then add a gist + link to the map's Decisions-so-far.

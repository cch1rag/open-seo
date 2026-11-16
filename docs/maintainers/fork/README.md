# Fork maintainer docs

Notes that exist only in this fork (`cch1rag/open-seo`). Upstream
(`every-app/open-seo`) has none of these files, so they never conflict
during a sync.

| File                                     | What it is for                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------- |
| [CONTEXT.md](./CONTEXT.md)               | Context board: current state, deployments, open items. Overwrite it as things change. |
| [LEDGER.md](./LEDGER.md)                 | Active ledger: dated, append-only record of syncs, fixes, deploys and cleanup.        |
| [../../FORK_SYNC.md](../../FORK_SYNC.md) | How to sync with upstream: fork changes, standing conflict resolutions, gates.        |
| [plans/](./plans)                        | Implementation plans for fork features (shipped; kept as design records).             |
| [specs/](./specs)                        | Design specs for fork features.                                                       |

`docs/FORK_SYNC.md` stays at that path because the repository instructions
name it exactly.

## Keeping these current

- After any sync, fix, deploy or branch cleanup: add a ledger entry, then
  update the board's "Current state" and "Open items".
- The board describes now; the ledger describes what happened. Do not copy
  ledger history into the board.
- No credentials, tokens or `.env` values in either file.

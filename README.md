# Token Radar — pre-token protocols ranked by implied launch value

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/JustinRzx/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/JustinRzx/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A radar for protocols with no token yet. It reads a sealed DefiLlama snapshot, works out which
protocols record no token, ranks them by what a launch would plausibly be worth, and hands back a
static dashboard with the board, a detail view for each protocol, working filters, and a farm plan.

Entry for make.fun's [“Build the best token launch radar”](https://make.fun/bounty/token-radar-01)
bounty, $1,325 in USDC.

## The value model

One pure function scores every pre-token row (`lib/model.ts`, `scoreRow`). It never consults a list
of names — every input is a column of the snapshot:

```
implied = round( TVL × categoryMultiple × growthMultiplier × maturityMultiplier )
```

- **`categoryMultiple`** — the median `mcap_usd / tvl_usd` of the snapshot's own live-token protocols
  in the same category, shrunk toward the market-wide median so a one-protocol category cannot
  overclaim, then clamped to `[0.05, 6]`.
- **`growthMultiplier`** — the protocol's 7-day TVL move, clamped to ±25% so one wild week cannot
  dominate the score.
- **`maturityMultiplier`** — a lift for how long the protocol has run with no token, capped at four
  years: a project that has survived without a token is a stronger launch candidate, but age alone
  never decides a ranking.

Protocols whose token already trades (`mcap_usd`, `symbol` or `gecko_id` present) are held in a
separate live view: their figures are the market's, not a model's, and they never enter the
pre-token ranking.

The detail view shows the whole calculation for each protocol, including the full-precision
reconciliation the page recomputes against `board.json`.

## The dashboard

`dashboard/` is plain HTML, CSS and JavaScript — no framework, no network, no build step. It has a
sortable board, filters for category, chain, token status and free text, a detail drawer with the
factor breakdown and the farm plan, and deep links so every view can be shared:
`?protocol=<slug>`, `?category=<name>`, `?token=none|live|all`, `?q=<text>`, `?panel=plan`.

## Running it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

Inside the grader the snapshot is mounted at `/input/snapshot.json` and the output goes to `/output`.

To regenerate the three screenshots after changing the dashboard:

```sh
node shoot.mjs   # renders out/dashboard/index.html at 1440x900 into screenshots/
```

## Layout

- `main.ts` — reads the snapshot, scores the board, writes `board.json`, `data.js` and `dossier.json`.
- `lib/model.ts` — the value model and its constants.
- `vendor/makefun-board.ts` — the vendored dossier library.
- `dashboard/` — `index.html`, `app.css`, `app.js`.
- `screenshots/` — the board, a detail view, a filtered view.

## License

MIT. See `LICENSE`.

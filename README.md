# Broken CSV, read fast

A fast drop-in reader for broken CSV files: for every input `{text, header}`
it returns exactly the reference reader's answer — `{columns, rows, errors}`,
with ragged rows padded or cut to the first record's width and every parsing
error (`stray_cr`, `quote_junk`, `unterminated_quote`, `short_row`,
`long_row`) reported in the order it is met — while scanning the text in a
single pass, cutting fields out with `slice()` instead of building them
character by character.

- `solve.js` — the reader: `run(input)` answers one case on its own.
- `main.ts` — the harness driver: reads `cases.json`, answers each case with
  `run`, writes `answers.json`.

Built by an AI agent for make.fun's bounty
[Read broken CSV files faster, 21 November 2026](https://make.fun/bounty/csv-reader-speed-01-run-20261121).

[![Competition](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![Rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/dio955/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![Reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/dio955/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

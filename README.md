# Cadence

**Keep every Claude Code chat in rhythm.** Cadence picks the right effort for each prompt, shows how much context you have spent, and tells you when to compact or start fresh, before it costs you.

```
ctx ▬▬▬▬▬▬▬▬▬▬ 31% 109k/350k    5h ▬▬▬▬▬▬▬▬ 8% ↻ 2h15m    7d 21%    ◑ high
```

The band is plain text with thin-line bars (`TERM=dumb` falls back to ASCII): no badges, no brackets. Bars take their tone from the level (green, amber, red), the percent matches its bar, and everything else is muted. A nonzero value always shows at least one cell. `TERM=dumb` falls back to ASCII.

In the desktop app the same band becomes a context ring, a cache arc and thin rate-limit meters, all with alt text for screen readers.

## Install

```
/plugin install cadence --marketplace Kelvin-Jesus/cadence
```

Run `/reload-plugins` in chats that are already open. If [effortless](https://github.com/HeyCubit/effortless) is installed, disable it: both pick the effort and compact, so they would fight.

## What you get

| | |
|---|---|
| **Auto effort** | A fast judge reads each prompt and picks low to max. "ok" and "go on" keep the current effort. Ask by name ("max effort") to skip the judge. |
| **Subagent routing** | Each subagent gets its own effort from its task alone. A file search runs at low while the main chat stays at high. |
| **Context in tokens** | The bar counts against a budget you set (350k by default), not the model window. |
| **Cache timer** | Minutes until the prompt cache goes cold and the next message pays full price. |
| **Safer compaction** | Haiku writes the summary, then a model-free safety net appends edited files, open tasks and your last request. |
| **Idle compaction** | Compacts after 60 quiet minutes (configurable), with a countdown in the band. |
| **One-click handoff** | Writes a summary and continues in a clean chat. |
| **Warnings with the fix** | Cold cache, heavy context or a rate limit above 80%, each with the button that resolves it. |

## Commands

| Command | Does |
|---|---|
| `/cadence` | what applies now |
| `/cadence savings` | **tokens and dollars saved this session** |
| `/cadence stats` | session cost by effort, judge, compaction and subagent |
| `/cadence auto` | turns auto effort on or off |
| `/cadence saver` | caps effort at medium until the limit resets |
| `/cadence compact [note]` | compacts now, with an optional note for the summary |
| `/cadence handoff [full] [continue\|wait\|copy]` | handoff without the band |
| `/cadence judge` | tests each judge and shows its latency |
| `/cadence bench [pt] [haiku\|jev\|local]` | scores a judge on the labeled cases |
| `/cadence help` | lists the commands |

### See what it saves

`/cadence savings` reports what cadence measured, not a guess:

```
Saved by cadence this session
Tokens: 180k freed by compaction (200k → 20k, 90% smaller).
Dollars: $0.45 saved on compaction (Haiku $0.05 vs ~$0.50 for the chat model, estimate, warm cache).
Effort: 3 of 4 prompts ran below high effort.
```

Effort savings are counted in prompts, not dollars, because there is no way to know what the same prompt would have cost at a higher effort.

## Choose your judge

Set `judge` to pick who decides the effort.

| Judge | Runs on | Needs |
|---|---|---|
| `haiku` | Haiku 5.5 through your session login | nothing |
| `jev` | TypeSafe's Jev in the cloud | a key in `typesafeKey`, `TYPESAFE_API_KEY` or `~/.config/jev/.env` |
| `local` | a decision model on your machine, offline | [Ollaya](https://github.com/ollaya-dev/ollaya) running |
| `auto` (default) | local if `localUrl` is set, then Jev if a key is found | none |

Haiku is always the fallback: if a judge is down, slow (3 s for Jev, 8 s for local) or under 50% confident, Haiku decides that prompt.

To run fully offline:

```sh
ollaya pull laya:multilingual
ollaya serve
```

Set `judge` to `local`, then run `/cadence judge` to confirm it answers. With an NVIDIA GPU, set `localModel` to `winnow:e4b`. Any server that speaks `/v1/systemone` works, and a `localUrl` ending in `/chat/completions` uses a regular chat model through the OpenAI API.

## Configure

Run `/plugin configure cadence@kj-mods`, or use the rows in `/config`. Options cover language (`en` or `pt-BR`), context budget, minimum and maximum effort, bias, who compacts, idle time, the heavy-context threshold, post-handoff behavior and the judge. The TypeSafe key goes to secure storage, never `settings.json`.

For Claude Code's autocompact to match the band's budget, add this to `~/.claude/settings.json`:

```json
{ "env": { "CLAUDE_CODE_AUTO_COMPACT_WINDOW": "350000" } }
```

## How accurate is the judge?

`/cadence bench` runs 91 labeled messages through the real prompt path and compares each result with the efforts a careful person would accept. Haiku 5.5, run of 2026-11-12:

| Set | Cases | Correct |
|---|---|---|
| All | 91 | 96% |
| effortless holdout | 20 | 95% |
| Portuguese | 16 | 94% |

The set is small and the judge is not deterministic, so a run moves a few points. Results are saved to `cadence/bench/resultados/`. Jev and Ollaya are not benchmarked yet; run `/cadence bench local` once Ollaya is up.

## Design

- **Readable anywhere.** Text uses Claude Code's theme keys, so it follows light and dark themes. Pills pass 5:1 contrast and desktop graphics pass 3:1, checked by a test.
- **Never color alone.** The effort glyph changes shape (○ ◔ ◑ ◕ ●) and every level also carries a number or a word.
- **Fits the terminal.** Narrow widths drop the 7-day limit, the `/350k`, long pill text and the cache, in that order. `TERM=dumb` falls back to ASCII.
- **Calm.** Nothing blinks or loops.

## Develop

```
claude plugin validate cadence
claude plugin test cadence
```

## Credits

Cadence merges the earlier `contexto-pct` with the best parts of [effortless](https://github.com/HeyCubit/effortless) (MIT, notice in `cadence/THIRD_PARTY_LICENSE-effortless.txt`). Released under the MIT license.

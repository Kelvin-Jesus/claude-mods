# claude-mods

Mods for Claude Code.

## Cadence

A band above the prompt that keeps the chat in rhythm. It decides how much effort each prompt deserves, shows how much context is spent and how long the prompt cache stays warm, and tells you when to compact or start over.

```
ctx ■■■■□□□□□□ 40% 140k/350k · ◑ high · cache 42m              compacts in 12 min   5h 62%
│ Heavy context: every message rereads 310k        [ Compact ] [ New chat ] ✕
```

In the desktop app the same band becomes a context ring, an arc for the cache and thin meters for the rate limits, each with alt text for screen readers.

Cadence merges the old `contexto-pct` with the best parts of [effortless](https://github.com/HeyCubit/effortless) (MIT, notice in `cadence/THIRD_PARTY_LICENSE-effortless.txt`).

### Language

Everything is in English by default. Set `language` to `pt-BR` and the band, toasts and `/cadence` output switch to Brazilian Portuguese. Commands and option values stay in English either way. The effort judge reads messages in both languages regardless of this setting.

### What it does

**Auto effort.** Before each prompt, a fast judge reads the message and the end of the conversation and picks the effort, from low to max. "ok", "yes", "go on" keep the effort of the task in progress. Asking by name skips the judge: "max effort", "effort: low", "esforço máximo". A message typed mid-turn never lowers the effort of the task that is running. If you change the effort in the app, auto turns off and says so; `/cadence auto` turns it back on. It only acts on Opus and Sonnet 5.5, where changing effort keeps the prompt cache.

**Three judges, one of them offline.** The `judge` option picks who decides:

| Judge | Runs on | Needs |
|---|---|---|
| `haiku` | Haiku 5.5, through the session login | nothing |
| `jev` | TypeSafe's Jev, in the cloud (`/v1/systemone`) | a key in `typesafeKey`, `TYPESAFE_API_KEY` or `~/.config/jev/.env` |
| `local` | a decision model on your machine, no internet | [Ollaya](https://github.com/ollaya-dev/ollaya) running |
| `auto` (default) | the local judge when `localUrl` is set, then Jev when a key is found | — |

Haiku is always the fallback. When the fast judge is down, slow (3 s for Jev, 8 s for local) or unsure (under 50% confidence), Haiku decides that prompt and the band warns once.

The local judge is built for **Ollaya**, the local, open-source counterpart to Jev. Ollaya serves open decision models (Laya, Winnow, d1-omni and others) behind the same `/v1/systemone` contract Jev uses, so Cadence sends one request and reads one answer whether the judge is in the cloud or on your laptop.

- With `judge: local` and no URL, Cadence calls `http://127.0.0.1:11435/v1/systemone` with `laya:multilingual`. Ollaya's own numbers put that model at about half a second for five questions on a CPU, and it reads Portuguese.
- With an NVIDIA GPU, set `localModel` to `winnow:e4b`, Ollaya's recommended model.
- Any other server with `/v1/systemone` works too (Ollama 0.40+, `laya-serve`): put its base URL in `localUrl`.
- A `localUrl` ending in `/chat/completions` sends a regular chat model through the OpenAI API instead (llama-server, LM Studio), with the output held to a JSON schema.

Quick start:

```sh
ollaya pull laya:multilingual
ollaya serve
```

Then set `judge` to `local` and run `/cadence judge`, which sends a small message to each judge in the queue and shows what it answered and how many milliseconds it took.

**Context bar in tokens.** The bar counts against a fixed budget (350k by default), not the model window. In a 1M window, 350k is already a heavy chat, and the bar shows it. It turns to warning at 70% of the budget and to critical at the heavy-context threshold.

**Prompt cache timer.** Minutes left until the cache goes cold and the next message pays for the whole chat at full price. It detects whether the cache lives 5 minutes or 1 hour.

**Haiku compaction with a safety net.** Every compaction (`/compact`, the automatic one, the idle one) is summarized by Haiku 5.5. Under the summary goes a list taken from the transcript with no model: edited files (flagging the ones the summary forgot), open tasks and your last request, verbatim. If Haiku fails, Claude Code compacts as usual. Every compaction is also told to keep the plan, tasks, decisions and paths.

**Compacts when you step away.** After 60 minutes with no message and no agent work (configurable), and at least 30k tokens. In the last 15 minutes the band shows `compacts in N min`.

**One-click handoff.** Writes a handoff summary and continues in a clean chat. The quick one uses a fork of the chat model while the cache is warm, or Haiku once it has gone cold, since rereading a cold chat would be expensive. The full one checks git and writes `HANDOFF.md`, or runs the skill you name. Afterwards it can continue, wait, or only copy. From 30% of the budget, Haiku says when a new chat would do better (the task ended, the subject changed, the conversation is going in circles).

**Warnings with the button that fixes them**, one at a time: cold cache on a big chat, heavy context, a 5-hour or weekly limit above 80% (with **Turn saver on**: effort at most medium until the limit resets). The likeliest action comes first and highlighted; ✕ dismisses.

### Look

The band was redesigned after studying usage meters in shipped products (Claude, Vercel, Cursor, Revolut, Sentry, found through Mobbin) and terminal tools (btop, lazygit, Starship, Lip Gloss).

- The number sits next to the bar; the reset time goes in the warning or the alt text.
- Colored text uses Claude Code's theme keys (`success`, `warning`, `error`), so it follows a light or dark theme. Filled pills carry their own background and pass 5:1 on any theme; desktop graphics use tones that pass 3:1 on both app backgrounds. A test computes these ratios.
- Color is never the only cue. The effort glyph changes shape (○ ◔ ◑ ◕ ●), and every level comes with a number or a word.
- On narrow terminals the band drops, in order, the 7-day limit, the `/350k`, the long pill text and the cache. With `TERM=dumb`, glyphs fall back to ASCII (`[####------]`).
- Nothing blinks or loops.

### Commands

| Command | Does |
|---|---|
| `/cadence` | what applies now |
| `/cadence auto` | turns auto effort on or off |
| `/cadence judge` | tests each judge in the queue and shows its latency |
| `/cadence handoff [full] [continue\|wait\|copy]` | handoff without the band |
| `/cadence compact [note]` | compacts now, with an optional note for the summary |
| `/cadence saver` | effort at most medium until the limit resets |
| `/cadence stats` | session cost, by effort, by judge and by compaction |
| `/cadence bench [pt] [haiku\|jev\|local]` | scores a judge on the labeled cases |
| `/cadence help` | lists the commands |

### The judge, measured

`/cadence bench` runs 91 labeled messages through the same path as a real prompt and compares the result with the efforts a careful person would accept. 75 cases come from effortless; 16 in Portuguese were written for Cadence and never used to tune the prompt. Run of 2026-11-12, Haiku 5.5:

| Set | Cases | Correct |
|---|---|---|
| All | 91 | 96% |
| effortless holdout | 20 | 95% |
| Portuguese | 16 | 94% |

For comparison, effortless's Haiku judge scored 92–93% overall and 95% on the holdout. The set is small and the judge is not deterministic, so a run moves a few points. Results go to `cadence/bench/resultados/`. Jev and Ollaya have not been benchmarked here yet; `/cadence bench local` does it once Ollaya is running.

### Configure

`/plugin configure cadence@kj-mods`, or the rows in `/config`: language, context budget, minimum and maximum effort, bias (cheaper or more thorough on close calls), who compacts, idle time, the heavy-context warning, what happens after a handoff, and the judge with its URL, model and key. The TypeSafe key goes to secure storage, not `settings.json`.

For Claude Code's autocompact to use the band's budget, add to the `env` of `~/.claude/settings.json`:

```json
{ "env": { "CLAUDE_CODE_AUTO_COMPACT_WINDOW": "350000" } }
```

### Install

```
/plugin install cadence --marketplace Kelvin-Jesus/claude-mods
```

In chats already open, run `/reload-plugins`. Disable effortless if it is installed: both pick the effort and compact, and they would fight.

### Develop

```
claude plugin validate cadence
claude plugin test cadence
```

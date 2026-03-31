# CLAUDE.md — Agora Handover Document

## Big Picture

**Agora** is an AI-powered "Expert Proxy" — it helps non-experts ask expert-level questions. Instead of answering your question directly (which gives you a mediocre answer because you asked a mediocre question), Agora runs a structured dialogue between two AI agents:

1. **Socrates** (the Expert Proxy) — asks the probing, expert-level questions you *should* be asking but don't know to ask
2. **Oracle** (the Knowledge Engine) — provides deep, expert-grade answers to Socrates' questions
3. **Synthesis Layer** — translates the expert dialogue into plain language you can actually use

The insight: **expert answers start with expert questions**. A junior PM asking "how do I improve search ranking?" gets generic advice. Socrates reframes this into "are you optimizing within a marketplace algorithm or your own search infrastructure?" — which unlocks a completely different (and much more useful) answer.

## Current PoC Scope

The PoC is scoped to **E-commerce Product Management** as the domain. This means:
- Catalog management, pricing strategy, search ranking, fulfillment, marketplace dynamics, review systems
- The domain context and vocabulary are defined in `src/lib/prompts.ts`

### What the PoC Does (shipped)
- Landing page where user types a question
- 5-round Socrates ↔ Oracle dialogue (configurable via `maxRounds`)
- Real-time SSE streaming of each round to the browser
- Synthesis after each round (quick take + detailed synthesis)
- Off-topic detection endpoint (`/api/off-topic-check`)
- Session page that displays the dialogue as it unfolds

### What's NOT Built Yet
- **Heartbeat/keepalive events** — the SSE stream goes silent for 30-60s between rounds while AI calls run. Browsers/proxies may timeout. Need to send periodic heartbeat events.
- **User redirect** — Socrates should be able to ask the USER a clarifying question mid-dialogue (the `userRedirect` param exists in the API but isn't wired up in the UI)
- **User context injection** — `userContext` param exists but isn't exposed in the UI (user should be able to provide background before starting)
- **Multi-domain support** — currently hardcoded to e-commerce PM. The architecture supports a `domain` param but only one domain's prompts exist.
- **Session persistence** — sessions are ephemeral. No database, no history, no "continue where I left off."
- **Authentication** — none. Currently behind Cloudflare Access in production.
- **Mobile responsiveness** — UI works but isn't optimized for mobile
- **Error recovery** — if a round fails mid-dialogue, the whole session dies. Need graceful degradation.
- **Rate limiting** — no protection against abuse
- **Cost tracking** — no visibility into token usage per session
- **Share/export** — can't share a completed dialogue or export it

## Architecture

```
Next.js 16 (App Router, Turbopack)
├── src/app/page.tsx           # Landing page (question input)
├── src/app/session/page.tsx   # Session page (dialogue display)
├── src/app/api/
│   ├── session/route.ts       # POST → SSE stream of the dialogue
│   └── off-topic-check/route.ts  # POST → checks if question is in-domain
├── src/lib/
│   ├── agora.ts               # Core logic: Socrates, Oracle, Synthesis, session runner
│   └── prompts.ts             # System prompts and domain context
└── .env.local                 # ANTHROPIC_API_KEY
```

### Model Routing

Uses real Anthropic models via the standard API:

| Role | Model | Purpose |
|------|-------|---------|
| Socrates | `claude-sonnet-4-20250514` | Asks expert questions |
| Oracle | `claude-sonnet-4-20250514` | Provides expert answers |
| Synthesis | `claude-haiku-4-5-20251001` | Plain-language translation |
| Off-topic check | `claude-haiku-4-5-20251001` | Domain relevance filter |

### Authentication

Supports two auth methods (auto-detected):

**OAuth token (Max/Pro subscription, no extra cost):**
- Set `ANTHROPIC_AUTH_TOKEN=sk-ant-oat01-...` in `.env.local`
- Get your token via `claude auth token`
- The app mimics Claude Code's identity (required by Anthropic's OAuth):
  - Sends beta headers: `claude-code-20250219,oauth-2025-04-20`
  - User-agent: `claude-cli/2.1.75`
  - Prepends "You are Claude Code" to system prompts
- This is the same mechanism OpenClaw uses

**API key (pay-per-token):**
- Set `ANTHROPIC_API_KEY=sk-ant-api03-...` in `.env.local`
- Standard API billing

### SSE Event Flow

The `/api/session` endpoint streams these events:

```
session_started    → { sessionId, question, domain, maxRounds }
socrates_question  → { text, round }       (per round)
oracle_answer      → { text, round }       (per round)
synthesis_update   → { quickTake, synthesis } (per round)
round_complete     → { roundNumber }        (per round)
session_complete   → { quickTake, synthesis, questions } (final)
error              → { message }            (on failure)
```

## How to Run

```bash
git clone https://github.com/atlas-origin-git/agora.git
cd agora
npm install
cp .env.local.example .env.local  # add your API key
npm run dev                        # dev server on localhost:3000
```

For production build:
```bash
npm run build
npm start -- -p 3003
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_AUTH_TOKEN` | One of these | Claude Code OAuth token (uses Max/Pro subscription) |
| `ANTHROPIC_API_KEY` | One of these | Anthropic API key (pay-per-token) |

## Key Design Decisions

1. **SSE over WebSockets** — simpler, works through CDNs/proxies, sufficient for one-directional streaming
2. **No database** — PoC keeps everything in-memory. Sessions are fire-and-forget.
3. **Separate Socrates/Oracle/Synthesis** — three distinct system prompts with different roles. They don't share context except through the dialogue history passed between rounds.
4. **OAuth auth** — mimics Claude Code identity to use Max/Pro subscription. No extra API costs for PoC development.
5. **Domain-scoped** — the prompts are deeply tailored to e-commerce PM. This is intentional — generic "ask any question" would produce worse results.

## File-by-File Guide

| File | Lines | What it does |
|------|-------|-------------|
| `src/lib/prompts.ts` | 141 | System prompts for Socrates, Oracle, Synthesis, Off-topic. Domain context. |
| `src/lib/agora.ts` | 282 | Core engine: `callSocrates()`, `callOracle()`, `callSynthesis()`, `runSession()`, `checkOffTopic()` |
| `src/app/page.tsx` | 187 | Landing page with question input, off-topic check, navigation to session |
| `src/app/session/page.tsx` | 684 | Session UI — connects to SSE, renders rounds, shows synthesis |
| `src/app/api/session/route.ts` | 102 | API route — validates input, creates SSE stream, calls `runSession()` |
| `src/app/api/off-topic-check/route.ts` | 25 | API route — calls `checkOffTopic()`, returns boolean |
| `src/app/layout.tsx` | 33 | Root layout with fonts and metadata |

## Known Issues

1. **Browser timeout on long rounds** — each round takes 30-60s. No heartbeat events. Browsers/Cloudflare may cut the connection. Fix: send periodic `heartbeat` events in the SSE stream.
2. **OAuth auth** — uses Claude Code identity headers + system prompt prefix. If Anthropic changes the OAuth requirements, this may break.
3. **Thinking blocks** — MiniMax returns thinking blocks. `extractText()` in `agora.ts` handles this by preferring text blocks and falling back to thinking content, but sometimes Socrates' question gets buried in thinking output.
4. **No graceful shutdown** — if the server restarts mid-session, the client gets a dead SSE connection with no error.

## Production Deployment

- Runs on a Mac Mini via `launchd` (`com.rainbow.agora`)
- Port 3003, bound to 127.0.0.1
- Exposed via Cloudflare Tunnel at `agora.atlas-origin.com`
- Protected by Cloudflare Access (email-based auth)

## Git Workflow

When asked to push to git, commit, or save progress:

```bash
# 1. Stage all changes
git add -A

# 2. Commit with a descriptive message using conventional commits
git commit -m "type: short description

Optional longer explanation of what changed and why."

# 3. Push to origin main
git push origin main
```

### Conventional commit types:
- `feat:` — new feature or functionality
- `fix:` — bug fix
- `docs:` — documentation changes only
- `refactor:` — code restructuring without behavior change
- `style:` — UI/CSS changes
- `chore:` — build, config, dependency updates

### Rules:
- **Always `git add -A`** before committing (don't miss new files)
- **Always push to `origin main`** — this is the only branch
- **Never force push** (`--force`)
- **Write meaningful commit messages** — not "update" or "changes"
- If there are no changes to commit, say so — don't create empty commits

### Example:
```bash
git add -A
git commit -m "feat: add heartbeat events to SSE stream

Send periodic keepalive events during AI processing
to prevent browser/proxy timeout on long rounds."
git push origin main
```

## Vision (Beyond PoC)

The bigger vision is a platform where:
- Multiple domains are supported (product management, engineering, marketing, legal, finance...)
- Users can define custom domains with their own vocabulary and mental models
- Dialogue history is saved and searchable
- Users can "redirect" the dialogue mid-stream (Socrates asks the user, not just Oracle)
- Teams can share completed dialogues as knowledge artifacts
- The quality of Socrates' questions improves over time via feedback loops

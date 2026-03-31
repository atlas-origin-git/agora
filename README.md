# Agora — Expert Proxy Platform

**Expert answers start with expert questions.** A multi-round Socrates ↔ Oracle dialogue for E-commerce Product Management.

## What It Does

Instead of answering your question directly (which gives a mediocre answer because you asked a mediocre question), Agora runs a structured dialogue between two AI agents:

1. **Socrates** (Expert Proxy) — asks the probing, expert-level questions you *should* be asking
2. **Oracle** (Knowledge Engine) — provides deep, expert-grade answers
3. **Synthesis Layer** — translates the expert dialogue into plain language

## Quick Start

```bash
git clone https://github.com/atlas-origin-git/agora.git
cd agora
npm install
```

### Authentication

Agora supports two auth methods:

**Option 1 — Claude Code OAuth token (uses your Max/Pro subscription, no extra cost):**
```bash
# Get your token
claude auth token

# Create .env.local
echo "ANTHROPIC_AUTH_TOKEN=sk-ant-oat01-..." > .env.local
```

**Option 2 — Anthropic API key (pay-per-token):**
```bash
echo "ANTHROPIC_API_KEY=sk-ant-api03-..." > .env.local
```

Then run:
```bash
npm run dev        # dev server on localhost:3000
# or
npm run build && npm start -- -p 3003   # production
```

## Architecture

```
Next.js 16 (App Router, Turbopack)
├── src/app/page.tsx              # Landing page
├── src/app/session/page.tsx      # Dialogue display
├── src/app/api/session/route.ts  # SSE streaming endpoint
├── src/app/api/off-topic-check/  # Domain relevance filter
├── src/lib/agora.ts              # Core: Socrates, Oracle, Synthesis
└── src/lib/prompts.ts            # System prompts & domain context
```

### Model Routing

| Role | Model | Purpose |
|------|-------|---------|
| Socrates | Claude Sonnet 4 | Asks expert questions |
| Oracle | Claude Sonnet 4 | Provides expert answers |
| Synthesis | Claude Haiku 4.5 | Plain-language translation |
| Off-topic check | Claude Haiku 4.5 | Domain relevance filter |

### How OAuth Auth Works

When using a Claude Code OAuth token (`sk-ant-oat01-...`), Agora mimics Claude Code's identity to use your Max subscription:
- Sends `anthropic-beta: claude-code-20250219,oauth-2025-04-20` header
- Identifies as `claude-cli/2.1.75` via user-agent
- Prepends "You are Claude Code" to system prompts (required by Anthropic's OAuth)

This is the same mechanism OpenClaw uses for its agents.

## Deployment

Production instance runs on Mac Mini:
- Port 3003 via `launchd` (`com.rainbow.agora`)
- Exposed at `agora.atlas-origin.com` via Cloudflare Tunnel
- Protected by Cloudflare Access

## Domain

Currently scoped to **E-commerce Product Management**: catalog management, pricing, search ranking, fulfillment, marketplace dynamics, review systems.

## See Also

- `CLAUDE.md` — detailed handover document for Claude Code (design decisions, known issues, what's built vs not)

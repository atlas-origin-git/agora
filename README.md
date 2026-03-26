# Agora — Expert Proxy Platform

A 5-round Socrates ↔ Oracle dialogue app for E-commerce Product Management.

## Architecture

- **Socrates** (Expert Proxy, Claude Opus): asks probing expert questions the user should be asking
- **Oracle** (Knowledge LLM, Claude Sonnet): provides expert-level answers
- **Synthesis Layer** (Claude Haiku): real-time plain-language translation with 5 buckets

## Running

```bash
npm install
npm run dev
```

Open [http://localhost:3003](http://localhost:3003)

## Environment

Requires `ANTHROPIC_API_KEY` in `.env.local` (MiniMax access token format).

## Deployment

Runs on `agora.atlas-origin.com` via Cloudflare Access tunnel (port 3003).

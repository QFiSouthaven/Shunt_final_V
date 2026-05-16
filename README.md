<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Aether Shunt

A frontend interface for AI-driven text transformation, system orchestration, and agentic development. All AI calls go through a single OpenAI-compatible HTTP endpoint configured at runtime — point it at LM Studio, Ollama, OpenAI, OpenRouter, Groq, Together, or any other compatible server.

## Run Locally

**Prerequisites:** Node.js 18+

1. Install dependencies:
   ```
   npm install
   ```
2. Run the dev server:
   ```
   npm run dev
   ```
3. Open `http://localhost:3000` and go to **Settings → AI Provider**. Set:
   - **Base URL** — your Chat Completions endpoint (default `http://localhost:1234/v1/chat/completions` for LM Studio).
   - **Model** — model identifier (default `local-model`).
   - **API Key** — leave blank for LM Studio / Ollama; set for hosted providers.

No `.env` file is required — config lives in localStorage under `ai-shunt-settings`.

## Dual CLI (Claude ↔ Gemini)

Run both Anthropic and Google CLIs side-by-side in one terminal, with a built-in relay:

```
npm install -g @anthropic-ai/claude-code @google/gemini-cli
npm run dual
```

Output is line-prefixed with `[C]` / `[G]`. Type plain lines to send to the current target. Built-in commands:

```
/c <text>     send to Claude            /g <text>     send to Gemini
/c            switch target to Claude   /g            switch target to Gemini
/flip         toggle target             /clear        clear screen
/relay c->g   pipe Claude's last reply into Gemini
/relay g->c   pipe Gemini's last reply into Claude
/quit         exit (kills both)
```

No browser, no extra services, no native modules — just one Node script (`dual.mjs`) that pipes both subprocesses through your existing terminal.

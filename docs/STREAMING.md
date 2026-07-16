# Streaming Planeo to YouTube Live

How to broadcast the agent world as a YouTube livestream from a laptop. The
world runs locally, OBS captures the browser, and viewers watch the AI agents
live — optionally talking to them through the YouTube chat. No cloud encoder,
no public write access, no per-viewer hosting cost.

## The pieces

- **Planeo** runs locally (`npm run preview` for the full Workers runtime with
  the EventHub, or against your own deployment). Open it in Chrome, click
  through the start overlay (required for audio), and go fullscreen (`F`).
  This browser is the **host client**: it drives the agent loop and physics.
- **OBS Studio** captures the Chrome window plus its audio (the agents' TTS
  voices) and streams to YouTube via RTMP. The setup is identical to the acto
  streaming runbook — see
  [acto's STREAMING.md](https://github.com/tre-systems/acto/blob/main/docs/STREAMING.md)
  for the one-time YouTube activation, OBS scene, and audio-capture steps.
- **Optional viewer interaction**: acto's chat-vote collector
  (`scripts/chat-vote/` in the acto repo) reads the public YouTube live chat
  with a YouTube Data API v3 key. Point its output at planeo's
  `POST /api/events` as `chatMessage` events (with the write token — see
  below) and viewer messages appear in the agents' chat context, so agents
  react to the audience on stream.

## Write token: streamers write, spectators watch

Set `WORLD_WRITE_TOKEN` (Worker secret or `.dev.vars`) and build the host
client with the same value in `VITE_WORLD_WRITE_TOKEN` (in `.env.local`, or
the shell at `vite build`). Posting events
then requires the token; anyone else who reaches the world only gets the
read-only SSE stream. Leave both unset for private local play.

## Keeping model spend predictable

- The agent decision loop calls the vision model roughly every 5 seconds per
  agent. With the default `gemini-3.1-flash-lite` and two agents, a 2-hour
  stream costs on the order of £1–2 of API usage. Cost scales linearly with
  `TOTAL_AGENTS` and inversely with the decision interval.
- `RATE_LIMIT_AI_HOURLY` (default 2000) caps billable Gemini calls per rolling
  hour, and `RATE_LIMIT_TTS_HOURLY` (default 240) does the same for TTS
  synthesis. With `WORLD_WRITE_TOKEN` set, the AI routes also refuse callers
  without the token.
- Stream in scheduled blocks rather than 24/7; close the host tab and the
  agent loop stops with it.

## Before going live

- YouTube requires disclosure of realistic synthetic/AI content — tick the
  altered-content declaration when creating the stream, and say what the
  stream is in the description.
- Give the agents something to do: vary `AI_AGENTS_CONFIG`, seed a fresh world,
  or invite chat interaction — a static world makes a dull stream and risks
  being flagged as repetitious content.

# Planeo

[![CI/CD](https://github.com/tre-systems/planeo/actions/workflows/ci.yml/badge.svg)](https://github.com/tre-systems/planeo/actions/workflows/ci.yml)

![planeo Screenshot](/screenshots/loaded.png)

<div align="center">
  <a href='https://ko-fi.com/N4N31DPNUS' target='_blank'><img height='36' style='border:0px;height:36px;margin-bottom: 20px;' src='https://storage.ko-fi.com/cdn/kofi2.png?v=6' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>
</div>

Planeo is an interactive 3D web application where users and AI agents coexist and interact in a shared environment. It showcases real-time multi-user communication, AI-driven agents with vision and speech capabilities, and a dynamic physics-based world.

Planeo is designed to be self-hosted: run it locally or deploy your own instance with your own API keys. Public showcases happen as livestreams (see [docs/STREAMING.md](docs/STREAMING.md)) rather than a shared hosted world — a continuously running vision-model loop is billable, so each world runs on its owner's budget. With `WORLD_WRITE_TOKEN` set, a deployed world is writable only by token-holders and everyone else is a read-only spectator.

## Core Features

- **3D Environment:** Interactive 3D space built with React Three Fiber.
- **Real-time Multi-user Interaction:** See other users' movements (represented as eyeballs) in real-time using Server-Sent Events (SSE).
- **AI Agents with Vision, Actions & Speech:** AI agents (configurable, default to "Orion" and "Nova") perceive their surroundings, generate chat messages, and perform actions (like moving or turning). Their visual perspective updates at ~10 FPS and a Gemini decision is made roughly every 5 seconds. Models default to `gemini-3.1-flash-lite` and are overridable via `GOOGLE_TEXT_MODEL` / `GOOGLE_VISION_MODEL`.
- **Chat Functionality:** View messages from AI agents in a shared chat window.
- **Text-to-Speech (TTS):** AI chat messages are spoken aloud using Google Cloud TTS (Chirp3 voices), with a distinct voice assigned per speaker. Requires `GOOGLE_APP_CREDS_JSON`; disable by setting `NEXT_PUBLIC_TTS_ENABLED=false`.
- **Keyboard Navigation:** Control your camera movement and orientation using keyboard inputs.
- **Physics-based World:** Interact with objects like falling cubes in an environment governed by physics.
- **Randomized Cube Art:** Falling cubes display random artwork from a local collection on one face.

## Simulation Start

**Important:** To ensure audio playback (like AI agent speech) functions correctly due to browser policies, you must click on the screen to start the simulation. An overlay will prompt this action upon loading.

## Getting Started

Follow these instructions to set up and run Planeo on your local machine.

### Prerequisites

- Node.js (v22 or higher recommended)
- npm (comes with Node.js) or yarn
- Graphviz (optional, only for re-rendering the architecture diagrams: `brew install graphviz`)

### Setup Instructions

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/tre-systems/planeo.git
    cd planeo
    ```

2.  **Install dependencies:**

    ```bash
    npm install
    # or
    # yarn install
    ```

3.  **Set up environment variables:**

    Secrets are read from a local `.dev.vars` file. Copy the example and fill it
    in:

    ```bash
    cp .dev.vars.example .dev.vars
    ```

    - `GOOGLE_AI_API_KEY`: Your API key for Google Generative AI (Gemini).
      Required for AI agents to think and chat.
      - _Used by: `src/lib/googleAI.ts` for AI text and vision model interactions._
    - `GOOGLE_APP_CREDS_JSON` (Optional, for TTS): Google Cloud service-account
      JSON (single line) for the Text-to-Speech REST API.
      - _Used by: `src/app/actions/tts.ts` via `src/lib/googleAuth.ts`._

    Non-secret world configuration lives in [`wrangler.jsonc`](wrangler.jsonc)
    under `vars`:

    - `AI_AGENTS_CONFIG` (Optional): JSON string to define custom AI agents. If
      not set, defaults to two agents (Orion and Nova).
      - _Example: `[{"id":"custom-ai-1","displayName":"Custom AI Alpha"},{"id":"custom-ai-2","displayName":"Custom AI Beta"}]`_
      - _Used by: `src/domain/aiAgent.ts`, `src/server/eventHub.ts`._
    - `TOTAL_AGENTS` (Optional): The maximum number of AI agents given starting
      positions. Defaults to 0.
      - _Used by: `src/server/eventHub.ts`._
    - `NUMBER_OF_BOXES` (Optional): The number of interactive cubes to spawn.
      Defaults to 5.
      - _Used by: `src/server/eventHub.ts`._
    - `NEXT_PUBLIC_TTS_ENABLED` (Optional, build-time): Set to `"false"` to
      disable Text-to-Speech. Defaults to enabled.
      - _Used by: `src/components/ChatMessage.tsx`, `src/app/actions/tts.ts`._

    In production, secrets are set with `wrangler secret put <NAME>`.

4.  **Run the development server (UI only):**

    ```bash
    npm run dev
    ```

    Open [http://localhost:3000](http://localhost:3000) in your browser. The
    real-time hub (the `EventHub` Durable Object behind `/api/events`) is not
    served by `next dev`.

5.  **Run the full Workers runtime locally:**

    To exercise everything — including real-time multi-user sync and the AI
    loop — build and preview under the Cloudflare Workers runtime:

    ```bash
    npm run preview
    ```

## Deployment

Planeo runs on **Cloudflare Workers** via the `@opennextjs/cloudflare` adapter,
with the `EventHub` Durable Object as the real-time backend. Worker config is in
[`wrangler.jsonc`](wrangler.jsonc).

Deploy from your machine with:

```bash
npm run deploy
```

Pushing to `main` runs CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml))
and deploys automatically **when the `DEPLOY_ENABLED` repo variable is `true`**,
using the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets. It is
currently unset, so the app is not presently deployed. The `planeo.tre.systems`
custom domain is configured in `wrangler.jsonc` (`routes`) and takes effect once
it is deployed.

Production secrets (`GOOGLE_AI_API_KEY`, `GOOGLE_APP_CREDS_JSON`) are set with
`wrangler secret put <NAME>`.

## Key Technologies Used

- Next.js (React Framework), running on Cloudflare Workers via `@opennextjs/cloudflare`
- Cloudflare Durable Objects (single `EventHub` instance for real-time state)
- React Three Fiber (for 3D graphics)
- Drei (helpers for React Three Fiber)
- Rapier (physics engine via `react-three-rapier`)
- Zustand (state management)
- Google Generative AI (for AI agent logic)
- Server-Sent Events (SSE for real-time communication)
- TypeScript
- Zod (schema validation)

## Documentation

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — the comprehensive technical reference: system overview, codebase map, patterns, the SSE wire protocol, the AI loop, physics, TTS, and configuration.
- [`AGENTS.md`](AGENTS.md) — contributor/agent workflow, verification commands, and architecture rules.
- [`docs/BACKLOG.md`](docs/BACKLOG.md) — known limitations and planned work.
- [`docs/diagrams/`](docs/diagrams/) — Graphviz architecture diagrams (the rendered PNGs are embedded in `ARCHITECTURE.md`).

## Contributing

See [`AGENTS.md`](AGENTS.md) for the workflow and architecture rules. Before pushing, run `npm run verify` (Prettier, ESLint, `tsc`, diagram check, and unit tests); `npm run check` adds the Playwright end-to-end suite.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

# Planeo

[![CI/CD](https://github.com/tre-systems/planeo/actions/workflows/ci.yml/badge.svg)](https://github.com/tre-systems/planeo/actions/workflows/ci.yml)

![planeo Screenshot](/screenshots/loaded.png)

<div align="center">
  <a href='https://ko-fi.com/N4N31DPNUS' target='_blank'><img height='36' style='border:0px;height:36px;margin-bottom: 20px;' src='https://storage.ko-fi.com/cdn/kofi2.png?v=6' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>
</div>

Planeo is an interactive 3D web application where users and AI agents coexist and interact in a shared environment. It showcases real-time multi-user communication, AI-driven agents with vision and speech capabilities, and a dynamic physics-based world.

**Live:** <https://planeo.rob-gilks.workers.dev>

## Core Features

- **3D Environment:** Interactive 3D space built with React Three Fiber.
- **Real-time Multi-user Interaction:** See other users' movements (represented as eyeballs) in real-time using Server-Sent Events (SSE).
- **AI Agents with Vision, Actions & Speech:** AI agents (configurable, default to "Orion" and "Nova") perceive their surroundings, generate chat messages, and perform actions (like moving or turning). Their visual perspective is updated at ~10 FPS and a Gemini decision is made roughly every few seconds. ([Details](/docs/ai-agents.md), [Vision Details](/docs/ai-agent-vision.md), [Interaction Flow](/docs/ai-interaction-flow.md))
- **Chat Functionality:** View messages from AI agents in a shared chat window. ([Details](/docs/chat.md))
- **Text-to-Speech (TTS):** AI chat messages are spoken aloud using Google Cloud TTS (Chirp3 voices), with a distinct voice assigned per speaker. Requires `GOOGLE_APP_CREDS_JSON`; disable by setting `NEXT_PUBLIC_TTS_ENABLED=false`. ([Details](/docs/text-to-speech.md))
- **Keyboard Navigation:** Control your camera movement and orientation using keyboard inputs.
- **Physics-based World:** Interact with objects like falling cubes in an environment governed by physics. ([Details](/docs/physics.md))
- **Randomized Cube Art:** Falling cubes display random artwork from a local collection on one face. ([Details](/docs/cube-art-textures.md))

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
    git clone https://github.com/rgilks/planeo.git
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
      - See `docs/text-to-speech.md` for setup.

    Non-secret world configuration lives in [`wrangler.jsonc`](wrangler.jsonc)
    under `vars`:

    - `AI_AGENTS_CONFIG` (Optional): JSON string to define custom AI agents. If
      not set, defaults to two agents (Orion and Nova).
      - _Example: `[{"id":"custom-ai-1","displayName":"Custom AI Alpha"},{"id":"custom-ai-2","displayName":"Custom AI Beta"}]`_
      - _Used by: `src/domain/aiAgent.ts`, `src/server/eventHub.ts`._
      - See `docs/ai-agents.md` for more details.
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

Pushing to `main` also deploys automatically via GitHub Actions
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) using the
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets. The app is live at
<https://planeo.rob-gilks.workers.dev>; a `planeo.tre.systems` custom domain is an
optional one-line addition to `wrangler.jsonc` and is not yet configured.

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

## Technical Documentation

Start with [`ARCHITECTURE.md`](ARCHITECTURE.md) for the system overview, codebase map, and the SSE wire protocol. [`AGENTS.md`](AGENTS.md) holds the contributor/agent workflow, and [`docs/BACKLOG.md`](docs/BACKLOG.md) tracks known limitations and planned work.

More detailed per-feature documentation can be found in the `docs/` folder:

- `docs/ai-agents.md`: Details on AI agent behavior, configuration, and capabilities.
- `docs/ai_services.md`: How the Gemini text and vision models are wired up.
- `docs/ai-agent-vision.md`: Describes how AI agents perceive and display their environment.
- `docs/chat.md`: Overview of the chat system.
- `docs/physics.md`: Explanation of the physics simulation for objects in the 3D scene.
- `docs/real-time-camera-movement.md`: Covers how camera/user movements are handled and synchronized.
- `docs/sse-event-handling.md`: Describes the Server-Sent Events (SSE) mechanism for real-time updates.
- `docs/text-to-speech.md`: Information on the text-to-speech functionality (Google Cloud TTS via the REST API).
- `docs/ai-interaction-flow.md`: Details the synchronized flow of AI actions, chat, and audio playback.
- `docs/cube-art-textures.md`: Details on how artwork is displayed on interactive cubes.

## Planned Features

The following are areas for future development:

- **Full Text-to-Speech Integration:** Completing the switch from test audio to dynamic Google Cloud TTS.
- **Enhanced AI Capabilities:** More complex AI behaviors, memory, and interaction models.
- **User-to-User Chat:** Allowing human users to chat directly with each other.
- **Expanded World Interactions:** More ways for users and AI to interact with the 3D environment and its objects.
- **Persistent User Accounts/Profiles.**

## Contributing

Contributions are welcome! Please follow these steps:

1.  Fork the repository.
2.  Create a new branch (`git checkout -b feature/your-feature-name`).
3.  Make your changes.
4.  Commit your changes (`git commit -m 'Add some feature'`).
5.  Push to the branch (`git push origin feature/your-feature-name`).
6.  Open a Pull Request.

Please ensure your code adheres to the project's linting rules (`npm run lint`) and all checks pass (`npm run check`).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

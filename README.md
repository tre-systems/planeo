# Planeo

[![CI/CD](https://github.com/rgilks/planeo/actions/workflows/fly.yml/badge.svg)](https://github.com/rgilks/planeo/actions/workflows/fly.yml)

![planeo Screenshot](/screenshots/loaded.png)

<div align="center">
  <a href='https://ko-fi.com/N4N31DPNUS' target='_blank'><img height='36' style='border:0px;height:36px;margin-bottom: 20px;' src='https://storage.ko-fi.com/cdn/kofi2.png?v=6' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>
</div>

Planeo is an interactive 3D web application where users and AI agents coexist and interact in a shared environment. It showcases real-time multi-user communication, AI-driven agents with vision and speech capabilities, and a dynamic physics-based world.

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
    Copy the example environment file to create your local configuration:

    ```bash
    cp .env.example .env.local
    ```

    Now, edit `.env.local` and provide the necessary values:

    - `NEXT_PUBLIC_APP_URL`: The public URL of your application (e.g., `http://localhost:3000` for local development).
      - _Used by: `src/app/actions/generateMessage.ts` for SSE event posting._
    - `GOOGLE_AI_API_KEY`: Your API key for Google Generative AI (e.g., Gemini).
      - _Used by: `src/lib/googleAI.ts` for AI text and vision model interactions._
    - `AI_AGENTS_CONFIG` (Optional): JSON string to define custom AI agents. If not set, defaults to two agents (Orion and Nova).
      - _Example: `AI_AGENTS_CONFIG='[{"id":"custom-ai-1","displayName":"Custom AI Alpha"},{"id":"custom-ai-2","displayName":"Custom AI Beta"}]'`_
      - _Used by: `src/domain/aiAgent.ts`, `src/app/api/events/route.ts`._
      - See `docs/ai-agents.md` for more details.
    - `TOTAL_AGENTS` (Optional): The maximum number of AI agents allowed in the environment. Defaults to 0 if not set on the server-side, influencing AI agent initialization.
      - _Used by: `src/lib/env.ts`, potentially affecting `src/app/api/events/sseStore.ts`._
    - `NUMBER_OF_BOXES` (Optional): The number of interactive cubes to spawn in the environment. Defaults to 5 if not set.
      - _Used by: `src/lib/env.ts`, `src/app/api/events/sseStore.ts`._
    - `NEXT_PUBLIC_TTS_ENABLED` (Optional): Set to `"false"` to disable Text-to-Speech functionality. Defaults to `true` (enabled).
      - _Used by: `src/components/ChatMessage.tsx`, `src/app/actions/tts.ts`._
    - `GOOGLE_APP_CREDS_JSON` (Optional, for full TTS): JSON string containing Google Cloud service account credentials for Text-to-Speech API. Required if you intend to use the full Google Cloud TTS feature (currently prototyped).
      - _Used by: `src/app/actions/tts.ts`._
      - See `docs/text-to-speech.md` for setup.

4.  **Run the development server:**

    ```bash
    npm run dev
    # or
    # yarn dev
    ```

    Open [http://localhost:3000](http://localhost:3000) in your browser.

5.  **Build for production:**
    ```bash
    npm run build
    npm run start
    # or
    # yarn build
    # yarn start
    ```

## Key Technologies Used

- Next.js (React Framework)
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
- `docs/text-to-speech.md`: Information on the text-to-speech functionality (currently using test audio, with details on the planned full integration).
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

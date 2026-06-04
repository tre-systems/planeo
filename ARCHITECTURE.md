# Architecture

Planeo is an interactive 3D web app where a human user and AI agents share one
space. The user walks a first-person camera around a 3D world (React Three
Fiber + Rapier physics); AI agents are rendered as floating eyeballs that see
the scene from their own viewpoint, decide how to move, and chat. Everyone's
positions, the AI chat, and the physics cubes are synced between browsers over
Server-Sent Events (SSE).

This document describes how the running system fits together. For per-feature
detail see [`docs/`](docs/); for known gaps and planned work see
[`docs/BACKLOG.md`](docs/BACKLOG.md).

## The one constraint that shapes everything: single instance

All cross-client state lives in **plain in-memory module globals** on the
server — `eyes`, `boxes`, and `subs` Maps/Sets in
[`src/app/api/events/sseStore.ts`](src/app/api/events/sseStore.ts). There is no
Redis, database, or pub/sub. A broadcast only reaches clients connected to the
**same** server process, box state is per-process, and the `purgeStale`
interval runs per-process. The app is therefore correct only when pinned to a
single instance — which is exactly how [`fly.toml`](fly.toml) configures it
(`max_machines_running = 1`). Scaling horizontally would require a shared
backing store first. There is no persistence: nothing survives a restart.

## Codebase map

| Path                           | Responsibility                                                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/app/layout.tsx`           | Root layout: fonts, metadata, PWA manifest. No providers.                                                                                                                      |
| `src/app/page.tsx`             | `HomePage` client component. Mints a per-client `myId` (`nanoid(6)`), mounts the scene + chat UI, starts the text-chat and eye-sync hooks.                                     |
| `src/app/components/Scene.tsx` | React Three Fiber host: opens the SSE connection, gates on the start overlay, owns the human camera and keyboard controls, renders the world.                                  |
| `src/app/components/`          | Scene-level R3F components: `Eye`/`Eyes` (agents + users), `Box` (physics cubes), `AIAgentViews` (HUD thumbnails), `StartOverlay`.                                             |
| `src/components/`              | DOM chat UI: `ChatWindow`, `ChatMessage`, `ChatInput`.                                                                                                                         |
| `src/hooks/`                   | `useEventSource` (SSE in), `useEyePositionReporting` (position out), `useEyesDataSynchronizer`, `useAIAgentController` (agent vision + decisions), `useAiChat` (text replies). |
| `src/app/actions/`             | Server actions: `generateMessage.ts` (AI vision/action/chat), `aiControllerActions.ts` (`requestAiDecision` wrapper), `tts.ts` (Google Cloud TTS).                             |
| `src/app/api/events/`          | `route.ts` (SSE GET + event POST) and `sseStore.ts` (the in-memory hub).                                                                                                       |
| `src/lib/`                     | `googleAI.ts` (Gemini client + model selection), `audioService.ts`, `env.ts`.                                                                                                  |
| `src/stores/`                  | Zustand stores (see below).                                                                                                                                                    |
| `src/domain/`                  | Zod schemas and shared constants (the data contracts).                                                                                                                         |

## Render & input

[`Scene.tsx`](src/app/components/Scene.tsx) opens the SSE connection via
`useEventSource`, then gates rendering on `useSimulationStore(isStarted)`. Until
the user clicks the `StartOverlay`, nothing renders — the gate exists so the
browser's autoplay policy will allow audio once interaction begins. After start
it mounts a `<Canvas>` (camera at `[48, 20, 120]`, `fov 75`, `near 1`,
`far 2500`, `preserveDrawingBuffer: true`) wrapping `<Physics>`, the world
content, and the server-driven cubes, plus an `AIAgentViews` HUD.

`CanvasContent` owns the human's first-person camera: WASD/QE/arrow-key controls
(no mouse-look), integrated each frame with lerped velocity (`moveSpeed = 12`,
`acceleration = 0.05`, `dampingFactor = 0.9`, `rotationSpeedFactor = 0.5`).
Rotation is yaw-only and the camera's Y is locked to `EYE_Y_POSITION` (-11.9).

## Real-time layer (SSE)

[`route.ts`](src/app/api/events/route.ts) exposes one endpoint:

- **`GET /api/events`** opens an SSE stream (`text/event-stream`). On connect it
  initializes the configured AI agents' eye positions
  (`agents.slice(0, TOTAL_AGENTS)`, spread along X) and `subscribe`s the writer,
  which replays the current eyes and boxes to the new client.
- **`POST /api/events`** validates the body against `EventSchema` and dispatches:
  `eyeUpdate → setEye`, `chatMessage → broadcast`, `boxUpdate → setBox`.

[`sseStore.ts`](src/app/api/events/sseStore.ts) is the hub: `eyes`, `boxes`, and
`subs` in-memory collections; `broadcast` writes `data:<json>\n\n` to every live
subscriber; `setBox` preserves a box's color across updates; `purgeStale` (every
10 s) drops eyes idle for more than 30 s. Boxes are created once from
`NUMBER_OF_BOXES` at positions `[i*15 - (N-1)*7.5, 5, -20]` with colors cycled
from a 12-entry palette.

On the client, `useEventSource` opens `EventSource("/api/events")`, `safeParse`s
each message, and fans out: `eyeUpdate → rawEyeEventStore`, `chatMessage`/`box`
to registered listeners. `useEyePositionReporting` polls the camera every 100 ms
and sends an `eyeUpdate` (via `navigator.sendBeacon`) when the rounded
position/look changed, or at least every 20 s. `useEyesDataSynchronizer` maps
raw eye records into the animated `eyesStore` for rendering.

### Wire protocol

| `type`        | Direction       | Payload                                                                                                                                                                            |
| ------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eyeUpdate`   | both            | `id`, `name?`, `p?` (position), `l?` (lookAt), `t`                                                                                                                                 |
| `chatMessage` | both            | a `Message` (`id`, `userId`, `name?`, `text`, `timestamp`, `audioSrc?`)                                                                                                            |
| `box`         | server → client | `id`, `p`, `o` (orientation), `c` (color), `t`                                                                                                                                     |
| `boxUpdate`   | client → server | `id`, `p?`, `o?` (drives `setBox`)                                                                                                                                                 |
| `aiVision`    | client → server | accepted by the schema but **has no handler** — the human-camera capture posted from `Scene.tsx` is discarded. The live AI vision path is the server action below, not this event. |

## AI agents

Agents default to **Orion** (`ai-agent-1`) and **Nova** (`ai-agent-2`), or
whatever `AI_AGENTS_CONFIG` defines ([`src/domain/aiAgent.ts`](src/domain/aiAgent.ts)).
Two Gemini models back them, both via the `@google/genai` client keyed by
`GOOGLE_AI_API_KEY` ([`src/lib/googleAI.ts`](src/lib/googleAI.ts)):

- **Vision/action:** `gemini-1.5-flash-latest`
- **Text chat:** `gemini-2.0-flash-lite`

### Vision + movement loop

[`useAIAgentController`](src/hooks/useAIAgentController.ts) runs inside the
Canvas. For each agent (other than the local user) it allocates an offscreen
`PerspectiveCamera` and a `320×200` `WebGLRenderTarget`. A single `useFrame`
drives two cadences:

- **Visual update** every `100 ms` (~10 FPS): render the scene from the agent's
  eye, read + vertically flip the pixels into a PNG data URL, and push it to
  `aiVisionStore` for the HUD thumbnail.
- **Decision** every `500 ms`, guarded by a per-agent in-flight lock: send the
  latest thumbnail and the last 10 chat messages to the `requestAiDecision`
  server action, then apply the returned action locally — `move` translates
  along the forward vector by `distance × 10`; `turn` rotates the look-at about
  Y by `degrees`. The new position is reported back over SSE.

[`generateAiActionAndChat`](src/app/actions/generateMessage.ts) is the server
side: it builds the agent's "newly-awakened, disoriented" persona prompt, calls
Gemini with `responseMimeType: "application/json"` (`temperature 0.4`,
`maxOutputTokens 150`), strips code fences, and validates the result against
`AIResponseSchema` (`{ chatMessage?, action, audioSrc? }`). If there's a chat
message it broadcasts it. It then **awaits a fixed `setTimeout(5000)` before
returning** — this server-side pause, not any client constant, is what
effectively paces each agent to roughly one action every ~5 s. It also writes
every captured frame to a `debug_images/` directory on the server.

### Text chat replies

[`useAiChat`](src/hooks/useAiChat.ts) (page-level) watches the chat. When the
most recent message is from the human user, after a `1500–2500 ms` delay it asks
**only the first agent** to reply via `generateAiChatMessage` (text-only,
`gemini-2.0-flash-lite`) and broadcasts the result.

## Audio / TTS

There are two audio paths, and only one is live:

- **Live:** [`tts.ts`](src/app/actions/tts.ts) `synthesizeSpeechAction` is real
  Google Cloud TTS. It validates `GOOGLE_APP_CREDS_JSON`, deterministically
  assigns each `userId` one of 24 Chirp3-HD voices (by hash), synthesizes MP3,
  and returns base64. [`ChatMessage.tsx`](src/components/ChatMessage.tsx) calls
  it client-side for each incoming message (skipping the user's own and
  `/`-commands) and plays the audio. Disabled when `NEXT_PUBLIC_TTS_ENABLED` is
  exactly `"false"`.
- **Vestigial:** [`audioService.ts`](src/lib/audioService.ts) `generateAudio`
  returns a hardcoded test clip (a T-Rex roar) and is stored as a message's
  `audioSrc` on the server, but the client never reads `audioSrc`. See
  [`docs/BACKLOG.md`](docs/BACKLOG.md).

## State (Zustand stores)

| Store                | Holds                                                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `communicationStore` | Chat messages + chat-UI flags (`isChatVisible`, input focus).                                                           |
| `eventStore`         | The `EventSource` connection, listener registries, and outbound senders (`sendChatMessage`, throttled `sendBoxUpdate`). |
| `rawEyeEventStore`   | Raw per-id eye records (`p`, `l`, `t`) straight off SSE.                                                                |
| `eyesStore`          | The rendered/animated eyes (Three `Vector3`/`ShaderMaterial`, opacity, scale, proximity-based conversation pairing).    |
| `boxStore`           | Animated cube state (current/target position + orientation, color), lerped each frame.                                  |
| `aiVisionStore`      | The latest agent-view thumbnails for the HUD.                                                                           |
| `simulationStore`    | The single `isStarted` flag behind the start overlay.                                                                   |

## Domain schemas

[`src/domain/`](src/domain/) holds the Zod contracts: `aiAction` (the
`move`/`turn`/`none` action union and the `AIResponse` the vision model must
return — `turn` is clamped to 1–45°), `message`, `event` (the SSE union),
`eye`, `box`, `aiAgent` (config parsing + defaults), plus `sceneConstants`
(`EYE_RADIUS 8`, `EYE_Y_POSITION -11.9`, ground at -20) and `common`
(`Vec3Schema`).

## Configuration

| Variable                  | Required    | Purpose                                           | Default      |
| ------------------------- | ----------- | ------------------------------------------------- | ------------ |
| `GOOGLE_AI_API_KEY`       | for AI      | Gemini client (text + vision).                    | —            |
| `NEXT_PUBLIC_APP_URL`     | for AI chat | Base URL server actions POST chat back to.        | —            |
| `GOOGLE_APP_CREDS_JSON`   | for TTS     | Google Cloud service-account JSON for Chirp3 TTS. | —            |
| `AI_AGENTS_CONFIG`        | no          | JSON array of `{ id, displayName }` agents.       | Orion + Nova |
| `TOTAL_AGENTS`            | no          | How many agents get eye positions.                | `0`          |
| `NUMBER_OF_BOXES`         | no          | Physics cubes to spawn.                           | `5`          |
| `NEXT_PUBLIC_TTS_ENABLED` | no          | Set to `"false"` to disable TTS.                  | enabled      |

## Build & deploy

`npm run build` produces a Next.js **standalone** output (`next.config.ts`),
wrapped by `next-pwa` in production. The [`Dockerfile`](Dockerfile) is a
multi-stage Node Alpine build that runs `server.js` from the standalone bundle.
Deployment targets **Fly.io** (app `planeo`, region `lhr`, a single 256 MB
machine that scales to zero). CI is [`.github/workflows/fly.yml`](.github/workflows/fly.yml):
a `check` job (`npm run verify`) gates every push, and a `deploy` job ships to
Fly on push to `main` once a `FLY_API_TOKEN` secret is present.

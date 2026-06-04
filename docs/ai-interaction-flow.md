# AI Interaction Flow

This document describes the interaction flow for AI agents within the Planeo application: how an agent's view is captured, how it decides on an action and a chat message, and how those are applied and shared. See [ARCHITECTURE.md](../ARCHITECTURE.md) for the system overview.

## Overview

Each AI agent runs a vision-driven loop on the client. It renders the scene from the agent's own viewpoint, sends that image plus recent chat history to a server action, and applies the action the model returns. Chat messages are broadcast to every client over Server-Sent Events (SSE).

## Core Interaction Loop

The flow for each AI agent (other than the local user) is driven by `useAIAgentController` (`src/hooks/useAIAgentController.ts`):

1.  **Decision Gating (Client):** A single `useFrame` checks each agent against `DECISION_MAKING_INTERVAL_MS` (500 ms). A per-agent in-flight lock (`decisionProcessingLock`) prevents a new request from starting while the previous one for that agent is still outstanding.

2.  **Visual Data Capture (Client):** The agent's offscreen `PerspectiveCamera` is positioned at its eye, the scene is rendered into a `320×200` `WebGLRenderTarget`, and the pixels are read back, vertically flipped, and converted to a PNG data URL.

3.  **Request to Backend (Client -> Server):**

    - The client calls the `requestAiDecision` server action (`src/app/actions/aiControllerActions.ts`) with the agent ID, the captured image data URL, and the last 10 chat messages.
    - `requestAiDecision` delegates to `generateAiActionAndChat` (`src/app/actions/generateMessage.ts`) and returns just the `action` to the client.

4.  **LLM Processing (Server):**

    - `generateAiActionAndChat` builds a system prompt (a "newly-awakened, disoriented" persona) and calls the Google Generative AI vision model (`gemini-1.5-flash-latest`) with `responseMimeType: "application/json"`, the agent's current image, and the chat history.
    - The model is instructed to return a JSON object containing:
      - `chatMessage` (optional): A brief text message for the agent to say.
      - `action`: One of `{ "type": "move", "direction": "forward" | "backward", "distance": number }`, `{ "type": "turn", "direction": "left" | "right", "degrees": number }`, or `{ "type": "none" }`.
    - The response text has any code fences stripped and is validated against `AIResponseSchema` (`src/domain/aiAction.ts`); `turn` degrees are clamped to 1–45. Invalid responses are discarded and the action defaults to `none`.

5.  **Chat Broadcast (Server via SSE):** If the validated response includes a `chatMessage`, the server constructs a `Message` and posts it to `/api/events`, which broadcasts it to all connected clients over SSE so it appears in the shared chat UI.

6.  **Server-Side Pause:** Before returning, `generateAiActionAndChat` awaits a fixed `setTimeout(5000)`. This pause, combined with the per-agent in-flight lock on the client, is what paces each agent to roughly one action every ~5 seconds.

7.  **Apply Action (Client):** When `requestAiDecision` resolves, the client applies the action to the agent's eye in the 3D world — `move` translates along the forward vector by `distance × 10`; `turn` rotates the look-at about the Y axis by `degrees`. The agent's new position is reported back to the server over SSE as an `eyeUpdate`.

## Pacing

- **Server-side pause:** The `setTimeout(5000)` in `generateAiActionAndChat` is the dominant pacing mechanism, spacing out an agent's actions and chat.
- **In-flight lock:** `useAIAgentController` keeps a per-agent lock so it never issues a new decision request while one is still in flight, preventing overlapping requests and rapid cycling.

## Audio

The action loop does not drive audio playback. The `Message` schema carries an optional `audioSrc`, but the client never reads it. Spoken audio is handled independently by `ChatMessage.tsx` (`src/components/ChatMessage.tsx`), which calls the `synthesizeSpeechAction` Text-to-Speech server action (`src/app/actions/tts.ts`) for each incoming message it displays (skipping the user's own messages and `/`-commands) and plays the returned audio. See [ARCHITECTURE.md](../ARCHITECTURE.md) for the two audio paths.

## Notes

- Fetching the most recent chat history (`getMessages.slice(-10)`) just before each request gives the model up-to-date conversational context.
- The image captured for the live HUD thumbnail and the image sent for a decision are produced by the same render path; only the decision path forwards the image to the model.

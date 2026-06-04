# Real-time Camera Movement and Orientation

See [ARCHITECTURE.md](../ARCHITECTURE.md) for the system overview.

## Overview

This document outlines the real-time camera movement and orientation driven by keyboard controls. Changes in camera position and orientation (yaw) are broadcast to other connected clients, enabling a shared interactive experience. There is no mouse-look.

## Implementation Details

### 1. Keyboard Input Handling

- **Component:** `src/app/components/Scene.tsx`
- **Hook:** `useKeyboardControls` (defined locally in `Scene.tsx`)
- `useKeyboardControls` tracks the state of pressed keys.
- The `useFrame` hook within the `CanvasContent` component updates the camera based on key state each frame.

### 2. Camera Control Logic

- **Component:** `src/app/components/Scene.tsx` (`CanvasContent`)
- **Look (Yaw Rotation):**
  - `A` / `ArrowLeft`: Rotates the camera view to the left (increases `camera.rotation.y`).
  - `D` / `ArrowRight`: Rotates the camera view to the right (decreases `camera.rotation.y`).
  - Rotation is controlled by `rotationSpeedFactor` and smoothed with `rotationDampingFactor`.
  - The camera does not pitch (look up/down); rotation is yaw-only and `camera.rotation.x`/`.z` are held at `0`.
- **Movement:**
  - `W` / `ArrowUp`: Moves forward along the current facing direction.
  - `S` / `ArrowDown`: Moves backward from the current facing direction.
  - `Q` / `E`: Strafe right / left.
  - Movement speed is controlled by `moveSpeed`, with `acceleration` lerping toward the target velocity and `dampingFactor` decaying it when no key is pressed.
- The camera's Y position is locked to `EYE_Y_POSITION` (`-11.9`, from `src/domain/sceneConstants.ts`), so the camera stays level with the eyes.
- There is no `PointerLockControls` / mouse-look.

### 3. Position Broadcasting

- **Hook:** `src/hooks/useEyePositionReporting.ts`
- This hook periodically (every `LOCAL_INTERVAL_MS`, 100 ms) checks the camera's current position and look-at vector.
- If the rounded position or look-at vector has changed since the last sent update, or if `FORCE_POSITION_UPDATE_INTERVAL_MS` (20 s) has elapsed, an `eyeUpdate` event is created.
- The event payload includes:
  - `type: "eyeUpdate"`
  - `id`: The user's unique identifier.
  - `name`: The user's display name.
  - `p`: The camera's rounded 3D position `[x, y, z]` (if changed or forced).
  - `l`: The camera's rounded 3D look-at point `[x, y, z]` (if changed or forced).
  - `t`: Timestamp of the event.
- The event is sent to the `/api/events` endpoint using `navigator.sendBeacon()` for reliable background transmission.

### 4. Server-Side Event Handling

- **Handler:** The `EventHub` Durable Object (`src/server/eventHub.ts`), reached via `/api/events` (routed there by `worker.ts`).
- The DO's `POST` handler validates the body against `EventSchema` and, for the `eyeUpdate` variant, against `ValidatedEyeUpdatePayloadSchema`.
- If valid, the `setEye` function is called.
- `setEye` merges the incoming fields over the DO's in-memory record of the user's eye, then calls `broadcast`.
- `broadcast` writes the complete `eyeUpdate` message to every subscribed client over Server-Sent Events (SSE).

### 5. Client-Side Event Reception and Rendering

- **Store:** `src/stores/eventStore.ts` (`useEventStore`)
  - Manages the SSE connection (opened via `useEventSource`).
  - Receives messages, parses them with `EventSchema`.
  - For `eyeUpdate` events, it writes the raw record into `useRawEyeEventStore`.
- **Hook:** `src/hooks/useEventSource.ts`
  - Triggers the `eventStore` connection and registers chat/box listeners.
- **Store:** `src/stores/rawEyeEventStore.ts` (`useRawEyeEventStore`)
  - Stores the raw per-id eye records (`p`, `l`, `t`) straight off SSE.
- **Hook:** `src/hooks/useEyesDataSynchronizer.ts`
  - Reads `useRawEyeEventStore` and maps each raw record into the animated `eyesStore` for rendering.
- **Component:** `src/app/components/Eyes.tsx`
  - Reads the animated eyes from `eyesStore` and renders each eye in the 3D scene at its latest position and orientation.

## Key Files Involved

- `src/app/components/Scene.tsx`: Handles keyboard input and camera updates.
- `src/hooks/useEyePositionReporting.ts`: Sends local camera changes to the server.
- `src/domain/event.ts`: Defines the Zod schema for the `eyeUpdate` event.
- `src/server/eventHub.ts`: The `EventHub` Durable Object — receives events, holds the eye/box state, and broadcasts over SSE.
- `worker.ts`: Routes `/api/events` to the Durable Object.
- `src/stores/eventStore.ts`: Client-side SSE handling and event dispatching.
- `src/hooks/useEventSource.ts`: Opens the SSE connection and registers listeners.
- `src/hooks/useEyesDataSynchronizer.ts`: Maps raw eye records into the rendered eyes store.
- `src/stores/rawEyeEventStore.ts`: Client-side storage of raw eye event data.
- `src/app/components/Eyes.tsx`: Renders the eyes of all users and agents.

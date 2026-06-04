# Server-Sent Events (SSE) and State Synchronization

See [ARCHITECTURE.md](../ARCHITECTURE.md) for the system overview.

This document outlines the Server-Sent Events (SSE) mechanism used for real-time communication between the server and clients, focusing on how entity states like "eyes" (user avatars/views) and "boxes" (interactive cubes) are managed and synchronized.

## Overview

The core of the real-time communication is handled by the API endpoint `/api/events`. Clients establish a persistent connection to this endpoint to receive updates.

- **SSE Connection**: Clients connect via a `GET` request.
- **Event Broadcasting**: The server broadcasts events to all connected clients.
- **State Management**: Server-side state for entities is managed in `src/app/api/events/sseStore.ts`.

All cross-client state (`eyes`, `boxes`, `subs`) lives in plain in-memory module globals in `sseStore.ts`. There is no shared store, database, or pub/sub, and nothing is persisted: a broadcast only reaches clients connected to the same server process, and all state is lost on restart. The app is therefore correct only when pinned to a single instance, and scaling horizontally would require a shared backing store first.

## Event Types

Several event types are pushed to clients:

- `eyeUpdate`: Indicates a change in an eye's position (`p`) or look-at point (`l`).
- `box`: Indicates the current state (position `p`, orientation `o`, color `c`) of a box. This event is sent for initial state and for subsequent updates.
- `chatMessage`: Transmits chat messages between users.
- `aiVision`: Accepted by `EventSchema` but has **no `POST` handler** in `route.ts` — it is a dead path. The human-camera capture posted from `Scene.tsx` is validated and then discarded. The live AI vision path is the `requestAiDecision` server action, not this event.

## Box State Synchronization (Cubes)

Interactive cubes, referred to as "boxes" in the codebase, are a key part of the shared environment.

### Initialization (`sseStore.ts`)

- When the server starts (specifically, when `sseStore.ts` is loaded), a predefined number of boxes (configured by `NUMBER_OF_BOXES` in environment variables) are initialized by the `initializeBoxes` function.
- Each box is assigned:
  - A unique ID (e.g., `box_1`, `box_2`).
  - An initial position (`p`).
  - A default orientation (`o` - typically `[0,0,0]`).
  - A **persistent color** (`c`) from a predefined list (`BOX_COLORS`). The color is assigned cyclically from this list. This ensures all users see the same color for the same box.
  - A timestamp (`t`).
- This initial set of boxes (with their IDs, positions, orientations, and colors) is stored in a server-side map.

### Client Subscription (`sseStore.ts`)

- When a new client connects to `/api/events`:
  1.  The `subscribe` function is called.
  2.  The server immediately sends the current state of all initialized eyes and all initialized boxes to the new client. This ensures the client's world is populated with the current state.
  3.  The box data sent includes `id`, `p`, `o`, `c`, and `t`.

### Box Updates (`route.ts` and `sseStore.ts`)

- When a client interacts with a box (e.g., moves it), the client sends a `POST` request to `/api/events` with a payload of type `boxUpdate`.
- The `boxUpdate` payload should contain:
  - `id`: The ID of the box being updated.
  - `p`: The new position (optional, if only orientation changed).
  - `o`: The new orientation (optional, if only position changed).
- The server's `POST` handler in `src/app/api/events/route.ts`:
  1.  Validates the `boxUpdate` payload using `ValidatedBoxUpdatePayloadSchema`.
  2.  Calls the `setBox(id, p, o)` function in `sseStore.ts`.
- The `setBox` function in `sseStore.ts`:
  1.  Retrieves the existing state of the box, including its **color (`c`)** which was set during initialization.
  2.  Updates the box's position (`p`) and/or orientation (`o`) with the new values.
  3.  Preserves the existing color (`c`).
  4.  Updates the timestamp (`t`).
  5.  Constructs a `BoxEventType` message (which has `type: "box"`) containing the full updated state (`id`, `p`, `o`, `c`, `t`).
  6.  Broadcasts this `BoxEventType` message to **all connected clients**.

### Client-Side Handling

- Clients should listen for SSE messages with `type: "box"`.
- Upon receiving a "box" event:
  - If it's for a new box ID, create the box.
  - Update the box's position, orientation, and **color** based on the received `p`, `o`, and `c` fields.
- This ensures that all clients render the boxes with the server-authoritative colors and that position/orientation changes are synchronized.
- **Visual Enhancements**: For advanced visual styles, such as glowing edges on boxes (e.g., for a cyberpunk aesthetic), client-side rendering techniques (shaders, edge geometry, post-processing like bloom) would be required. The server provides the core state (position, orientation, base color).

## Eye State Synchronization (Avatars/Views)

- Similar to boxes, eye states (representing user or AI agent views) are managed.
- `eyeUpdate` events carry `id`, `p` (position), `l` (look-at point), and `t` (timestamp).
- Initial eye states (including AI agents) are sent to new subscribers.
- Updates are broadcast when an eye's position or look-at point changes via the `setEye` function in `sseStore.ts`.
- `purgeStale` (run every 10 s) drops any eye that has been idle for more than 30 s.

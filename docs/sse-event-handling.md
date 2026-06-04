# Server-Sent Events (SSE) and State Synchronization

See [ARCHITECTURE.md](../ARCHITECTURE.md) for the system overview.

This document outlines the Server-Sent Events (SSE) mechanism used for real-time communication between the server and clients, focusing on how entity states like "eyes" (user avatars/views) and "boxes" (interactive cubes) are managed and synchronized.

## Overview

The core of the real-time communication is handled by the `/api/events` endpoint, which is served by the `EventHub` Durable Object (`src/server/eventHub.ts`). [`worker.ts`](../worker.ts) routes `/api/events` straight to the one DO stub (`idFromName("global")`) and delegates everything else to the Next.js app. Clients establish a persistent connection to this endpoint to receive updates.

- **SSE Connection**: Clients connect via a `GET /api/events?id=<clientId>` request.
- **Event Broadcasting**: The DO broadcasts events to all connected clients.
- **State Management**: All shared state lives in the single `EventHub` Durable Object.

The DO holds `eyes`, `boxes`, and `subs` in plain in-memory instance fields — there is no Redis, database, or pub/sub, and none is needed: the Durable Object **is** the shared-state primitive. The Worker always resolves it by the same name (`idFromName("global")`), so there is exactly one instance and a broadcast reaches every subscriber on it. State is ephemeral (it lives only while the DO is active, not persisted). To run multiple independent worlds, shard by DO name (one `idFromName(world)` per world) rather than adding a separate backing store.

## Event Types

Several event types are pushed to clients:

- `eyeUpdate`: A change in an eye's position (`p`) or look-at point (`l`). Both directions.
- `box`: The current state (position `p`, orientation `o`, color `c`) of a box. Sent for initial state and subsequent updates (server → client).
- `chatMessage`: Transmits chat messages between users. Both directions.
- `boxUpdate`: A client's pose change for a box (`id`, optional `p`/`o`); drives `setBox` (client → server).
- `host`: Designates the current simulation host — the one client that drives the AI agents and the cube physics. The DO elects the oldest connected subscriber and re-broadcasts on change (server → client).

## Box State Synchronization (Cubes)

Interactive cubes, referred to as "boxes" in the codebase, are a key part of the shared environment.

### Initialization (`eventHub.ts`)

- The boxes are created once, the first time a client connects, by the DO's box-initialization logic. The count comes from `NUMBER_OF_BOXES` (`wrangler.jsonc` `vars`).
- Each box is assigned:
  - A unique ID (e.g., `box_1`, `box_2`).
  - An initial position (`p`), laid out along the X axis (`[i * 15 - (N - 1) * 7.5, 5, -20]`).
  - A default orientation (`o` - typically `[0,0,0]`).
  - A **persistent color** (`c`) cycled from a fixed 12-entry palette. This ensures all users see the same color for the same box.
  - A timestamp (`t`).
- This initial set of boxes (with their IDs, positions, orientations, and colors) is stored in the DO's in-memory `boxes` map.

### Client Subscription (`eventHub.ts`)

- When a new client connects to `/api/events?id=<clientId>`, the DO's `fetch` handler:
  1.  Initializes the boxes once and seeds the configured AI agents' eye positions.
  2.  Registers the SSE writer as a subscriber keyed by `clientId` and (re-)elects the host.
  3.  Immediately replays the current eyes, boxes, and current host to the new client, so its world is populated with the current state. The box data sent includes `id`, `p`, `o`, `c`, and `t`.

### Box Updates (`eventHub.ts`)

- When the host moves a box, it sends a `POST` request to `/api/events` with a payload of type `boxUpdate`.
- The `boxUpdate` payload should contain:
  - `id`: The ID of the box being updated.
  - `p`: The new position (optional, if only orientation changed).
  - `o`: The new orientation (optional, if only position changed).
- The DO's `POST` handler:
  1.  Validates the body against `EventSchema` (the `boxUpdate` variant is `ValidatedBoxUpdatePayloadSchema`).
  2.  Calls `setBox(id, p, o)`.
- The `setBox` function:
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

The physics that produces these poses runs on the **host** only: there each box is a `dynamic` rigid body that transmits its pose as `boxUpdate` events; on every other client the same box is a `kinematicPosition` body that follows the broadcast `box` events (lerped by `boxStore`). See [`physics.md`](physics.md).

## Eye State Synchronization (Avatars/Views)

- Similar to boxes, eye states (representing user or AI agent views) are managed.
- `eyeUpdate` events carry `id`, `p` (position), `l` (look-at point), and `t` (timestamp).
- Initial eye states (including AI agents) are sent to new subscribers.
- Updates are broadcast when an eye's position or look-at point changes via the `setEye` function in the DO.
- A self-rescheduling DO `alarm` (every 10 s) runs `purgeStale`, dropping any eye idle for more than 30 s.

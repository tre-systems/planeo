# Chat Functionality

This document outlines the implementation of the chat feature in Planeo.

See [ARCHITECTURE.md](../ARCHITECTURE.md) for the system overview.

## Overview

The chat feature displays text messages from the human user and AI agents in real-time within the application. It consists of a chat window that lists these messages and an input field for sending messages. By default, the chat window is hidden and can be toggled using a subtle button in the bottom-right corner of the screen.

## Components

- **`Message` (Domain Model):** Defined in `src/domain/message.ts` using a Zod schema (`MessageSchema`). It includes `id` (uuid), `userId`, optional `name`, `text` (minimum length 1), `timestamp`, and optional `audioSrc` fields.
- **`useCommunicationStore` (Zustand Store):** Located in `src/stores/communicationStore.ts`. It manages:
  - An array of `Message` objects (chat messages) and an `addMessage` action to append new messages.
  - The visibility state of the chat window (`isChatVisible`) and a `toggleChatVisibility` action.
  - The chat input focus state (`isChatInputFocused`) and a `setChatInputFocused` action.
- **`ChatMessage` (React Component):** Found in `src/components/ChatMessage.tsx`. Displays an individual chat message, showing the sender display name (`message.name`, the agent's display name for AI agent IDs, otherwise the `userId`) and the message text.
- **`ChatWindow` (React Component):** Located in `src/components/ChatWindow.tsx`. Renders the list of chat messages and a `ChatInput`. When the user sends a message, it adds the message locally via `addMessage` and broadcasts it through the event store's `sendChatMessage`.
- **`ChatToggleButton` (React Component):** Found in `src/app/components/ChatToggleButton.tsx`. A small, fixed button that allows the user to show or hide the `ChatWindow`.

## Integration

The `ChatWindow` component is integrated into the main application page (`src/app/page.tsx`). Its visibility is controlled by the `ChatToggleButton` and the `useCommunicationStore`. The `useAiChat` hook, responsible for fetching and displaying AI agent messages, is also initialized on the main page to ensure it operates independently of the chat window's visibility.

## Simulation Start

To ensure browser audio policies are respected (allowing AI agent speech to play), the main 3D simulation requires a user interaction to start. A `StartOverlay` component is displayed initially, and the user must click it to begin the experience. This is managed by the `useSimulationStore`.

## Future Enhancements

- More sophisticated UI/UX for the chat window and toggle button.
- User-specific notification indicators for new messages when the chat is hidden.

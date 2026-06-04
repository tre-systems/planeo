# AI Agent Vision System

This document details the implementation of the AI agent vision system in Planeo, focusing on how AI agents perceive and display their environment. See [ARCHITECTURE.md](../ARCHITECTURE.md) for the system overview.

## Overview

AI agents in Planeo have their own virtual cameras within the 3D scene. These cameras are used to capture images of their surroundings, providing them with visual input for decision-making and displaying their perspective to the user.

## View Rendering and Updates

- **Capture Mechanism**: The `useAIAgentController` hook (`src/hooks/useAIAgentController.ts`) is responsible for managing AI agents' vision.

  - Each AI agent has a dedicated `PerspectiveCamera` and a `WebGLRenderTarget`.
  - The visual representation (what the AI "sees") is updated frequently, controlled by `VISUAL_UPDATE_INTERVAL_MS` (100 milliseconds, aiming for ~10 FPS). This involves rendering the scene from the AI's perspective and updating the displayed image.
  - The AI's decision-making process, which includes calling an LLM, is gated by `DECISION_MAKING_INTERVAL_MS` (500 milliseconds) plus a per-agent in-flight lock, so a new decision is only started once the previous one for that agent has returned. The effective pacing of roughly one action every ~5 seconds per agent comes from a fixed `setTimeout(5000)` pause that the `generateAiActionAndChat` server action awaits before returning (`src/app/actions/generateMessage.ts`), not from the interval constant. This keeps visual updates fast and fluid while spacing out LLM calls.
  - The rendered image for both visual updates and decision-making is converted to a data URL (PNG format).

- **State Management**: The generated image data URL for each AI agent (from the frequent visual updates) is stored in a Zustand store (`useAIVisionStore` in `src/stores/aiVisionStore.ts`) using the `setAIAgentView` action.

- **Display Component**:
  - The `AIAgentViews` component (`src/app/components/AIAgentViews.tsx`) subscribes to the `useAIVisionStore`.
  - When the image data URL for an agent updates in the store, this component re-renders, displaying the new image in the top-left and top-right corners of the screen.
  - The images are displayed at a resolution of 160x100 pixels, scaled down from the capture resolution of 320x200 pixels.

## Real-time Experience

The `VISUAL_UPDATE_INTERVAL_MS` in `useAIAgentController.ts` dictates the frequency of the displayed view updates, providing a near real-time feed. Decision-making runs on a separate, much slower cadence (the `DECISION_MAKING_INTERVAL_MS` check, the per-agent in-flight lock, and the server-side `setTimeout(5000)` pause), processing the visual information along with chat history to make decisions and perform actions. This separation ensures responsive visuals without overloading the AI decision-making services.

This ensures that the views displayed are an accurate representation of what each AI agent's virtual camera is capturing from the scene, updated frequently.

## Future Considerations

- **Performance**: Very frequent updates (e.g., 30-60 FPS) could impact performance, especially with multiple AI agents. The current interval is a balance between real-time feel and resource usage.

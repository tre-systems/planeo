# Text-to-Speech (TTS) Functionality

This document outlines the Text-to-Speech (TTS) feature implemented in the application, enabling chat messages to be spoken aloud.

See [ARCHITECTURE.md](../ARCHITECTURE.md) for the system overview.

## Overview

The TTS system uses Google Cloud Text-to-Speech to give each user in the chat a distinct and consistent Chirp3-HD voice. When a new chat message is rendered, if it's not from the current user and not a command message (starting with `/`), the system synthesizes the message text into speech and plays it.

A separate `generateAudio` stub in `src/lib/audioService.ts` returns a static test clip and is unused/vestigial (see [BACKLOG.md](./BACKLOG.md)); it is not part of this path.

## Technical Implementation

### Server-Side (Action)

- **Action Location**: `src/app/actions/tts.ts`
- **Function**: `synthesizeSpeechAction`
  - **Input**: `text` (string), `userId` (string), `voiceName` (optional string).
  - **Output**: `audioBase64` (base64 MP3 string) or an `error` object.
  - When `NEXT_PUBLIC_TTS_ENABLED` is exactly `"false"`, the action short-circuits and returns a disabled result instead of synthesizing.
- **Voice Assignment**:
  - A predefined list of Google Cloud Chirp3-HD voices is used (see `chirp3Voices` in `tts.ts`).
  - If `voiceName` is not provided in the parameters, a voice is deterministically assigned to a `userId` by hashing the `userId`. This ensures that each user consistently has the same voice.
  - The language code is derived from the selected voice name (e.g., `en-US`, `en-GB`).
- **Authentication**: The Google Cloud Text-to-Speech client is initialized in `tts.ts` (`initializeTTSClientInternal`), which validates and parses the service-account JSON from the `GOOGLE_APP_CREDS_JSON` environment variable. The client is created once and cached for reuse.

### Client-Side (React Components)

- **Chat Message Component**: `src/components/ChatMessage.tsx`

  - This component renders individual chat messages and receives the `currentUserId` as a prop.
  - **TTS Trigger**: A `useEffect` hook runs when the message renders. If TTS is enabled and the message is not from the current user and does not start with `/`, it calls `synthesizeSpeechAction` with the message text and the sender's `userId`.
  - **Audio Playback**: The `audioBase64` data returned from the action is used to create an `HTMLAudioElement` (`new Audio("data:audio/mp3;base64," + audioBase64)`), which is then played automatically.

- **Chat Window Component**: `src/components/ChatWindow.tsx`
  - Passes the `myId` (current user's ID) prop to each `ChatMessage` instance as `currentUserId`.

### Environment Variables

- `GOOGLE_APP_CREDS_JSON`: **Required**. A JSON string containing the Google Cloud service account credentials necessary for the Text-to-Speech API. This should be set in your `.env.local` or server environment.
- `NEXT_PUBLIC_TTS_ENABLED`: **Optional**. Set to `"false"` to disable Text-to-Speech functionality across the application. If not set, or set to any other value (e.g., `"true"`), TTS will be enabled by default. This is useful for disabling TTS during development, testing (e.g., end-to-end tests), or if a user wishes to globally turn off the feature via environment configuration.

## Error Handling

- `synthesizeSpeechAction` returns error objects for issues like invalid parameters or TTS synthesis failures.
- The `ChatMessage` component logs these errors to the console rather than rendering UI feedback.
- Audio playback errors on the client side are also caught and logged.

## Future Enhancements (Potential)

- User preference to disable TTS (via UI, complementing the environment variable for global control).
- User preference for voice selection.
- More sophisticated rate limiting and queueing if API limits become an issue.
- Admin panel to manage available voices.

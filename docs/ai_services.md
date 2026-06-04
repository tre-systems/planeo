# AI Services Integration

This document outlines the AI services used in Planeo, focusing on Google GenAI for agent behavior. See [ARCHITECTURE.md](../ARCHITECTURE.md) for the system overview.

## AI Agent Behavior (Google GenAI)

AI agents in Planeo use Google's Generative AI models, accessed through the `@google/genai` client in `src/lib/googleAI.ts`. Two models back the agents:

- **Vision/action:** `gemini-1.5-flash-latest` — drives the vision-and-action loop.
- **Text chat:** `gemini-2.0-flash-lite` — generates text-only chat replies.

The vision/action process involves:

1.  **Visual Input**: Periodically, each AI agent captures an image of its current view of the 3D scene.
2.  **Chat History**: The recent chat history is provided as context.
3.  **System Prompt**: A system prompt guides the AI's persona and lists its available actions.
4.  **JSON Output**: The AI is instructed to respond with a JSON object containing two main parts:
    - `chatMessage`: A string for what the AI wants to say.
    - `action`: An object defining the AI's next physical action.

### AI Actions

AI agents can perform the following actions:

- **Move**: `{ "type": "move", "direction": "forward" | "backward", "distance": number }`
- **Turn**: `{ "type": "turn", "direction": "left" | "right", "degrees": number }`
- **None**: `{ "type": "none" }` (no physical action)

### Prompt Engineering

The system prompt (defined in `src/app/actions/generateMessage.ts`) shapes the AI's behavior. It establishes:

- A "newly-awakened, disoriented" persona with no prior memories, trying to make sense of its surroundings.
- A directive to actively explore — turning to scan the area and moving toward things of interest.
- A directive to briefly mention any recognized artwork shown on a cube (e.g. a famous painting), including a small piece of history about it.
- A brief, conversational communication style, encouraging the agent to talk to other entities and make plans together.
- The required JSON output format and example actions.

Generation uses `temperature: 0.4`, `maxOutputTokens: 150`, and `responseMimeType: "application/json"`; safety settings are left empty.

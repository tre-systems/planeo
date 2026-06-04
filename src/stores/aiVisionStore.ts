import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

interface AIVisionState {
  aiAgentViews: Record<string, string | undefined>; // imageDataUrl per agentId
  setAIAgentView: (agentId: string, imageDataUrl: string) => void;
}

export const useAIVisionStore = create<AIVisionState>()(
  immer((set) => ({
    aiAgentViews: {},
    setAIAgentView: (agentId, imageDataUrl) =>
      set((state) => {
        state.aiAgentViews[agentId] = imageDataUrl;
      }),
  })),
);

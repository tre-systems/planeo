import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import type { Message } from "@/domain/message";

// Chat state: the shared message log plus the two UI flags. isChatInputFocused
// gates the camera's WASD handling in Scene so typing doesn't move the player.
interface CommunicationStore {
  messages: Message[];
  isChatVisible: boolean;
  isChatInputFocused: boolean;
  addMessage: (message: Message) => void;
  toggleChatVisibility: () => void;
  setChatInputFocused: (isFocused: boolean) => void;
}

export const useCommunicationStore = create<CommunicationStore>()(
  immer((set) => ({
    messages: [],
    isChatVisible: false,
    isChatInputFocused: false,

    addMessage: (message) =>
      set((state) => {
        state.messages.push(message);
      }),
    toggleChatVisibility: () =>
      set((state) => {
        state.isChatVisible = !state.isChatVisible;
      }),
    setChatInputFocused: (isFocused) =>
      set((state) => {
        state.isChatInputFocused = isFocused;
      }),
  })),
);

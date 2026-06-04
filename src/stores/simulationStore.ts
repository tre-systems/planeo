import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

interface SimulationState {
  isStarted: boolean;
  setIsStarted: (isStarted: boolean) => void;
}

export const useSimulationStore = create<SimulationState>()(
  immer((set) => ({
    isStarted: false,
    setIsStarted: (isStarted) =>
      set((state) => {
        state.isStarted = isStarted;
      }),
  })),
);

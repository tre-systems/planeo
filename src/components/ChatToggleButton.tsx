import { useShallow } from "zustand/react/shallow";

import { useCommunicationStore } from "@/stores/communicationStore";

export const ChatToggleButton = () => {
  const { isChatVisible, toggleChatVisibility } = useCommunicationStore(
    useShallow((s) => ({
      isChatVisible: s.isChatVisible,
      toggleChatVisibility: s.toggleChatVisibility,
    })),
  );

  return (
    <button
      onClick={toggleChatVisibility}
      style={{
        position: "fixed",
        bottom: "20px",
        right: "20px",
        background: "rgba(0, 0, 0, 0.3)",
        color: "white",
        border: "1px solid rgba(255, 255, 255, 0.2)",
        borderRadius: "50%",
        width: "40px",
        height: "40px",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        cursor: "pointer",
        zIndex: 1001,
        fontSize: "1.2em",
        boxShadow: "0px 0px 10px rgba(0,0,0,0.5)",
      }}
      title={isChatVisible ? "Hide Chat" : "Show Chat"}
    >
      {isChatVisible ? "✕" : "💬"}
    </button>
  );
};

import { nanoid } from "nanoid";
import { useRef } from "react";

import { ChatToggleButton } from "@/components/ChatToggleButton";
import { ChatWindow } from "@/components/ChatWindow";
import Scene from "@/components/Scene";
import { useAiChat } from "@/hooks/useAiChat";
import { useEyesDataSynchronizer } from "@/hooks/useEyesDataSynchronizer";
import { useCommunicationStore } from "@/stores/communicationStore";

const HomePage = () => {
  const myId = useRef(nanoid(6)).current;
  const isChatVisible = useCommunicationStore((state) => state.isChatVisible);

  useAiChat(myId);
  useEyesDataSynchronizer(myId);

  return (
    <>
      <main style={{ width: "100%", height: "100vh" }}>
        <Scene myId={myId} />
      </main>
      <ChatToggleButton />
      {/* Hidden via display:none rather than unmounting: ChatWindow stays
          mounted so ChatMessage's TTS effects keep firing while the chat is
          hidden. */}
      <div
        style={{
          position: "fixed",
          right: "10px",
          top: "10px",
          height: "calc(100vh - 20px)",
          width: "300px",
          zIndex: 1000,
          borderRadius: "8px",
          boxShadow: "0 4px 8px rgba(0,0,0,0.2)",
          display: isChatVisible ? "block" : "none",
        }}
      >
        <ChatWindow myId={myId} />
      </div>
    </>
  );
};

export default HomePage;

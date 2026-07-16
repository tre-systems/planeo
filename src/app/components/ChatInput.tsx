"use client";

import React, { useState } from "react";

import { useCommunicationStore } from "@/stores/communicationStore";

interface ChatInputProps {
  onSendMessage: (message: string) => void;
}

export const ChatInput = ({ onSendMessage }: ChatInputProps) => {
  const [message, setMessage] = useState("");
  const setChatInputFocused = useCommunicationStore(
    (s) => s.setChatInputFocused,
  );

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setMessage(event.target.value);
  };

  const handleSend = () => {
    if (message.trim()) {
      onSendMessage(message.trim());
      setMessage("");
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      style={{ display: "flex", padding: "10px", borderTop: "1px solid #444" }}
    >
      <input
        type="text"
        value={message}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        // The focus flag gates the camera's WASD handling in Scene.
        onFocus={() => setChatInputFocused(true)}
        onBlur={() => setChatInputFocused(false)}
        placeholder="Type a message..."
        style={{
          flexGrow: 1,
          padding: "8px",
          marginRight: "8px",
          borderRadius: "4px",
          border: "1px solid #555",
          backgroundColor: "#333",
          color: "#e0e0e0",
        }}
      />
      <button
        onClick={handleSend}
        style={{
          padding: "8px 15px",
          borderRadius: "4px",
          border: "none",
          backgroundColor: "#007bff",
          color: "white",
          cursor: "pointer",
        }}
      >
        Send
      </button>
    </div>
  );
};

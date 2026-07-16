"use client";

import { useEffect, useRef } from "react";

import { generateAiChatMessage } from "@/app/actions/generateMessage";
import { getAIAgents, isAIAgentId } from "@/domain/aiAgent";
import { log } from "@/lib/log";
import { worldWriteToken } from "@/lib/worldAuth";
import { useCommunicationStore } from "@/stores/communicationStore";

export const useAiChat = (myId: string) => {
  const messages = useCommunicationStore((s) => s.messages);
  const aiResponseInProgress = useRef(false);

  useEffect(() => {
    const agents = getAIAgents();
    if (agents.length === 0) return; // no agents configured
    const respondingAgentId = agents[0].id;

    if (messages.length === 0 || aiResponseInProgress.current) {
      return;
    }

    const lastMessage = messages[messages.length - 1];

    // Never respond to an AI's own or another AI's message.
    if (isAIAgentId(lastMessage.userId)) {
      return;
    }

    // Only trigger if the last message was from the human user (myId)
    if (lastMessage.userId !== myId) {
      return;
    }

    aiResponseInProgress.current = true;

    const timerId = setTimeout(
      async () => {
        log.debug("ai.chat", "Triggering AI response", {
          agentId: respondingAgentId,
        });
        try {
          const currentChatHistory = [...messages];
          await generateAiChatMessage(
            currentChatHistory,
            respondingAgentId,
            worldWriteToken(),
          );
        } catch (error) {
          log.error("ai.chat", "Error getting AI response", {
            error: String(error),
          });
        } finally {
          aiResponseInProgress.current = false;
        }
      },
      1500 + Math.random() * 1000,
    );

    return () => {
      clearTimeout(timerId);
    };
  }, [messages, myId]);
};

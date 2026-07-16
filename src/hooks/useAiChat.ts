import { useEffect, useRef } from "react";

import { getAIAgents, isAIAgentId } from "@/domain/aiAgent";
import { generateAiChatMessage } from "@/lib/aiClient";
import { log } from "@/lib/log";
import { worldWriteToken } from "@/lib/worldAuth";
import { useCommunicationStore } from "@/stores/communicationStore";

// Schedules an AI reply shortly after this user sends a chat message. The
// pending reply is keyed to the human message id: AI messages arriving in the
// meantime (the vision loop chats every few seconds) must not cancel it —
// only a newer human message supersedes it.
export const useAiChat = (myId: string) => {
  const messages = useCommunicationStore((s) => s.messages);
  const aiResponseInProgress = useRef(false);
  const scheduledForMessageId = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The timer callback reads the latest history through this ref, so a reply
  // includes messages that arrived after it was scheduled.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    const agents = getAIAgents();
    if (agents.length === 0) return; // no agents configured
    const respondingAgentId = agents[0].id;

    if (messages.length === 0) return;

    const lastMessage = messages[messages.length - 1];

    // Only my own (human) messages trigger a reply.
    if (isAIAgentId(lastMessage.userId) || lastMessage.userId !== myId) {
      return;
    }

    // Already scheduled for this exact message (an unrelated re-render).
    if (scheduledForMessageId.current === lastMessage.id) return;

    // A newer human message supersedes any pending reply.
    if (timerRef.current) clearTimeout(timerRef.current);
    scheduledForMessageId.current = lastMessage.id;

    timerRef.current = setTimeout(
      async () => {
        timerRef.current = null;
        scheduledForMessageId.current = null;
        // Skip if a reply request is already in flight; its response will
        // land in the shared chat either way.
        if (aiResponseInProgress.current) return;
        aiResponseInProgress.current = true;
        log.debug("ai.chat", "Triggering AI response", {
          agentId: respondingAgentId,
        });
        try {
          const result = await generateAiChatMessage(
            messagesRef.current.slice(-10),
            respondingAgentId,
            worldWriteToken(),
          );
          if (!result.ok) {
            log.warn("ai.chat", "AI reply refused/failed", {
              reason: result.reason,
            });
          }
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
  }, [messages, myId]);

  // Cancel any pending reply only on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);
};

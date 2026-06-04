"use client";
import { useEffect } from "react";

import { type BoxEventType } from "@/domain";
import { useBoxStore } from "@/stores/boxStore";
import { useCommunicationStore } from "@/stores/communicationStore";
import { useEventStore } from "@/stores/eventStore";

import type { ChatMessageEventType } from "@/domain/event";

export const useEventSource = (myId: string) => {
  const connectToEventSource = useEventStore((s) => s.connect);
  const disconnectFromEventSource = useEventStore((s) => s.disconnect);
  const subscribeToChatMessageEvents = useEventStore(
    (s) => s.subscribeChatMessageEvents,
  );
  const subscribeToBoxEvents = useEventStore((s) => s.subscribeBoxEvents);

  const addMessage = useCommunicationStore((s) => s.addMessage);
  const handleBoxEventFromStore = useBoxStore((s) => s.handleBoxEvent);

  useEffect(() => {
    // connect() is idempotent; close the connection on unmount. The id lets the
    // DO identify this client for host election.
    connectToEventSource(myId);
    return () => disconnectFromEventSource();
  }, [connectToEventSource, disconnectFromEventSource, myId]);

  useEffect(() => {
    const handleChatMessageEvent = (event: ChatMessageEventType) => {
      if (event.userId === myId) return; // ignore our own echoed messages
      addMessage(event);
    };

    const unsubscribeChat = subscribeToChatMessageEvents(
      handleChatMessageEvent,
    );
    return () => unsubscribeChat();
  }, [subscribeToChatMessageEvents, addMessage, myId]);

  useEffect(() => {
    const handleBoxEvent = (event: BoxEventType) => {
      handleBoxEventFromStore(event);
    };

    const unsubscribeBox = subscribeToBoxEvents(handleBoxEvent);
    return () => unsubscribeBox();
  }, [subscribeToBoxEvents, handleBoxEventFromStore]);
};

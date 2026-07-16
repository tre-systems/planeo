"use client";
import { useEffect } from "react";

import { useEventStore } from "@/stores/eventStore";

// Owns the SSE connection lifecycle. Inbound events fan out directly to the
// owning stores inside eventStore._handleMessage; nothing to wire up here.
export const useEventSource = (myId: string) => {
  const connectToEventSource = useEventStore((s) => s.connect);
  const disconnectFromEventSource = useEventStore((s) => s.disconnect);

  useEffect(() => {
    // connect() is idempotent; close the connection on unmount. The id lets
    // the DO identify this client for host election.
    connectToEventSource(myId);
    return () => disconnectFromEventSource();
  }, [connectToEventSource, disconnectFromEventSource, myId]);
};

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import {
  BoxUpdatePayloadSchema,
  type ValidatedBoxUpdatePayloadType,
} from "@/domain/box";
import {
  EventSchema,
  ChatMessageEventType,
  ChatMessageEventSchema,
} from "@/domain/event";
import { postWorldEventChecked } from "@/lib/eventEgress";
import { exposeStoreForDebug } from "@/lib/exposeStore";
import { log } from "@/lib/log";
import { throttle } from "@/lib/utils";

import { useBoxStore } from "./boxStore";
import { useCommunicationStore } from "./communicationStore";
import { useRawEyeEventStore } from "./rawEyeEventStore";

// Delay before rebuilding a CLOSED EventSource (one that gave up retrying).
const RECONNECT_DELAY_MS = 3000;
// The id used for the current connection: reconnects reuse it, and inbound
// chat is filtered against it so our own echoed messages aren't re-added.
let lastClientId: string | undefined;

interface EventStoreState {
  isConnected: boolean;
  lastError: string | null;
  hostId: string | null;
  eventSourceInstance: EventSource | null;
}

interface EventStoreActions {
  connect: (myId: string) => void;
  disconnect: () => void;
  sendBoxUpdate: (boxUpdate: ValidatedBoxUpdatePayloadType) => Promise<void>;
  sendChatMessage: (message: ChatMessageEventType) => Promise<void>;
  _handleMessage: (event: MessageEvent) => void;
  _handleError: (event: Event) => void;
}

export const useEventStore = create<EventStoreState & EventStoreActions>()(
  immer((set, get) => {
    const sendBoxUpdateNow = async (
      boxUpdate: ValidatedBoxUpdatePayloadType,
    ): Promise<void> => {
      if (!get().isConnected) {
        log.warn("sse", "Box update skipped: not connected");
        return;
      }

      const parsedPayload = BoxUpdatePayloadSchema.safeParse(boxUpdate);
      if (!parsedPayload.success) {
        log.error("sse", "Invalid box update payload before sending", {
          details: parsedPayload.error.flatten(),
        });
        set({ lastError: "Invalid box update payload formation" });
        return;
      }

      await postWorldEventChecked(parsedPayload.data, {
        kind: "box update",
        onError: (lastError) => set({ lastError }),
      });
    };

    // One throttle per box id. A single shared throttle would let box B's
    // update cancel box A's pending trailing send, leaving A's final rest
    // pose permanently untransmitted (viewers see it hovering mid-motion).
    const throttledBoxSenders = new Map<
      string,
      (u: ValidatedBoxUpdatePayloadType) => Promise<void | undefined>
    >();
    const throttledSendForBox = (id: string) => {
      let sender = throttledBoxSenders.get(id);
      if (!sender) {
        sender = throttle(sendBoxUpdateNow, 300);
        throttledBoxSenders.set(id, sender);
      }
      return sender;
    };

    return {
      isConnected: false,
      lastError: null,
      hostId: null,
      eventSourceInstance: null,

      connect: (myId: string) => {
        if (get().eventSourceInstance || get().isConnected) return;
        lastClientId = myId;
        const es = new EventSource(
          `/api/events?id=${encodeURIComponent(myId)}`,
        );
        set({ eventSourceInstance: es, isConnected: false, lastError: null });

        es.onopen = () => {
          set({ isConnected: true, lastError: null });
        };
        es.onmessage = (event: MessageEvent) => get()._handleMessage(event);
        es.onerror = (event: Event) => get()._handleError(event);
      },

      disconnect: () => {
        const es = get().eventSourceInstance;
        if (es) {
          es.close();
          set({
            eventSourceInstance: null,
            isConnected: false,
            // A client that is no longer listening must not keep acting as
            // host (driving agents and box physics) off a stale election.
            hostId: null,
          });
        }
      },

      sendBoxUpdate: async (boxUpdate: ValidatedBoxUpdatePayloadType) => {
        useBoxStore.getState().optimisticallySetBoxState(boxUpdate);
        throttledSendForBox(boxUpdate.id)(boxUpdate);
      },

      sendChatMessage: async (message: ChatMessageEventType) => {
        if (!get().isConnected) {
          log.warn("sse", "Chat message skipped: not connected");
          return;
        }

        const parsedPayload = ChatMessageEventSchema.safeParse(message);
        if (!parsedPayload.success) {
          log.error("sse", "Invalid chat message payload before sending", {
            details: parsedPayload.error.flatten(),
          });
          set({ lastError: "Invalid chat message payload formation" });
          return;
        }

        await postWorldEventChecked(parsedPayload.data, {
          kind: "chat message",
          onError: (lastError) => set({ lastError }),
        });
      },

      // Direct fan-out: each event type goes straight to the store that owns
      // it. `data` is already narrowed by the discriminated union — no casts.
      _handleMessage: (event: MessageEvent) => {
        try {
          const parsedEvent = EventSchema.safeParse(JSON.parse(event.data));
          if (!parsedEvent.success) {
            log.error("sse", "Failed to parse event", {
              details: parsedEvent.error.flatten(),
            });
            set({ lastError: "Failed to parse event data" });
            return;
          }

          const data = parsedEvent.data;
          if (data.type === "eyeUpdate") {
            useRawEyeEventStore.getState().setEye(data);
          } else if (data.type === "chatMessage") {
            // Our own messages were added locally on send; skip the echo.
            if (data.userId !== lastClientId) {
              useCommunicationStore.getState().addMessage(data);
            }
          } else if (data.type === "box") {
            useBoxStore.getState().handleBoxEvent(data);
          } else if (data.type === "host") {
            set({ hostId: data.hostId });
          }
        } catch (error) {
          log.error("sse", "Error processing SSE message", {
            error: String(error),
          });
          set({ lastError: "Error processing SSE message" });
        }
      },

      _handleError: () => {
        log.error("sse", "EventSource connection error");
        // Keep the instance: EventSource reconnects by itself and onopen will
        // flip isConnected back. Only a CLOSED source is done for good — drop
        // it and retry with a fresh one. hostId is cleared either way so a
        // disconnected ex-host stops driving agents (and double-billing
        // Gemini) off a stale election; the stream replays the current host
        // on (re)connect.
        const es = get().eventSourceInstance;
        const closed = es?.readyState === EventSource.CLOSED;
        set((state) => {
          state.lastError = "EventSource connection error";
          state.isConnected = false;
          state.hostId = null;
          if (closed) state.eventSourceInstance = null;
        });
        if (closed && lastClientId) {
          const myId = lastClientId;
          setTimeout(() => get().connect(myId), RECONNECT_DELAY_MS);
        }
      },
    };
  }),
);

exposeStoreForDebug("__eventStore", useEventStore);

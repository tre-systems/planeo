"use client";

import { useEffect, useRef } from "react";

import { synthesizeSpeechAction } from "@/app/actions/tts";
import { senderDisplayName } from "@/domain/aiAgent";
import { log } from "@/lib/log";

import type { Message } from "@/domain/message";

interface ChatMessageProps {
  message: Message;
  currentUserId: string;
}

export const ChatMessage = ({ message, currentUserId }: ChatMessageProps) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const isMyMessage = message.userId === currentUserId;
  const ttsEnabled = process.env["NEXT_PUBLIC_TTS_ENABLED"] !== "false"; // Defaults to true if not set or not 'false'

  useEffect(() => {
    if (!ttsEnabled || isMyMessage || message.text.startsWith("/")) {
      return;
    }

    let isMounted = true;

    const playAudio = async () => {
      if (!isMounted) return;

      try {
        const result = await synthesizeSpeechAction({
          text: message.text,
          userId: message.userId,
        });

        if (!isMounted) return;

        if (!result.ok) {
          log.warn("chat-tts", "Synthesis refused/failed", {
            reason: result.reason,
          });
        } else {
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.src = "";
          }
          const newAudio = new Audio(
            "data:audio/mp3;base64," + result.value.audioBase64,
          );
          audioRef.current = newAudio;

          newAudio.onended = () => {
            if (isMounted && audioRef.current) {
              audioRef.current.src = "";
              audioRef.current = null;
            }
          };

          newAudio.onerror = (e) => {
            if (isMounted) {
              log.warn("chat-tts", "Audio playback error event", {
                event: String(e),
                mediaError: String(audioRef.current?.error),
              });
            }
          };

          try {
            await newAudio.play();
          } catch (playError) {
            // play() commonly rejects when the browser blocks autoplay.
            if (isMounted) {
              log.warn("chat-tts", "Audio play() promise rejected", {
                error: String(playError),
              });
            }
          }
        }
      } catch (e) {
        if (isMounted) {
          log.error("chat-tts", "Failed to synthesize speech", {
            error: String(e),
          });
        }
      }
    };

    // ttsEnabled and !isMyMessage are already guaranteed by the early return above.
    if (message.id) {
      playAudio();
    }

    return () => {
      isMounted = false;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.onended = null;
        audioRef.current.onerror = null;
        audioRef.current.src = "";
        audioRef.current = null;
      }
    };
  }, [
    message.id,
    message.text,
    message.userId,
    isMyMessage,
    currentUserId,
    ttsEnabled,
  ]);

  return (
    <div style={{ marginBottom: "5px", color: "#e0e0e0" }}>
      <span style={{ fontWeight: "bold", color: "#88c0f0" }}>
        {senderDisplayName(message)}:{" "}
      </span>
      <span>{message.text}</span>
    </div>
  );
};

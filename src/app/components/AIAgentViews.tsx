"use client";

import Image from "next/image";
import React from "react";

import { getAIAgents } from "@/domain/aiAgent";
import { useAIVisionStore } from "@/stores/aiVisionStore";

const MAX_AI_VIEWS = 2;

export const AIAgentViews = () => {
  const aiAgentViews = useAIVisionStore((state) => state.aiAgentViews);
  const agents = getAIAgents().slice(0, MAX_AI_VIEWS);

  if (agents.length === 0) {
    return null;
  }

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: "fixed",
      top: "10px",
      left: "10px",
      right: "10px",
      display: "flex",
      zIndex: 1000,
      pointerEvents: "none", // let clicks fall through to the canvas behind
    },
    viewWrapper: {
      position: "fixed",
      top: "10px",
      width: "160px", // half of CAPTURE_WIDTH (320)
      height: "100px", // half of CAPTURE_HEIGHT (200)
      border: "1px solid lime",
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      padding: "0px",
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "flex-start",
    },
    imageContainer: {
      width: "100%",
      height: "calc(100% - 15px)", // leave room for the name label below
      position: "relative", // required for next/image fill
    },
    image: {
      objectFit: "contain",
    },
    text: {
      color: "white",
      fontSize: "10px",
      textAlign: "center",
      marginTop: "2px",
      width: "100%",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    loadingText: {
      color: "white",
      fontSize: "10px",
      textAlign: "center",
    },
  };

  return (
    <div style={styles["container"]}>
      {agents.map((agent, index) => {
        const imageDataUrl = aiAgentViews[agent.id];
        const displayName = agent.displayName || agent.id;

        // Determine position based on index
        const positionStyle: React.CSSProperties = {};
        if (index === 0) {
          positionStyle.left = "10px";
        } else if (index === 1) {
          positionStyle.right = "10px";
        } else {
          return null; // Should not happen with slice(0, MAX_AI_VIEWS)
        }

        return (
          <div
            key={agent.id}
            style={{ ...styles["viewWrapper"], ...positionStyle }}
          >
            <div style={styles["imageContainer"]}>
              {imageDataUrl ? (
                <Image
                  src={imageDataUrl}
                  alt={`View from ${displayName}`}
                  style={styles["image"]}
                  fill
                  priority
                />
              ) : (
                <p style={styles["loadingText"]}>
                  {`${displayName} view loading...`}
                </p>
              )}
            </div>
            <p style={styles["text"]}>{displayName}</p>
          </div>
        );
      })}
    </div>
  );
};

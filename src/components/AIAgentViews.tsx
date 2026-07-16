import React from "react";

import { getAIAgents } from "@/domain/aiAgent";
import {
  AGENT_VIEW_WIDTH,
  AGENT_VIEW_HEIGHT,
} from "@/domain/realtimeConstants";
import { useAIVisionStore } from "@/stores/aiVisionStore";

const MAX_AI_VIEWS = 2;

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: "fixed",
    top: "10px",
    left: "10px",
    right: "10px",
    zIndex: 1000,
    pointerEvents: "none", // let clicks fall through to the canvas behind
  },
  viewWrapper: {
    position: "fixed",
    top: "10px",
    width: `${AGENT_VIEW_WIDTH / 2}px`,
    height: `${AGENT_VIEW_HEIGHT / 2}px`,
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
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
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

export const AIAgentViews = () => {
  const aiAgentViews = useAIVisionStore((state) => state.aiAgentViews);
  const agents = getAIAgents().slice(0, MAX_AI_VIEWS);

  return (
    <div style={styles["container"]}>
      {agents.map((agent, index) => {
        const imageDataUrl = aiAgentViews[agent.id];
        const displayName = agent.displayName || agent.id;

        const positionStyle = [{ left: "10px" }, { right: "10px" }][index];

        return (
          <div
            key={agent.id}
            style={{ ...styles["viewWrapper"], ...positionStyle }}
          >
            <div style={styles["imageContainer"]}>
              {imageDataUrl ? (
                <img
                  src={imageDataUrl}
                  alt={`View from ${displayName}`}
                  style={styles["image"]}
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

export const StartOverlay = ({ onStart }: { onStart: () => void }) => {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        color: "white",
        fontSize: "2em",
        cursor: "pointer",
        zIndex: 1000,
      }}
      onClick={onStart}
    >
      Click to Start
    </div>
  );
};

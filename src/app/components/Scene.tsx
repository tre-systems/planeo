import { Grid } from "@react-three/drei";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { Physics } from "@react-three/rapier";
import { useRef, useEffect } from "react";
import { Vector3 } from "three";

import { EYE_Y_POSITION, GROUND_Y_POSITION } from "@/domain/sceneConstants";
import { useEventSource, useEyePositionReporting } from "@/hooks";
import { useAIAgentController } from "@/hooks/useAIAgentController";
import { useCommunicationStore } from "@/stores/communicationStore";
import { useSimulationStore } from "@/stores/simulationStore";
import { AIAgentViews } from "@components/AIAgentViews";
import { ServerDrivenBoxes } from "@components/Box";
import { Eyes } from "@components/Eyes";
import { StartOverlay } from "@components/StartOverlay";

// Basic keyboard state
const useKeyboardControls = () => {
  const keys = useRef<{ [key: string]: boolean }>({});
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) =>
      (keys.current[event.key.toLowerCase()] = true);
    const onKeyUp = (event: KeyboardEvent) =>
      (keys.current[event.key.toLowerCase()] = false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);
  return keys;
};

// Scratch vectors reused every frame by the movement loop.
const scratchDirection = new Vector3();
const scratchRight = new Vector3();
const WORLD_UP = new Vector3(0, 1, 0);

const CanvasContent = ({ myId, myName }: { myId: string; myName?: string }) => {
  const { camera } = useThree();
  useEyePositionReporting(myId, myName || myId, camera);
  useAIAgentController(myId);
  const keyboard = useKeyboardControls();
  const isChatInputFocused = useCommunicationStore((s) => s.isChatInputFocused);

  const targetVelocity = useRef(new Vector3());
  const currentVelocity = useRef(new Vector3());
  const targetRotation = useRef(0);
  const currentRotationSpeed = useRef(0);

  const moveSpeed = 12.0;
  const rotationSpeedFactor = 0.5;
  const acceleration = 0.05;
  const dampingFactor = 0.9;
  const rotationDampingFactor = 0.85;
  const stopThreshold = 0.005;

  useEffect(() => {
    camera.position.y = EYE_Y_POSITION;
    camera.rotation.set(0, camera.rotation.y, 0, "YXZ");
  }, [camera]);

  useFrame((_, delta) => {
    const direction = scratchDirection;
    camera.getWorldDirection(direction);
    direction.y = 0;
    direction.normalize();

    const right = scratchRight.crossVectors(WORLD_UP, direction).normalize();

    targetVelocity.current.set(0, 0, 0);
    targetRotation.current = 0;

    let didInput = false;

    if (!isChatInputFocused) {
      if (keyboard.current["w"] || keyboard.current["arrowup"]) {
        targetVelocity.current.addScaledVector(direction, moveSpeed);
        didInput = true;
      }
      if (keyboard.current["s"] || keyboard.current["arrowdown"]) {
        targetVelocity.current.addScaledVector(direction, -moveSpeed);
        didInput = true;
      }
      if (keyboard.current["q"]) {
        targetVelocity.current.addScaledVector(right, moveSpeed);
        didInput = true;
      }
      if (keyboard.current["e"]) {
        targetVelocity.current.addScaledVector(right, -moveSpeed);
        didInput = true;
      }

      if (keyboard.current["a"] || keyboard.current["arrowleft"]) {
        targetRotation.current += rotationSpeedFactor;
        didInput = true;
      }
      if (keyboard.current["d"] || keyboard.current["arrowright"]) {
        targetRotation.current -= rotationSpeedFactor;
        didInput = true;
      }
    }

    currentVelocity.current.lerp(targetVelocity.current, acceleration);

    if (!didInput) {
      currentVelocity.current.multiplyScalar(dampingFactor);
      if (currentVelocity.current.lengthSq() < stopThreshold * stopThreshold) {
        currentVelocity.current.set(0, 0, 0);
      }
    }

    currentRotationSpeed.current =
      currentRotationSpeed.current * (1 - rotationDampingFactor) +
      targetRotation.current * rotationDampingFactor;
    if (
      Math.abs(currentRotationSpeed.current) < stopThreshold &&
      targetRotation.current === 0
    ) {
      currentRotationSpeed.current = 0;
    }

    const clampedDelta = Math.min(delta, 0.1);

    if (currentVelocity.current.lengthSq() > 0) {
      camera.position.addScaledVector(currentVelocity.current, clampedDelta);
    }

    if (Math.abs(currentRotationSpeed.current) > 0) {
      camera.rotation.y += currentRotationSpeed.current * clampedDelta;
      camera.rotation.x = 0;
      camera.rotation.z = 0;
    }

    if (camera.position.y !== EYE_Y_POSITION) {
      camera.position.y = EYE_Y_POSITION;
    }
  });

  return (
    <>
      <EffectComposer>
        <Bloom
          luminanceThreshold={0.05}
          luminanceSmoothing={0.2}
          intensity={0.5}
        />
      </EffectComposer>
      <group>
        <ambientLight intensity={0.08} />
        <Eyes />
        <directionalLight
          position={[100, 100, 100]}
          intensity={6}
          color={"#fffbe6"}
          castShadow
          shadow-mapSize-width={8192}
          shadow-mapSize-height={8192}
          shadow-bias={-0.001}
          shadow-camera-near={1}
          shadow-camera-far={2000}
          shadow-camera-left={-1000}
          shadow-camera-right={1000}
          shadow-camera-top={1000}
          shadow-camera-bottom={-1000}
          target-position={[0, 0, 0]}
        />
      </group>
      <Grid
        position={[0, GROUND_Y_POSITION + 0.01, 0]}
        args={[1000, 1000]}
        cellSize={10}
        cellThickness={1}
        cellColor={"green"}
        sectionSize={100}
        sectionThickness={1.5}
        sectionColor={"green"}
        fadeDistance={2000}
        fadeStrength={1}
        followCamera={false}
        infiniteGrid
      />
    </>
  );
};

const Scene = ({ myId, myName }: { myId: string; myName?: string }) => {
  const isStarted = useSimulationStore((state) => state.isStarted);

  useEventSource(myId);

  if (!isStarted) {
    return <StartOverlay />;
  }

  return (
    <>
      <AIAgentViews />
      <Canvas
        gl={{ preserveDrawingBuffer: true }}
        camera={{ position: [48, 20, 120], near: 1, far: 2500, fov: 75 }}
        style={{ width: "100%", height: "100%" }}
        shadows
      >
        <color attach="background" args={["#000"]} />
        <Physics>
          <CanvasContent
            myId={myId}
            {...(myName !== undefined && { myName })}
          />
          <ServerDrivenBoxes myId={myId} />
        </Physics>
      </Canvas>
    </>
  );
};

export default Scene;

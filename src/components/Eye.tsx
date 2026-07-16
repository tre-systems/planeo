import { Text, Billboard } from "@react-three/drei";
import {
  RigidBody,
  BallCollider,
  type RapierRigidBody,
} from "@react-three/rapier";
import React from "react";

import { EYE_RADIUS } from "@/domain/sceneConstants";
import { ManagedEye } from "@/stores/eyesStore";

interface EyeProps {
  eye: ManagedEye;
  rigidBodyRef: React.RefObject<RapierRigidBody | null>;
}

export const Eye = ({ eye, rigidBodyRef }: EyeProps) => {
  return (
    <RigidBody
      ref={rigidBodyRef}
      colliders="ball"
      type="kinematicPosition"
      position={eye.position}
    >
      <BallCollider args={[EYE_RADIUS]} />
      {/* The fade-in scale lives on the visual mesh, not the kinematic
          RigidBody (which has no scale) or the collider (scaling it would
          change physics). It animates INITIAL_SCALE -> 1 and settles at 1. */}
      <group scale={eye.scale}>
        <mesh rotation={[0, Math.PI, 0]}>
          <sphereGeometry args={[EYE_RADIUS, 32, 32]} />
          <primitive object={eye.material} attach="material" />
        </mesh>
      </group>
      {eye.name && (
        <Billboard position={[0, EYE_RADIUS * 1.5, 0]}>
          <Text fontSize={1.5} color="white" anchorX="center" anchorY="middle">
            {eye.name}
          </Text>
        </Billboard>
      )}
    </RigidBody>
  );
};

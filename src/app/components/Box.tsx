"use client";

import { Box, useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import {
  CuboidCollider,
  RigidBody,
  type RapierRigidBody,
} from "@react-three/rapier";
import React, { useRef, useEffect, useCallback, useState } from "react";
import * as THREE from "three";

import { type Vec3 } from "@/domain";
import { type ValidatedBoxUpdatePayloadType } from "@/domain/box";
import { GROUND_Y_POSITION } from "@/domain/sceneConstants";
import { roundArray } from "@/lib/utils";

import { useBoxStore, type AnimatedBoxState } from "../../stores/boxStore";
import { useEventStore } from "../../stores/eventStore";

const POSITION_THRESHOLD = 0.1;
const ROTATION_THRESHOLD = 0.05;

// Predefined list of art image URLs from The Metropolitan Museum of Art Open Access
const artImageUrls = [
  "/art/image_1.jpg",
  "/art/image_2.jpg",
  "/art/image_3.jpg",
  "/art/image_4.jpg",
];

interface SyncedRigidBoxProps {
  box: AnimatedBoxState;
  isHost: boolean;
}

const SyncedRigidBox: React.FC<SyncedRigidBoxProps> = ({ box, isHost }) => {
  const rigidBodyRef = useRef<RapierRigidBody>(null);
  const lastTransmittedPRef = useRef<Vec3 | undefined>(undefined);
  const lastTransmittedORef = useRef<Vec3 | undefined>(undefined);
  const sendBoxUpdate = useEventStore((state) => state.sendBoxUpdate);

  const [stableArtUrl] = useState(() => {
    return artImageUrls[Math.floor(Math.random() * artImageUrls.length)];
  });

  const [stableMaterialAttachName] = useState(() => {
    const randomIndex = Math.floor(Math.random() * 6);
    return `material-${randomIndex}`;
  });

  useEffect(() => {
    lastTransmittedPRef.current = box.currentP.toArray();
    lastTransmittedORef.current = [
      box.currentO.x,
      box.currentO.y,
      box.currentO.z,
    ];
  }, [box.id, box.currentP, box.currentO.x, box.currentO.y, box.currentO.z]);

  const handleUpdate = useCallback(
    (rb: RapierRigidBody) => {
      const currentPositionVec3 = rb.translation();
      const currentRotationRapier = rb.rotation();

      const newRawP: Vec3 = [
        currentPositionVec3.x,
        currentPositionVec3.y,
        currentPositionVec3.z,
      ];
      const threeQuatFromRapier = new THREE.Quaternion(
        currentRotationRapier.x,
        currentRotationRapier.y,
        currentRotationRapier.z,
        currentRotationRapier.w,
      );
      const euler = new THREE.Euler().setFromQuaternion(
        threeQuatFromRapier,
        "XYZ",
      );
      const newRawO: Vec3 = [euler.x, euler.y, euler.z];

      const lastP = lastTransmittedPRef.current;
      const lastO = lastTransmittedORef.current;

      const positionChanged =
        !lastP ||
        new THREE.Vector3(...newRawP).distanceTo(new THREE.Vector3(...lastP)) >
          POSITION_THRESHOLD;

      const newQuatForComparison = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(...newRawO),
      );
      const lastQuatForComparison = lastO
        ? new THREE.Quaternion().setFromEuler(new THREE.Euler(...lastO))
        : new THREE.Quaternion();

      const rotationChanged =
        !lastO ||
        newQuatForComparison.angleTo(lastQuatForComparison) >
          ROTATION_THRESHOLD;

      if (positionChanged || rotationChanged) {
        const finalP = positionChanged
          ? (roundArray(newRawP) as Vec3)
          : undefined;
        const finalO = rotationChanged
          ? (roundArray(newRawO) as Vec3)
          : undefined;

        if (!finalP && !finalO) return;

        const updatePayload: ValidatedBoxUpdatePayloadType = {
          type: "boxUpdate",
          id: box.id,
        };
        if (finalP) updatePayload.p = finalP;
        if (finalO) updatePayload.o = finalO;

        sendBoxUpdate(updatePayload);

        if (rigidBodyRef.current) {
          if (finalP) {
            rigidBodyRef.current.setTranslation(
              { x: finalP[0], y: finalP[1], z: finalP[2] },
              true,
            );
          }
          if (finalO) {
            const q = new THREE.Quaternion().setFromEuler(
              new THREE.Euler(...finalO),
            );
            rigidBodyRef.current.setRotation(
              { x: q.x, y: q.y, z: q.z, w: q.w },
              true,
            );
          }
        }

        if (finalP) lastTransmittedPRef.current = newRawP;
        if (finalO) lastTransmittedORef.current = newRawO;
      }
    },
    [box.id, sendBoxUpdate],
  );

  useFrame(() => {
    const rb = rigidBodyRef.current;
    if (!rb) return;
    if (isHost) {
      // Host owns the physics sim; read the simulated pose and broadcast it.
      if (rb.isDynamic()) handleUpdate(rb);
    } else {
      // Viewer: the body is kinematic — follow the pose the host broadcast
      // (interpolated toward the target by updateBoxAnimations each frame).
      rb.setNextKinematicTranslation({
        x: box.currentP.x,
        y: box.currentP.y,
        z: box.currentP.z,
      });
      const q = new THREE.Quaternion().setFromEuler(box.currentO);
      rb.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    }
  });

  const texture = useTexture(stableArtUrl);

  const materials = Array.from({ length: 6 }, (_, i) => {
    const attachName = `material-${i}`;
    if (attachName === stableMaterialAttachName && texture) {
      return (
        <meshStandardMaterial
          key={attachName}
          attach={attachName}
          map={texture}
        />
      );
    }
    return (
      <meshStandardMaterial
        key={attachName}
        attach={attachName}
        color={new THREE.Color(box.c)}
      />
    );
  });

  return (
    <RigidBody
      ref={rigidBodyRef}
      position={box.currentP}
      rotation={box.currentO}
      colliders="cuboid"
      type={isHost ? "dynamic" : "kinematicPosition"}
    >
      <Box args={[15, 15, 15]}>
        {texture ? (
          <>{materials}</>
        ) : (
          <meshStandardMaterial color={new THREE.Color(box.c)} />
        )}
      </Box>
    </RigidBody>
  );
};

export const ServerDrivenBoxes = ({ myId }: { myId: string }) => {
  const boxesMap = useBoxStore(
    (state: { boxes: Map<string, AnimatedBoxState> }) => state.boxes,
  );
  const updateBoxAnimations = useBoxStore((state) => state.updateBoxAnimations);
  // Only the host simulates box physics; everyone else renders them kinematically.
  const isHost = useEventStore((s) => s.hostId) === myId;

  const serverBoxesArray: AnimatedBoxState[] = Array.from(boxesMap.values());

  useFrame((_, delta) => {
    updateBoxAnimations(delta);
  });

  return (
    <>
      {serverBoxesArray.map((boxState: AnimatedBoxState) => {
        // Key on the role so the RigidBody remounts (dynamic ↔ kinematic) when
        // the host changes.
        return (
          <SyncedRigidBox
            key={`${boxState.id}-${isHost ? "host" : "viewer"}`}
            box={boxState}
            isHost={isHost}
          />
        );
      })}
      <RigidBody type="fixed" colliders="cuboid">
        <CuboidCollider
          args={[1000, 0.1, 1000]}
          position={[0, GROUND_Y_POSITION - 0.05, 0]}
        />
      </RigidBody>
    </>
  );
};

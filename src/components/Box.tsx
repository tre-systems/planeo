import { Box, useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import {
  CuboidCollider,
  RigidBody,
  type RapierRigidBody,
} from "@react-three/rapier";
import { useRef, useEffect, useCallback, useState } from "react";
import * as THREE from "three";

import { type ValidatedBoxUpdatePayloadType } from "@/domain/box";
import { type Vec3 } from "@/domain/common";
import { GROUND_Y_POSITION } from "@/domain/sceneConstants";
import { roundArray } from "@/lib/utils";
import { useBoxStore, type AnimatedBoxState } from "@/stores/boxStore";
import { useEventStore } from "@/stores/eventStore";

const POSITION_THRESHOLD = 0.1;
const ROTATION_THRESHOLD = 0.05;

// Scratch objects reused by the host's per-frame pose check (synchronous
// loop, so sharing is safe) — handleUpdate runs for every box every frame.
const scratchNewPosition = new THREE.Vector3();
const scratchLastPosition = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();
const scratchNewQuaternion = new THREE.Quaternion();
const scratchLastQuaternion = new THREE.Quaternion();
const scratchEuler = new THREE.Euler();

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

const SyncedRigidBox = ({ box, isHost }: SyncedRigidBoxProps) => {
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

  // Baseline the send threshold once per box (mount / identity change) only.
  // Re-running on every pose change would overwrite the last *transmitted*
  // pose with the locally lerped echo, inflating deltas and causing redundant
  // sends; handleUpdate maintains the refs on every real send.
  useEffect(() => {
    lastTransmittedPRef.current = box.currentP.toArray();
    lastTransmittedORef.current = [
      box.currentO.x,
      box.currentO.y,
      box.currentO.z,
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box.id]);

  const handleUpdate = useCallback(
    (rb: RapierRigidBody) => {
      const currentPositionVec3 = rb.translation();
      const currentRotationRapier = rb.rotation();

      const newRawP: Vec3 = [
        currentPositionVec3.x,
        currentPositionVec3.y,
        currentPositionVec3.z,
      ];
      scratchQuaternion.set(
        currentRotationRapier.x,
        currentRotationRapier.y,
        currentRotationRapier.z,
        currentRotationRapier.w,
      );
      scratchEuler.setFromQuaternion(scratchQuaternion, "XYZ");
      const newRawO: Vec3 = [scratchEuler.x, scratchEuler.y, scratchEuler.z];

      const lastP = lastTransmittedPRef.current;
      const lastO = lastTransmittedORef.current;

      const positionChanged =
        !lastP ||
        scratchNewPosition
          .set(...newRawP)
          .distanceTo(scratchLastPosition.set(...lastP)) > POSITION_THRESHOLD;

      scratchNewQuaternion.setFromEuler(scratchEuler.set(...newRawO));
      if (lastO) {
        scratchLastQuaternion.setFromEuler(scratchEuler.set(...lastO));
      } else {
        scratchLastQuaternion.identity();
      }

      const rotationChanged =
        !lastO ||
        scratchNewQuaternion.angleTo(scratchLastQuaternion) >
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
            const q = scratchNewQuaternion.setFromEuler(
              scratchEuler.set(...finalO),
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
      const q = scratchQuaternion.setFromEuler(box.currentO);
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
  // Only the host simulates box physics; everyone else renders them
  // kinematically. Gated on isConnected so a stale election can't leave two
  // clients simulating at once.
  const isHost = useEventStore((s) => s.isConnected && s.hostId === myId);

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

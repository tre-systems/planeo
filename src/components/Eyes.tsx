import { useFrame } from "@react-three/fiber";
import { type RapierRigidBody } from "@react-three/rapier";
import React, { useRef, useEffect } from "react";
import { Vector3, Euler, Quaternion, Matrix4 } from "three";

import { EYE_Y_POSITION } from "@/domain/sceneConstants";
import { useEyesStore, ManagedEye } from "@/stores/eyesStore";

import { Eye } from "./Eye";

// Scratch objects reused across every eye every frame (the loop is
// synchronous, so sharing is safe) — avoids ~6 allocations per eye per frame.
const UP = new Vector3(0, 1, 0);
const IDENTITY_ROTATION = new Quaternion().setFromEuler(new Euler(0, 0, 0));
const scratchCurrentPosition = new Vector3();
const scratchTargetPosition = new Vector3();
const scratchEyePosition = new Vector3();
const scratchTargetRotation = new Quaternion();
const scratchCurrentRotation = new Quaternion();
const scratchMatrix = new Matrix4();

export const Eyes = () => {
  const refs = useRef<Record<string, React.RefObject<RapierRigidBody | null>>>(
    {},
  );

  const managedEyes = useEyesStore((s) => s.managedEyes);
  const updateEyeAnimations = useEyesStore((s) => s.updateEyeAnimations);

  useEffect(() => {
    const currentKeys = Object.keys(refs.current);
    const managedKeys = Object.keys(managedEyes);

    managedKeys.forEach((id) => {
      if (!refs.current[id]) {
        refs.current[id] = React.createRef<RapierRigidBody | null>();
      }
    });

    currentKeys.forEach((id) => {
      if (!managedEyes[id]) {
        delete refs.current[id];
      }
    });
  }, [managedEyes]);

  useFrame((_, delta) => {
    updateEyeAnimations(delta);

    for (const id in managedEyes) {
      const eyeData = managedEyes[id];
      const rigidBodyRef = refs.current[id];
      const rigidBody = rigidBodyRef?.current;

      if (!rigidBody) continue;

      const rbTranslation = rigidBody.translation();
      scratchCurrentPosition.set(
        rbTranslation.x,
        rbTranslation.y,
        rbTranslation.z,
      );
      scratchTargetPosition.set(
        eyeData.position.x,
        EYE_Y_POSITION,
        eyeData.position.z,
      );
      if (scratchCurrentPosition.distanceTo(scratchTargetPosition) > 0.001) {
        rigidBody.setNextKinematicTranslation(scratchTargetPosition);
      }

      if (eyeData.lookAt) {
        scratchEyePosition.set(
          rbTranslation.x,
          EYE_Y_POSITION,
          rbTranslation.z,
        );
        scratchMatrix.lookAt(scratchEyePosition, eyeData.lookAt, UP);
        scratchTargetRotation.setFromRotationMatrix(scratchMatrix);

        const currentRotationQuat = rigidBody.rotation();
        scratchCurrentRotation.set(
          currentRotationQuat.x,
          currentRotationQuat.y,
          currentRotationQuat.z,
          currentRotationQuat.w,
        );
        if (!scratchCurrentRotation.equals(scratchTargetRotation)) {
          rigidBody.setNextKinematicRotation(scratchTargetRotation);
        }
      } else {
        const currentRotationQuat = rigidBody.rotation();
        scratchCurrentRotation.set(
          currentRotationQuat.x,
          currentRotationQuat.y,
          currentRotationQuat.z,
          currentRotationQuat.w,
        );
        if (!scratchCurrentRotation.equals(IDENTITY_ROTATION)) {
          rigidBody.setNextKinematicRotation(IDENTITY_ROTATION);
        }
      }

      // Opacity is driven on the shader material, not the rigid body.
      if (eyeData.material.uniforms["uOpacity"].value !== eyeData.opacity) {
        eyeData.material.uniforms["uOpacity"].value = eyeData.opacity;
      }
      // The fade-in scale is applied to a mesh child inside Eye.
    }
  });

  return (
    <>
      {Object.values(managedEyes).map((eye: ManagedEye) => {
        const rigidBodyRef = refs.current[eye.id];
        // Render can run before the ref-creating effect; skip this frame's eye.
        if (!rigidBodyRef) return null;

        return <Eye key={eye.id} eye={eye} rigidBodyRef={rigidBodyRef} />;
      })}
    </>
  );
};

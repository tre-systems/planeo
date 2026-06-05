"use client";
import { useFrame } from "@react-three/fiber";
import { type RapierRigidBody } from "@react-three/rapier";
import React, { useRef, useEffect } from "react";
import { Vector3, Euler, Quaternion, Matrix4 } from "three";

import { EYE_Y_POSITION } from "@/domain/sceneConstants";
import { useEyesStore, ManagedEye } from "@/stores/eyesStore";

import { Eye } from "./Eye";

export const Eyes = () => {
  const refs = useRef<Record<string, React.RefObject<RapierRigidBody | null>>>(
    {},
  );

  const managedEyes = useEyesStore((s) => s.managedEyes);
  const updateEyeAnimations = useEyesStore((s) => s.updateEyeAnimations);

  // Ensure refs are created for new eyes and cleaned up for removed eyes
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
      const currentPositionVec = new Vector3(
        rbTranslation.x,
        rbTranslation.y,
        rbTranslation.z,
      );
      const targetPosition = new Vector3(
        eyeData.position.x,
        EYE_Y_POSITION,
        eyeData.position.z,
      );
      if (currentPositionVec.distanceTo(targetPosition) > 0.001) {
        rigidBody.setNextKinematicTranslation(targetPosition);
      }

      if (eyeData.lookAt) {
        const targetRotation = new Quaternion();
        const tempLookAtPosition = new Vector3().copy(eyeData.lookAt);
        const eyePosition = new Vector3(
          rbTranslation.x,
          EYE_Y_POSITION,
          rbTranslation.z,
        );

        const m4 = new Matrix4();
        m4.lookAt(eyePosition, tempLookAtPosition, new Vector3(0, 1, 0));
        targetRotation.setFromRotationMatrix(m4);

        const currentRotationQuat = rigidBody.rotation();
        const currentRotation = new Quaternion(
          currentRotationQuat.x,
          currentRotationQuat.y,
          currentRotationQuat.z,
          currentRotationQuat.w,
        );
        if (!currentRotation.equals(targetRotation)) {
          rigidBody.setNextKinematicRotation(targetRotation);
        }
      } else {
        const fallbackRotation = new Quaternion().setFromEuler(
          new Euler(0, 0, 0),
        );
        const currentRotationQuat = rigidBody.rotation();
        const currentRotation = new Quaternion(
          currentRotationQuat.x,
          currentRotationQuat.y,
          currentRotationQuat.z,
          currentRotationQuat.w,
        );
        if (!currentRotation.equals(fallbackRotation)) {
          rigidBody.setNextKinematicRotation(fallbackRotation);
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
        // Ref creation is handled in useEffect
        const rigidBodyRef = refs.current[eye.id];
        // It's possible the ref might not be there yet if managedEyes updated
        // and this render happens before the useEffect for refs runs,
        // or if an eye is quickly added and removed.
        if (!rigidBodyRef) return null;

        return <Eye key={eye.id} eye={eye} rigidBodyRef={rigidBodyRef} />;
      })}
    </>
  );
};

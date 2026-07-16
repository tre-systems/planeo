"use client";

import { useEffect, useMemo, useState } from "react";
import { TextureLoader, ShaderMaterial, Texture } from "three";

import { EyeUpdateType } from "@/domain/event";
import {
  EYE_MAX_AGE_MS,
  EYE_PURGE_INTERVAL_MS,
} from "@/domain/realtimeConstants";
import { log } from "@/lib/log";
import { useEyesStore } from "@/stores/eyesStore";
import { useRawEyeEventStore } from "@/stores/rawEyeEventStore";

// Shader/texture for the eye material (cloned per eye in eyesStore.syncEyes).
const EYE_TEXTURE_PATH = "/eye.jpg";

const vertexShader = `
  precision mediump float;
  varying vec3 vNormal;
  void main() {
    vNormal = normal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  precision mediump float;
  uniform sampler2D tex;
  uniform float uOpacity;
  varying vec3 vNormal;
  void main() {
    vec2 uv = normalize(vNormal).xy * 0.5 + 0.5;
    vec3 color = texture2D(tex, uv).rgb;
    if (vNormal.z < -0.85) color = vec3(0.777, 0.74, 0.74); // iris
    gl_FragColor = vec4(color, uOpacity);
  }
`;

export const useEyesDataSynchronizer = (myId: string) => {
  const rawEyesData = useRawEyeEventStore((state) => state.eyes);
  const { syncEyes } = useEyesStore.getState();
  const [eyeTexture, setEyeTexture] = useState<Texture | null>(null);

  useEffect(() => {
    const intervalId = setInterval(() => {
      useRawEyeEventStore.getState().removeStaleEyes(EYE_MAX_AGE_MS);
    }, EYE_PURGE_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const loader = new TextureLoader();
    loader.load(
      EYE_TEXTURE_PATH,
      (texture) => {
        setEyeTexture(texture);
      },
      undefined,
      (error) => {
        log.error("eyes", "Failed to load eye texture", {
          error: String(error),
        });
      },
    );
  }, []);

  const baseShaderMaterial = useMemo(() => {
    if (!eyeTexture) return null;
    return new ShaderMaterial({
      uniforms: {
        tex: { value: eyeTexture },
        uOpacity: { value: 1.0 },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
    });
  }, [eyeTexture]);

  useEffect(() => {
    // Material not ready (eye texture still loading) — nothing to sync yet.
    if (!baseShaderMaterial) return;

    const transformedDataArray: EyeUpdateType[] = Object.entries(
      rawEyesData,
    ).map(([id, data]) => ({
      type: "eyeUpdate" as const,
      id,
      p: data.p,
      l: data.l,
      name: data.name,
      t: data.t,
    }));
    // Sync even when empty so eyesStore clears eyes as rawEyesData empties.
    syncEyes(transformedDataArray, myId, baseShaderMaterial);
  }, [rawEyesData, myId, baseShaderMaterial, syncEyes]);
};

import { LinearSRGBColorSpace } from "three";

import {
  AGENT_VIEW_WIDTH as CAPTURE_WIDTH,
  AGENT_VIEW_HEIGHT as CAPTURE_HEIGHT,
} from "@/domain/realtimeConstants";

import type { Camera, Scene, WebGLRenderer, WebGLRenderTarget } from "three";

// Captures run ~10×/s per agent on the host's frame loop, so the canvas and
// pixel buffer are allocated once and reused (captures are synchronous and
// single-threaded, so sharing is safe).
let scratchCanvas: HTMLCanvasElement | null = null;
let scratchPixels: Uint8Array | null = null;

const getScratchCanvas = (): HTMLCanvasElement => {
  if (!scratchCanvas) {
    scratchCanvas = document.createElement("canvas");
    scratchCanvas.width = CAPTURE_WIDTH;
    scratchCanvas.height = CAPTURE_HEIGHT;
  }
  return scratchCanvas;
};

const getScratchPixels = (): Uint8Array => {
  if (!scratchPixels) {
    scratchPixels = new Uint8Array(CAPTURE_WIDTH * CAPTURE_HEIGHT * 4);
  }
  return scratchPixels;
};

// Renders `scene` from `camera` into `renderTarget`, reads back the pixels,
// flips them vertically (WebGL's origin is bottom-left), draws them to a 2D
// canvas, and returns a JPEG data URL (5-10× smaller than PNG for a world
// render, and Gemini's image-token cost is per-tile so quality loss is free).
// Restores the renderer's render target and output color space before
// returning. Uses WebGL/DOM, so it is not unit testable. Returns null if a
// 2D canvas context is unavailable.
export const captureView = (
  gl: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  renderTarget: WebGLRenderTarget,
): string | null => {
  const originalRenderTarget = gl.getRenderTarget();
  const originalOutputColorSpace = gl.outputColorSpace;

  gl.setRenderTarget(renderTarget);
  gl.outputColorSpace = LinearSRGBColorSpace;
  gl.render(scene, camera);

  const captureCanvas = getScratchCanvas();
  const context = captureCanvas.getContext("2d");

  if (context) {
    const imageData = getScratchPixels();
    gl.readRenderTargetPixels(
      renderTarget,
      0,
      0,
      CAPTURE_WIDTH,
      CAPTURE_HEIGHT,
      imageData,
    );

    const bytesPerRow = CAPTURE_WIDTH * 4;
    const halfHeight = CAPTURE_HEIGHT / 2;
    for (let y = 0; y < halfHeight; ++y) {
      const topOffset = y * bytesPerRow;
      const bottomOffset = (CAPTURE_HEIGHT - y - 1) * bytesPerRow;
      for (let i = 0; i < bytesPerRow; ++i) {
        const temp = imageData[topOffset + i];
        imageData[topOffset + i] = imageData[bottomOffset + i];
        imageData[bottomOffset + i] = temp;
      }
    }
    const imgData = new ImageData(
      new Uint8ClampedArray(imageData.buffer),
      CAPTURE_WIDTH,
      CAPTURE_HEIGHT,
    );
    context.putImageData(imgData, 0, 0);
  }
  const imageDataUrl = captureCanvas.toDataURL("image/jpeg", 0.7);

  gl.setRenderTarget(originalRenderTarget);
  gl.outputColorSpace = originalOutputColorSpace;

  return imageDataUrl;
};

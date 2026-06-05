import { LinearSRGBColorSpace } from "three";

import type { Camera, Scene, WebGLRenderer, WebGLRenderTarget } from "three";

const CAPTURE_WIDTH = 320;
const CAPTURE_HEIGHT = 200;

// Renders `scene` from `camera` into `renderTarget`, reads back the pixels,
// flips them vertically (WebGL's origin is bottom-left), draws them to a 2D
// canvas, and returns a PNG data URL. Restores the renderer's render target
// and output color space before returning. Uses WebGL/DOM, so it is not unit
// testable. Returns null if a 2D canvas context is unavailable.
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

  const captureCanvas = document.createElement("canvas");
  captureCanvas.width = CAPTURE_WIDTH;
  captureCanvas.height = CAPTURE_HEIGHT;
  const context = captureCanvas.getContext("2d");

  if (context) {
    const imageData = new Uint8Array(CAPTURE_WIDTH * CAPTURE_HEIGHT * 4);
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
  const imageDataUrl = captureCanvas.toDataURL("image/png");

  gl.setRenderTarget(originalRenderTarget);
  gl.outputColorSpace = originalOutputColorSpace;

  return imageDataUrl;
};

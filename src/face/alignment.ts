// src/face/alignment.ts

/**
 * Align a face crop based on 5‑point landmarks (leftEye, rightEye, nose, mouthLeft, mouthRight).
 * Returns a Uint8Array containing the aligned 112×112 RGBA image.
 * Uses a similarity transform (scale + rotation + translation).
 */
export async function alignFace(
  rgbaData: Uint8Array,
  width: number,
  height: number,
  landmarks: { x: number; y: number }[]
): Promise<Uint8Array> {
  if (!landmarks || landmarks.length < 5) {
    throw new Error('Insufficient landmarks for alignment');
  }

  // Source eye positions
  const leftEye = landmarks[0];
  const rightEye = landmarks[1];

  // Desired canonical eye positions in the output 112x112 image
  const desiredLeft = { x: 38, y: 56 };
  const desiredRight = { x: 74, y: 56 };

  // Compute angle, scale, and translation
  const dx = rightEye.x - leftEye.x;
  const dy = rightEye.y - leftEye.y;
  const angle = Math.atan2(dy, dx);
  const srcDist = Math.hypot(dx, dy);
  const dstDist = desiredRight.x - desiredLeft.x;
  const scale = dstDist / srcDist;

  // Rotation matrix components (inverse rotation for mapping destination -> source)
  const sin = Math.sin(-angle);
  const cos = Math.cos(-angle);

  // Translation to align left eye after scaling and rotation
  const tx = desiredLeft.x - (leftEye.x * scale * cos - leftEye.y * scale * sin);
  const ty = desiredLeft.y - (leftEye.x * scale * sin + leftEye.y * scale * cos);

  const outSize = 112;
  const outData = new Uint8Array(outSize * outSize * 4);

  // Nearest‑neighbor sampling (fast). For higher quality replace with bilinear.
  for (let y = 0; y < outSize; y++) {
    for (let x = 0; x < outSize; x++) {
      const srcX = ((x - tx) * cos + (y - ty) * sin) / scale;
      const srcY = (-(x - tx) * sin + (y - ty) * cos) / scale;
      const srcXi = Math.round(srcX);
      const srcYi = Math.round(srcY);
      const outIdx = (y * outSize + x) * 4;
      if (srcXi >= 0 && srcXi < width && srcYi >= 0 && srcYi < height) {
        const srcIdx = (srcYi * width + srcXi) * 4;
        outData[outIdx] = rgbaData[srcIdx];
        outData[outIdx + 1] = rgbaData[srcIdx + 1];
        outData[outIdx + 2] = rgbaData[srcIdx + 2];
        outData[outIdx + 3] = rgbaData[srcIdx + 3];
      } else {
        // Fill missing area with transparent black
        outData[outIdx] = 0;
        outData[outIdx + 1] = 0;
        outData[outIdx + 2] = 0;
        outData[outIdx + 3] = 0;
      }
    }
  }
  return outData;
}

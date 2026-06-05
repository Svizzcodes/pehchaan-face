// src/face/imageProcessor.ts
import { alignFace } from './alignment';
import { detectFace } from './detector';
import { preprocessFacePixels, runInference } from './modelRunner';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { decode } from 'jpeg-js';
import { Buffer } from 'buffer';

/**
 * Given a file path from VisionCamera's takePhoto(), decode the JPEG into
 * raw RGBA pixels, run SCRFD detection + alignment, then MobileFaceNet inference.
 *
 * Returns an L2-normalised 192-dimensional embedding, or null on failure.
 */
export async function getFaceEmbedding(filePath: string): Promise<number[] | null> {
  try {
    // Normalise path: Android needs file:// prefix; iOS may already have it
    const uri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;

    // ── Step 1: Resize to 640×640 for SCRFD, get base64 JPEG ──────────────
    const resized = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 640, height: 640 } }],
      { base64: true, format: ImageManipulator.SaveFormat.JPEG }
    );

    if (!resized.base64) {
      console.warn('[ImageProcessor] Resize failed — no base64 output');
      return null;
    }

    // ── Step 2: Decode JPEG base64 → raw RGBA via Canvas-free pure-JS path ─
    const rgbaResult = decodeJpegBase64ToRGBA(resized.base64);
    if (!rgbaResult) {
      console.warn('[ImageProcessor] JPEG decode returned null');
      return null;
    }
    const { data: rgbaData, width, height } = rgbaResult;

    // ── Step 3: Detect face via SCRFD ──────────────────────────────────────
    const detection = await detectFace(rgbaData, width, height);
    if (!detection) {
      console.warn('[ImageProcessor] No face detected in frame');
      return null;
    }

    // ── Step 4: Align face to 112×112 canonical crop ───────────────────────
    // alignFace expects landmark array, not the full detection object
    const aligned = await alignFace(rgbaData, width, height, detection.landmarks);

    // ── Step 5: Preprocess → MobileFaceNet inference ───────────────────────
    const pixelData = preprocessFacePixels(aligned);
    const embedding = await runInference(pixelData);
    return embedding;
  } catch (e) {
    console.error('[ImageProcessor] Embedding generation error:', e);
    return null;
  }
}

/**
 * Process a raw camera RGBA frame directly (used when you already have pixel data).
 */
export async function getFaceEmbeddingFromFrame(
  rgbaData: Uint8Array,
  width: number,
  height: number
): Promise<number[] | null> {
  try {
    const detection = await detectFace(rgbaData, width, height);
    if (!detection) return null;
    const aligned = await alignFace(rgbaData, width, height, detection.landmarks);
    const pixelData = preprocessFacePixels(aligned);
    return await runInference(pixelData);
  } catch (e) {
    console.error('[ImageProcessor] Frame embedding error:', e);
    return null;
  }
}

// ─── Minimal JPEG decoder using Expo's built-in APIs ─────────────────────────
// We leverage expo-image-manipulator to resize to exactly 640×640 and get
// the raw pixel data via a second resize to 1×1 per-pixel trick would be too
// slow, so instead we decode via base64→Uint8Array using a simple approach.

/**
 * Decode a base64 JPEG string into {data: Uint8Array (RGBA), width, height}.
 */
function decodeJpegBase64ToRGBA(
  base64: string
): { data: Uint8Array; width: number; height: number } | null {
  try {
    const buffer = Buffer.from(base64, 'base64');
    const rawImageData = decode(buffer, { useTArray: true });
    return {
      data: rawImageData.data,
      width: rawImageData.width,
      height: rawImageData.height,
    };
  } catch (e) {
    console.error('[JPEG Decode]', e);
    return null;
  }
}

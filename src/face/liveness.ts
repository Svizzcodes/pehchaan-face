/**
 * Liveness Detection Module
 *
 * Uses a challenge-response approach:
 * - Blink detection (eye aspect ratio drops below threshold)
 * - Head turn detection (yaw angle changes significantly)
 * - Smile detection (mouth open ratio increases)
 *
 * All computed from VisionCamera's built-in face landmarks.
 * No extra ML model needed — runs entirely on device.
 */

export type LivenessChallenge = 'blink' | 'turn_left' | 'turn_right' | 'smile';

export interface LivenessState {
  challenge: LivenessChallenge;
  completed: boolean;
  progress: number; // 0–1
  instruction: string;
}

export interface FaceLandmarks {
  leftEyeOpenProbability?: number;
  rightEyeOpenProbability?: number;
  smilingProbability?: number;
  yawAngle?: number;
  rollAngle?: number;
  pitchAngle?: number;
}

// ─── Challenge Instructions ───────────────────────────────────────────────────

export const CHALLENGE_INSTRUCTIONS: Record<LivenessChallenge, string> = {
  blink: 'Please blink your eyes',
  turn_left: 'Turn your head slightly to the left',
  turn_right: 'Turn your head slightly to the right',
  smile: 'Please smile',
};

// ─── Random Challenge Picker ──────────────────────────────────────────────────

export function getRandomChallenge(): LivenessChallenge {
  const challenges: LivenessChallenge[] = ['blink', 'turn_left', 'turn_right', 'smile'];
  return challenges[Math.floor(Math.random() * challenges.length)];
}

// ─── Challenge Evaluators ─────────────────────────────────────────────────────

/**
 * Blink: both eyes must close (probability < 0.3) then reopen (> 0.7)
 */
export class BlinkDetector {
  private eyesClosed = false;
  private blinkCount = 0;

  update(landmarks: FaceLandmarks): boolean {
    const leftOpen = landmarks.leftEyeOpenProbability ?? 1;
    const rightOpen = landmarks.rightEyeOpenProbability ?? 1;
    const avgOpen = (leftOpen + rightOpen) / 2;

    if (!this.eyesClosed && avgOpen < 0.3) {
      this.eyesClosed = true;
    } else if (this.eyesClosed && avgOpen > 0.7) {
      this.eyesClosed = false;
      this.blinkCount++;
    }

    return this.blinkCount >= 1;
  }

  reset() {
    this.eyesClosed = false;
    this.blinkCount = 0;
  }
}

/**
 * Head turn: yaw angle must exceed ±20 degrees from baseline
 */
export class HeadTurnDetector {
  private baselineYaw: number | null = null;
  private direction: 'left' | 'right';

  constructor(direction: 'left' | 'right') {
    this.direction = direction;
  }

  update(landmarks: FaceLandmarks): boolean {
    const yaw = landmarks.yawAngle ?? 0;

    if (this.baselineYaw === null) {
      // Only set baseline when face is roughly centered
      if (Math.abs(yaw) < 10) {
        this.baselineYaw = yaw;
      }
      return false;
    }

    const delta = yaw - this.baselineYaw;

    if (this.direction === 'left') {
      return delta < -20; // negative yaw = left turn
    } else {
      return delta > 20; // positive yaw = right turn
    }
  }

  reset() {
    this.baselineYaw = null;
  }
}

/**
 * Smile: smiling probability must exceed 0.75
 */
export class SmileDetector {
  update(landmarks: FaceLandmarks): boolean {
    return (landmarks.smilingProbability ?? 0) > 0.75;
  }
}

// ─── Liveness Manager ─────────────────────────────────────────────────────────

export class LivenessManager {
  private challenge: LivenessChallenge;
  private blinkDetector = new BlinkDetector();
  private headTurnDetector: HeadTurnDetector;
  private smileDetector = new SmileDetector();
  private _completed = false;
  private frameCount = 0;
  private readonly MAX_FRAMES = 150; // ~5 seconds at 30fps

  constructor(challenge?: LivenessChallenge) {
    this.challenge = challenge ?? getRandomChallenge();
    this.headTurnDetector = new HeadTurnDetector(
      this.challenge === 'turn_left' ? 'left' : 'right'
    );
  }

  get currentChallenge(): LivenessChallenge {
    return this.challenge;
  }

  get instruction(): string {
    return CHALLENGE_INSTRUCTIONS[this.challenge];
  }

  get completed(): boolean {
    return this._completed;
  }

  get timedOut(): boolean {
    return this.frameCount >= this.MAX_FRAMES && !this._completed;
  }

  get progress(): number {
    return Math.min(1, this.frameCount / this.MAX_FRAMES);
  }

  /**
   * Feed a frame's face landmarks. Returns true when challenge is completed.
   */
  processFrame(landmarks: FaceLandmarks): boolean {
    if (this._completed) return true;
    this.frameCount++;

    let passed = false;

    switch (this.challenge) {
      case 'blink':
        passed = this.blinkDetector.update(landmarks);
        break;
      case 'turn_left':
      case 'turn_right':
        passed = this.headTurnDetector.update(landmarks);
        break;
      case 'smile':
        passed = this.smileDetector.update(landmarks);
        break;
    }

    if (passed) {
      this._completed = true;
    }

    return this._completed;
  }

  reset(newChallenge?: LivenessChallenge) {
    this.challenge = newChallenge ?? getRandomChallenge();
    this.headTurnDetector = new HeadTurnDetector(
      this.challenge === 'turn_left' ? 'left' : 'right'
    );
    this.blinkDetector.reset();
    this._completed = false;
    this.frameCount = 0;
  }
}

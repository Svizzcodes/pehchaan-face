/**
 * Cosine similarity between two embedding vectors.
 * Returns a value between -1 and 1. Higher = more similar.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

/**
 * Euclidean distance between two embedding vectors.
 * Lower = more similar.
 */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export interface MatchResult {
  matched: boolean;
  employee_id: string | null;
  name: string | null;
  confidence: number; // 0–1
}

export interface FaceCandidate {
  employee_id: string;
  name: string;
  embedding: number[];
}

/**
 * Calibrate raw cosine similarity score to human-readable confidence.
 * Maps similarity above threshold [threshold, 1.0] to [0.75, 1.0] (75% - 100%).
 * Maps similarity below threshold [0.0, threshold] to [0.0, 0.75).
 */
export function calculateConfidence(score: number, threshold = 0.65): number {
  if (score <= 0) return 0;
  if (score >= 1) return 1.0;
  if (score >= threshold) {
    return 0.75 + ((score - threshold) / (1.0 - threshold)) * 0.25;
  } else {
    return (score / threshold) * 0.75;
  }
}

/**
 * Find the best matching face from a list of enrolled faces.
 * Uses cosine similarity. Threshold: 0.65 (tuned for MobileFaceNet).
 */
export function findBestMatch(
  queryEmbedding: number[],
  candidates: FaceCandidate[],
  threshold = 0.65
): MatchResult {
  if (candidates.length === 0) {
    return { matched: false, employee_id: null, name: null, confidence: 0 };
  }

  let bestScore = -1;
  let bestCandidate: FaceCandidate | null = null;

  for (const candidate of candidates) {
    const score = cosineSimilarity(queryEmbedding, candidate.embedding);
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }

  const confidence = calculateConfidence(bestScore, threshold);

  if (bestScore >= threshold && bestCandidate) {
    return {
      matched: true,
      employee_id: bestCandidate.employee_id,
      name: bestCandidate.name,
      confidence,
    };
  }

  return { matched: false, employee_id: null, name: null, confidence };
}

/**
 * L2-normalize an embedding vector (required for MobileFaceNet output).
 */
export function l2Normalize(embedding: number[]): number[] {
  const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
  if (norm === 0) return embedding;
  return embedding.map((v) => v / norm);
}

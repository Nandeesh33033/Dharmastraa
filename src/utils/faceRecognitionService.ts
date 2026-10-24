/**
 * Production Deep Face Recognition & Identity Verification Service
 * Powered by @vladmandic/face-api with 128-dimensional deep metric embeddings.
 * Distinguishes different individuals with mathematical precision.
 */

import * as faceapi from '@vladmandic/face-api';

export type FaceModelLifecycleState = 
  | 'NOT_INITIALIZED' 
  | 'LOADING' 
  | 'READY' 
  | 'VERIFICATION_IN_PROGRESS' 
  | 'VERIFIED' 
  | 'VERIFICATION_FAILED' 
  | 'MODEL_ERROR';

let modelsLoaded = false;
let currentModelState: FaceModelLifecycleState = 'NOT_INITIALIZED';
let modelLoadingPromise: Promise<boolean> | null = null;

export function getModelStatus(): FaceModelLifecycleState {
  return currentModelState;
}

export function isModelReady(): boolean {
  return modelsLoaded && currentModelState !== 'MODEL_ERROR' && currentModelState !== 'NOT_INITIALIZED';
}

// Primary local static path (served by Vite from public/models)
const LOCAL_MODEL_PATH = '/models';
// Fallback CDN if local static files are not reachable
const CDN_MODEL_PATH = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';

/**
 * Initializes and loads deep face recognition neural networks:
 * 1. TinyFaceDetector / SSD MobileNet V1: Face localization & bounding box
 * 2. FaceLandmark68Net: 68-point 3D facial alignment & normalization
 * 3. FaceRecognitionNet: ResNet-34 deep feature extractor yielding 128D biometric vector
 */
export async function loadFaceRecognitionModels(): Promise<boolean> {
  if (modelsLoaded) {
    if (currentModelState === 'NOT_INITIALIZED' || currentModelState === 'LOADING') {
      currentModelState = 'READY';
    }
    return true;
  }
  if (modelLoadingPromise) return modelLoadingPromise;

  currentModelState = 'LOADING';

  modelLoadingPromise = (async () => {
    try {
      // First attempt: Load from local /models
      let loaded = false;
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(LOCAL_MODEL_PATH),
          faceapi.nets.faceLandmark68Net.loadFromUri(LOCAL_MODEL_PATH),
          faceapi.nets.faceRecognitionNet.loadFromUri(LOCAL_MODEL_PATH),
          faceapi.nets.ssdMobilenetv1.loadFromUri(LOCAL_MODEL_PATH)
        ]);
        loaded = true;
        console.log('[FaceRecognition] Deep models loaded successfully from local /models');
      } catch (localErr) {
        console.warn('[FaceRecognition] Local model load failed, trying CDN fallback:', localErr);
      }

      if (!loaded) {
        // Fallback: CDN
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(CDN_MODEL_PATH),
          faceapi.nets.faceLandmark68Net.loadFromUri(CDN_MODEL_PATH),
          faceapi.nets.faceRecognitionNet.loadFromUri(CDN_MODEL_PATH),
          faceapi.nets.ssdMobilenetv1.loadFromUri(CDN_MODEL_PATH)
        ]);
        console.log('[FaceRecognition] Deep models loaded successfully from CDN fallback');
      }

      // Warm-up inference on a dummy canvas to confirm the model has actually loaded and can perform inference
      try {
        const dummyCanvas = document.createElement('canvas');
        dummyCanvas.width = 64;
        dummyCanvas.height = 64;
        const ctx = dummyCanvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#101010';
          ctx.fillRect(0, 0, 64, 64);
          await faceapi.detectAllFaces(dummyCanvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 128 }));
        }
      } catch (warmupErr) {
        console.warn('[FaceRecognition] Warm-up inference notice (non-fatal):', warmupErr);
      }

      modelsLoaded = true;
      currentModelState = 'READY';
      return true;
    } catch (err) {
      console.error('[FaceRecognition] Failed to load face recognition models:', err);
      modelsLoaded = false;
      currentModelState = 'MODEL_ERROR';
      return false;
    } finally {
      modelLoadingPromise = null;
    }
  })();

  return modelLoadingPromise;
}

export interface FaceExtractionResult {
  faceCount: number;
  descriptor: number[] | null;
  box: { xMin: number; yMin: number; width: number; height: number } | null;
  score: number;
  error?: 'NO_FACE' | 'MULTIPLE_FACES' | 'LOW_CONFIDENCE' | 'EXTRACTION_FAILED' | null;
}

export interface FaceMatchResult {
  isMatch: boolean;
  distance: number;
  similarityScore: number; // 0 to 100
  confidenceText: string;
}

/**
 * Normalizes an image input for face-api processing
 */
function createOffscreenImage(imageSrc: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = imageSrc;
  });
}

/**
 * Detects faces and extracts 128D deep biometric embedding.
 * Strict rules:
 * - faceCount === 0: returns NO_FACE error
 * - faceCount > 1: returns MULTIPLE_FACES error
 * - faceCount === 1: extracts deep descriptor
 */
export async function extractFaceBiometrics(
  input: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement | string,
  options: { useFastTiny?: boolean; scoreThreshold?: number } = {}
): Promise<FaceExtractionResult> {
  const ready = await loadFaceRecognitionModels();
  if (!ready) {
    return {
      faceCount: 0,
      descriptor: null,
      box: null,
      score: 0,
      error: 'EXTRACTION_FAILED'
    };
  }

  let element: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement;

  if (typeof input === 'string') {
    const imgEl = await createOffscreenImage(input);
    if (!imgEl) {
      return { faceCount: 0, descriptor: null, box: null, score: 0, error: 'EXTRACTION_FAILED' };
    }
    element = imgEl;
  } else if (typeof HTMLVideoElement !== 'undefined' && input instanceof HTMLVideoElement) {
    if (input.readyState < 2 || input.videoWidth === 0 || input.videoHeight === 0) {
      return { faceCount: 0, descriptor: null, box: null, score: 0, error: 'NO_FACE' };
    }
    const offscreen = document.createElement('canvas');
    offscreen.width = input.videoWidth;
    offscreen.height = input.videoHeight;
    const ctx = offscreen.getContext('2d');
    if (ctx) {
      ctx.drawImage(input, 0, 0, input.videoWidth, input.videoHeight);
      element = offscreen;
    } else {
      element = input;
    }
  } else {
    element = input;
  }

  try {
    const minScore = options.scoreThreshold ?? 0.5;

    // Use SSD MobileNet for high precision on images / enrollment, or TinyFaceDetector for real-time video
    let detections: any[];
    if (options.useFastTiny) {
      const detectorOptions = new faceapi.TinyFaceDetectorOptions({
        inputSize: 224,
        scoreThreshold: minScore
      });
      detections = await faceapi
        .detectAllFaces(element, detectorOptions)
        .withFaceLandmarks()
        .withFaceDescriptors();
    } else {
      const detectorOptions = new faceapi.SsdMobilenetv1Options({
        minConfidence: minScore
      });
      detections = await faceapi
        .detectAllFaces(element, detectorOptions)
        .withFaceLandmarks()
        .withFaceDescriptors();
    }

    const faceCount = detections.length;

    if (faceCount === 0) {
      return {
        faceCount: 0,
        descriptor: null,
        box: null,
        score: 0,
        error: 'NO_FACE'
      };
    }

    if (faceCount > 1) {
      return {
        faceCount,
        descriptor: null,
        box: null,
        score: 0,
        error: 'MULTIPLE_FACES'
      };
    }

    const primary = detections[0];
    const rawBox = primary.detection.box;
    const descArray = Array.from(primary.descriptor as Float32Array);

    return {
      faceCount: 1,
      descriptor: descArray,
      box: {
        xMin: rawBox.x,
        yMin: rawBox.y,
        width: rawBox.width,
        height: rawBox.height
      },
      score: primary.detection.score,
      error: null
    };
  } catch (err) {
    console.warn('[FaceRecognition] Face extraction error:', err);
    return {
      faceCount: 0,
      descriptor: null,
      box: null,
      score: 0,
      error: 'EXTRACTION_FAILED'
    };
  }
}

/**
 * Calculates Euclidean distance between two vectors
 */
export function calculateEuclideanDistance(v1: number[], v2: number[]): number {
  if (!v1 || !v2 || v1.length !== v2.length) return 1.0;
  let sum = 0;
  for (let i = 0; i < v1.length; i++) {
    const diff = v1[i] - v2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Compares live face embedding against registered student face template.
 * 
 * Strict Biometric Verification Threshold:
 * - In standard 128D ResNet face models, same person distance is <= 0.45 (typically 0.20 - 0.40).
 * - Different persons distance is > 0.55 (typically 0.65 - 1.10).
 * - Match threshold is configured at distance <= 0.48.
 */
export function verifyBiometricIdentity(
  liveDescriptor: number[] | null | undefined,
  enrolledDescriptor: number[] | null | undefined,
  maxDistanceThreshold: number = 0.48
): FaceMatchResult {
  if (!liveDescriptor || !enrolledDescriptor) {
    return {
      isMatch: false,
      distance: 1.0,
      similarityScore: 0,
      confidenceText: 'Descriptor unavailable'
    };
  }

  // Handle case if dimensions mismatch (e.g. legacy vs 128D)
  if (liveDescriptor.length !== enrolledDescriptor.length) {
    return {
      isMatch: false,
      distance: 1.0,
      similarityScore: 0,
      confidenceText: 'Biometric template format mismatch'
    };
  }

  const distance = calculateEuclideanDistance(liveDescriptor, enrolledDescriptor);

  // Map distance to a 0-100% similarity score
  // distance <= 0.48 is a match: scores 70% - 99%
  // distance > 0.48 is mismatch: scores 0% - 68%
  let similarityScore: number;
  if (distance <= maxDistanceThreshold) {
    const fraction = (maxDistanceThreshold - distance) / maxDistanceThreshold;
    similarityScore = Math.min(99.5, Math.round((70 + fraction * 29.5) * 10) / 10);
  } else {
    const excess = (distance - maxDistanceThreshold) / 0.52;
    similarityScore = Math.max(5.0, Math.round((68 - excess * 63.0) * 10) / 10);
  }

  const isMatch = distance <= maxDistanceThreshold;

  let confidenceText: string;
  if (isMatch) {
    if (similarityScore >= 88) {
      confidenceText = 'High Confidence Biometric Match';
    } else {
      confidenceText = 'Identity Confirmed';
    }
  } else {
    if (similarityScore < 45) {
      confidenceText = 'Distinct Face - Identity Mismatch';
    } else {
      confidenceText = 'Biometric Profile Mismatch';
    }
  }

  return {
    isMatch,
    distance,
    similarityScore,
    confidenceText
  };
}

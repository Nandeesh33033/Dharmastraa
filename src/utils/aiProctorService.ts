import * as tf from '@tensorflow/tfjs';
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

export interface ModelLoadingState {
  isTfReady: boolean;
  isFaceModelReady: boolean;
  isObjectDetectorReady: boolean;
  isCameraReady: boolean;
  isFaceDetected: boolean;
  currentStepText: string;
  progressPercent: number;
  error: string | null;
}

let cachedFaceDetector: any = null;
let cachedObjectDetector: cocoSsd.ObjectDetection | null = null;
let faceLoadingPromise: Promise<any> | null = null;
let objectLoadingPromise: Promise<cocoSsd.ObjectDetection> | null = null;
let nativeFaceDetectorInstance: any = null;

/**
 * Allows any component (like StudentFaceScanner) to share an already-initialized detector.
 */
export function setCachedFaceDetector(detector: any): void {
  if (detector) {
    cachedFaceDetector = detector;
  }
}

/**
 * Initializes TensorFlow backend, prioritizing WebGL for GPU acceleration with fallback to CPU.
 */
export async function initTfBackend(): Promise<void> {
  try {
    await tf.setBackend('webgl');
  } catch (e) {
    console.warn('WebGL not supported, falling back to CPU for TF.js');
    try {
      await tf.setBackend('cpu');
    } catch (_) {}
  }
  await tf.ready();
}

/**
 * Fast face detector loader: loads ONLY the Face Mesh detector immediately.
 * This runs independently of the heavier COCO-SSD model.
 */
export async function getFastFaceDetector(
  onProgress?: (state: Partial<ModelLoadingState>) => void
): Promise<any> {
  if (cachedFaceDetector) {
    onProgress?.({ isFaceModelReady: true, progressPercent: 100 });
    return cachedFaceDetector;
  }

  if (faceLoadingPromise) {
    return faceLoadingPromise;
  }

  faceLoadingPromise = (async () => {
    try {
      await initTfBackend();
      onProgress?.({ isTfReady: true, currentStepText: 'Initializing Fast Neural Face Detector...' });

      const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
      const det = await faceLandmarksDetection.createDetector(model, {
        runtime: 'tfjs',
        refineLandmarks: false,
        maxFaces: 5
      });

      cachedFaceDetector = det;
      onProgress?.({ isFaceModelReady: true, currentStepText: 'Face Detector Ready' });
      return det;
    } catch (err) {
      faceLoadingPromise = null;
      console.error('Error loading face detector:', err);
      throw err;
    }
  })();

  return faceLoadingPromise;
}

/**
 * Loads object detector (COCO-SSD lite) in background without blocking face detection.
 */
export async function getObjectDetector(
  onProgress?: (state: Partial<ModelLoadingState>) => void
): Promise<cocoSsd.ObjectDetection> {
  if (cachedObjectDetector) {
    onProgress?.({ isObjectDetectorReady: true });
    return cachedObjectDetector;
  }

  if (objectLoadingPromise) {
    return objectLoadingPromise;
  }

  objectLoadingPromise = (async () => {
    try {
      await initTfBackend();
      const objDet = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
      cachedObjectDetector = objDet;
      onProgress?.({ isObjectDetectorReady: true });
      return objDet;
    } catch (err) {
      try {
        const fallback = await cocoSsd.load();
        cachedObjectDetector = fallback;
        onProgress?.({ isObjectDetectorReady: true });
        return fallback;
      } catch (e2) {
        objectLoadingPromise = null;
        console.warn('COCO-SSD load note:', e2);
        throw e2;
      }
    }
  })();

  return objectLoadingPromise;
}

/**
 * Preloads both models concurrently.
 */
export async function preloadAiModels(
  onProgress?: (state: Partial<ModelLoadingState>) => void
): Promise<{ faceDetector: any; objectDetector: cocoSsd.ObjectDetection }> {
  // Fire both in parallel
  const facePromise = getFastFaceDetector(onProgress);
  const objectPromise = getObjectDetector(onProgress);

  const [faceDetector, objectDetector] = await Promise.all([facePromise, objectPromise]);
  return { faceDetector, objectDetector };
}

/**
 * Ultra-fast face detection for video elements:
 * Uses Native Chrome FaceDetector API (<5ms) if available,
 * or the compiled MediaPipe FaceMesh detector in video mode.
 */
export async function detectFaceInVideo(
  video: HTMLVideoElement,
  customDetector?: any
): Promise<{ hasFace: boolean; faceCount: number; faces: any[] }> {
  if (!video || video.readyState < 2 || video.videoWidth === 0 || video.paused) {
    return { hasFace: false, faceCount: 0, faces: [] };
  }

  // 1. Try Hardware-Accelerated Native Browser FaceDetector (0ms download, instant 2ms execution in Chrome/Chromium)
  if (typeof window !== 'undefined' && 'FaceDetector' in window) {
    try {
      if (!nativeFaceDetectorInstance) {
        nativeFaceDetectorInstance = new (window as any).FaceDetector({
          fastMode: true,
          maxDetectedFaces: 5
        });
      }
      const nativeFaces = await nativeFaceDetectorInstance.detect(video);
      if (nativeFaces && nativeFaces.length > 0) {
        return {
          hasFace: true,
          faceCount: nativeFaces.length,
          faces: nativeFaces
        };
      }
    } catch (nativeErr) {
      // Fallback seamlessly to neural detector
    }
  }

  // 2. Use MediaPipe FaceMesh detector
  const detector = customDetector || cachedFaceDetector;
  if (detector) {
    try {
      let faces: any[] = [];
      try {
        faces = await detector.estimateFaces(video, {
          flipHorizontal: false,
          staticImageMode: false
        });
      } catch (_) {
        faces = await detector.estimateFaces(video);
      }

      if (faces && faces.length > 0) {
        return {
          hasFace: true,
          faceCount: faces.length,
          faces
        };
      }
    } catch (detErr) {
      console.warn('FaceMesh estimation warning:', detErr);
    }
  }

  return { hasFace: false, faceCount: 0, faces: [] };
}

export function getCachedDetectors(): { faceDetector: any; objectDetector: cocoSsd.ObjectDetection | null } {
  return { faceDetector: cachedFaceDetector, objectDetector: cachedObjectDetector };
}

export function areModelsReady(): boolean {
  return !!cachedFaceDetector && !!cachedObjectDetector;
}

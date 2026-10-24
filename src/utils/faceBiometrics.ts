/**
 * Facial Biometric Feature Extractor & Geometric Embedding Comparator
 * Uses deep 128D metric embeddings and MediaPipe FaceMesh 3D keypoints
 * to verify genuine identity matches.
 */

import { verifyBiometricIdentity, extractFaceBiometrics } from './faceRecognitionService';

// Indices of salient landmarks in MediaPipe FaceMesh (468/478 points model)
export const LANDMARK_INDICES = {
  NOSE_TIP: 1,
  NOSE_BRIDGE: 168,
  NOSE_BASE: 2,
  NOSE_LEFT: 129,
  NOSE_RIGHT: 358,
  CHIN: 152,
  FOREHEAD: 10,
  LEFT_EYE_INNER: 133,
  LEFT_EYE_OUTER: 33,
  LEFT_EYE_TOP: 159,
  LEFT_EYE_BOTTOM: 145,
  RIGHT_EYE_INNER: 362,
  RIGHT_EYE_OUTER: 263,
  RIGHT_EYE_TOP: 386,
  RIGHT_EYE_BOTTOM: 374,
  MOUTH_LEFT: 61,
  MOUTH_RIGHT: 291,
  UPPER_LIP: 0,
  LOWER_LIP: 17,
  LEFT_CHEEK: 234,
  RIGHT_CHEEK: 454,
  LEFT_JAW: 58,
  RIGHT_JAW: 288,
  LEFT_EYEBROW_INNER: 70,
  LEFT_EYEBROW_OUTER: 105,
  RIGHT_EYEBROW_INNER: 300,
  RIGHT_EYEBROW_OUTER: 334,
};

// Array of 36 key landmark indices for structural contour tracking
export const STRUCTURAL_POINTS = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152,
  148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109
];

export interface BiometricComparisonResult {
  similarityScore: number; // 0 to 100
  isMatch: boolean;
  confidenceText: string;
  cosineDistance: number;
  rawScore: number;
}

/**
 * Extracts a normalized 3D geometric biometric descriptor vector from a detected Face object.
 */
export function extractBiometricFeatureVector(face: any): number[] | null {
  if (!face || !face.keypoints || face.keypoints.length < 400) {
    return null;
  }

  const kps = face.keypoints;

  const getPt = (idx: number) => {
    const pt = kps[idx] || kps[0];
    return { x: pt.x, y: pt.y, z: pt.z || 0 };
  };

  // Compute Eye Centers
  const leftEyeInner = getPt(LANDMARK_INDICES.LEFT_EYE_INNER);
  const leftEyeOuter = getPt(LANDMARK_INDICES.LEFT_EYE_OUTER);
  const rightEyeInner = getPt(LANDMARK_INDICES.RIGHT_EYE_INNER);
  const rightEyeOuter = getPt(LANDMARK_INDICES.RIGHT_EYE_OUTER);

  const leftEyeCenter = {
    x: (leftEyeInner.x + leftEyeOuter.x) / 2,
    y: (leftEyeInner.y + leftEyeOuter.y) / 2,
    z: (leftEyeInner.z + leftEyeOuter.z) / 2
  };

  const rightEyeCenter = {
    x: (rightEyeInner.x + rightEyeOuter.x) / 2,
    y: (rightEyeInner.y + rightEyeOuter.y) / 2,
    z: (rightEyeInner.z + rightEyeOuter.z) / 2
  };

  // Order eyes from viewer-left to viewer-right to ensure dx is always positive
  // This eliminates coordinate inversion between mirrored snapshots and unmirrored camera streams
  const eyeA = leftEyeCenter;
  const eyeB = rightEyeCenter;
  const viewerLeftEye = eyeA.x <= eyeB.x ? eyeA : eyeB;
  const viewerRightEye = eyeA.x <= eyeB.x ? eyeB : eyeA;

  // Midpoint between eyes (Origin)
  const eyeMid = {
    x: (viewerLeftEye.x + viewerRightEye.x) / 2,
    y: (viewerLeftEye.y + viewerRightEye.y) / 2,
    z: ((viewerLeftEye.z || 0) + (viewerRightEye.z || 0)) / 2
  };

  // Interocular distance (Scale Factor)
  const dx = viewerRightEye.x - viewerLeftEye.x; // Always >= 0
  const dy = viewerRightEye.y - viewerLeftEye.y; // Vertical tilt
  const interocularDist = Math.sqrt(dx * dx + dy * dy);

  if (interocularDist < 10) {
    return null;
  }

  // In-plane face tilt angle (rollAngle is always in [-PI/2, +PI/2] because dx >= 0)
  // For upright faces, rollAngle is close to 0 and cosA is ALWAYS positive (~1.0).
  const rollAngle = Math.atan2(dy, dx);
  const cosA = Math.cos(rollAngle);
  const sinA = Math.sin(rollAngle);

  // Normalize, translate, rotate and scale a 2D point
  const normalizePt = (pt: { x: number; y: number; z?: number }) => {
    const tx = pt.x - eyeMid.x;
    const ty = pt.y - eyeMid.y;
    // Rotate by -rollAngle so the face is upright
    const rx = tx * cosA + ty * sinA;
    const ry = -tx * sinA + ty * cosA;
    return {
      x: rx / interocularDist,
      y: ry / interocularDist,
      z: (pt.z || 0) / interocularDist
    };
  };

  const dist2D = (p1: { x: number; y: number }, p2: { x: number; y: number }) => {
    const dX = p1.x - p2.x;
    const dY = p1.y - p2.y;
    return Math.sqrt(dX * dX + dY * dY);
  };

  // Extract key normalized points
  const noseTip = normalizePt(getPt(LANDMARK_INDICES.NOSE_TIP));
  const noseBridge = normalizePt(getPt(LANDMARK_INDICES.NOSE_BRIDGE));
  const noseBase = normalizePt(getPt(LANDMARK_INDICES.NOSE_BASE));
  const chin = normalizePt(getPt(LANDMARK_INDICES.CHIN));
  const forehead = normalizePt(getPt(LANDMARK_INDICES.FOREHEAD));
  const mouthLeft = normalizePt(getPt(LANDMARK_INDICES.MOUTH_LEFT));
  const mouthRight = normalizePt(getPt(LANDMARK_INDICES.MOUTH_RIGHT));
  const upperLip = normalizePt(getPt(LANDMARK_INDICES.UPPER_LIP));
  const lowerLip = normalizePt(getPt(LANDMARK_INDICES.LOWER_LIP));
  const leftCheek = normalizePt(getPt(LANDMARK_INDICES.LEFT_CHEEK));
  const rightCheek = normalizePt(getPt(LANDMARK_INDICES.RIGHT_CHEEK));
  const leftJaw = normalizePt(getPt(LANDMARK_INDICES.LEFT_JAW));
  const rightJaw = normalizePt(getPt(LANDMARK_INDICES.RIGHT_JAW));
  const leftEyeOut = normalizePt(leftEyeOuter);
  const rightEyeOut = normalizePt(rightEyeOuter);
  const leftBrowIn = normalizePt(getPt(LANDMARK_INDICES.LEFT_EYEBROW_INNER));
  const rightBrowIn = normalizePt(getPt(LANDMARK_INDICES.RIGHT_EYEBROW_INNER));
  const leftBrowOut = normalizePt(getPt(LANDMARK_INDICES.LEFT_EYEBROW_OUTER));
  const rightBrowOut = normalizePt(getPt(LANDMARK_INDICES.RIGHT_EYEBROW_OUTER));
  const noseLeft = normalizePt(getPt(LANDMARK_INDICES.NOSE_LEFT));
  const noseRight = normalizePt(getPt(LANDMARK_INDICES.NOSE_RIGHT));

  const vector: number[] = [];

  // Section 1: Invariant Anthropometric Ratios (30 critical measurements)
  vector.push(
    dist2D(noseTip, chin),
    dist2D(noseBridge, noseTip),
    dist2D(forehead, noseBridge),
    dist2D(forehead, chin),
    dist2D(mouthLeft, mouthRight),
    dist2D(upperLip, lowerLip),
    dist2D(leftCheek, rightCheek),
    dist2D(leftJaw, rightJaw),
    dist2D(noseLeft, noseRight),
    dist2D(noseTip, mouthLeft),
    dist2D(noseTip, mouthRight),
    dist2D(chin, mouthLeft),
    dist2D(chin, mouthRight),
    dist2D(leftEyeOut, mouthLeft),
    dist2D(rightEyeOut, mouthRight),
    dist2D(leftEyeOut, leftCheek),
    dist2D(rightEyeOut, rightCheek),
    dist2D(leftBrowIn, rightBrowIn),
    dist2D(leftBrowOut, rightBrowOut),
    dist2D(leftBrowIn, leftEyeOut),
    dist2D(rightBrowIn, rightEyeOut),
    dist2D(noseBase, upperLip),
    dist2D(chin, lowerLip),
    dist2D(chin, leftJaw),
    dist2D(chin, rightJaw),
    dist2D(noseBridge, leftCheek),
    dist2D(noseBridge, rightCheek),
    dist2D(forehead, leftBrowOut),
    dist2D(forehead, rightBrowOut),
    dist2D(noseTip, upperLip)
  );

  // Section 2: Relative Normalized Landmark Coordinates (X, Y of structural contour & features)
  const landmarkChecklist = [
    ...STRUCTURAL_POINTS,
    LANDMARK_INDICES.NOSE_TIP,
    LANDMARK_INDICES.NOSE_BRIDGE,
    LANDMARK_INDICES.CHIN,
    LANDMARK_INDICES.MOUTH_LEFT,
    LANDMARK_INDICES.MOUTH_RIGHT,
    LANDMARK_INDICES.UPPER_LIP,
    LANDMARK_INDICES.LOWER_LIP,
    LANDMARK_INDICES.LEFT_CHEEK,
    LANDMARK_INDICES.RIGHT_CHEEK,
    LANDMARK_INDICES.LEFT_JAW,
    LANDMARK_INDICES.RIGHT_JAW,
    LANDMARK_INDICES.LEFT_EYEBROW_INNER,
    LANDMARK_INDICES.RIGHT_EYEBROW_INNER
  ];

  for (const idx of landmarkChecklist) {
    const pt = normalizePt(getPt(idx));
    vector.push(pt.x, pt.y);
  }

  // Section 3: Return raw calibrated anthropometric feature vector
  // The values are already scale-invariant and pose-normalized (divided by interocular distance).
  // Leaving individual metric dimensions un-collapsed allows high-discrimination point-by-point
  // and ratio-by-ratio comparison between different human faces.
  if (vector.length === 0) return null;

  return vector;
}

/**
 * Extracts biometric feature vector from an image data URL / Base64 image using deep face recognition.
 */
export async function extractDescriptorFromImage(
  detector: any,
  imageSrc: string
): Promise<number[] | null> {
  if (!imageSrc) return null;

  try {
    // 1. Primary: Use deep ResNet-34 128D facial recognition
    const deepResult = await extractFaceBiometrics(imageSrc, { scoreThreshold: 0.45 });
    if (deepResult && deepResult.descriptor && deepResult.descriptor.length === 128) {
      return deepResult.descriptor;
    }
  } catch (deepErr) {
    console.warn('Deep descriptor extraction fallback:', deepErr);
  }

  // 2. Secondary fallback with detector canvas if deep model unavailable
  if (!detector) return null;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
      try {
        const canvas = document.createElement('canvas');
        const width = img.naturalWidth || img.width || 480;
        const height = img.naturalHeight || img.height || 480;
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        let faces: any[] = [];
        try {
          faces = await detector.estimateFaces(canvas, { flipHorizontal: false, staticImageMode: true });
        } catch {
          faces = await detector.estimateFaces(canvas);
        }

        if (faces && faces.length > 0) {
          const desc = extractBiometricFeatureVector(faces[0]);
          resolve(desc);
          return;
        }
        resolve(null);
      } catch (err) {
        console.warn('Descriptor extraction from image failed:', err);
        resolve(null);
      }
    };
    img.onerror = () => {
      resolve(null);
    };
    img.src = imageSrc;
  });
}

/**
 * Compares two biometric descriptor vectors and returns a similarity percentage (0 - 100%)
 * and genuine match decision.
 * 
 * Deep 128D embeddings (ResNet-34) use Euclidean distance verification (threshold <= 0.48).
 * Different people have distance > 0.55 (strict rejection).
 */
export function compareBiometricDescriptors(
  liveDescriptor: number[] | null,
  enrolledDescriptor: number[] | null,
  thresholdScore = 70
): BiometricComparisonResult {
  if (!liveDescriptor || !enrolledDescriptor) {
    return {
      similarityScore: 0,
      isMatch: false,
      confidenceText: 'Descriptor unavailable',
      cosineDistance: 1,
      rawScore: 0
    };
  }

  // If both are 128D deep ResNet embeddings, use exact metric distance verification
  if (liveDescriptor.length === 128 && enrolledDescriptor.length === 128) {
    const deepMatch = verifyBiometricIdentity(liveDescriptor, enrolledDescriptor, 0.48);
    return {
      similarityScore: deepMatch.similarityScore,
      isMatch: deepMatch.isMatch,
      confidenceText: deepMatch.confidenceText,
      cosineDistance: deepMatch.distance,
      rawScore: deepMatch.similarityScore
    };
  }

  // Dimension mismatch (e.g. 128D vs legacy landmark vector)
  if (liveDescriptor.length !== enrolledDescriptor.length) {
    return {
      similarityScore: 0,
      isMatch: false,
      confidenceText: 'Biometric descriptor format mismatch',
      cosineDistance: 1,
      rawScore: 0
    };
  }

  const len = liveDescriptor.length;
  // If either vector was saved under legacy L2 unit normalization, rescale independently
  const normLive = Math.sqrt(liveDescriptor.reduce((s, v) => s + v * v, 0));
  const normEnrolled = Math.sqrt(enrolledDescriptor.reduce((s, v) => s + v * v, 0));
  
  let vLive = liveDescriptor;
  let vEnrolled = enrolledDescriptor;
  if (normLive < 2.0) {
    vLive = liveDescriptor.map(v => v * 9.2);
  }
  if (normEnrolled < 2.0) {
    vEnrolled = enrolledDescriptor.map(v => v * 9.2);
  }

  // Section 1: Invariant Anthropometric Distance Ratios (first 30 values)
  const ratioCount = Math.min(30, len);
  let totalRatioDiff = 0;
  let maxRatioDiff = 0;
  let validRatios = 0;

  for (let i = 0; i < ratioCount; i++) {
    const val1 = Math.abs(vLive[i]);
    const val2 = Math.abs(vEnrolled[i]);
    const avg = (val1 + val2) / 2;
    if (avg > 0.001) {
      const diff = Math.abs(val1 - val2) / avg;
      totalRatioDiff += diff;
      if (diff > maxRatioDiff) maxRatioDiff = diff;
      validRatios += 1;
    }
  }
  const meanRatioDiff = validRatios > 0 ? totalRatioDiff / validRatios : 1;

  // Section 2: Structural Landmark Point Euclidean Deviation (indices 30 onwards, pairs of (X, Y))
  let directPtDistSum = 0;
  let mirroredPtDistSum = 0;
  let directMaxPtDist = 0;
  let mirroredMaxPtDist = 0;
  let ptCount = 0;

  for (let i = 30; i + 1 < len; i += 2) {
    const x1 = vLive[i];
    const y1 = vLive[i + 1];

    const x2 = vEnrolled[i];
    const y2 = vEnrolled[i + 1];

    // 1) Direct alignment
    const dDirect = Math.hypot(x1 - x2, y1 - y2);
    directPtDistSum += dDirect;
    if (dDirect > directMaxPtDist) directMaxPtDist = dDirect;

    // 2) Mirrored alignment (horizontal flip: invert X)
    const dMirrored = Math.hypot(x1 - (-x2), y1 - y2);
    mirroredPtDistSum += dMirrored;
    if (dMirrored > mirroredMaxPtDist) mirroredMaxPtDist = dMirrored;

    ptCount += 1;
  }

  const directMeanPtDist = ptCount > 0 ? directPtDistSum / ptCount : 1;
  const mirroredMeanPtDist = ptCount > 0 ? mirroredPtDistSum / ptCount : 1;

  const isMirroredBest = mirroredMeanPtDist < directMeanPtDist;
  const bestMeanPtDist = isMirroredBest ? mirroredMeanPtDist : directMeanPtDist;
  const bestMaxPtDist = isMirroredBest ? mirroredMaxPtDist : directMaxPtDist;

  const compositeDiscrepancy = (bestMeanPtDist * 1.5) + (meanRatioDiff * 1.2) + (bestMaxPtDist * 0.4) + (maxRatioDiff * 0.2);
  const calculatedScore = 100.0 - (compositeDiscrepancy * 210.0);
  const boundedScore = Math.min(99.4, Math.max(5.0, parseFloat(calculatedScore.toFixed(1))));

  const isMatch = (boundedScore >= thresholdScore) && (bestMeanPtDist <= 0.046) && (meanRatioDiff <= 0.042);

  let confidenceText: string;
  if (isMatch) {
    confidenceText = boundedScore >= 85 ? 'High Confidence Biometric Match' : 'Biometric Identity Confirmed';
  } else {
    confidenceText = boundedScore < 45 ? 'Distinct Face - Identity Mismatch' : 'Biometric Profile Mismatch';
  }

  return {
    similarityScore: boundedScore,
    isMatch,
    confidenceText,
    cosineDistance: compositeDiscrepancy,
    rawScore: calculatedScore
  };
}

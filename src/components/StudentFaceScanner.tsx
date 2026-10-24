import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';
import { Camera, CameraOff, RefreshCw, CheckCircle2, AlertTriangle, ShieldCheck, UserCheck, Sparkles, Scan, Upload, Timer, Trash2, XCircle, UserX, AlertOctagon } from 'lucide-react';
import { motion } from 'motion/react';
import { 
  extractBiometricFeatureVector, 
  extractDescriptorFromImage, 
  compareBiometricDescriptors,
  BiometricComparisonResult 
} from '../utils/faceBiometrics';
import { 
  loadFaceRecognitionModels, 
  extractFaceBiometrics, 
  verifyBiometricIdentity,
  FaceModelLifecycleState,
  getModelStatus,
  isModelReady
} from '../utils/faceRecognitionService';
import { loadOpenCV, analyzeFrameWithOpenCV, OpenCVMetrics } from '../utils/openCvFaceHelper';
import { setCachedFaceDetector } from '../utils/aiProctorService';

interface StudentFaceScannerProps {
  mode: 'register' | 'authenticate';
  onFaceCaptured?: (dataUrl: string, descriptor?: number[]) => void;
  onFaceStatusChange?: (
    isDetected: boolean, 
    faceCount: number, 
    matchScore?: number, 
    isMatch?: boolean,
    liveDescriptor?: number[]
  ) => void;
  onModelStateChange?: (
    state: FaceModelLifecycleState,
    message: string
  ) => void;
  capturedImage?: string | null;
  onResetCapture?: () => void;
  enrolledFacePhoto?: string | null;
  enrolledDescriptor?: number[] | null;
  studentName?: string | null;
  studentRollNo?: string | null;
}

export const StudentFaceScanner: React.FC<StudentFaceScannerProps> = ({
  mode,
  onFaceCaptured,
  onFaceStatusChange,
  onModelStateChange,
  capturedImage,
  onResetCapture,
  enrolledFacePhoto,
  enrolledDescriptor,
  studentName,
  studentRollNo
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [detectorStatus, setDetectorStatus] = useState<'idle' | 'loading' | 'active' | 'error' | 'stopped'>('loading');
  const [modelLifecycle, setModelLifecycle] = useState<FaceModelLifecycleState>(() => getModelStatus());
  const [modelStatusMessage, setModelStatusMessage] = useState<string>('Loading face recognition model. Please wait...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [detectedFacesCount, setDetectedFacesCount] = useState<number>(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [flashEffect, setFlashEffect] = useState(false);
  
  // Real Biometric Matching State
  const [matchResult, setMatchResult] = useState<BiometricComparisonResult | null>(null);
  const [isExtractingEnrolled, setIsExtractingEnrolled] = useState(false);

  // OpenCV WebAssembly (opencv.js) Vision Metrics State
  const [openCvMetrics, setOpenCvMetrics] = useState<OpenCVMetrics>({
    isLoaded: false,
    sharpnessScore: 0,
    isSharpEnough: true,
    averageBrightness: 120,
    contrastRatio: 45,
    isLightingAdequate: true,
    openCvActive: false
  });

  const detectorRef = useRef<any>(null);
  const enrolledDescriptorRef = useRef<number[] | null>(enrolledDescriptor || null);
  const isDetectingRef = useRef<boolean>(false);
  const lastDetectTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);
  const streamRef = useRef<MediaStream | null>(null);
  const countdownTimerRef = useRef<any>(null);

  // Temporal smoothing & landmark memory refs to prevent micro-dropout flickers
  const consecutiveMissingFramesRef = useRef<number>(0);
  const lastValidFaceBoxRef = useRef<any>(null);
  const lastValidDescriptorRef = useRef<number[] | null>(null);
  const attemptedExtractionRef = useRef<boolean>(false);

  // Sync enrolled descriptor when passed as prop
  useEffect(() => {
    if (enrolledDescriptor && enrolledDescriptor.length > 0) {
      enrolledDescriptorRef.current = enrolledDescriptor;
    }
  }, [enrolledDescriptor]);

  // Extract enrolled face descriptor from photo using deep face recognition
  const loadEnrolledFaceDescriptor = useCallback(async (photoUrl: string) => {
    if (!photoUrl || isExtractingEnrolled || attemptedExtractionRef.current) return;
    setIsExtractingEnrolled(true);
    attemptedExtractionRef.current = true;
    try {
      // 1. Primary: Use deep ResNet 128D facial recognition
      const deepRes = await extractFaceBiometrics(photoUrl, { scoreThreshold: 0.45 });
      if (deepRes && deepRes.descriptor && deepRes.descriptor.length === 128 && isMountedRef.current) {
        enrolledDescriptorRef.current = deepRes.descriptor;
        return;
      }

      // 2. Secondary fallback with detector
      if (detectorRef.current) {
        const desc = await extractDescriptorFromImage(detectorRef.current, photoUrl);
        if (desc && isMountedRef.current) {
          enrolledDescriptorRef.current = desc;
        }
      }
    } catch (e) {
      console.warn('Enrolled face descriptor extraction notice:', e);
    } finally {
      if (isMountedRef.current) {
        setIsExtractingEnrolled(false);
      }
    }
  }, [isExtractingEnrolled]);

  // Initialize OpenCV.js WebAssembly asynchronously
  useEffect(() => {
    loadOpenCV().then((loaded) => {
      if (loaded && isMountedRef.current) {
        setOpenCvMetrics(prev => ({ ...prev, isLoaded: true, openCvActive: true }));
      }
    });
  }, []);

  // When enrolled photo changes, reload descriptor
  useEffect(() => {
    if (enrolledFacePhoto) {
      enrolledDescriptorRef.current = enrolledDescriptor || null;
      attemptedExtractionRef.current = false;
      if (detectorRef.current) {
        loadEnrolledFaceDescriptor(enrolledFacePhoto);
      }
    } else {
      enrolledDescriptorRef.current = null;
      setMatchResult(null);
      attemptedExtractionRef.current = false;
    }
  }, [enrolledFacePhoto, enrolledDescriptor, loadEnrolledFaceDescriptor]);

  const stopCamera = useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdown(null);

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
          track.enabled = false;
        } catch (e) {
          console.warn('Track stop error:', e);
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    setDetectorStatus('loading');
    setErrorMessage(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 640 }, 
          height: { ideal: 480 }, 
          facingMode: 'user' 
        },
        audio: false
      });

      if (!isMountedRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        videoRef.current.autoplay = true;
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.warn('Video play error:', playErr);
        }
      }

      if (isMountedRef.current) {
        setDetectorStatus('active');
        setDetectedFacesCount(1);
        if (onFaceStatusChange) {
          onFaceStatusChange(true, 1, matchResult?.similarityScore, matchResult?.isMatch ?? true);
        }
      }

      await initDetector();
      runDetectionLoop();
    } catch (err: any) {
      console.error('Camera initialization error:', err);
      if (isMountedRef.current) {
        setDetectorStatus('error');
        setErrorMessage(err.message || 'Camera permission denied or camera not found.');
      }
    }
  }, [stopCamera, onFaceStatusChange, matchResult]);

  const initDetector = async () => {
    try {
      setModelLifecycle('LOADING');
      setModelStatusMessage('Loading face recognition model. Please wait...');
      if (onModelStateChange) {
        onModelStateChange('LOADING', 'Loading face recognition model. Please wait...');
      }

      try {
        await tf.setBackend('webgl');
      } catch {
        await tf.setBackend('cpu');
      }
      await tf.ready();

      // Initialize deep face recognition models (ResNet 128D embedding network)
      const isLoaded = await loadFaceRecognitionModels();

      if (!isLoaded) {
        setModelLifecycle('MODEL_ERROR');
        setModelStatusMessage('Model failed to load. Please refresh and check your camera.');
        if (onModelStateChange) {
          onModelStateChange('MODEL_ERROR', 'Model failed to load. Please refresh and check your camera.');
        }
        return;
      }

      setModelLifecycle('READY');
      setModelStatusMessage('Face recognition ready. Please verify your identity.');
      if (onModelStateChange) {
        onModelStateChange('READY', 'Face recognition ready. Please verify your identity.');
      }

      if (!detectorRef.current && isMountedRef.current) {
        const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
        detectorRef.current = await faceLandmarksDetection.createDetector(model, {
          runtime: 'tfjs',
          refineLandmarks: false,
          maxFaces: 2
        });
        setCachedFaceDetector(detectorRef.current);

        // If enrolled photo is already loaded, extract its descriptor
        if (enrolledFacePhoto) {
          loadEnrolledFaceDescriptor(enrolledFacePhoto);
        }
      }
    } catch (err: any) {
      console.warn('TensorFlow face model warm-up notice:', err);
      setModelLifecycle('MODEL_ERROR');
      setModelStatusMessage('Model failed to load. Please refresh and check your camera.');
      if (onModelStateChange) {
        onModelStateChange('MODEL_ERROR', 'Model failed to load. Please refresh and check your camera.');
      }
    }
  };

  const runDetectionLoop = () => {
    const detectFrame = async () => {
      if (!isMountedRef.current || !streamRef.current) return;

      const now = performance.now();
      // Run detection every 140ms for high responsiveness
      if (now - lastDetectTimeRef.current > 140 && !isDetectingRef.current) {
        lastDetectTimeRef.current = now;

        const video = videoRef.current;
        if (
          video &&
          video.readyState >= 2 &&
          video.videoWidth > 0 &&
          video.videoHeight > 0 &&
          !video.paused
        ) {
          isDetectingRef.current = true;
          try {
            let rawCount = 0;
            let faceBox: any = null;
            let liveDescriptor: number[] | null = null;

            // 1. Primary: Run deep face recognition model to extract genuine 128D biometric vector
            try {
              const deepExtract = await extractFaceBiometrics(video, { useFastTiny: true, scoreThreshold: 0.45 });
              rawCount = deepExtract.faceCount;
              if (deepExtract.faceCount > 0) {
                faceBox = deepExtract.box;
                liveDescriptor = deepExtract.descriptor;
                consecutiveMissingFramesRef.current = 0;
                lastValidFaceBoxRef.current = faceBox;
                if (liveDescriptor) {
                  lastValidDescriptorRef.current = liveDescriptor;
                }
              } else {
                consecutiveMissingFramesRef.current += 1;
              }
            } catch (deepErr) {
              // Secondary fallback with detectorRef if deep model is unavailable
              if (detectorRef.current) {
                let faces: any[] = [];
                try {
                  faces = await detectorRef.current.estimateFaces(video, { flipHorizontal: false, staticImageMode: false });
                } catch {
                  faces = await detectorRef.current.estimateFaces(video);
                }

                rawCount = faces.length;
                if (faces.length > 0) {
                  faceBox = faces[0].box;
                  liveDescriptor = extractBiometricFeatureVector(faces[0]);
                  consecutiveMissingFramesRef.current = 0;
                  lastValidFaceBoxRef.current = faceBox;
                  if (liveDescriptor) {
                    lastValidDescriptorRef.current = liveDescriptor;
                  }
                } else {
                  consecutiveMissingFramesRef.current += 1;
                }
              }
            }

            // Temporal stabilization: Keep face detected status for up to 5 missing frames (~700ms)
            // This absorbs natural micro-movements, eye blinks, and momentary detector dropouts
            const isGraceActive = consecutiveMissingFramesRef.current > 0 && consecutiveMissingFramesRef.current <= 5;
            const effectiveCount = rawCount > 0 ? rawCount : (isGraceActive && lastValidFaceBoxRef.current ? 1 : 0);
            const effectiveFaceBox = faceBox || (isGraceActive ? lastValidFaceBoxRef.current : null);
            const effectiveDescriptor = liveDescriptor || (isGraceActive ? lastValidDescriptorRef.current : null);

            // 0. OPENCV.JS COMPUTER VISION ANALYSIS (Contrast normalization & blur/liveness metrics)
            const cvMetrics = analyzeFrameWithOpenCV(video, effectiveFaceBox);

            if (isMountedRef.current) {
              setDetectedFacesCount(effectiveCount);
              setOpenCvMetrics(cvMetrics);

              // 1. BIOMETRIC COMPARISON LOGIC
              let currentMatch: BiometricComparisonResult | null = null;
              let nextState = modelLifecycle;
              let nextMsg = modelStatusMessage;

              if (effectiveCount === 1 && effectiveDescriptor) {
                if (mode === 'authenticate') {
                  nextState = 'VERIFICATION_IN_PROGRESS';
                  nextMsg = 'Verifying your registered identity...';
                }

                if (enrolledDescriptorRef.current) {
                  // Prefer 128D ResNet deep metric verification
                  if (effectiveDescriptor.length === 128 && enrolledDescriptorRef.current.length === 128) {
                    const strictRes = verifyBiometricIdentity(effectiveDescriptor, enrolledDescriptorRef.current, 0.48);
                    currentMatch = {
                      isMatch: strictRes.isMatch,
                      similarityScore: strictRes.similarityScore,
                      confidenceText: strictRes.confidenceText,
                      cosineDistance: strictRes.distance,
                      rawScore: strictRes.similarityScore
                    };
                  } else {
                    currentMatch = compareBiometricDescriptors(
                      effectiveDescriptor, 
                      enrolledDescriptorRef.current,
                      70
                    );
                  }

                  if (mode === 'authenticate') {
                    if (currentMatch.isMatch) {
                      nextState = 'VERIFIED';
                      nextMsg = 'Identity verified. You may proceed.';
                    } else {
                      nextState = 'VERIFICATION_FAILED';
                      nextMsg = 'Face does not match the registered student. Login denied.';
                    }
                  }
                } else if (enrolledFacePhoto && !isExtractingEnrolled && !attemptedExtractionRef.current) {
                  loadEnrolledFaceDescriptor(enrolledFacePhoto);
                }
              } else if (effectiveCount === 0 && mode === 'authenticate' && isModelReady()) {
                nextState = 'READY';
                nextMsg = 'Face recognition ready. Please align your face.';
              } else if (effectiveCount > 1 && mode === 'authenticate' && isModelReady()) {
                nextState = 'READY';
                nextMsg = 'Multiple faces detected. Only one student must be in frame.';
              }

              setModelLifecycle(nextState);
              setModelStatusMessage(nextMsg);
              if (onModelStateChange) {
                onModelStateChange(nextState, nextMsg);
              }

              setMatchResult(currentMatch);

              const isFaceDetected = effectiveCount === 1;
              let isMatchApproved = false;
              if (mode === 'register') {
                isMatchApproved = isFaceDetected;
              } else {
                // In authenticate mode: Strictly require BOTH enrolled photo and verified biometric match
                if (enrolledFacePhoto) {
                  isMatchApproved = !!(currentMatch && currentMatch.isMatch);
                } else {
                  // No biometric profile enrolled on student account
                  isMatchApproved = false;
                }
              }

              if (onFaceStatusChange) {
                onFaceStatusChange(
                  isFaceDetected, 
                  effectiveCount, 
                  currentMatch?.similarityScore, 
                  isMatchApproved,
                  effectiveDescriptor || undefined
                );
              }

              // 2. DRAW HUD CANVAS OVERLAY (Geometry only; text rendered cleanly in HTML)
              if (canvasRef.current && video) {
                const ctx = canvasRef.current.getContext('2d');
                if (ctx) {
                  canvasRef.current.width = video.videoWidth || 640;
                  canvasRef.current.height = video.videoHeight || 480;
                  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

                  const vw = canvasRef.current.width;
                  const vh = canvasRef.current.height;

                  if (effectiveCount === 1) {
                    const centerX = effectiveFaceBox ? (effectiveFaceBox.xMin + effectiveFaceBox.width / 2) : vw / 2;
                    const centerY = effectiveFaceBox ? (effectiveFaceBox.yMin + effectiveFaceBox.height / 2) : vh * 0.48;
                    const radiusX = effectiveFaceBox ? (effectiveFaceBox.width * 0.55) : vw * 0.22;
                    const radiusY = effectiveFaceBox ? (effectiveFaceBox.height * 0.65) : vh * 0.32;

                    // Color reticle based on real biometric decision:
                    let strokeColor = '#10b981'; // Emerald (default / match)
                    if (enrolledFacePhoto) {
                      if (currentMatch) {
                        strokeColor = currentMatch.isMatch ? '#10b981' : '#ef4444'; // Red if mismatch
                      } else {
                        strokeColor = '#6366f1'; // Indigo while analyzing
                      }
                    }

                    // Biometric Target Oval
                    ctx.strokeStyle = strokeColor;
                    ctx.lineWidth = 2.5;
                    ctx.beginPath();
                    ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
                    ctx.stroke();

                    // Corner brackets
                    const left = centerX - radiusX;
                    const right = centerX + radiusX;
                    const top = centerY - radiusY;
                    const bottom = centerY + radiusY;
                    const bracketLen = 20;

                    ctx.lineWidth = 3.5;
                    // Top-Left
                    ctx.beginPath();
                    ctx.moveTo(left, top + bracketLen);
                    ctx.lineTo(left, top);
                    ctx.lineTo(left + bracketLen, top);
                    ctx.stroke();

                    // Top-Right
                    ctx.beginPath();
                    ctx.moveTo(right - bracketLen, top);
                    ctx.lineTo(right, top);
                    ctx.lineTo(right, top + bracketLen);
                    ctx.stroke();

                    // Bottom-Left
                    ctx.beginPath();
                    ctx.moveTo(left, bottom - bracketLen);
                    ctx.lineTo(left, bottom);
                    ctx.lineTo(left + bracketLen, bottom);
                    ctx.stroke();

                    // Bottom-Right
                    ctx.beginPath();
                    ctx.moveTo(right - bracketLen, bottom);
                    ctx.lineTo(right, bottom);
                    ctx.lineTo(right, bottom - bracketLen);
                    ctx.stroke();
                  }
                }
              }
            }
          } catch (err) {
            console.warn('Face detection frame step notice:', err);
          } finally {
            isDetectingRef.current = false;
          }
        }
      }

      if (isMountedRef.current && streamRef.current) {
        animationFrameRef.current = requestAnimationFrame(detectFrame);
      }
    };

    animationFrameRef.current = requestAnimationFrame(detectFrame);
  };

  const handleCaptureSnapshot = async () => {
    if (!videoRef.current) {
      if (detectorStatus === 'stopped' || detectorStatus === 'error') {
        startCamera();
      }
      return;
    }

    setIsCapturing(true);
    setFlashEffect(true);
    setTimeout(() => setFlashEffect(false), 200);

    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');

    if (ctx && videoRef.current) {
      const vidWidth = videoRef.current.videoWidth || 640;
      const vidHeight = videoRef.current.videoHeight || 480;
      const minDim = Math.min(vidWidth, vidHeight);
      const startX = (vidWidth - minDim) / 2;
      const startY = (vidHeight - minDim) / 2;

      // Draw mirrored cropped square around center
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(
        videoRef.current,
        startX, startY, minDim, minDim,
        0, 0, canvas.width, canvas.height
      );

      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

      // Verify that exactly ONE clear face is present and generate deep 128D biometric vector
      let descriptor: number[] | undefined = undefined;
      try {
        const deepRes = await extractFaceBiometrics(canvas, { scoreThreshold: 0.45 });
        if (deepRes.faceCount === 0) {
          setErrorMessage('No face detected in photo. Please center your face in the camera.');
          setIsCapturing(false);
          return;
        }
        if (deepRes.faceCount > 1) {
          setErrorMessage('Multiple faces detected. Only one student must be present in the frame.');
          setIsCapturing(false);
          return;
        }
        if (deepRes.descriptor && deepRes.descriptor.length === 128) {
          descriptor = deepRes.descriptor;
        }
      } catch (deepExtractErr) {
        console.warn('Deep snapshot extraction notice:', deepExtractErr);
      }

      // Secondary fallback if needed
      if (!descriptor && lastValidDescriptorRef.current) {
        descriptor = lastValidDescriptorRef.current;
      }

      if (!descriptor) {
        setErrorMessage('Unable to generate face recognition biometric template. Please try again.');
        setIsCapturing(false);
        return;
      }

      if (onFaceCaptured) {
        onFaceCaptured(dataUrl, descriptor);
      }
      if (onFaceStatusChange) {
        onFaceStatusChange(true, 1, 100, true);
      }

      // Shut off camera once photo is enrolled
      stopCamera();
      setDetectorStatus('stopped');
    }
    setTimeout(() => setIsCapturing(false), 300);
  };

  const startCountdownCapture = () => {
    if (countdown !== null) return;
    setCountdown(3);

    let current = 3;
    countdownTimerRef.current = setInterval(() => {
      current -= 1;
      if (current <= 0) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
        setCountdown(null);
        handleCaptureSnapshot();
      } else {
        setCountdown(current);
      }
    }, 1000);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const imgData = event.target?.result as string;
      if (imgData) {
        let descriptor: number[] | undefined = undefined;
        try {
          const deepRes = await extractFaceBiometrics(imgData, { scoreThreshold: 0.45 });
          if (deepRes.faceCount === 0) {
            setErrorMessage('No face detected in uploaded photo. Please upload a clear frontal portrait.');
            return;
          }
          if (deepRes.faceCount > 1) {
            setErrorMessage('Multiple faces detected in photo. Please upload an image with only one student.');
            return;
          }
          if (deepRes.descriptor && deepRes.descriptor.length === 128) {
            descriptor = deepRes.descriptor;
          }
        } catch (err) {
          console.warn('Upload deep extraction notice:', err);
        }

        if (!descriptor && detectorRef.current) {
          try {
            const desc = await extractDescriptorFromImage(detectorRef.current, imgData);
            if (desc) descriptor = desc;
          } catch (e) {
            console.warn('Uploaded image descriptor extraction notice:', e);
          }
        }

        if (!descriptor) {
          setErrorMessage('Could not generate biometric face template from uploaded photo. Please try a different photo.');
          return;
        }

        if (onFaceCaptured) {
          onFaceCaptured(imgData, descriptor);
        }
        if (onFaceStatusChange) {
          onFaceStatusChange(true, 1, 100, true);
        }
        stopCamera();
        setDetectorStatus('stopped');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleManualToggleCamera = () => {
    if (streamRef.current) {
      stopCamera();
      setDetectorStatus('stopped');
    } else {
      startCamera();
    }
  };

  const handleRetake = () => {
    if (onResetCapture) {
      onResetCapture();
    }
    startCamera();
  };

  useEffect(() => {
    isMountedRef.current = true;
    
    if (!capturedImage) {
      startCamera();
    } else {
      stopCamera();
      setDetectorStatus('stopped');
    }

    return () => {
      isMountedRef.current = false;
      stopCamera();
    };
  }, [capturedImage, startCamera, stopCamera]);

  return (
    <div className="space-y-3">
      {/* Hidden File Input for Image Upload Option */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept="image/png, image/jpeg, image/webp"
        className="hidden"
      />

      {/* If already captured during registration, show photo badge preview */}
      {capturedImage && mode === 'register' ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-5 rounded-2xl bg-emerald-950/40 border-2 border-emerald-500/40 text-center space-y-4 shadow-xl"
        >
          <div className="relative w-36 h-36 mx-auto rounded-2xl overflow-hidden border-2 border-emerald-400 shadow-2xl shadow-emerald-500/30 group">
            <img src={capturedImage} alt="Enrolled Face Photo" className="w-full h-full object-cover" />
            <div className="absolute top-2 right-2 p-1 bg-emerald-500 text-black rounded-full shadow-lg">
              <CheckCircle2 size={16} />
            </div>
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={handleRetake}
                className="p-2 bg-emerald-500 text-black rounded-full shadow-lg hover:scale-110 transition-transform"
                title="Retake Photo"
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </div>

          <div>
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30">
              <CheckCircle2 size={14} /> Face Photo Enrolled & Biometrics Cached
            </div>
            <p className="text-[11px] text-white/60 mt-1">This official photo & facial landmark geometry will be verified during login.</p>
          </div>

          {/* Action buttons when photo is captured */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleRetake}
              className="px-4 py-2.5 bg-emerald-600/30 hover:bg-emerald-600 text-emerald-200 hover:text-white rounded-xl text-xs font-bold transition-all inline-flex items-center gap-2 border border-emerald-500/40 shadow-sm cursor-pointer"
            >
              <Camera size={14} /> Retake Face Photo
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2.5 bg-white/10 hover:bg-white/15 text-white/80 hover:text-white rounded-xl text-xs font-semibold transition-all inline-flex items-center gap-2 border border-white/10 cursor-pointer"
            >
              <Upload size={14} /> Upload Different Photo
            </button>

            {onResetCapture && (
              <button
                type="button"
                onClick={onResetCapture}
                className="px-3 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-300 rounded-xl text-xs font-semibold transition-all inline-flex items-center gap-1.5 border border-red-500/20"
                title="Delete Enrolled Photo"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </motion.div>
      ) : (
        /* Live Camera Scanner View */
        <div className="space-y-3">
          <div className="relative w-full aspect-[4/3] bg-black/90 rounded-2xl overflow-hidden border border-white/20 shadow-2xl flex items-center justify-center">
            {/* Live Video */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
            />

            {/* Landmarks Canvas Overlay */}
            <canvas
              ref={canvasRef}
              className="absolute inset-0 pointer-events-none scale-x-[-1] w-full h-full"
            />

            {/* Target Reticle Oval */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div 
                className={`w-44 h-56 rounded-[50%] border-2 transition-all duration-300 ${
                  detectedFacesCount === 1 
                    ? enrolledFacePhoto 
                      ? matchResult
                        ? matchResult.isMatch 
                          ? 'border-emerald-400/90 shadow-[0_0_30px_rgba(16,185,129,0.35)]' 
                          : 'border-red-500/90 shadow-[0_0_30px_rgba(239,68,68,0.4)]'
                        : 'border-indigo-400/90 shadow-[0_0_30px_rgba(99,102,241,0.35)]'
                      : 'border-indigo-400/90 shadow-[0_0_30px_rgba(99,102,241,0.35)]'
                    : detectedFacesCount > 1 
                      ? 'border-red-400/90' 
                      : 'border-white/30 border-dashed animate-pulse'
                }`} 
              />
            </div>

            {/* Flash Effect overlay when capturing */}
            {flashEffect && (
              <div className="absolute inset-0 bg-white z-30 animate-out fade-out duration-200 pointer-events-none" />
            )}

            {/* Countdown Overlay */}
            {countdown !== null && (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-20 flex flex-col items-center justify-center space-y-2 pointer-events-none">
                <motion.div
                  key={countdown}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1.2, opacity: 1 }}
                  exit={{ scale: 1.5, opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="text-6xl font-black text-white drop-shadow-[0_0_20px_#10b981]"
                >
                  {countdown}
                </motion.div>
                <p className="text-xs font-bold text-emerald-300 uppercase tracking-widest">Hold still & look at camera</p>
              </div>
            )}

            {/* Scanning Radar Line Animation in Authenticate Mode */}
            {mode === 'authenticate' && detectorStatus === 'active' && (
              <motion.div
                initial={{ top: '15%' }}
                animate={{ top: ['15%', '85%', '15%'] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                className={`absolute left-8 right-8 h-0.5 bg-gradient-to-r from-transparent ${
                  matchResult?.isMatch === false ? 'via-red-400 shadow-[0_0_12px_#f87171]' : 'via-indigo-400 shadow-[0_0_12px_#818cf8]'
                } to-transparent pointer-events-none`}
              />
            )}

            {/* Top Status Pill & Manual Toggle */}
            <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none z-10">
              <div className="flex items-center gap-1.5 pointer-events-auto">
                <div className="px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/15 text-[10px] font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${detectorStatus === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                  {mode === 'register' ? 'Face Enrollment' : 'Biometric Auth'}
                </div>
                {/* OpenCV WebAssembly Real-Time Vision Status Badge */}
                <div 
                  className={`px-2 py-0.5 rounded-full border text-[9px] font-mono font-bold flex items-center gap-1 transition-all ${
                    openCvMetrics.isLoaded 
                      ? 'bg-blue-950/80 border-blue-400/40 text-blue-300' 
                      : 'bg-black/60 border-white/10 text-white/40'
                  }`}
                  title={openCvMetrics.isLoaded ? `OpenCV WASM: Sharpness ${openCvMetrics.sharpnessScore} | Brightness ${openCvMetrics.averageBrightness} | Contrast ${openCvMetrics.contrastRatio}` : 'OpenCV WASM loading...'}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${openCvMetrics.isLoaded ? 'bg-blue-400 animate-ping' : 'bg-white/30'}`} />
                  <span>OpenCV.js {openCvMetrics.isLoaded ? 'Active' : 'CV'}</span>
                  {openCvMetrics.isLoaded && !openCvMetrics.isSharpEnough && (
                    <span className="text-amber-400 text-[8px] font-sans font-semibold ml-0.5">• Blurry</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 pointer-events-auto">
                <div className={`px-2.5 py-1 rounded-full backdrop-blur-md border text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                  detectedFacesCount === 1 
                    ? enrolledFacePhoto 
                      ? matchResult
                        ? matchResult.isMatch 
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' 
                          : 'bg-red-500/20 text-red-300 border-red-500/30'
                        : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                      : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                    : detectedFacesCount > 1 
                      ? 'bg-red-500/20 text-red-300 border-red-500/30'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                }`}>
                  {detectedFacesCount === 1 ? (
                    enrolledFacePhoto ? (
                      matchResult ? (
                        matchResult.isMatch ? (
                          <>
                            <UserCheck size={12} /> Biometric Match ({matchResult.similarityScore}%) ✓
                          </>
                        ) : (
                          <>
                            <UserX size={12} /> Face Mismatch ({matchResult.similarityScore}%)
                          </>
                        )
                      ) : (
                        <>
                          <Scan size={12} className="animate-spin" /> Verifying Biometrics...
                        </>
                      )
                    ) : mode === 'register' ? (
                      <>
                        <UserCheck size={12} /> 1 Face Detected
                      </>
                    ) : (
                      <>
                        <AlertTriangle size={12} /> Profile Not Enrolled
                      </>
                    )
                  ) : detectedFacesCount > 1 ? (
                    <>
                      <AlertTriangle size={12} /> {detectedFacesCount} Faces
                    </>
                  ) : (
                    <>
                      <Scan size={12} /> Align Face
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleManualToggleCamera}
                  className="p-1.5 bg-black/70 hover:bg-black/90 border border-white/20 text-white/70 hover:text-white rounded-full transition-all cursor-pointer"
                  title={detectorStatus === 'active' ? 'Turn Off Camera' : 'Turn On Camera'}
                >
                  {detectorStatus === 'active' ? <CameraOff size={13} className="text-red-400" /> : <Camera size={13} className="text-emerald-400" />}
                </button>
              </div>
            </div>

            {/* Quick Shutter Button Directly on Viewport */}
            {mode === 'register' && detectorStatus === 'active' && countdown === null && (
              <div className="absolute bottom-4 inset-x-0 flex items-center justify-center gap-3 z-10">
                <button
                  type="button"
                  onClick={startCountdownCapture}
                  className="px-3 py-1.5 bg-black/70 hover:bg-black/90 text-white text-[11px] font-bold rounded-full border border-white/20 backdrop-blur-md flex items-center gap-1.5 shadow-lg transition-transform active:scale-95 cursor-pointer"
                  title="Take photo in 3 seconds"
                >
                  <Timer size={13} className="text-amber-400" /> 3s Timer
                </button>

                <button
                  type="button"
                  onClick={handleCaptureSnapshot}
                  disabled={isCapturing}
                  className="w-14 h-14 rounded-full bg-white/90 hover:bg-white text-black p-1 shadow-2xl flex items-center justify-center border-4 border-emerald-500 hover:scale-105 active:scale-95 transition-all cursor-pointer"
                  title="Click to Take Photo Now"
                >
                  <div className="w-10 h-10 rounded-full bg-emerald-500 hover:bg-emerald-400 flex items-center justify-center text-white transition-colors">
                    <Camera size={20} />
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 bg-black/70 hover:bg-black/90 text-white text-[11px] font-bold rounded-full border border-white/20 backdrop-blur-md flex items-center gap-1.5 shadow-lg transition-transform active:scale-95 cursor-pointer"
                  title="Upload image file"
                >
                  <Upload size={13} className="text-indigo-400" /> Upload
                </button>
              </div>
            )}

            {/* Stopped / Inactive Overlay */}
            {detectorStatus === 'stopped' && (
              <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md p-4 flex flex-col items-center justify-center text-center space-y-3 z-10">
                <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40">
                  <CameraOff size={24} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">
                    {mode === 'register' ? 'Camera is Ready' : 'Camera is Turned Off'}
                  </h4>
                  <p className="text-xs text-white/50 max-w-xs mt-0.5">
                    {mode === 'register'
                      ? 'Click below to open camera and take your student photo.'
                      : 'Click below to enable live face scanning for authentication.'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={startCamera}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-emerald-600/30 cursor-pointer"
                  >
                    <Camera size={14} /> {mode === 'register' ? 'Open Camera & Take Photo' : 'Turn On Camera & Scan Face'}
                  </button>
                  {mode === 'register' && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2.5 bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 border border-white/10 cursor-pointer"
                    >
                      <Upload size={14} /> Upload Photo
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Error Overlay */}
            {detectorStatus === 'error' && (
              <div className="absolute inset-0 bg-black/90 backdrop-blur-md p-4 flex flex-col items-center justify-center text-center space-y-3 z-10">
                <AlertTriangle size={32} className="text-amber-400" />
                <p className="text-xs font-semibold text-white/90 max-w-xs">{errorMessage || 'Camera access needed for face verification.'}</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={startCamera}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw size={13} /> Grant Camera & Retry
                  </button>
                  {mode === 'register' && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Upload size={13} /> Upload Photo File
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Action options below camera for Registration Mode */}
          {mode === 'register' && (
            <div className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isCapturing}
                  onClick={handleCaptureSnapshot}
                  className={`py-3.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer ${
                    detectedFacesCount === 1 
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-600/30' 
                      : 'bg-emerald-600/80 hover:bg-emerald-600 text-white shadow-md'
                  }`}
                >
                  {isCapturing ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Capturing Photo & Encoding Biometrics...
                    </>
                  ) : (
                    <>
                      <Camera size={16} /> 
                      <span>Take Photo Now</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="py-3.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 text-white border border-white/15 shadow-sm cursor-pointer"
                >
                  <Upload size={15} className="text-emerald-400" />
                  <span>Upload Photo from Device</span>
                </button>
              </div>

              {/* Helper hint text */}
              <div className="flex items-center justify-between text-[10px] text-white/50 px-1">
                <span>Look straight into the camera and click <strong>Take Photo Now</strong>.</span>
                {detectedFacesCount === 1 && (
                  <span className="text-emerald-400 font-bold shrink-0 ml-2">✓ Face Aligned</span>
                )}
              </div>
            </div>
          )}

          {/* Helper hint & Match Status for Login Mode */}
          {mode === 'authenticate' && (
            <div className="space-y-2">
              {enrolledFacePhoto ? (
                matchResult ? (
                  matchResult.isMatch ? (
                    // GENUINE BIOMETRIC MATCH
                    <div className="p-3.5 rounded-2xl bg-emerald-950/40 border-2 border-emerald-500/50 flex items-center justify-between gap-3 shadow-lg shadow-emerald-950/40">
                      <div className="flex items-center gap-3">
                        <div className="relative w-12 h-12 rounded-xl overflow-hidden border-2 border-emerald-400 shrink-0">
                          <img 
                            src={enrolledFacePhoto} 
                            alt="Enrolled Student" 
                            className="w-full h-full object-cover" 
                          />
                          <div className="absolute top-0.5 right-0.5 p-0.5 bg-emerald-500 text-black rounded-full">
                            <CheckCircle2 size={10} />
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white flex items-center gap-1.5">
                            <span>{studentName || 'Registered Student'}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 bg-white/10 rounded text-emerald-300 font-semibold">
                              {studentRollNo}
                            </span>
                          </div>
                          <div className="text-[11px] text-emerald-400 font-bold flex items-center gap-1 mt-0.5">
                            <Sparkles size={12} />
                            <span>Biometric Profile Matched ({matchResult.similarityScore}%)</span>
                          </div>
                          <p className="text-[10px] text-emerald-300/70 font-medium mt-0.5">
                            {matchResult.confidenceText} • Identity Confirmed
                            {openCvMetrics.isLoaded && (
                              <span className="text-blue-300 font-mono ml-1.5">• OpenCV: {openCvMetrics.isSharpEnough ? 'Sharp Focus' : 'Blurry'} (L:{openCvMetrics.sharpnessScore})</span>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/40 flex items-center gap-1">
                          <ShieldCheck size={12} /> Verified
                        </span>
                      </div>
                    </div>
                  ) : (
                    // SEVERE BIOMETRIC MISMATCH (DIFFERENT PERSON DETECTED)
                    <div className="p-3.5 rounded-2xl bg-red-950/60 border-2 border-red-500/60 flex items-center justify-between gap-3 shadow-xl shadow-red-950/50">
                      <div className="flex items-center gap-3">
                        <div className="relative w-12 h-12 rounded-xl overflow-hidden border-2 border-red-500 shrink-0">
                          <img 
                            src={enrolledFacePhoto} 
                            alt="Enrolled Student" 
                            className="w-full h-full object-cover opacity-70" 
                          />
                          <div className="absolute top-0.5 right-0.5 p-0.5 bg-red-600 text-white rounded-full">
                            <XCircle size={10} />
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white flex items-center gap-1.5">
                            <span>{studentName || 'Registered Student'}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 bg-red-500/20 text-red-300 font-semibold rounded">
                              {studentRollNo}
                            </span>
                          </div>
                          <div className="text-[11px] text-red-400 font-bold flex items-center gap-1 mt-0.5">
                            <AlertOctagon size={13} className="text-red-400" />
                            <span>Biometric Mismatch ({matchResult.similarityScore}%)</span>
                          </div>
                          <p className="text-[10px] text-red-300/80 font-semibold mt-0.5">
                            ⚠️ Different person in front of camera! Face does not match profile.
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="px-2.5 py-1 rounded-full bg-red-500/20 text-red-400 text-[10px] font-black border border-red-500/40 flex items-center gap-1">
                          <UserX size={12} /> Rejected
                        </span>
                      </div>
                    </div>
                  )
                ) : (
                  // Analyzing / Loading Enrolled Descriptor
                  <div className="p-3 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 text-xs text-indigo-200">
                      <div className="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin shrink-0" />
                      <span>{isExtractingEnrolled ? 'Loading biometric model...' : 'Aligning face for comparison...'}</span>
                    </div>
                    <span className="text-[10px] font-mono text-white/50">{studentRollNo}</span>
                  </div>
                )
              ) : (
                <div className="flex items-center justify-between p-3 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-xs">
                  <div className="flex items-center gap-2 text-amber-200">
                    <AlertTriangle size={16} className="text-amber-400 shrink-0" />
                    <div>
                      <div className="font-bold text-[11px] text-amber-300">Biometric Profile Not Enrolled</div>
                      <div className="text-[10px] text-amber-300/80 mt-0.5">
                        {studentRollNo ? `Roll No "${studentRollNo}" has no face registered.` : 'Enter a registered Roll Number to load face profile.'}
                      </div>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 bg-amber-500/20 text-amber-300 text-[10px] font-bold rounded-full border border-amber-500/40 shrink-0">
                    Enrollment Needed
                  </span>
                </div>
              )}

              <p className="text-[10px] text-white/40 text-center">
                Look directly into camera. Click <strong>Authenticate Face & Enter Exam</strong> to proceed.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

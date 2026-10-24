import React, { useRef, useEffect, useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import { useExam } from '../ExamContext';
import { Camera, AlertCircle, UserCheck, UserMinus, Users, Activity, Volume2, VolumeX, Mic, ShieldAlert, Sparkles, UserX } from 'lucide-react';
import { getViolationInfo } from '../utils/violationFormatter';
import { preloadAiModels } from '../utils/aiProctorService';
import { 
  extractBiometricFeatureVector, 
  compareBiometricDescriptors,
  extractDescriptorFromImage 
} from '../utils/faceBiometrics';
import { extractFaceBiometrics, verifyBiometricIdentity, isModelReady } from '../utils/faceRecognitionService';
import { db } from '../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

export const CameraMonitor: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { 
    logViolation, 
    setIsFaceDetected, 
    faceCount, 
    setFaceCount, 
    violations,
    autoSubmitExamOnElectronicDevice,
    disqualification,
    currentAnswers,
    setIsAiActive,
    setAiStatus,
    user,
    sessionId,
    students,
    isIdentitySuspended,
    setIsIdentitySuspended,
    setIdentityStatusMessage,
    setIdentityMatchScore
  } = useExam();
  const [status, setStatus] = useState<'loading' | 'active' | 'error' | 'terminated'>('loading');
  const [isTalkingDetected, setIsTalkingDetected] = useState<boolean>(false);
  
  // Real Continuous Biometric Identity Tracking State
  const [biometricMatch, setBiometricMatch] = useState<{
    isMatch: boolean;
    score: number;
    status: 'checking' | 'verified' | 'mismatch' | 'no_face' | 'no_profile';
    message: string;
  }>({
    isMatch: true,
    score: 100,
    status: 'checking',
    message: 'Verifying identity.'
  });
  const [isMismatchEscalated, setIsMismatchEscalated] = useState(false);
  const enrolledDescriptorRef = useRef<number[] | null>(user?.faceDescriptor || null);
  const consecutiveMismatchRef = useRef<number>(0);
  const lastBiometricCheckRef = useRef<number>(0);

  const lastViolationRef = useRef<Record<string, number>>({});
  const logViolationRef = useRef(logViolation);
  useEffect(() => {
    logViolationRef.current = logViolation;
  }, [logViolation]);
  const missingFaceFramesRef = useRef<number>(0);
  const detectorRef = useRef<any>(null);
  const objectDetectorRef = useRef<cocoSsd.ObjectDetection | null>(null);
  const statusRef = useRef<'loading' | 'active' | 'error' | 'terminated'>('loading');
  const faceCountHistoryRef = useRef<number[]>([]);
  const lastSentFaceCountRef = useRef<number>(-1);
  const lastFacePositionRef = useRef<{ x: number, y: number } | null>(null);
  const movementHistoryRef = useRef<number[]>([]);
  const electronicDeviceAutoSubmittedRef = useRef<boolean>(false);
  const SMOOTHING_WINDOW = 20;

  const ELECTRONIC_DEVICE_CLASSES = ['cell phone', 'laptop', 'remote', 'tv', 'mouse', 'keyboard'];

  const isMountedRef = useRef<boolean>(true);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const detectionAnimFrameRef = useRef<number | null>(null);
  const audioAnimFrameRef = useRef<number | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const speechFramesAccumulatorRef = useRef<number>(0);
  const ambientNoiseFloorRef = useRef<number>(10);
  const talkingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Robust Biometric Template Resolution for Authenticated Student
  useEffect(() => {
    let isCancelled = false;

    const resolveEnrolledTemplate = async () => {
      // 1. Direct from user session object
      if (user?.faceDescriptor && user.faceDescriptor.length === 128) {
        enrolledDescriptorRef.current = user.faceDescriptor;
        console.log('[Dharmastra] Bound 128D template from active user session:', user.rollNo || user.id);
        return;
      }

      const roll = (user?.rollNo || user?.id || '').trim().toUpperCase();

      // 2. From cached students array in memory
      if (roll && students && students.length > 0) {
        const found = students.find(s => s.rollNo.trim().toUpperCase() === roll);
        if (found?.faceDescriptor && found.faceDescriptor.length === 128) {
          enrolledDescriptorRef.current = found.faceDescriptor;
          console.log('[Dharmastra] Bound 128D template from student memory cache:', roll);
          return;
        }
      }

      // 3. From Firestore students/{roll}
      if (roll) {
        try {
          const snap = await getDoc(doc(db, 'students', roll));
          if (snap.exists() && !isCancelled) {
            const data = snap.data();
            if (data?.faceDescriptor && data.faceDescriptor.length === 128) {
              enrolledDescriptorRef.current = data.faceDescriptor;
              console.log('[Dharmastra] Bound 128D template from Firestore students collection:', roll);
              return;
            } else if (data?.faceSnapshot) {
              const res = await extractFaceBiometrics(data.faceSnapshot, { scoreThreshold: 0.45 });
              if (res.descriptor && res.descriptor.length === 128 && !isCancelled) {
                enrolledDescriptorRef.current = res.descriptor;
                console.log('[Dharmastra] Extracted 128D template from Firestore student faceSnapshot:', roll);
                return;
              }
            }
          }
        } catch (fetchErr) {
          console.warn('[Dharmastra] Firestore student doc fetch note:', fetchErr);
        }
      }

      // 4. From user.faceSnapshot fallback
      if (user?.faceSnapshot && !isCancelled) {
        try {
          const res = await extractFaceBiometrics(user.faceSnapshot, { scoreThreshold: 0.45 });
          if (res.descriptor && res.descriptor.length === 128 && !isCancelled) {
            enrolledDescriptorRef.current = res.descriptor;
            console.log('[Dharmastra] Extracted 128D template from session faceSnapshot:', roll);
          }
        } catch (e) {
          console.warn('[Dharmastra] Session faceSnapshot extraction error:', e);
        }
      }
    };

    resolveEnrolledTemplate();

    return () => {
      isCancelled = true;
    };
  }, [user, students]);

  const stopCameraAndAudio = () => {
    statusRef.current = 'error';
    setIsAiActive(false);
    if (detectionAnimFrameRef.current) {
      cancelAnimationFrame(detectionAnimFrameRef.current);
      detectionAnimFrameRef.current = null;
    }
    if (audioAnimFrameRef.current) {
      cancelAnimationFrame(audioAnimFrameRef.current);
      audioAnimFrameRef.current = null;
    }
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch (e) {
        // ignore speechRecognition stop errors
      }
      speechRecognitionRef.current = null;
    }
    if (talkingTimeoutRef.current) {
      clearTimeout(talkingTimeoutRef.current);
      talkingTimeoutRef.current = null;
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
    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close().catch(() => {});
        }
      } catch (e) {
        console.warn('AudioContext close error:', e);
      }
      audioContextRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const setupCamera = async () => {
    stopCameraAndAudio();
    setStatus('loading');
    statusRef.current = 'loading';
    setAiStatus('loading');
    setIsAiActive(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480, facingMode: 'user' }, 
        audio: true 
      });

      if (!isMountedRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.warn('Video play error:', playErr);
        }
      }
      setupAudioAnalysis(stream);
      await setupDetector();
    } catch (err) {
      console.error("Camera Error:", err);
      if (isMountedRef.current) {
        setStatus('error');
        statusRef.current = 'error';
        setIsFaceDetected(false);
      }
    }
  };

  const triggerTalkingViolation = (reason: string, details: any = {}) => {
    const now = Date.now();
    if (!lastViolationRef.current['BACKGROUND_TALKING'] || now - lastViolationRef.current['BACKGROUND_TALKING'] > 8000) {
      const screenshot = captureScreenshot('BACKGROUND_TALKING');
      logViolationRef.current('BACKGROUND_TALKING', { ...details, reason, screenshot });
      lastViolationRef.current['BACKGROUND_TALKING'] = now;
      
      setIsTalkingDetected(true);
      if (talkingTimeoutRef.current) clearTimeout(talkingTimeoutRef.current);
      talkingTimeoutRef.current = setTimeout(() => {
        setIsTalkingDetected(false);
      }, 4000);
    }
  };

  const setupAudioAnalysis = (stream: MediaStream) => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      let loudStartTime = 0;
      const LOUD_THRESHOLD = 160; // Threshold for extreme sound/loud spike

      const checkAudio = () => {
        if (!isMountedRef.current || !streamRef.current) return;

        if (statusRef.current !== 'active') {
          if (isMountedRef.current && streamRef.current) {
            audioAnimFrameRef.current = requestAnimationFrame(checkAudio);
          }
          return;
        }

        try {
          analyser.getByteFrequencyData(dataArray);

          // 1. Calculate Human Vocal Band Energy (~100Hz to ~3500Hz, bins 1 to 40)
          let vocalSum = 0;
          let vocalBins = 0;
          const endVocalBin = Math.min(bufferLength - 1, 40);
          for (let i = 1; i <= endVocalBin; i++) {
            vocalSum += dataArray[i];
            vocalBins++;
          }
          const vocalEnergy = vocalSum / (vocalBins || 1);

          // Overall full spectrum average
          const fullAverage = dataArray.reduce((a, b) => a + b, 0) / bufferLength;

          // 2. Track Adaptive Ambient Noise Floor
          if (vocalEnergy < ambientNoiseFloorRef.current + 10) {
            ambientNoiseFloorRef.current = ambientNoiseFloorRef.current * 0.96 + vocalEnergy * 0.04;
            ambientNoiseFloorRef.current = Math.max(4, Math.min(32, ambientNoiseFloorRef.current));
          }

          // 3. Detect Background People Talking / Voice Sound
          // Voice activity occurs when vocal energy exceeds the ambient noise baseline significantly
          const voiceThreshold = Math.max(18, ambientNoiseFloorRef.current + 12);
          if (vocalEnergy > voiceThreshold) {
            speechFramesAccumulatorRef.current += 1;
            // Approx 20 frames of speech activity registered (~600-800ms of conversational sound)
            if (speechFramesAccumulatorRef.current >= 20) {
              triggerTalkingViolation('Background person or people talking sound detected', {
                intensity: Math.round(vocalEnergy),
                noiseFloor: Math.round(ambientNoiseFloorRef.current)
              });
              speechFramesAccumulatorRef.current = 0;
            }
          } else {
            // Decay accumulator smoothly between natural speech pauses
            speechFramesAccumulatorRef.current = Math.max(0, speechFramesAccumulatorRef.current - 0.4);
          }

          // 4. Detect Sudden Loud Audio Spikes (e.g. shouting, slamming, loud noise)
          if (fullAverage > LOUD_THRESHOLD) {
            if (loudStartTime === 0) {
              loudStartTime = Date.now();
            } else if (Date.now() - loudStartTime > 2000) {
              const now = Date.now();
              if (!lastViolationRef.current['LOUD_AUDIO'] || now - lastViolationRef.current['LOUD_AUDIO'] > 12000) {
                const screenshot = captureScreenshot('LOUD_AUDIO');
                logViolationRef.current('LOUD_AUDIO', { intensity: Math.round(fullAverage), screenshot });
                lastViolationRef.current['LOUD_AUDIO'] = now;
              }
              loudStartTime = Date.now();
            }
          } else {
            loudStartTime = 0;
          }
        } catch (e) {
          // ignore audio transient frames
        }
        
        if (isMountedRef.current && streamRef.current) {
          audioAnimFrameRef.current = requestAnimationFrame(checkAudio);
        }
      };

      audioAnimFrameRef.current = requestAnimationFrame(checkAudio);

      // 5. Native Speech Recognition Integration (Browser Speech API for conversation detection)
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition && !speechRecognitionRef.current) {
        try {
          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = 'en-US';

          recognition.onresult = (event: any) => {
            if (statusRef.current !== 'active' || !isMountedRef.current) return;
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
              interimTranscript += event.results[i][0].transcript;
            }
            const clean = interimTranscript.trim();
            if (clean.length > 1) {
              triggerTalkingViolation('People talking / conversation detected', {
                transcript: clean
              });
            }
          };

          recognition.onerror = () => {
            // Non-blocking fallback to audio analyser
          };

          recognition.onend = () => {
            if (isMountedRef.current && statusRef.current === 'active') {
              try { recognition.start(); } catch (_) {}
            }
          };

          recognition.start();
          speechRecognitionRef.current = recognition;
        } catch (speechErr) {
          console.warn('SpeechRecognition initialization note:', speechErr);
        }
      }
    } catch (audioErr) {
      console.warn('Audio analysis setup error:', audioErr);
    }
  };

  const setupDetector = async () => {
    try {
      const { faceDetector, objectDetector } = await preloadAiModels();
      detectorRef.current = faceDetector;
      objectDetectorRef.current = objectDetector;
      
      setStatus('active');
      statusRef.current = 'active';
      setAiStatus('active');
      setIsAiActive(true);
      detect();
    } catch (err) {
      console.error("Detector Error:", err);
      setStatus('error');
      statusRef.current = 'error';
      setAiStatus('error');
      setIsAiActive(false);
    }
  };

  const captureScreenshot = (violationType?: string) => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = 480;
      canvas.height = 360;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Draw current student video frame
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

        const info = violationType ? getViolationInfo(violationType) : { title: 'Exam Mistake' };
        const titleText = (info.title || 'MISTAKE DETECTED').toUpperCase();

        // Top Red Violation Banner
        ctx.fillStyle = 'rgba(185, 28, 28, 0.95)';
        ctx.fillRect(0, 0, canvas.width, 30);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.fillText(`🚨 MISTAKE COMMITTED: ${titleText}`, 10, 19);

        // Timestamp on top right
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.fillText(new Date().toLocaleTimeString(), canvas.width - 75, 19);

        // Red Outer Frame
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 4;
        ctx.strokeRect(0, 0, canvas.width, canvas.height);

        return canvas.toDataURL('image/jpeg', 0.65);
      }
    }
    return null;
  };

  const captureElectronicDeviceViolationScreenshot = (deviceBbox?: number[], deviceClass?: string) => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = 480;
      canvas.height = 360;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Draw video frame
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

        const deviceName = (deviceClass || 'ELECTRONIC DEVICE').toUpperCase();

        // Draw electronic device bounding box scaled to canvas dimensions
        if (deviceBbox && videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0) {
          const scaleX = canvas.width / videoRef.current.videoWidth;
          const scaleY = canvas.height / videoRef.current.videoHeight;
          const bx = deviceBbox[0] * scaleX;
          const by = deviceBbox[1] * scaleY;
          const bw = deviceBbox[2] * scaleX;
          const bh = deviceBbox[3] * scaleY;

          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 4;
          ctx.strokeRect(bx, by, bw, bh);

          ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
          ctx.fillRect(bx, by, bw, bh);

          ctx.fillStyle = '#ef4444';
          ctx.fillRect(bx, Math.max(0, by - 22), 240, 22);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 11px Inter, sans-serif';
          ctx.fillText(`PROHIBITED ${deviceName} DETECTED`, bx + 6, Math.max(15, by - 6));
        }

        // Add header banner
        ctx.fillStyle = 'rgba(185, 28, 28, 0.95)';
        ctx.fillRect(0, 0, canvas.width, 28);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.fillText(`🚨 ELECTRONIC DEVICE USED • TRUST SCORE: 30% • ${new Date().toLocaleTimeString()}`, 10, 18);

        return canvas.toDataURL('image/jpeg', 0.7);
      }
    }
    return captureScreenshot('ELECTRONIC_DEVICE_USAGE');
  };

  const handleElectronicDeviceDisqualification = async (deviceBbox?: number[], deviceClass?: string) => {
    if (electronicDeviceAutoSubmittedRef.current) return;
    electronicDeviceAutoSubmittedRef.current = true;
    setStatus('terminated');
    statusRef.current = 'terminated';

    const evidenceImage = captureElectronicDeviceViolationScreenshot(deviceBbox, deviceClass);
    
    // Stop recording and camera to ensure student cannot continue
    stopCameraAndAudio();

    // Auto-submit and persist disqualification with trust score 30
    await autoSubmitExamOnElectronicDevice(evidenceImage, currentAnswers, deviceClass || 'cell phone');
  };

  const detect = async () => {
    if (disqualification?.isDisqualified || electronicDeviceAutoSubmittedRef.current) {
      stopCameraAndAudio();
      return;
    }

    if (detectorRef.current && objectDetectorRef.current && videoRef.current && videoRef.current.readyState === 4) {
      try {
        // Run both detectors
        const [faces, objects] = await Promise.all([
          detectorRef.current.estimateFaces(videoRef.current),
          objectDetectorRef.current.detect(videoRef.current)
        ]);

        // CRITICAL CHECK: Check for any electronic devices (phone, laptop, remote, tv, etc.)
        const electronicDeviceObj = objects.find((obj: any) => 
          ELECTRONIC_DEVICE_CLASSES.includes(obj.class) && obj.score >= 0.45
        );

        if (electronicDeviceObj && !electronicDeviceAutoSubmittedRef.current) {
          console.warn("Electronic device detected during exam! Triggering auto-submit & termination to score 30:", electronicDeviceObj);
          await handleElectronicDeviceDisqualification(electronicDeviceObj.bbox, electronicDeviceObj.class);
          return;
        }

        // Count detected faces and persons from vision models
        const personsCount = objects.filter((obj: any) => obj.class === 'person' && obj.score > 0.5).length;
        const facesCount = faces.length;
        const rawFaceCount = Math.max(facesCount, personsCount);

        let smoothedFaceCount = rawFaceCount;
        // If multiple faces/persons detected, report immediately without smoothing lag
        if (rawFaceCount > 1) {
          faceCountHistoryRef.current = [rawFaceCount];
          smoothedFaceCount = rawFaceCount;
        } else {
          faceCountHistoryRef.current.push(rawFaceCount);
          if (faceCountHistoryRef.current.length > SMOOTHING_WINDOW) {
            faceCountHistoryRef.current.shift();
          }

          // Calculate the mode (most frequent value) for stability when 0 or 1
          const frequencyMap: Record<number, number> = {};
          faceCountHistoryRef.current.forEach(count => {
            frequencyMap[count] = (frequencyMap[count] || 0) + 1;
          });

          let maxFreq = 0;
          for (const count in frequencyMap) {
            if (frequencyMap[count] > maxFreq) {
              maxFreq = frequencyMap[count];
              smoothedFaceCount = parseInt(count);
            }
          }
        }

        if (smoothedFaceCount !== lastSentFaceCountRef.current) {
          setFaceCount(smoothedFaceCount);
          lastSentFaceCountRef.current = smoothedFaceCount;
        }
        const currentFaceCount = smoothedFaceCount;

        const now = Date.now();
        const throttle = (type: string, delay: number, details: any = {}) => {
          if (!lastViolationRef.current[type] || now - lastViolationRef.current[type] > delay) {
            const screenshot = captureScreenshot(type);
            logViolationRef.current(type, { ...details, screenshot });
            lastViolationRef.current[type] = now;
          }
        };

        const personDetected = objects.some((obj: any) => obj.class === 'person' && obj.score > 0.6);

        // Movement Detection
        if (currentFaceCount === 1) {
          const face = faces[0];
          const centerX = face.box.xMin + face.box.width / 2;
          const centerY = face.box.yMin + face.box.height / 2;

          if (lastFacePositionRef.current) {
            const dist = Math.sqrt(
              Math.pow(centerX - lastFacePositionRef.current.x, 2) +
              Math.pow(centerY - lastFacePositionRef.current.y, 2)
            );
            movementHistoryRef.current.push(dist);
            if (movementHistoryRef.current.length > 30) movementHistoryRef.current.shift();

            const avgMovement = movementHistoryRef.current.reduce((a, b) => a + b, 0) / movementHistoryRef.current.length;
            if (avgMovement > 50) { // High movement threshold
              throttle('EXCESSIVE_MOVEMENT', 10000);
            }
          }
          lastFacePositionRef.current = { x: centerX, y: centerY };
        } else {
          lastFacePositionRef.current = null;
        }

        // ------------------ REAL CONTINUOUS BIOMETRIC FACE RECOGNITION ------------------
        if (now - lastBiometricCheckRef.current > 800) {
          lastBiometricCheckRef.current = now;
          try {
            if (!videoRef.current || videoRef.current.readyState < 2) {
              setBiometricMatch(prev => ({ ...prev, status: 'no_face', message: 'Camera unavailable.' }));
              setIdentityStatusMessage('Camera unavailable.');
            } else if (!isModelReady()) {
              setBiometricMatch(prev => ({ ...prev, status: 'checking', message: 'Recognition model unavailable.' }));
              setIdentityStatusMessage('Recognition model unavailable.');
            } else {
              // Extract frame via offscreen canvas to prevent video frame drops
              const offCanvas = document.createElement('canvas');
              offCanvas.width = 320;
              offCanvas.height = 240;
              const offCtx = offCanvas.getContext('2d');
              if (offCtx && videoRef.current) {
                offCtx.drawImage(videoRef.current, 0, 0, 320, 240);
              }

              const deepRes = await extractFaceBiometrics(offCanvas, { useFastTiny: true, scoreThreshold: 0.45 });

              if (deepRes.faceCount === 0) {
                setBiometricMatch(prev => ({ ...prev, status: 'no_face', message: 'No face detected.' }));
                setIdentityStatusMessage('No face detected.');
              } else if (deepRes.faceCount > 1) {
                setBiometricMatch(prev => ({ ...prev, status: 'mismatch', message: 'Multiple faces detected.' }));
                setIdentityStatusMessage('Multiple faces detected.');
              } else if (deepRes.faceCount === 1 && deepRes.descriptor) {
                if (!enrolledDescriptorRef.current) {
                  setBiometricMatch(prev => ({ ...prev, status: 'checking', message: 'Verification temporarily inconclusive.' }));
                  setIdentityStatusMessage('Verification temporarily inconclusive.');
                } else {
                  // Verify live 128D descriptor against authenticated student's enrolled 128D template
                  const comp = verifyBiometricIdentity(deepRes.descriptor, enrolledDescriptorRef.current, 0.48);

                  if (comp.isMatch) {
                    consecutiveMismatchRef.current = 0;
                    setIsMismatchEscalated(false);
                    setIsIdentitySuspended(false);
                    setBiometricMatch({
                      isMatch: true,
                      score: comp.similarityScore,
                      status: 'verified',
                      message: 'Identity verified.'
                    });
                    setIdentityStatusMessage('Identity verified.');
                    setIdentityMatchScore(comp.similarityScore);

                    // Periodically update session status to verified
                    if (sessionId && now % 10000 < 900) {
                      updateDoc(doc(db, 'sessions', sessionId), {
                        identityVerificationStatus: 'verified',
                        identityMatchScore: comp.similarityScore,
                        isIdentitySuspended: false,
                        lastHeartbeat: new Date().toISOString()
                      }).catch(() => {});
                    }
                  } else {
                    // Confirmed Identity Mismatch
                    consecutiveMismatchRef.current += 1;
                    const mismatchCount = consecutiveMismatchRef.current;
                    setBiometricMatch({
                      isMatch: false,
                      score: comp.similarityScore,
                      status: 'mismatch',
                      message: 'Identity mismatch detected.'
                    });
                    setIdentityStatusMessage('Identity mismatch detected.');
                    setIdentityMatchScore(comp.similarityScore);

                    // Action on 2 consecutive mismatch checks (~1.6 seconds)
                    if (mismatchCount >= 2) {
                      const mismatchPenaltyDelay = 8000;
                      if (!lastViolationRef.current['IDENTITY_MISMATCH'] || now - lastViolationRef.current['IDENTITY_MISMATCH'] > mismatchPenaltyDelay) {
                        const screenshot = captureScreenshot('IDENTITY_MISMATCH');
                        logViolationRef.current('IDENTITY_MISMATCH', {
                          studentRollNo: user?.rollNo || user?.id,
                          similarityScore: comp.similarityScore,
                          reason: `Unauthorized Person: Face in camera (${comp.similarityScore}% match) does not match enrolled student (${user?.rollNo || user?.id})`,
                          screenshot
                        });
                        lastViolationRef.current['IDENTITY_MISMATCH'] = now;

                        // Flag session in Firestore
                        if (sessionId) {
                          updateDoc(doc(db, 'sessions', sessionId), {
                            identityVerificationStatus: 'mismatch',
                            lastIdentityMismatchTime: new Date().toISOString(),
                            identityMatchScore: comp.similarityScore
                          }).catch(() => {});
                        }
                      }
                    }

                    // Action on 4 consecutive mismatch checks (~3.2 seconds): Suspend exam
                    if (mismatchCount >= 4) {
                      setIsMismatchEscalated(true);
                      setIsIdentitySuspended(true);
                      if (sessionId) {
                        updateDoc(doc(db, 'sessions', sessionId), {
                          isIdentitySuspended: true,
                          identityVerificationStatus: 'suspended_mismatch'
                        }).catch(() => {});
                      }
                    }
                  }
                }
              }
            }
          } catch (bioErr) {
            console.warn('Biometric comparison error in camera loop:', bioErr);
            setIdentityStatusMessage('Verification temporarily inconclusive.');
          }
        }

        // Draw Debug Overlay
        if (canvasRef.current && videoRef.current) {
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) {
            canvasRef.current.width = videoRef.current.videoWidth;
            canvasRef.current.height = videoRef.current.videoHeight;
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            
            // Draw Faces with real Biometric Identity Recognition Status
            faces.forEach((face: any, idx: number) => {
              const box = face.box;
              const isMatch = biometricMatch.isMatch;
              ctx.strokeStyle = idx === 0 ? (isMatch ? '#10b981' : '#ef4444') : '#ef4444'; // Emerald for matching student, Red for mismatch / extra faces
              ctx.lineWidth = 3;
              ctx.strokeRect(box.xMin, box.yMin, box.width, box.height);

              ctx.fillStyle = idx === 0 ? (isMatch ? '#10b981' : '#ef4444') : '#ef4444';
              ctx.font = 'bold 12px Inter, sans-serif';
              const labelText = idx === 0
                ? (isMatch 
                    ? `VERIFIED STUDENT (${biometricMatch.score}%) ✓` 
                    : `🚨 IDENTITY MISMATCH (${biometricMatch.score}%)`)
                : `EXTRA FACE #${idx + 1}`;
              ctx.fillText(labelText, box.xMin, Math.max(15, box.yMin - 8));
            });

            // Draw Objects (Electronic Devices & Additional Persons)
            objects.forEach((obj: any) => {
              if (ELECTRONIC_DEVICE_CLASSES.includes(obj.class) && obj.score > 0.45) {
                ctx.strokeStyle = '#ef4444'; // Red 500
                ctx.lineWidth = 4;
                ctx.strokeRect(obj.bbox[0], obj.bbox[1], obj.bbox[2], obj.bbox[3]);
                ctx.fillStyle = '#ef4444';
                ctx.font = 'bold 12px Inter, sans-serif';
                ctx.fillText(`ELECTRONIC DEVICE (${obj.class.toUpperCase()}) - SCORE: 30`, obj.bbox[0], Math.max(15, obj.bbox[1] - 8));
              } else if (obj.class === 'person' && obj.score > 0.5 && personsCount > 1) {
                ctx.strokeStyle = '#ef4444'; // Red 500
                ctx.lineWidth = 3;
                ctx.strokeRect(obj.bbox[0], obj.bbox[1], obj.bbox[2], obj.bbox[3]);
                ctx.fillStyle = '#ef4444';
                ctx.fillRect(obj.bbox[0], Math.max(0, obj.bbox[1] - 22), 220, 22);
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 11px Inter, sans-serif';
                ctx.fillText('🚨 BACKGROUND PERSON DETECTED', obj.bbox[0] + 4, Math.max(15, obj.bbox[1] - 6));
              }
            });
          }
        }

        // Smoothing logic: Increased to 300 frames (~10 seconds) for extreme stability
        const MISSING_THRESHOLD = 300;
        if (currentFaceCount >= 1) {
          missingFaceFramesRef.current = 0;
          setIsFaceDetected(true);
        } else {
          missingFaceFramesRef.current += 1;
          if (missingFaceFramesRef.current > MISSING_THRESHOLD) {
            setIsFaceDetected(false);
          }
        }

        if (currentFaceCount === 1) {
          const face = faces[0];
          if (face && face.keypoints) {
            const keypoints = face.keypoints;
            
            // Simple Head Pose Estimation
            // Keypoints: 1 (nose), 33 (left eye), 263 (right eye)
            const nose = keypoints[1];
            const leftEye = keypoints[33];
            const rightEye = keypoints[263];

            if (nose && leftEye && rightEye) {
              const eyeDist = rightEye.x - leftEye.x;
              const noseOffset = nose.x - (leftEye.x + eyeDist / 2);
              const ratio = noseOffset / eyeDist;

              // If ratio is too high or too low, user is looking away
              if (Math.abs(ratio) > 0.45) {
                throttle('LOOKING_AWAY', 10000);
              }
            }
          }
        }

        if (personDetected && currentFaceCount === 0) {
          // Only log if person is detected but no face for a significant time
          if (missingFaceFramesRef.current > 60) {
            throttle('TURNING_AROUND', 10000);
          }
        }

        if (currentFaceCount > 1 || personsCount > 1) {
          const detectedPeopleCount = Math.max(currentFaceCount, personsCount);
          throttle('BACKGROUND_PERSON_DETECTED', 8000, { 
            count: detectedPeopleCount,
            facesCount,
            personsCount,
            reason: 'Background person detected in exam room'
          });
        } else if (currentFaceCount === 0 && missingFaceFramesRef.current > MISSING_THRESHOLD) {
          throttle('FACE_MISSING', 20000);
        }
      } catch (err) {
        console.error("Detection Loop Error:", err);
      }
    }
    if (statusRef.current === 'active' && isMountedRef.current && streamRef.current) {
      detectionAnimFrameRef.current = requestAnimationFrame(detect);
    }
  };


  useEffect(() => {
    isMountedRef.current = true;
    setupCamera();

    const handleDeviceChange = () => {
      if (statusRef.current === 'active') {
        logViolationRef.current('AUDIO_DEVICE_CHANGE', { timestamp: new Date().toISOString() });
      }
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);

    return () => {
      isMountedRef.current = false;
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      stopCameraAndAudio();
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border border-white/10 shadow-2xl">
        <video ref={videoRef} className="w-full h-full object-cover scale-x-[-1]" muted playsInline />
        <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none scale-x-[-1]" />
        
        <div className="absolute top-4 left-4 flex flex-col gap-2">
          <div className="px-3 py-1 bg-black/50 backdrop-blur-md rounded-full flex items-center gap-2 text-[10px] font-bold text-white border border-white/10 uppercase tracking-widest">
            <div className={`w-2 h-2 rounded-full ${status === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
            {status === 'active' ? 'AI ACTIVE' : 'INITIALIZING'}
          </div>
          <div className="px-3 py-1 bg-black/50 backdrop-blur-md rounded-full flex items-center gap-2 text-[10px] font-bold text-white border border-white/10 uppercase tracking-widest">
            <Users size={12} className={faceCount === 1 ? 'text-emerald-400' : 'text-red-400'} />
            PEOPLE DETECTED: <span className={faceCount === 1 ? 'text-emerald-400' : 'text-red-400'}>{faceCount}</span>
          </div>
          <div className={`px-3 py-1 backdrop-blur-md rounded-full flex items-center gap-2 text-[10px] font-bold border uppercase tracking-widest transition-colors ${
            biometricMatch.status === 'mismatch'
              ? 'text-red-300 border-red-500/60 bg-red-950/80 animate-pulse'
              : biometricMatch.status === 'verified'
                ? 'text-emerald-300 border-emerald-500/30 bg-black/50'
                : 'text-white border-white/10 bg-black/50'
          }`}>
            <UserCheck size={12} className={biometricMatch.status === 'mismatch' ? 'text-red-400' : 'text-emerald-400'} />
            IDENTITY: <span className={biometricMatch.status === 'mismatch' ? 'text-red-400 font-extrabold' : 'text-emerald-400'}>
              {biometricMatch.message || (biometricMatch.status === 'verified' ? `Identity verified. (${biometricMatch.score}%)` : 'Verifying identity.')}
            </span>
          </div>
          <div className={`px-3 py-1 backdrop-blur-md rounded-full flex items-center gap-2 text-[10px] font-bold border uppercase tracking-widest transition-colors ${isTalkingDetected ? 'text-red-300 border-red-500/60 bg-red-950/70 animate-pulse' : 'text-white border-white/10 bg-black/50'}`}>
            <Volume2 size={12} className={isTalkingDetected ? 'text-red-400' : 'text-emerald-400'} />
            AUDIO: <span className={isTalkingDetected ? 'text-red-400 font-extrabold' : 'text-emerald-400'}>{isTalkingDetected ? 'TALKING DETECTED (-5)' : 'SECURE'}</span>
          </div>
          {faceCount === 0 && missingFaceFramesRef.current > 0 && (
            <div className="px-3 py-1 bg-red-500/20 backdrop-blur-md rounded-full flex items-center gap-2 text-[10px] font-bold text-red-400 border border-red-500/20 uppercase tracking-widest animate-pulse">
              <AlertCircle size={12} />
              FACE LOST: {Math.ceil((300 - missingFaceFramesRef.current) / 30)}s REMAINING
            </div>
          )}
        </div>

        {/* Identity Mismatch Escalated Warning Overlay */}
        {isMismatchEscalated && (
          <div className="absolute inset-0 bg-red-950/90 backdrop-blur-sm z-20 flex flex-col items-center justify-center p-6 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-red-500/20 border-2 border-red-500 flex items-center justify-center text-red-400 animate-pulse">
              <UserX size={32} />
            </div>
            <div className="space-y-1 max-w-sm">
              <h4 className="text-sm font-black text-red-300 uppercase tracking-wider">🚨 Identity Mismatch Escalated</h4>
              <p className="text-xs text-white/90">
                The person currently sitting in front of the camera does NOT match enrolled student <strong>{user?.rollNo || user?.id}</strong>.
              </p>
              <p className="text-[11px] text-red-200/70">
                Violation logged to examiner dashboard. Please ensure the registered student returns immediately.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                consecutiveMismatchRef.current = 0;
                setIsMismatchEscalated(false);
              }}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg cursor-pointer"
            >
              Re-verify Live Face
            </button>
          </div>
        )}

        {(() => {
          const latestViolation = violations.length > 0 ? violations[0] : null;
          const isRecent = latestViolation && (Date.now() - new Date(latestViolation.timestamp).getTime() < 10000);
          if (!isRecent || !latestViolation) return null;
          const info = getViolationInfo(latestViolation.type, latestViolation.details);
          return (
            <div className="absolute bottom-3 left-3 right-3 bg-red-950/95 border border-red-500/60 backdrop-blur-md p-2.5 rounded-xl flex items-center gap-2.5 text-white shadow-2xl animate-pulse z-10">
              <div className="p-1.5 bg-red-500/30 text-red-400 rounded-lg shrink-0">
                <AlertCircle size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-black text-red-400 uppercase tracking-widest">Mistake Committed</p>
                <p className="text-xs font-bold text-white truncate">{info.title}</p>
              </div>
            </div>
          );
        })()}

        {status === 'terminated' && (
          <div className="absolute inset-0 bg-red-950/95 flex flex-col items-center justify-center p-6 text-center space-y-3 z-30">
            <div className="w-12 h-12 rounded-2xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400">
              <AlertCircle size={28} />
            </div>
            <p className="text-sm font-black text-white uppercase tracking-wider">EXAM AUTO-SUBMITTED</p>
            <p className="text-xs text-red-200/80 max-w-xs">Prohibited mobile device detected. Exam session closed.</p>
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 bg-red-950/80 flex flex-col items-center justify-center p-6 text-center space-y-4">
            <AlertCircle className="text-red-400" size={40} />
            <p className="text-sm font-bold text-white">Camera or AI Initialization Failed</p>
            <button 
              onClick={setupCamera}
              className="px-4 py-2 bg-white text-black text-xs font-bold rounded-lg hover:bg-white/90 transition-all"
            >
              RETRY INITIALIZATION
            </button>
          </div>
        )}
      </div>

      <button 
        onClick={setupCamera}
        className="w-full py-3 bg-white/5 border border-white/10 rounded-xl text-[10px] font-bold text-white/50 hover:bg-white/10 hover:text-white transition-all uppercase tracking-widest flex items-center justify-center gap-2"
      >
        <Activity size={14} /> Reset AI Proctoring Engine
      </button>
    </div>
  );
};

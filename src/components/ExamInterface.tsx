import React, { useState, useEffect, useRef } from 'react';
import { useExam } from '../ExamContext';
import { QUESTIONS } from '../constants';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CheckCircle2, 
  Clock, 
  Shield, 
  AlertTriangle, 
  Users, 
  Activity, 
  X, 
  PhoneOff, 
  AlertOctagon, 
  Smartphone, 
  FileWarning, 
  Maximize2, 
  CameraOff,
  ArrowLeft,
  ArrowRight,
  Send,
  Check,
  AlertCircle,
  UserX
} from 'lucide-react';
import { getViolationInfo } from '../utils/violationFormatter';

export const ExamInterface: React.FC = () => {
  const { 
    trustScore, 
    logViolation, 
    isFaceDetected, 
    setIsFaceDetected, 
    faceCount, 
    violations, 
    submitExam, 
    exitExamSession,
    questions,
    disqualification,
    setCurrentAnswers,
    user,
    selectedSubject,
    resetDisqualification,
    isAiActive,
    isIdentitySuspended,
    identityStatusMessage,
    identityMatchScore
  } = useExam();
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string | number, any>>({});
  const [timeLeft, setTimeLeft] = useState(1800); // 30 minutes
  const [shuffledQuestions, setShuffledQuestions] = useState(questions && questions.length > 0 ? questions : QUESTIONS);
  const [isIdle, setIsIdle] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmSubmitModal, setShowConfirmSubmitModal] = useState(false);
  const [dismissedViolationId, setDismissedViolationId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => {
    if (typeof document !== 'undefined') {
      return Boolean(document.fullscreenElement || (document as any).webkitFullscreenElement);
    }
    return true;
  });
  const [screenshotAlert, setScreenshotAlert] = useState<string | null>(null);
  const hasEnteredFullscreenRef = useRef<boolean>(
    typeof document !== 'undefined' ? Boolean(document.fullscreenElement || (document as any).webkitFullscreenElement) : false
  );
  const lastFullscreenExitRef = useRef<number>(0);
  const lastScreenshotViolationRef = useRef<number>(0);
  const screenshotTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Keep a stable ref to logViolation to prevent stale closures in event listeners
  const logViolationRef = useRef(logViolation);
  useEffect(() => {
    logViolationRef.current = logViolation;
  }, [logViolation]);

  // Keep ExamContext answers synced in real-time
  useEffect(() => {
    setCurrentAnswers(answers);
  }, [answers, setCurrentAnswers]);

  useEffect(() => {
    let idleTimer: NodeJS.Timeout;
    
    const resetIdleTimer = () => {
      setIsIdle(false);
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        setIsIdle(true);
        logViolationRef.current('IDLE_DETECTED', { timestamp: new Date().toISOString() });
      }, 60000); // 60 seconds
    };

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(event => window.addEventListener(event, resetIdleTimer));

    resetIdleTimer();

    return () => {
      clearTimeout(idleTimer);
      events.forEach(event => window.removeEventListener(event, resetIdleTimer));
    };
  }, []);

  useEffect(() => {
    if (questions && questions.length > 0) {
      setShuffledQuestions(questions);
    }
  }, [questions]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (!isAiActive) return prev;
        if (prev <= 0) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isAiActive]);

  const requestFullscreenMode = async () => {
    try {
      const elem = document.documentElement;
      if (elem.requestFullscreen) {
        await elem.requestFullscreen();
      } else if ((elem as any).webkitRequestFullscreen) {
        await (elem as any).webkitRequestFullscreen();
      } else if ((elem as any).msRequestFullscreen) {
        await (elem as any).msRequestFullscreen();
      }
      setIsFullscreen(true);
      hasEnteredFullscreenRef.current = true;
    } catch (err) {
      console.warn('Fullscreen request blocked or not permitted:', err);
    }
  };

  // Monitoring Hooks: Tab Switches, Fullscreen Exits, Screenshot Attempts, Copy/Paste
  useEffect(() => {
    // Initial check of fullscreen status
    const initialFs = Boolean(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement
    );
    setIsFullscreen(initialFs);
    if (initialFs) {
      hasEnteredFullscreenRef.current = true;
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        logViolationRef.current('TAB_SWITCH', { timestamp: new Date().toISOString() });
      }
    };

    const handleResize = () => {
      console.log('Window resized:', window.innerWidth);
      logViolationRef.current('WINDOW_RESIZE', { timestamp: new Date().toISOString() });
    };

    const triggerScreenshotViolation = (shortcut: string, key?: string) => {
      const now = Date.now();
      if (now - lastScreenshotViolationRef.current > 2500) {
        lastScreenshotViolationRef.current = now;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText('').catch(() => {});
          }
        } catch (_) {}
        
        logViolationRef.current('SCREENSHOT_ATTEMPT', {
          shortcut,
          key: key || shortcut,
          timestamp: new Date().toISOString()
        });

        setScreenshotAlert(`⚠️ Screenshot Attempt Intercepted (${shortcut}): Screen capturing is prohibited (-5 Trust Score).`);
        if (screenshotTimeoutRef.current) clearTimeout(screenshotTimeoutRef.current);
        screenshotTimeoutRef.current = setTimeout(() => {
          setScreenshotAlert(null);
        }, 5000);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Detect Screenshot attempts (PrintScreen, Snipping tool, Mac shortcuts)
      const isPrintScreen = e.key === 'PrintScreen' || e.code === 'PrintScreen' || e.key === 'Snapshot' || e.key === 'Print';
      const isWinSnippingTool = (e.key.toLowerCase() === 's' || e.code === 'KeyS') && e.shiftKey && (e.metaKey || e.ctrlKey);
      const isMacScreenshot = (e.metaKey || e.ctrlKey) && e.shiftKey && ['3', '4', '5', '6', 's'].includes(e.key.toLowerCase());
      const isAltPrintScreen = e.altKey && (e.key === 'PrintScreen' || e.code === 'PrintScreen');
      const isCtrlPrintScreen = e.ctrlKey && (e.key === 'PrintScreen' || e.code === 'PrintScreen');

      if (isPrintScreen || isWinSnippingTool || isMacScreenshot || isAltPrintScreen || isCtrlPrintScreen) {
        e.preventDefault();
        e.stopPropagation();
        const shortcutName = isPrintScreen ? 'PrintScreen' : 
          isWinSnippingTool ? 'Win+Shift+S (Snipping Tool)' : 
          isMacScreenshot ? `Cmd+Shift+${e.key.toUpperCase()}` : 
          'Screen Capture Shortcut';
        triggerScreenshotViolation(shortcutName, e.key);
        return;
      }

      // 2. Forbidden copy / paste / developer tools shortcuts
      const forbidden = (e.ctrlKey && ['c', 'v', 'x', 'i', 'j', 'u'].includes(e.key.toLowerCase())) || 
                        ['F12'].includes(e.key);
      if (forbidden) {
        e.preventDefault();
        logViolationRef.current('COPY_ATTEMPT', { key: e.key });
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen' || e.code === 'PrintScreen' || e.key === 'Snapshot' || e.key === 'Print') {
        e.preventDefault();
        e.stopPropagation();
        triggerScreenshotViolation('PrintScreen', e.key);
      }
    };

    const handlePaste = (e: ClipboardEvent) => {
      if (e.clipboardData && e.clipboardData.items) {
        for (let i = 0; i < e.clipboardData.items.length; i++) {
          if (e.clipboardData.items[i].type.indexOf('image') !== -1) {
            e.preventDefault();
            triggerScreenshotViolation('Image paste from clipboard', 'Paste');
            break;
          }
        }
      }
    };

    const handleFullscreenChange = () => {
      const isFs = Boolean(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(isFs);

      if (isFs) {
        hasEnteredFullscreenRef.current = true;
      } else {
        // Trigger violation if student was previously in fullscreen mode
        if (hasEnteredFullscreenRef.current && !isSubmitted && !disqualification?.isDisqualified) {
          const now = Date.now();
          if (now - lastFullscreenExitRef.current > 3000) {
            lastFullscreenExitRef.current = now;
            logViolationRef.current('FULLSCREEN_EXIT', {
              timestamp: new Date().toISOString(),
              reason: 'Student exited mandatory fullscreen examination mode'
            });
          }
        }
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      logViolationRef.current('COPY_ATTEMPT', { type: 'context_menu' });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('resize', handleResize);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
      if (screenshotTimeoutRef.current) clearTimeout(screenshotTimeoutRef.current);
    };
  }, [isSubmitted, disqualification]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isQuestionAnswered = (questionId: string | number) => {
    const ans = answers[questionId];
    if (ans === undefined || ans === null) return false;
    if (typeof ans === 'string') return ans.trim().length > 0;
    if (Array.isArray(ans)) return ans.length > 0;
    return true;
  };

  const answeredCount = shuffledQuestions.filter(ques => isQuestionAnswered(ques.id)).length;
  const unansweredCount = shuffledQuestions.length - answeredCount;

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      await submitExam(answers);
    } catch (err) {
      console.error('Error submitting exam:', err);
    } finally {
      setIsSubmitted(true);
      setShowConfirmSubmitModal(false);
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (timeLeft === 0 && !isSubmitted && !disqualification?.isDisqualified) {
      handleSubmit();
    }
  }, [timeLeft, isSubmitted, disqualification]);

  // 1. AUTOMATIC DISQUALIFICATION & SUBMISSION SCREEN (Electronic Device Violation)
  if (disqualification?.isDisqualified) {
    const totalCount = shuffledQuestions.length;
    const deviceName = disqualification.deviceClass ? disqualification.deviceClass.toUpperCase() : 'ELECTRONIC DEVICE';

    return (
      <div className="max-w-2xl mx-auto p-6 md:p-12 text-center space-y-6">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-24 h-24 bg-red-600 rounded-3xl mx-auto flex items-center justify-center text-white shadow-2xl shadow-red-600/30 border border-red-400/30 relative"
        >
          <PhoneOff size={46} className="text-white animate-pulse" />
          <div className="absolute -top-2 -right-2 bg-red-500 rounded-full p-1 border-2 border-[#050505]">
            <AlertOctagon size={18} className="text-white" />
          </div>
        </motion.div>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-500/10 border border-red-500/30 rounded-full text-red-400 text-xs font-black uppercase tracking-widest">
            <span>🚨 ELECTRONIC DEVICE DETECTED</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">
            Exam Terminated & Auto-Submitted
          </h1>
          <p className="text-red-400 font-bold text-base">
            Electronic Device Used ({deviceName})
          </p>
          <p className="text-white/60 text-xs md:text-sm max-w-lg mx-auto leading-relaxed">
            During your active proctored examination, an electronic device was identified in your camera frame. Under anti-cheating regulations, your trust score has been directly reduced to 30 and your exam has been immediately terminated and automatically submitted.
          </p>
        </div>

        {/* Evidence Card */}
        <div className="p-6 bg-red-950/20 border border-red-500/30 rounded-3xl space-y-4 text-left backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-red-500/20 pb-3">
            <span className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-2">
              <FileWarning size={15} /> Incident Audit Record
            </span>
            <span className="text-[10px] font-mono text-white/40">
              {new Date(disqualification.timestamp).toLocaleTimeString()}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-black/40 rounded-xl border border-white/5">
              <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Student Name</p>
              <p className="font-bold text-white mt-0.5">{user?.name || 'Student'}</p>
            </div>
            <div className="p-3 bg-black/40 rounded-xl border border-white/5">
              <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Student Roll / USN</p>
              <p className="font-bold text-white mt-0.5">{user?.id || 'N/A'}</p>
            </div>
            <div className="p-3 bg-black/40 rounded-xl border border-white/5">
              <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Subject & Code</p>
              <p className="font-bold text-white mt-0.5">{disqualification.subjectName || selectedSubject?.name || 'Exam'} ({disqualification.subjectCode || selectedSubject?.code || 'CODE'})</p>
            </div>
            <div className="p-3 bg-black/40 rounded-xl border border-white/5">
              <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Questions Saved</p>
              <p className="font-bold text-amber-400 mt-0.5">{answeredCount} of {totalCount} answered</p>
            </div>
          </div>

          <div className="p-3 bg-red-500/10 rounded-xl border border-red-500/20 flex justify-between items-center">
            <span className="text-xs font-bold text-red-300">Final Integrity Trust Score:</span>
            <span className="text-base font-black text-red-400">30% (TERMINATED)</span>
          </div>

          {disqualification.screenshot && (
            <div className="space-y-2 pt-1">
              <p className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Photographic Vision Evidence:</p>
              <div className="rounded-2xl overflow-hidden border border-red-500/40 bg-black max-h-56">
                <img 
                  src={disqualification.screenshot} 
                  alt="Electronic Device Evidence" 
                  className="w-full h-auto object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>
          )}

          <p className="text-[11px] text-white/40 leading-normal italic pt-1">
            Notice: Marked in red in Teacher Portal as "electronic device used" with 30% Trust Score.
          </p>
        </div>

        <button 
          type="button"
          onClick={() => {
            resetDisqualification();
            exitExamSession();
          }}
          className="w-full sm:w-auto px-8 py-4 bg-red-600 hover:bg-red-500 text-white font-bold rounded-2xl transition-all shadow-xl shadow-red-600/30 text-sm uppercase tracking-wider cursor-pointer"
        >
          Exit to Student Portal
        </button>
      </div>
    );
  }

  if (isSubmitted) {
    return (
      <div className="max-w-2xl mx-auto p-8 sm:p-12 text-center space-y-8">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-24 h-24 bg-emerald-500 rounded-full mx-auto flex items-center justify-center text-white shadow-2xl shadow-emerald-500/20"
        >
          <CheckCircle2 size={48} />
        </motion.div>
        <div className="space-y-3">
          <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">Exam Submitted Successfully</h1>
          <p className="text-white/60 text-base">Your integrity-monitored examination answers have been securely recorded in the system.</p>
        </div>
        <div className="p-6 bg-white/5 border border-white/10 rounded-3xl space-y-4 text-left">
          <div className="flex justify-between items-center pb-3 border-b border-white/10">
            <span className="text-sm text-white/50">Subject</span>
            <span className="text-sm font-bold text-white">{selectedSubject?.name || 'General Exam'} ({selectedSubject?.code || 'EXAM'})</span>
          </div>
          <div className="flex justify-between items-center pb-3 border-b border-white/10">
            <span className="text-sm text-white/50">Questions Answered</span>
            <span className="text-sm font-bold text-emerald-400">{answeredCount} of {shuffledQuestions.length} answered</span>
          </div>
          <div className="flex justify-between items-center pb-3 border-b border-white/10">
            <span className="text-sm text-white/50">Final Trust Score</span>
            <span className={`text-base font-bold ${trustScore > 80 ? 'text-emerald-400' : trustScore > 50 ? 'text-amber-400' : 'text-red-400'}`}>{trustScore}%</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-white/50">Violations Recorded</span>
            <span className="text-base font-bold text-white">{violations.length}</span>
          </div>
        </div>
        <button 
          type="button"
          onClick={() => exitExamSession()}
          className="w-full sm:w-auto px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl transition-all shadow-xl shadow-indigo-600/30 text-sm cursor-pointer"
        >
          Return to Dashboard / Portal
        </button>
      </div>
    );
  }

  const q = (shuffledQuestions && shuffledQuestions[currentQuestion]) 
    ? shuffledQuestions[currentQuestion] 
    : (shuffledQuestions && shuffledQuestions[0]) 
    ? shuffledQuestions[0] 
    : QUESTIONS[0];

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8 relative">
      {/* Identity Mismatch Exam Suspension Modal */}
      <AnimatePresence>
        {isIdentitySuspended && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="max-w-md w-full bg-slate-900 border-2 border-red-500 rounded-3xl p-6 sm:p-8 text-center space-y-6 shadow-2xl shadow-red-950/60"
            >
              <div className="w-16 h-16 rounded-2xl bg-red-500/20 border-2 border-red-500 flex items-center justify-center mx-auto text-red-400 animate-pulse">
                <AlertOctagon size={36} />
              </div>

              <div className="space-y-2">
                <span className="px-3 py-1 bg-red-500/20 text-red-300 border border-red-500/40 rounded-full text-[11px] font-bold uppercase tracking-wider">
                  Exam Suspended • Identity Mismatch
                </span>
                <h3 className="text-xl font-bold text-white pt-1">
                  Unauthorized Person in Camera View
                </h3>
                <p className="text-xs text-white/70 leading-relaxed">
                  The face in front of the camera does not match registered student <strong className="text-red-300 font-mono font-bold">{user?.rollNo || user?.id}</strong> ({identityMatchScore}% similarity).
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-red-950/50 border border-red-500/30 text-left space-y-2 text-xs">
                <div className="flex items-center gap-2 text-red-300 font-semibold">
                  <UserX size={15} className="shrink-0" />
                  <span>Proctor Status: {identityStatusMessage}</span>
                </div>
                <p className="text-[11px] text-white/60">
                  Exam questions and input are suspended. Registered student must return in front of the camera. The test will automatically resume upon successful biometric verification.
                </p>
              </div>

              <div className="flex items-center justify-center gap-2 text-xs text-indigo-300 font-medium">
                <div className="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                <span>Continuously scanning for registered student...</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Real-time Integrity Badge */}
      <motion.div 
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 1, x: 0 }}
        className="fixed top-24 right-8 z-[60] hidden xl:block"
      >
        <div className="bg-white/5 backdrop-blur-2xl border border-white/10 p-6 rounded-[2.5rem] shadow-2xl flex flex-col items-center gap-4 w-32">
          <div className="relative w-20 h-20">
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="40"
                cy="40"
                r="36"
                stroke="currentColor"
                strokeWidth="4"
                fill="transparent"
                className="text-white/5"
              />
              <motion.circle
                cx="40"
                cy="40"
                r="36"
                stroke="currentColor"
                strokeWidth="4"
                fill="transparent"
                strokeDasharray="226.19"
                initial={{ strokeDashoffset: 226.19 }}
                animate={{ strokeDashoffset: 226.19 - (226.19 * trustScore) / 100 }}
                className={cn(
                  "transition-all duration-1000",
                  trustScore > 80 ? "text-emerald-500" : trustScore > 50 ? "text-amber-500" : "text-red-500"
                )}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl font-black text-white">{trustScore}</span>
            </div>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Integrity</p>
            <p className={cn(
              "text-[8px] font-bold uppercase tracking-tighter mt-1",
              trustScore > 80 ? "text-emerald-400" : trustScore > 50 ? "text-amber-400" : "text-red-400"
            )}>
              {trustScore > 80 ? 'EXCELLENT' : trustScore > 50 ? 'CAUTION' : 'CRITICAL'}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Active Mistake Notification Alert Banner */}
      <AnimatePresence>
        {(() => {
          const latestViolation = violations.length > 0 ? violations[0] : null;
          if (!latestViolation) return null;
          if (dismissedViolationId === latestViolation.id) return null;

          const timeSinceViolation = Date.now() - new Date(latestViolation.timestamp).getTime();
          if (timeSinceViolation > 18000) return null; // Show banner for 18 seconds after mistake

          const info = getViolationInfo(latestViolation.type, latestViolation.details);

          return (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className="p-5 rounded-2xl bg-gradient-to-r from-red-950/90 via-red-900/80 to-red-950/90 border border-red-500/50 backdrop-blur-2xl shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-white border-l-8 border-l-red-500"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 bg-red-500/20 text-red-400 rounded-2xl shrink-0 mt-0.5 border border-red-500/30">
                  <AlertTriangle size={24} />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-red-500/30 text-red-200 border border-red-500/40">
                      ⚠️ Mistake Committed
                    </span>
                    <span className="text-[11px] font-bold text-red-400 bg-black/40 px-2 py-0.5 rounded-full border border-red-500/20">
                      -{info.penalty}% Trust Penalty
                    </span>
                  </div>
                  <h4 className="text-lg font-bold text-white tracking-tight">
                    {info.title}
                  </h4>
                  <p className="text-xs text-red-100/80 leading-relaxed">
                    {info.description}
                  </p>
                  <p className="text-[11px] text-amber-300 font-semibold pt-1">
                    💡 <span className="underline">How to correct:</span> {info.advice}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDismissedViolationId(latestViolation.id)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl border border-white/20 transition-all shrink-0 self-end md:self-center flex items-center gap-1.5"
              >
                <X size={14} /> Dismiss
              </button>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Screenshot Intercepted Warning Banner */}
      <AnimatePresence>
        {screenshotAlert && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 rounded-2xl bg-gradient-to-r from-red-950/95 via-red-900/90 to-red-950/95 border border-red-500/60 backdrop-blur-xl flex items-center justify-between gap-3 text-red-100 shadow-2xl border-l-8 border-l-red-500 animate-pulse"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-red-500/20 text-red-400 rounded-xl shrink-0 border border-red-500/30">
                <CameraOff size={22} />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-red-500/30 text-red-200 border border-red-500/40">
                    🚨 SCREENSHOT INTERCEPTED
                  </span>
                  <span className="text-[11px] font-bold text-red-400 bg-black/40 px-2 py-0.5 rounded-full border border-red-500/20">
                    -5 Trust Score
                  </span>
                </div>
                <p className="text-xs font-semibold text-white">
                  {screenshotAlert}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setScreenshotAlert(null)}
              className="p-1.5 text-red-300 hover:text-white rounded-lg transition-colors shrink-0"
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fullscreen Mode Exited Warning Banner */}
      <AnimatePresence>
        {!isFullscreen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 rounded-2xl bg-gradient-to-r from-amber-950/90 via-amber-900/80 to-amber-950/90 border border-amber-500/50 backdrop-blur-xl flex flex-col sm:flex-row items-center justify-between gap-4 text-amber-200 shadow-xl border-l-8 border-l-amber-500"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl shrink-0 border border-amber-500/30">
                <Maximize2 size={22} className="animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-amber-500/30 text-amber-200 border border-amber-500/40">
                    ⚠️ Mandatory Fullscreen Exited
                  </span>
                  <span className="text-[11px] font-bold text-amber-400 bg-black/40 px-2 py-0.5 rounded-full border border-amber-500/20">
                    -5 Trust Score
                  </span>
                </div>
                <p className="text-xs text-amber-100/90 mt-1 leading-relaxed">
                  You have exited mandatory fullscreen examination mode. Please re-enter fullscreen immediately to maintain session integrity.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={requestFullscreenMode}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shrink-0 flex items-center gap-2 shadow-lg shadow-amber-500/30 active:scale-95"
            >
              <Maximize2 size={16} />
              Re-Enter Fullscreen
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Stats */}
      {trustScore <= 30 && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-2xl bg-red-950/50 border border-red-500/40 flex items-center gap-3 text-red-200 backdrop-blur-xl"
        >
          <AlertOctagon className="text-red-400 shrink-0" size={22} />
          <div className="text-xs leading-relaxed">
            <span className="font-bold text-red-400 uppercase tracking-wide mr-1.5">⚠️ Trust Score Reached Below 30 ({trustScore}%):</span>
            You are permitted to continue answering and complete your examination. Your session has been flagged in red in the Teacher Portal with "trust score reached below 30".
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-4 rounded-2xl flex items-center gap-4">
          <div className="p-3 bg-indigo-500/20 rounded-xl text-indigo-400">
            <Clock size={24} />
          </div>
          <div>
            <p className="text-xs font-medium text-white/50 uppercase tracking-wider">Time Remaining</p>
            <p className="text-xl font-bold text-white font-mono">{formatTime(timeLeft)}</p>
          </div>
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-4 rounded-2xl flex items-center gap-4">
          <div className={cn(
            "p-3 rounded-xl",
            trustScore > 80 ? "bg-emerald-500/20 text-emerald-400" : 
            trustScore > 50 ? "bg-amber-500/20 text-amber-400" : "bg-red-500/20 text-red-400"
          )}>
            <Shield size={24} />
          </div>
          <div>
            <p className="text-xs font-medium text-white/50 uppercase tracking-wider">Trust Score</p>
            <p className={cn(
              "text-xl font-bold",
              trustScore > 80 ? "text-emerald-400" : 
              trustScore > 50 ? "text-amber-400" : "text-red-400"
            )}>{trustScore}%</p>
          </div>
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-4 rounded-2xl flex items-center gap-4">
          <div className="p-3 bg-violet-500/20 rounded-xl text-violet-400">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <p className="text-xs font-medium text-white/50 uppercase tracking-wider">Progress</p>
            <p className="text-xl font-bold text-white">{currentQuestion + 1} / {shuffledQuestions.length}</p>
          </div>
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-4 rounded-2xl flex items-center gap-4">
          <div className={cn(
            "p-3 rounded-xl",
            faceCount === 1 ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
          )}>
            <Users size={24} />
          </div>
          <div>
            <p className="text-xs font-medium text-white/50 uppercase tracking-wider">People in Frame</p>
            <p className={cn(
              "text-xl font-bold",
              faceCount === 1 ? "text-emerald-400" : "text-red-400"
            )}>{faceCount}</p>
          </div>
        </div>
      </div>

      {/* Interactive Question Palette & Summary Bar */}
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-5 rounded-3xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white text-sm uppercase tracking-wider">Question Navigator</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-mono font-medium">
              {answeredCount} of {shuffledQuestions.length} Answered
            </span>
            {unansweredCount > 0 && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-300 font-mono">
                {unansweredCount} Remaining
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowConfirmSubmitModal(true)}
            className="self-start sm:self-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-emerald-600/20 flex items-center gap-1.5 cursor-pointer"
          >
            <Send size={13} />
            <span>Submit Exam</span>
          </button>
        </div>

        {/* Quick jump question numbers */}
        <div className="flex flex-wrap gap-2">
          {shuffledQuestions.map((ques, idx) => {
            const hasAnswer = isQuestionAnswered(ques.id);
            const isCurrent = idx === currentQuestion;
            return (
              <button
                key={ques.id || idx}
                type="button"
                onClick={() => setCurrentQuestion(idx)}
                className={cn(
                  "w-10 h-10 rounded-xl text-xs font-bold font-mono transition-all flex items-center justify-center relative cursor-pointer border",
                  isCurrent 
                    ? "bg-indigo-600 text-white border-indigo-400 ring-2 ring-indigo-400/50 shadow-lg shadow-indigo-600/30 scale-105 z-10"
                    : hasAnswer
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30"
                    : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white"
                )}
                title={`Jump to Question ${idx + 1}${hasAnswer ? ' (Answered)' : ' (Not Answered)'}`}
              >
                {idx + 1}
                {hasAnswer && !isCurrent && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full border border-black" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Question Area */}
      <motion.div 
        key={currentQuestion}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="bg-white/5 backdrop-blur-xl border border-white/10 p-6 sm:p-8 rounded-3xl relative min-h-[400px] flex flex-col justify-center overflow-hidden group"
      >
        <div className="absolute -top-3 left-8 px-4 py-1 bg-indigo-600 text-white text-xs font-bold rounded-full z-10 shadow-md">
          QUESTION {currentQuestion + 1} OF {shuffledQuestions.length}
        </div>

        {/* Face Status Notice */}
        <AnimatePresence>
          {!isFaceDetected && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-4 right-4 z-20 flex items-center gap-1.5 px-3 py-1.5 bg-red-500/90 text-white rounded-full shadow-lg text-xs font-semibold backdrop-blur-md"
            >
              <Shield size={13} className="animate-pulse text-amber-300" />
              <span>Face Not Centered</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Inactivity Banner */}
        {isIdle && (
          <div className="mb-4 p-3 bg-amber-500/15 border border-amber-500/30 rounded-2xl text-amber-300 text-xs flex items-center gap-2">
            <AlertTriangle size={15} className="shrink-0 text-amber-400" />
            <span>Inactivity detected. Move mouse or interact with choices to keep session active.</span>
          </div>
        )}

        <div className={cn(
          "space-y-6 select-none transition-opacity duration-300",
          isIdle ? "opacity-75" : "opacity-100"
        )}>
          <div className="flex items-center justify-between pb-2 gap-4">
            <h2 className="text-xl sm:text-2xl font-medium text-white leading-relaxed cursor-default">
              {q.text}
            </h2>
            <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-full uppercase tracking-wider shrink-0">
              {q.points || 10} Points
            </span>
          </div>

          {/* Question Type: Single Choice (MCQ) or Default */}
          {(q.type === 'mcq' || !q.type) && q.options && (
            <div className="grid grid-cols-1 gap-3">
              {q.options.map((opt, idx) => {
                const isSelected = answers[q.id] === idx;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setAnswers({ ...answers, [q.id]: idx })}
                    className={cn(
                      "w-full p-4 sm:p-5 rounded-2xl text-left transition-all duration-200 border cursor-pointer",
                      isSelected 
                        ? "bg-indigo-600/25 border-indigo-500 text-white shadow-lg shadow-indigo-500/15 font-semibold ring-1 ring-indigo-500/50" 
                        : "bg-white/5 border-white/5 text-white/70 hover:bg-white/10 hover:border-white/20"
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-colors shrink-0",
                        isSelected ? "border-indigo-400 bg-indigo-500 text-white" : "border-white/20"
                      )}>
                        {String.fromCharCode(65 + idx)}
                      </div>
                      <span className="font-medium text-sm sm:text-base">{opt}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Question Type: Multiple Select (Checkboxes) */}
          {q.type === 'multiple_select' && q.options && (
            <div className="grid grid-cols-1 gap-3">
              <p className="text-xs text-violet-300 font-medium">Select all correct options that apply:</p>
              {q.options.map((opt, idx) => {
                const selected = Array.isArray(answers[q.id]) && answers[q.id].includes(idx);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      const currentArr: number[] = Array.isArray(answers[q.id]) ? answers[q.id] : [];
                      const nextArr = selected 
                        ? currentArr.filter(i => i !== idx)
                        : [...currentArr, idx];
                      setAnswers({ ...answers, [q.id]: nextArr });
                    }}
                    className={cn(
                      "w-full p-4 sm:p-5 rounded-2xl text-left transition-all duration-200 border flex items-center justify-between cursor-pointer",
                      selected 
                        ? "bg-violet-600/25 border-violet-500 text-white shadow-lg shadow-violet-500/15 font-semibold ring-1 ring-violet-500/50" 
                        : "bg-white/5 border-white/5 text-white/70 hover:bg-white/10 hover:border-white/20"
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-8 h-8 rounded-xl border-2 flex items-center justify-center text-sm font-bold transition-colors shrink-0",
                        selected ? "border-violet-400 bg-violet-500 text-white" : "border-white/20"
                      )}>
                        {selected ? '✓' : String.fromCharCode(65 + idx)}
                      </div>
                      <span className="font-medium text-sm sm:text-base">{opt}</span>
                    </div>
                    <span className="text-[10px] text-violet-300/60 uppercase tracking-widest font-bold">Checkbox</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Question Type: True / False */}
          {q.type === 'true_false' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(q.options || ['True', 'False']).map((opt, idx) => {
                const isSelected = answers[q.id] === idx;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setAnswers({ ...answers, [q.id]: idx })}
                    className={cn(
                      "p-5 rounded-2xl text-center text-base sm:text-lg font-bold border transition-all cursor-pointer",
                      isSelected 
                        ? "bg-emerald-600/25 border-emerald-500 text-emerald-300 shadow-lg shadow-emerald-500/15 ring-1 ring-emerald-500/50" 
                        : "bg-white/5 border-white/5 text-white/70 hover:bg-white/10 hover:border-white/20"
                    )}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          )}

          {/* Question Type: Short Answer / Essay */}
          {q.type === 'short_answer' && (
            <div className="space-y-3">
              <label className="text-xs text-amber-300 font-medium">Type your detailed answer below:</label>
              <textarea
                rows={4}
                value={answers[q.id] || ''}
                onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                placeholder="Enter response..."
                className="w-full bg-black/50 border border-white/15 rounded-2xl p-5 text-white text-base focus:outline-none focus:ring-2 focus:ring-amber-500/50 leading-relaxed placeholder:text-white/30"
              />
            </div>
          )}
        </div>
      </motion.div>

      {/* Navigation Controls */}
      <div className="flex flex-wrap justify-between items-center gap-4 pt-2">
        <button
          type="button"
          disabled={currentQuestion === 0}
          onClick={() => {
            setCurrentQuestion(prev => Math.max(0, prev - 1));
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="px-6 py-3.5 rounded-xl bg-white/5 border border-white/10 text-white font-medium hover:bg-white/10 disabled:opacity-25 disabled:cursor-not-allowed transition-all flex items-center gap-2 text-sm cursor-pointer"
        >
          <ArrowLeft size={16} />
          <span>Previous Question</span>
        </button>

        <div className="flex items-center gap-3">
          {/* Always accessible Submit Exam button */}
          <button
            type="button"
            onClick={() => setShowConfirmSubmitModal(true)}
            className="px-6 py-3.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 hover:text-white font-bold transition-all shadow-md flex items-center gap-2 text-sm cursor-pointer"
          >
            <Send size={15} />
            <span>Submit Exam</span>
          </button>

          {currentQuestion < shuffledQuestions.length - 1 ? (
            <button
              type="button"
              onClick={() => {
                setCurrentQuestion(prev => Math.min(shuffledQuestions.length - 1, prev + 1));
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="px-8 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white font-bold transition-all shadow-lg shadow-indigo-600/30 flex items-center gap-2 text-sm cursor-pointer select-none"
            >
              <span>Next Question</span>
              <ArrowRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowConfirmSubmitModal(true)}
              className="px-8 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-bold transition-all shadow-lg shadow-emerald-500/30 flex items-center gap-2 text-sm cursor-pointer select-none"
            >
              <CheckCircle2 size={16} />
              <span>Finish & Submit</span>
            </button>
          )}
        </div>
      </div>

      {/* Submit Confirmation Modal */}
      <AnimatePresence>
        {showConfirmSubmitModal && (
          <div 
            onClick={() => {
              if (!isSubmitting) setShowConfirmSubmitModal(false);
            }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md pointer-events-auto"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg bg-[#0d0d12] border border-white/20 rounded-3xl p-6 md:p-8 shadow-2xl space-y-6 text-left relative z-[201] pointer-events-auto"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <Send size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Submit Examination?</h3>
                    <p className="text-xs text-white/50">{selectedSubject?.name || 'General Exam'} ({selectedSubject?.code || 'EXAM'})</p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setShowConfirmSubmitModal(false)}
                  className="text-white/40 hover:text-white p-1 rounded-lg cursor-pointer disabled:opacity-30"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 bg-white/5 rounded-2xl border border-white/5">
                  <span className="text-white/40 block text-[11px] font-semibold uppercase">Questions Answered</span>
                  <span className="text-xl font-bold text-emerald-400 mt-1 block">
                    {answeredCount} / {shuffledQuestions.length}
                  </span>
                </div>
                <div className="p-3.5 bg-white/5 rounded-2xl border border-white/5">
                  <span className="text-white/40 block text-[11px] font-semibold uppercase">Unanswered</span>
                  <span className={`text-xl font-bold mt-1 block ${unansweredCount > 0 ? 'text-amber-400' : 'text-white/60'}`}>
                    {unansweredCount}
                  </span>
                </div>
              </div>

              {unansweredCount > 0 ? (
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-start gap-3 text-amber-300 text-xs">
                  <AlertTriangle size={18} className="shrink-0 mt-0.5 text-amber-400" />
                  <p className="leading-relaxed">
                    You have <span className="font-bold underline">{unansweredCount} unanswered question{unansweredCount > 1 ? 's' : ''}</span>. 
                    You can still submit now or return to review and answer them.
                  </p>
                </div>
              ) : (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center gap-3 text-emerald-300 text-xs">
                  <CheckCircle2 size={18} className="shrink-0 text-emerald-400" />
                  <p className="leading-relaxed font-medium">
                    All {shuffledQuestions.length} questions have been answered. Ready to submit!
                  </p>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setShowConfirmSubmitModal(false)}
                  className="flex-1 py-3.5 px-5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 font-semibold text-xs border border-white/10 transition-colors cursor-pointer disabled:opacity-40"
                >
                  Continue Reviewing
                </button>
                <button
                  type="button"
                  id="confirm-submit-exam-button"
                  disabled={isSubmitting}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSubmit();
                  }}
                  className="flex-1 py-3.5 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-bold text-xs shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 select-none"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Submitting Exam...</span>
                    </>
                  ) : (
                    <>
                      <Send size={14} />
                      <span>Confirm & Submit Exam</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {trustScore < 50 && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-4 text-red-400">
          <AlertTriangle />
          <p className="text-sm font-medium">Warning: Your trust score is critically low. Continued violations will result in automatic disqualification.</p>
        </div>
      )}

      {/* Monitoring Log */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-white/30 uppercase tracking-[0.2em]">Live Monitoring Log</h3>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-bold text-emerald-500/50 uppercase tracking-widest">System Healthy</span>
          </div>
        </div>
        
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
          <div className="max-h-[200px] overflow-y-auto p-2 space-y-1 scrollbar-hide">
            <AnimatePresence initial={false}>
              {violations.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-xs text-white/20 font-medium italic">No violations recorded. Integrity maintained.</p>
                </div>
              ) : (
                violations.map((v) => {
                  const info = getViolationInfo(v.type, v.details);
                  return (
                    <motion.div
                      key={v.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="p-3.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400 shrink-0">
                            <AlertTriangle size={14} />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-white tracking-wide">{info.title}</p>
                            <p className="text-[9px] text-white/40 font-mono">{new Date(v.timestamp).toLocaleTimeString()}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-0.5 rounded-full">
                            -{info.penalty}% Penalty
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-white/70 pl-11">{info.description}</p>
                      <p className="text-[10px] text-amber-300/90 font-medium pl-11">Advice: {info.advice}</p>
                    </motion.div>
                  );
                })
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
};

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}

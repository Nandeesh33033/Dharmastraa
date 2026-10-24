import React, { useState, useEffect } from 'react';
import { ExamProvider, useExam } from './ExamContext';
import { ExamInterface } from './components/ExamInterface';
import { CameraMonitor } from './components/CameraMonitor';
import { AuditorDashboard } from './components/AuditorDashboard';
import { ProctorDashboard } from './components/ProctorDashboard';
import { StudentFaceScanner } from './components/StudentFaceScanner';
import { preloadAiModels, areModelsReady } from './utils/aiProctorService';
import { FaceModelLifecycleState } from './utils/faceRecognitionService';
import { 
  Shield, 
  User, 
  LogIn, 
  UserPlus,
  LayoutDashboard, 
  GraduationCap, 
  KeyRound, 
  AlertCircle,
  ScanFace,
  CheckCircle2,
  Lock,
  Sparkles,
  Eye,
  EyeOff,
  Key,
  ArrowRight,
  UserX,
  ShieldCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const LoginPage: React.FC = () => {
  const [role, setRole] = useState<'student' | 'admin'>('student');
  const [studentAuthMode, setStudentAuthMode] = useState<'login' | 'register'>('login');
  
  // Student & Teacher Form Fields
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [capturedFaceData, setCapturedFaceData] = useState<string | null>(null);
  const [capturedFaceDescriptor, setCapturedFaceDescriptor] = useState<number[] | null>(null);
  const [isLiveFaceDetected, setIsLiveFaceDetected] = useState(false);
  const [isBiometricMatched, setIsBiometricMatched] = useState(false);
  const [biometricMatchScore, setBiometricMatchScore] = useState<number | undefined>(undefined);
  const [liveFaceDescriptor, setLiveFaceDescriptor] = useState<number[] | null>(null);
  const [faceModelState, setFaceModelState] = useState<FaceModelLifecycleState>('NOT_INITIALIZED');
  const [faceModelMessage, setFaceModelMessage] = useState<string>('Loading face recognition model. Please wait...');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { 
    students,
    teachers,
    loginStudentWithFace, 
    registerStudent, 
    loginAsTeacher, 
    loginWithGoogle,
    isAuthReady 
  } = useExam();

  // Find matching student account if user entered their USN / Roll number
  const matchedStudent = students.find(s => 
    s.rollNo.trim().toUpperCase() === id.trim().toUpperCase()
  );

  // Detect if user mistakenly entered an Instructor/Teacher ID in Student Portal
  const enteredTeacherAccount = teachers.find(t => 
    t.teacherId.trim().toUpperCase() === id.trim().toUpperCase() || 
    (t.email && t.email.trim().toUpperCase() === id.trim().toUpperCase())
  );

  // Reset biometric match evaluation when roll number or mode changes
  useEffect(() => {
    setIsBiometricMatched(false);
    setBiometricMatchScore(undefined);
    setLiveFaceDescriptor(null);
  }, [id, studentAuthMode, role]);

  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const trimmedId = id.trim().toUpperCase();
    const trimmedPass = password.trim();

    if (!trimmedId) {
      setErrorMsg('Please enter your Student Roll Number.');
      return;
    }

    // Explicit model-loading states: Block login before model is ready or if model errored
    if (faceModelState === 'LOADING' || faceModelState === 'NOT_INITIALIZED') {
      setErrorMsg('Loading face recognition model. Please wait...');
      return;
    }

    if (faceModelState === 'MODEL_ERROR') {
      setErrorMsg('Model failed to load. Please refresh and check your camera.');
      return;
    }

    // 1. Guard against teacher credentials in student login
    if (enteredTeacherAccount) {
      setErrorMsg(
        `"${enteredTeacherAccount.teacherId}" is an Instructor/Teacher account. Please switch to the "Teacher Portal" tab above to log in with teacher credentials.`
      );
      return;
    }

    if (!trimmedPass) {
      setErrorMsg('Please enter your Student Password.');
      return;
    }

    if (!matchedStudent) {
      setErrorMsg(`Student Roll No "${trimmedId}" is not registered. Please switch to the "Sign In / Register" tab to create your profile.`);
      return;
    }

    // 2. Guard: Student must have an enrolled face snapshot
    if (!matchedStudent.faceSnapshot) {
      setErrorMsg(
        `Biometric Profile Required: Roll No "${matchedStudent.rollNo}" has no enrolled facial profile. Please switch to the "Sign In / Register" tab to complete facial enrollment.`
      );
      return;
    }

    // 3. Camera face presence
    if (!isLiveFaceDetected) {
      setErrorMsg('Face recognition ready. Please verify your identity.');
      return;
    }

    // 4. In progress verification guard
    if (faceModelState === 'VERIFICATION_IN_PROGRESS') {
      setErrorMsg('Verifying your registered identity... Please hold still in front of the camera.');
      return;
    }

    // 5. Biometric identity check: strictly enforce match
    if (faceModelState === 'VERIFICATION_FAILED' || !isBiometricMatched) {
      setErrorMsg('Face does not match the registered student. Login denied.');
      return;
    }

    if (faceModelState !== 'VERIFIED') {
      setErrorMsg('Face recognition ready. Please verify your identity.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await loginStudentWithFace(
        trimmedId, 
        trimmedPass, 
        isLiveFaceDetected,
        isBiometricMatched,
        undefined,
        liveFaceDescriptor || undefined
      );
      if (!res.success) {
        setErrorMsg(res.error || 'Authentication failed. Please check credentials and biometric verification.');
      } else {
        setSuccessMsg('Biometric profile verified successfully! Entering exam portal...');
      }
    } catch (err: any) {
      console.error('Student login error:', err);
      setErrorMsg(err?.message || 'Login error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStudentRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!id.trim()) {
      setErrorMsg('Please enter your Student Roll Number.');
      return;
    }
    if (!name.trim()) {
      setErrorMsg('Please enter your Full Name.');
      return;
    }
    if (!password.trim()) {
      setErrorMsg('Please enter a Password.');
      return;
    }
    if (password.length < 4) {
      setErrorMsg('Password should be at least 4 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please verify Confirm Password.');
      return;
    }
    if (!capturedFaceData) {
      setErrorMsg('Biometric Photo Required: Please click "Take Photo Now" or "Upload Photo" below to enroll your face image.');
      return;
    }

    setIsLoading(true);
    try {
      const registeredRoll = id.trim().toUpperCase();
      const res = await registerStudent(
        id.trim(), 
        name.trim(), 
        password.trim(), 
        capturedFaceData,
        capturedFaceDescriptor || undefined
      );
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to register student account.');
      } else {
        setSuccessMsg(`Student profile & Face biometric enrolled successfully for "${registeredRoll}"! Please authenticate with your credentials and face below.`);
        // Switch to Student Login tab with pre-filled Roll Number
        setTimeout(() => {
          setStudentAuthMode('login');
          setPassword('');
          setConfirmPassword('');
          setCapturedFaceData(null);
          setCapturedFaceDescriptor(null);
        }, 1200);
      }
    } catch (err: any) {
      console.error('Student register error:', err);
      setErrorMsg(err?.message || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTeacherLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!id.trim() || !password.trim()) {
      setErrorMsg('Please enter your Teacher ID and Password.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await loginAsTeacher(id.trim(), password.trim());
      if (!res.success) {
        setErrorMsg(res.error || 'Invalid Teacher ID or Password.');
      }
    } catch (err: any) {
      console.error('Teacher login error:', err);
      setErrorMsg(err?.message || 'Teacher authentication error.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleTeacherLogin = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsLoading(true);
    try {
      const res = await loginWithGoogle('admin');
      if (res && !res.success) {
        setErrorMsg(res.error || 'Google login failed.');
      }
    } catch (err: any) {
      console.error('Google teacher login error:', err);
      setErrorMsg(err?.message || 'Failed to authenticate with Google.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAuthReady) return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4 sm:p-6 py-12">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-xl bg-white/5 backdrop-blur-2xl border border-white/10 p-6 sm:p-10 rounded-[2.5rem] shadow-2xl space-y-6"
      >
        {/* App Title Header */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl mx-auto flex items-center justify-center shadow-xl shadow-indigo-500/20">
            <Shield size={32} className="text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Dharmastra: Online Exam Proctoring System</h1>
          <p className="text-white/50 text-xs font-medium">Biometric Integrity & Real-Time Proctored Examination Platform</p>
        </div>

        {/* Main Role Toggle Tabs: Student vs Teacher */}
        <div className="flex p-1 bg-white/5 rounded-2xl border border-white/5">
          <button 
            onClick={() => { 
              setRole('student'); 
              setId('');
              setPassword('');
              setName('');
              setConfirmPassword('');
              setErrorMsg(null); 
              setSuccessMsg(null);
              setIsLiveFaceDetected(false);
              setIsBiometricMatched(false);
              setBiometricMatchScore(undefined);
            }}
            className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
              role === 'student' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'text-white/40 hover:text-white'
            }`}
          >
            <GraduationCap size={16} /> Student Portal
          </button>
          <button 
            onClick={() => { 
              setRole('admin'); 
              setId('');
              setPassword('');
              setName('');
              setConfirmPassword('');
              setErrorMsg(null); 
              setSuccessMsg(null);
              setIsLiveFaceDetected(false);
              setIsBiometricMatched(false);
              setBiometricMatchScore(undefined);
            }}
            className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
              role === 'admin' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'text-white/40 hover:text-white'
            }`}
          >
            <KeyRound size={16} /> Teacher Portal
          </button>
        </div>

        {/* Student Sub-Tabs: Login vs Sign In (Register) */}
        {role === 'student' && (
          <div className="flex p-1 bg-black/40 rounded-xl border border-white/10">
            <button
              onClick={() => {
                setStudentAuthMode('login');
                setErrorMsg(null);
                setSuccessMsg(null);
                setIsLiveFaceDetected(false);
                setIsBiometricMatched(false);
                setBiometricMatchScore(undefined);
              }}
              className={`flex-1 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                studentAuthMode === 'login' 
                  ? 'bg-white/15 text-white shadow' 
                  : 'text-white/40 hover:text-white/80'
              }`}
            >
              <LogIn size={14} /> Student Login
            </button>
            <button
              onClick={() => {
                setStudentAuthMode('register');
                setErrorMsg(null);
                setSuccessMsg(null);
                setIsLiveFaceDetected(false);
                setIsBiometricMatched(false);
                setBiometricMatchScore(undefined);
              }}
              className={`flex-1 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                studentAuthMode === 'register' 
                  ? 'bg-emerald-600 text-white shadow' 
                  : 'text-white/40 hover:text-white/80'
              }`}
            >
              <UserPlus size={14} /> Sign In / Register
            </button>
          </div>
        )}

        {/* Status Alerts */}
        {errorMsg && (
          <motion.div 
            initial={{ opacity: 0, y: -5 }} 
            animate={{ opacity: 1, y: 0 }} 
            className="p-4 bg-red-500/15 border border-red-500/30 rounded-2xl text-red-400 text-xs font-semibold flex items-start gap-3"
          >
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </motion.div>
        )}

        {successMsg && (
          <motion.div 
            initial={{ opacity: 0, y: -5 }} 
            animate={{ opacity: 1, y: 0 }} 
            className="p-4 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl text-emerald-300 text-xs font-semibold flex items-start gap-3"
          >
            <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </motion.div>
        )}

        {/* ===================== STUDENT LOGIN FORM ===================== */}
        {role === 'student' && studentAuthMode === 'login' && (
          <form onSubmit={handleStudentLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-white/50 uppercase tracking-widest ml-1">
                Student Roll No *
              </label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={18} />
                <input
                  type="text"
                  required
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all uppercase placeholder:normal-case font-mono"
                  placeholder="e.g. 4JN23CS089"
                />
              </div>

              {/* Contextual Guidance for entered ID */}
              {enteredTeacherAccount && (
                <div className="p-3 bg-amber-500/15 border border-amber-500/30 rounded-xl text-amber-300 text-xs flex items-center gap-2 mt-2">
                  <AlertCircle size={16} className="shrink-0 text-amber-400" />
                  <span>
                    <strong>Instructor Account:</strong> "{enteredTeacherAccount.teacherId}" is a Teacher ID. Please click <strong>Teacher Portal</strong> above to log in.
                  </span>
                </div>
              )}

              {id.trim() && !enteredTeacherAccount && !matchedStudent && (
                <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-xs flex items-center gap-2 mt-1.5">
                  <AlertCircle size={15} className="shrink-0 text-amber-400" />
                  <span>
                    Roll Number not found in student directory. Switch to <strong>Sign In / Register</strong> above to enroll.
                  </span>
                </div>
              )}

              {matchedStudent && !matchedStudent.faceSnapshot && (
                <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-xs flex items-center gap-2 mt-1.5">
                  <AlertCircle size={15} className="shrink-0 text-amber-400" />
                  <span>
                    <strong>Biometric Profile Missing:</strong> Roll No "{matchedStudent.rollNo}" has no face photo. Please switch to <strong>Sign In / Register</strong> to complete camera enrollment.
                  </span>
                </div>
              )}

              {matchedStudent && matchedStudent.faceSnapshot && (
                <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-300 text-xs flex items-center justify-between mt-1.5">
                  <div className="flex items-center gap-2">
                    <img src={matchedStudent.faceSnapshot} alt="Profile" className="w-6 h-6 rounded-md object-cover border border-emerald-500/40" />
                    <span>Enrolled: <strong>{matchedStudent.name}</strong></span>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400 font-bold">Face Profile Active ✓</span>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-white/50 uppercase tracking-widest ml-1">
                Student Password *
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={18} />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-mono"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {/* Live Face Authentication Section */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between px-1">
                <label className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest flex items-center gap-1.5">
                  <ScanFace size={14} /> Live Biometric Scan *
                </label>
                <span className={`text-[10px] font-bold uppercase ${
                  isLiveFaceDetected 
                    ? matchedStudent?.faceSnapshot 
                      ? isBiometricMatched 
                        ? 'text-emerald-400' 
                        : biometricMatchScore !== undefined
                          ? 'text-red-400'
                          : 'text-indigo-400' 
                      : 'text-amber-400' 
                    : 'text-amber-400'
                }`}>
                  {isLiveFaceDetected 
                    ? matchedStudent?.faceSnapshot 
                      ? isBiometricMatched 
                        ? `Biometric Match (${biometricMatchScore ?? 95}%) ✓` 
                        : biometricMatchScore !== undefined
                          ? `Face Mismatch (${biometricMatchScore}%) ✗` 
                          : 'Verifying Face Biometrics...'
                      : 'Biometric Profile Not Enrolled' 
                    : 'Looking for Face...'}
                </span>
              </div>

              <StudentFaceScanner
                mode="authenticate"
                onFaceStatusChange={(detected, count, score, isMatch, descriptor) => {
                  setIsLiveFaceDetected(detected);
                  setIsBiometricMatched(isMatch ?? false);
                  setBiometricMatchScore(score);
                  setLiveFaceDescriptor(descriptor || null);
                }}
                onModelStateChange={(state, msg) => {
                  setFaceModelState(state);
                  setFaceModelMessage(msg);
                }}
                enrolledFacePhoto={matchedStudent?.faceSnapshot}
                enrolledDescriptor={matchedStudent?.faceDescriptor}
                studentName={matchedStudent?.name}
                studentRollNo={matchedStudent?.rollNo}
              />
            </div>

            <button
              type="submit"
              disabled={
                isLoading ||
                faceModelState !== 'VERIFIED' ||
                !isBiometricMatched ||
                !id.trim() ||
                !password.trim() ||
                !!enteredTeacherAccount ||
                !matchedStudent ||
                !matchedStudent.faceSnapshot ||
                !isLiveFaceDetected
              }
              className={`w-full py-4 rounded-2xl transition-all font-bold text-sm shadow-xl flex items-center justify-center gap-2 ${
                isLoading
                  ? 'bg-indigo-600/50 text-white/50 cursor-wait'
                  : faceModelState === 'LOADING' || faceModelState === 'NOT_INITIALIZED'
                    ? 'bg-indigo-950/40 text-indigo-300/60 border border-indigo-500/20 cursor-wait'
                    : faceModelState === 'MODEL_ERROR'
                      ? 'bg-red-950/40 text-red-300 border border-red-500/30 cursor-not-allowed'
                      : enteredTeacherAccount
                        ? 'bg-amber-600/30 text-amber-300 border border-amber-500/30 cursor-not-allowed'
                        : !matchedStudent && id.trim()
                          ? 'bg-white/5 text-white/40 border border-white/10 cursor-not-allowed'
                          : matchedStudent && !matchedStudent.faceSnapshot
                            ? 'bg-amber-600/30 text-amber-300 border border-amber-500/30 cursor-not-allowed'
                            : !isLiveFaceDetected
                              ? 'bg-indigo-600/40 text-white/50 border border-indigo-500/20 cursor-not-allowed'
                              : faceModelState === 'VERIFICATION_IN_PROGRESS'
                                ? 'bg-indigo-600/50 text-white cursor-wait'
                                : faceModelState === 'VERIFICATION_FAILED' || !isBiometricMatched
                                  ? 'bg-red-600/70 text-white border border-red-500/40 cursor-not-allowed shadow-red-600/20'
                                  : faceModelState === 'VERIFIED' && isBiometricMatched
                                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30 cursor-pointer'
                                    : 'bg-indigo-600/50 text-white/50 cursor-not-allowed'
              }`}
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Verifying Biometrics & Logging In...
                </>
              ) : faceModelState === 'LOADING' || faceModelState === 'NOT_INITIALIZED' ? (
                <>
                  <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  Loading face recognition model. Please wait...
                </>
              ) : faceModelState === 'MODEL_ERROR' ? (
                <>
                  <AlertCircle size={18} className="text-red-400" />
                  Model failed to load. Please refresh and check your camera.
                </>
              ) : enteredTeacherAccount ? (
                <>
                  <KeyRound size={18} /> Teacher Account (Switch to Teacher Portal)
                </>
              ) : !matchedStudent && id.trim() ? (
                <>
                  <UserPlus size={18} /> Student Not Registered (Switch to Register)
                </>
              ) : matchedStudent && !matchedStudent.faceSnapshot ? (
                <>
                  <ScanFace size={18} /> Biometric Profile Needed (Switch to Register)
                </>
              ) : !isLiveFaceDetected ? (
                <>
                  <ScanFace size={18} /> Face recognition ready. Please verify your identity.
                </>
              ) : faceModelState === 'VERIFICATION_IN_PROGRESS' ? (
                <>
                  <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  Verifying your registered identity...
                </>
              ) : faceModelState === 'VERIFICATION_FAILED' || (matchedStudent?.faceSnapshot && !isBiometricMatched) ? (
                <>
                  <UserX size={18} /> Face does not match the registered student. Login denied.
                </>
              ) : faceModelState === 'VERIFIED' && isBiometricMatched ? (
                <>
                  <ShieldCheck size={18} /> Identity verified. You may proceed.
                </>
              ) : (
                <>
                  <ScanFace size={18} /> Face recognition ready. Please verify your identity.
                </>
              )}
            </button>
          </form>
        )}

        {/* ===================== STUDENT SIGN IN (REGISTRATION) FORM ===================== */}
        {role === 'student' && studentAuthMode === 'register' && (
          <form onSubmit={handleStudentRegister} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-white/50 uppercase tracking-widest ml-1">
                  Student Roll No *
                </label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={18} />
                  <input
                    type="text"
                    required
                    value={id}
                    onChange={(e) => setId(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all uppercase placeholder:normal-case font-mono"
                    placeholder="e.g. 4JN23CS089"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-white/50 uppercase tracking-widest ml-1">
                  Full Name *
                </label>
                <div className="relative">
                  <GraduationCap className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={18} />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                    placeholder="e.g. Alex Johnson"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-white/50 uppercase tracking-widest ml-1">
                  Create Password *
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={18} />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-mono"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-white/50 uppercase tracking-widest ml-1">
                  Confirm Password *
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={18} />
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-mono"
                    placeholder="••••••••"
                  />
                </div>
              </div>
            </div>

            {/* Live Face Detection & Enrollment Scanner */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between px-1">
                <label className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                  <ScanFace size={14} /> Face Detection & Enrollment System *
                </label>
                <span className={`text-[10px] font-bold uppercase ${capturedFaceData ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {capturedFaceData ? 'Face Enrolled ✓' : 'Biometric Capture Required'}
                </span>
              </div>

              <StudentFaceScanner
                mode="register"
                capturedImage={capturedFaceData}
                onFaceCaptured={(dataUrl, descriptor) => {
                  setCapturedFaceData(dataUrl);
                  setCapturedFaceDescriptor(descriptor || null);
                }}
                onResetCapture={() => {
                  setCapturedFaceData(null);
                  setCapturedFaceDescriptor(null);
                }}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-4 rounded-2xl transition-all font-bold text-sm shadow-xl flex items-center justify-center gap-2 cursor-pointer ${
                capturedFaceData 
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30' 
                  : 'bg-emerald-600/85 hover:bg-emerald-600 text-white'
              }`}
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Creating Student Profile...
                </>
              ) : (
                <>
                  <UserPlus size={18} /> Complete Sign In & Register Profile
                </>
              )}
            </button>
          </form>
        )}

        {/* ===================== TEACHER PORTAL FORM ===================== */}
        {role === 'admin' && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={handleGoogleTeacherLogin}
              disabled={isLoading}
              className="w-full py-3.5 px-4 bg-white/10 hover:bg-white/15 active:scale-[0.99] border border-white/20 rounded-2xl text-white font-bold text-sm transition-all shadow-md flex items-center justify-center gap-3 cursor-pointer hover:border-white/30 group"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>Sign in with Google (Teacher Account)</span>
            </button>

            <div className="relative flex items-center justify-center my-2">
              <div className="border-t border-white/10 w-full" />
              <span className="bg-[#121217] px-3 text-[10px] uppercase font-bold tracking-widest text-white/40 absolute">
                or sign in with teacher id
              </span>
            </div>

            <form onSubmit={handleTeacherLogin} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-white/50 uppercase tracking-widest ml-1">
                  Teacher ID *
                </label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={18} />
                  <input
                    type="text"
                    required
                    value={id}
                    onChange={(e) => setId(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-mono"
                    placeholder="e.g. TCH101 or smith_prof"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-white/50 uppercase tracking-widest ml-1">
                  Teacher Password *
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={18} />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-mono"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 group text-sm cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Authenticating Teacher...
                  </>
                ) : (
                  <>
                    <LogIn size={18} className="group-hover:translate-x-1 transition-transform" />
                    Login with Teacher ID
                  </>
                )}
              </button>

              <div className="pt-2 text-center">
                <p className="text-[11px] text-white/35">
                  Main Administrator Access: <span className="text-indigo-300 font-mono font-medium">MAINADMIN</span> or <span className="text-indigo-300 font-mono font-medium">nandeesh.as.2005@gmail.com</span>
                </p>
              </div>
            </form>
          </div>
        )}
      </motion.div>
    </div>
  );
};

const MainApp: React.FC = () => {
  const { user, sessionId, startExam, isAuthReady, logout, subjects, activeSubjectId, setActiveSubjectId, isAiActive } = useExam();
  const [view, setView] = useState<'student' | 'admin'>('student');
  const [selectedExamSubId, setSelectedExamSubId] = useState<string>(activeSubjectId || subjects[0]?.id || '');
  const [testPasscode, setTestPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [passcodeError, setPasscodeError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isAiInitialized, setIsAiInitialized] = useState<boolean>(() => areModelsReady());
  const [aiInitStatus, setAiInitStatus] = useState<'loading' | 'ready' | 'error'>(() => areModelsReady() ? 'ready' : 'loading');

  // Background initialize AI neural models as soon as student enters portal
  useEffect(() => {
    if (user?.role === 'student' && !sessionId) {
      if (areModelsReady()) {
        setIsAiInitialized(true);
        setAiInitStatus('ready');
      } else {
        setAiInitStatus('loading');
        preloadAiModels()
          .then(() => {
            setIsAiInitialized(true);
            setAiInitStatus('ready');
          })
          .catch(e => {
            console.warn('Preload AI models background note:', e);
            setAiInitStatus('error');
          });
      }
    }
  }, [user, sessionId]);

  useEffect(() => {
    if (user?.role === 'student') {
      setView('student');
    } else if (user?.role === 'admin') {
      setView('admin');
    }
  }, [user]);

  useEffect(() => {
    if (activeSubjectId) {
      setSelectedExamSubId(activeSubjectId);
    }
  }, [activeSubjectId]);

  const launchExamSession = async () => {
    setIsStarting(true);
    try {
      const res = await startExam(selectedExamSubId, testPasscode.trim());
      if (!res.success) {
        setPasscodeError(res.error || 'Invalid test passcode. Please check with your teacher.');
        setIsStarting(false);
        return;
      }

      // Enter fullscreen if possible
      try {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
      } catch (err) {
        console.warn('Fullscreen request skipped or not allowed in preview container:', err);
      }
    } catch (err: any) {
      setPasscodeError(err?.message || 'Failed to start examination session.');
    } finally {
      setIsStarting(false);
    }
  };

  const handleStartExam = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setPasscodeError(null);

    if (!testPasscode.trim()) {
      setPasscodeError('Please enter the Test Password / Passcode given by the teacher to begin this exam.');
      return;
    }

    // Pre-validate password against designated subject before starting
    const curSub = subjects.find(s => s.id === selectedExamSubId) || subjects[0];
    if (curSub?.examPassword && curSub.examPassword.trim() !== testPasscode.trim()) {
      setPasscodeError(`Incorrect test passcode for "${curSub.name}". Please check with your teacher.`);
      return;
    }

    // Ensure exam NEVER starts until the AI is initialized
    if (!areModelsReady() && !isAiInitialized) {
      setIsStarting(true);
      try {
        await preloadAiModels();
        setIsAiInitialized(true);
        setAiInitStatus('ready');
      } catch (err: any) {
        setIsStarting(false);
        setPasscodeError('AI Proctoring system could not be initialized. Please check network connection and try again.');
        return;
      }
    }

    // AI is verified initialized - launch exam directly without modal gate
    await launchExamSession();
  };

  if (!isAuthReady) return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!user) return <LoginPage />;

  // Only users with verified admin role are permitted to view the Teacher & Auditor Dashboard
  if (user.role === 'admin' && view === 'admin') return (
    <>
      <button 
        onClick={() => setView('student')}
        className="fixed top-8 right-8 z-50 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg cursor-pointer transition-all flex items-center gap-2"
      >
        <GraduationCap size={15} /> Student Preview View
      </button>
      <AuditorDashboard />
    </>
  );

  const currentSelectedSubject = subjects.find(s => s.id === selectedExamSubId) || subjects[0];

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <nav className="border-b border-white/10 bg-black/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-indigo-600/30">
              <Shield size={20} />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-lg md:text-xl tracking-tight leading-none text-white">Dharmastra</span>
              <span className="text-[10px] text-indigo-300 font-semibold tracking-wider uppercase mt-0.5">Online Exam Proctoring System</span>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            {user.role === 'admin' && (
              <button 
                onClick={() => setView('admin')}
                className="flex items-center gap-2 text-xs font-bold text-white/50 hover:text-white transition-colors uppercase tracking-widest"
              >
                <LayoutDashboard size={16} /> Auditor Panel
              </button>
            )}
            <div className="h-8 w-[1px] bg-white/10" />
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-bold">{user.name}</p>
                <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">{user.id}</p>
              </div>
              <button 
                onClick={logout}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors"
              >
                <LogIn size={20} className="rotate-180" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="py-12">
        {!sessionId ? (
          <div className="max-w-3xl mx-auto text-center space-y-8 px-6">
            <div className="space-y-4">
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Ready to begin your examination?</h1>
              <p className="text-white/50 text-sm md:text-base max-w-xl mx-auto">
                Please select your designated subject paper and enter the test password provided by your teacher to unlock the exam.
              </p>
            </div>

            {/* Subject Selection for Students */}
            <div className="text-left space-y-3">
              <label className="text-xs font-bold text-white/50 uppercase tracking-wider block">
                1. Select Exam Subject Paper:
              </label>

              {subjects.length === 0 ? (
                <div className="p-8 rounded-2xl bg-white/5 border border-dashed border-white/20 text-center space-y-2">
                  <p className="text-sm font-bold text-white">No Exam Papers Available</p>
                  <p className="text-xs text-white/50">Your instructor has not published any exam subject papers yet. Please check back later.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {subjects.map(sub => {
                    const isSel = sub.id === selectedExamSubId;
                    const qNum = sub.questions?.length || 0;
                    const ptsNum = (sub.questions || []).reduce((acc, curr) => acc + (curr.points || 10), 0);

                    return (
                      <div
                        key={sub.id}
                        onClick={() => {
                          setSelectedExamSubId(sub.id);
                          setActiveSubjectId(sub.id);
                          setPasscodeError(null);
                        }}
                        className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                          isSel 
                            ? 'bg-indigo-600/30 border-indigo-500 text-white shadow-xl ring-2 ring-indigo-500/50' 
                            : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:border-white/20'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase">
                              {sub.code}
                            </span>
                            <span className="text-[10px] font-semibold text-amber-300/80 flex items-center gap-1">
                              <Lock size={10} /> Password Protected
                            </span>
                          </div>
                          <h3 className="text-base font-bold text-white mt-2">{sub.name}</h3>
                          <p className="text-xs text-white/50 mt-1 line-clamp-2">{sub.description}</p>
                        </div>

                        <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs font-semibold text-white/60">
                          <span>{qNum} Questions</span>
                          <span className="text-emerald-400">{ptsNum} Points</span>
                          <span className="text-amber-300">{sub.durationMinutes || 30} Mins</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            
            {/* Rules Checkboxes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
              {[
                "Fullscreen mode is mandatory during test",
                "Tab switching & window unfocus is flagged",
                "Continuous AI Camera face proctoring active",
                "🚨 Zero Tolerance: Using mobile phone auto-submits & terminates exam"
              ].map((rule, i) => (
                <div key={i} className={`p-4 rounded-2xl flex items-center gap-3 border ${i === 3 ? 'bg-red-500/10 border-red-500/30 text-red-300' : 'bg-white/5 border-white/10 text-white/80'}`}>
                  <div className={`w-2 h-2 rounded-full shrink-0 ${i === 3 ? 'bg-red-500' : 'bg-indigo-500'}`} />
                  <span className="text-xs md:text-sm font-medium">{rule}</span>
                </div>
              ))}
            </div>

            {/* Test Password Verification Form Card */}
            <form onSubmit={handleStartExam} className="p-6 md:p-8 bg-gradient-to-b from-indigo-950/40 to-black/60 border border-indigo-500/30 rounded-3xl backdrop-blur-xl text-left space-y-5 shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-amber-500/20 text-amber-300 rounded-xl border border-amber-500/30">
                    <KeyRound size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">2. Enter Test Password (Exam Passcode)</h3>
                    <p className="text-xs text-white/50">
                      Authorization passcode for <strong className="text-indigo-300 font-bold">{currentSelectedSubject?.name} ({currentSelectedSubject?.code})</strong>
                    </p>
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-300 text-xs font-mono font-bold">
                  <Lock size={12} /> Required
                </div>
              </div>

              {passcodeError && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3.5 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center gap-3 text-red-300 text-xs font-medium"
                >
                  <AlertCircle size={18} className="shrink-0 text-red-400" />
                  <span>{passcodeError}</span>
                </motion.div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-bold text-white/70 uppercase tracking-wider block">
                  Exam Passcode:
                </label>
                <div className="relative">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={18} />
                  <input
                    type={showPasscode ? 'text' : 'password'}
                    required
                    placeholder={`Enter password for ${currentSelectedSubject?.code || 'exam'}...`}
                    value={testPasscode}
                    onChange={(e) => {
                      setTestPasscode(e.target.value);
                      if (passcodeError) setPasscodeError(null);
                    }}
                    className="w-full bg-black/60 border border-white/20 focus:border-indigo-500 rounded-2xl pl-12 pr-12 py-4 text-sm text-white font-mono placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all tracking-wider"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasscode(!showPasscode)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors p-1"
                    title={showPasscode ? "Hide password" : "Show password"}
                  >
                    {showPasscode ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <p className="text-[11px] text-white/40">
                  Ask your test administrator or teacher for the secret access code if you haven't received it yet.
                </p>
              </div>

              {/* AI Proctoring Initialization Status Badge */}
              <div className="flex items-center justify-between text-xs px-1 pt-1 border-t border-white/10">
                <span className="text-white/40 uppercase tracking-wider text-[11px] font-semibold">AI Proctoring Engine:</span>
                {areModelsReady() || isAiInitialized ? (
                  <span className="text-emerald-400 font-semibold flex items-center gap-1.5 text-xs">
                    <Sparkles size={14} className="text-emerald-400" />
                    AI Initialized & Ready
                  </span>
                ) : aiInitStatus === 'error' ? (
                  <span className="text-red-400 font-semibold flex items-center gap-1.5 text-xs">
                    <AlertCircle size={14} className="text-red-400" />
                    Neural Init Retrying...
                  </span>
                ) : (
                  <span className="text-amber-300 font-semibold flex items-center gap-2 text-xs">
                    <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                    Initializing AI Models...
                  </span>
                )}
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isStarting || (!areModelsReady() && !isAiInitialized)}
                  className={`w-full py-4.5 rounded-2xl transition-all shadow-xl text-base flex items-center justify-center gap-3 border font-bold ${
                    (!areModelsReady() && !isAiInitialized) 
                      ? 'bg-indigo-950/50 text-indigo-300/70 border-indigo-500/20 cursor-wait'
                      : 'bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white shadow-indigo-600/30 border-indigo-400/30 cursor-pointer disabled:opacity-50'
                  }`}
                >
                  {isStarting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>{(!areModelsReady() && !isAiInitialized) ? 'Initializing AI Proctoring...' : 'Verifying Passcode & Launching Exam...'}</span>
                    </>
                  ) : (!areModelsReady() && !isAiInitialized) ? (
                    <>
                      <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                      <span>Initializing AI Proctoring... Please wait</span>
                    </>
                  ) : (
                    <>
                      <Lock size={18} />
                      <span>Unlock & Begin Exam for {currentSelectedSubject?.code || 'Selected Subject'}</span>
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 px-8 max-w-[1600px] mx-auto">
            <div className="lg:col-span-3">
              <ExamInterface />
            </div>
            <div className="space-y-6">
              <div className="sticky top-32">
                <p className="text-xs font-bold text-white/40 uppercase tracking-widest mb-4 ml-1">Live AI Proctoring</p>
                <CameraMonitor />
                <div className="mt-6">
                  <ProctorDashboard />
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default function App() {
  return (
    <ExamProvider>
      <MainApp />
    </ExamProvider>
  );
}

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  doc, 
  setDoc, 
  getDoc, 
  getDocs,
  deleteDoc,
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  limit,
  serverTimestamp,
  updateDoc,
  increment,
  runTransaction
} from 'firebase/firestore';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { db, auth, googleProvider } from './firebase';
import { handleFirestoreError, OperationType, sanitizeForFirestore } from './utils/firestoreError';
import { hashPassword, verifyPassword } from './utils/authSecurity';
import { verifyBiometricIdentity } from './utils/faceRecognitionService';
import { 
  QUESTIONS, 
  Question, 
  Subject, 
  DEFAULT_SUBJECTS, 
  TeacherAccount, 
  DEFAULT_TEACHERS,
  StudentAccount,
  DEFAULT_STUDENTS,
  PENALTIES,
  getViolationPenalty
} from './constants';

export interface User {
  id: string;
  name: string;
  role: 'student' | 'admin';
  email?: string;
  isSuperAdmin?: boolean;
  teacherId?: string;
  rollNo?: string;
  faceSnapshot?: string;
  faceDescriptor?: number[];
}

interface Violation {
  id: string;
  type: string;
  timestamp: string;
  details?: any;
}

export interface DisqualificationInfo {
  isDisqualified: boolean;
  reason: string;
  type: 'ELECTRONIC_DEVICE_USAGE' | 'MOBILE_PHONE_USAGE' | 'CRITICAL_INTEGRITY' | string;
  deviceClass?: string;
  timestamp: string;
  screenshot?: string | null;
  message: string;
  studentAnswers?: Record<string | number, any>;
  subjectName?: string;
  subjectCode?: string;
}

interface ExamContextType {
  user: User | null;
  sessionId: string | null;
  trustScore: number;
  isFaceDetected: boolean;
  faceCount: number;
  violations: Violation[];
  questions: Question[];
  subjects: Subject[];
  teachers: TeacherAccount[];
  students: StudentAccount[];
  activeSubjectId: string;
  selectedSubject: Subject | null;
  disqualification: DisqualificationInfo | null;
  currentAnswers: Record<string | number, any>;
  setCurrentAnswers: (answers: Record<string | number, any>) => void;
  autoSubmitExamOnElectronicDevice: (screenshot?: string | null, answersOverride?: Record<string | number, any>, deviceClass?: string) => Promise<void>;
  autoSubmitExamOnMobilePhone: (screenshot?: string | null, answersOverride?: Record<string | number, any>, deviceClass?: string) => Promise<void>;
  resetDisqualification: () => void;
  setActiveSubjectId: (id: string) => void;
  addSubject: (name: string, code: string, description?: string, durationMinutes?: number, examPassword?: string, creatorTeacherId?: string, creatorTeacherName?: string) => Promise<void>;
  deleteSubject: (id: string) => Promise<{ success: boolean; error?: string }>;
  clearAllSubjects: () => Promise<void>;
  updateSubjectSettings: (subjectId: string, updates: Partial<Subject>) => Promise<void>;
  updateSubjectQuestions: (subjectId: string, newQuestions: Question[]) => Promise<void>;
  updateQuestions: (newQuestions: Question[]) => Promise<void>;
  addTeacher: (teacherId: string, name: string, password: string, department?: string, email?: string) => Promise<{ success: boolean; error?: string }>;
  deleteTeacher: (id: string) => Promise<void>;
  clearAllTeachers: () => Promise<void>;
  loginAsTeacher: (teacherId: string, password: string) => Promise<{ success: boolean; error?: string }>;
  registerStudent: (rollNo: string, name: string, password: string, faceSnapshot?: string, faceDescriptor?: number[]) => Promise<{ success: boolean; error?: string }>;
  loginStudentWithFace: (rollNo: string, password: string, liveFaceDetected: boolean, isBiometricMatched?: boolean, liveFaceSnapshot?: string, liveFaceDescriptor?: number[]) => Promise<{ success: boolean; error?: string; student?: StudentAccount }>;
  deleteStudent: (id: string) => Promise<void>;
  clearAllStudents: () => Promise<void>;
  setIsFaceDetected: (detected: boolean) => void;
  setFaceCount: (count: number) => void;
  isAiActive: boolean;
  setIsAiActive: (active: boolean) => void;
  aiStatus: 'idle' | 'loading' | 'active' | 'error';
  setAiStatus: (status: 'idle' | 'loading' | 'active' | 'error') => void;
  isIdentitySuspended: boolean;
  setIsIdentitySuspended: (suspended: boolean) => void;
  identityStatusMessage: string;
  setIdentityStatusMessage: (msg: string) => void;
  identityMatchScore: number;
  setIdentityMatchScore: (score: number) => void;
  login: (id: string, name: string, role: 'student' | 'admin') => Promise<void>;
  loginWithGoogle: (role: 'student' | 'admin') => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  startExam: (subjectId?: string, enteredPassword?: string) => Promise<{ success: boolean; error?: string }>;
  submitExam: (answers: any, options?: { autoSubmitted?: boolean; disqualified?: boolean; reason?: string; screenshot?: string | null }) => Promise<void>;
  exitExamSession: () => void;
  logViolation: (type: string, details?: any, eventId?: string) => Promise<void>;
  socket: Socket | null;
  isAuthReady: boolean;
  isSuperAdmin: boolean;
}

const ExamContext = createContext<ExamContextType | undefined>(undefined);

export const ExamProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const cached = localStorage.getItem('guardrail_user');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [sessionId, setSessionId] = useState<string | null>(() => {
    try {
      return localStorage.getItem('guardrail_session_id');
    } catch {
      return null;
    }
  });
  const [trustScore, setTrustScore] = useState<number>(() => {
    try {
      const sId = localStorage.getItem('guardrail_session_id');
      if (sId) {
        const cachedScore = localStorage.getItem(`guardrail_session_score_${sId}`);
        if (cachedScore !== null) {
          const parsed = parseInt(cachedScore, 10);
          if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
            return parsed;
          }
        }
      }
    } catch {}
    return 100;
  });
  const trustScoreRef = useRef<number>(trustScore);
  const processedEventsRef = useRef<Map<string, number>>(new Map());

  // Keep trustScoreRef strictly synchronized with trustScore
  useEffect(() => {
    trustScoreRef.current = trustScore;
  }, [trustScore]);
  const [isFaceDetected, setIsFaceDetected] = useState(true);
  const [faceCount, setFaceCount] = useState(0);
  const [isAiActive, setIsAiActive] = useState(false);
  const [aiStatus, setAiStatus] = useState<'idle' | 'loading' | 'active' | 'error'>('idle');
  const [violations, setViolations] = useState<Violation[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>(() => {
    try {
      const cached = localStorage.getItem('guardrail_subjects');
      return cached ? JSON.parse(cached) : DEFAULT_SUBJECTS;
    } catch {
      return DEFAULT_SUBJECTS;
    }
  });
  const [teachers, setTeachers] = useState<TeacherAccount[]>(() => {
    try {
      const cached = localStorage.getItem('guardrail_teachers');
      return cached ? JSON.parse(cached) : DEFAULT_TEACHERS;
    } catch {
      return DEFAULT_TEACHERS;
    }
  });
  const [students, setStudents] = useState<StudentAccount[]>(() => {
    try {
      const cached = localStorage.getItem('guardrail_students');
      return cached ? JSON.parse(cached) : DEFAULT_STUDENTS;
    } catch {
      return DEFAULT_STUDENTS;
    }
  });
  const [activeSubjectId, setActiveSubjectId] = useState<string>(DEFAULT_SUBJECTS[0].id);
  const [disqualification, setDisqualification] = useState<DisqualificationInfo | null>(null);
  const [currentAnswers, setCurrentAnswers] = useState<Record<string | number, any>>({});
  const [lastViolationSnapshot, setLastViolationSnapshot] = useState<string | null>(null);
  const [isIdentitySuspended, setIsIdentitySuspended] = useState<boolean>(false);
  const [identityStatusMessage, setIdentityStatusMessage] = useState<string>('Identity verified.');
  const [identityMatchScore, setIdentityMatchScore] = useState<number>(100);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // Sync subjects & questions configuration from Firestore real-time
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'config', 'subjects'), (docSnap) => {
      if (docSnap.exists() && docSnap.data().items && Array.isArray(docSnap.data().items)) {
        const fetchedSubjects: Subject[] = docSnap.data().items;
        setSubjects(fetchedSubjects);
        const activeId = docSnap.data().activeSubjectId || (fetchedSubjects[0]?.id || '');
        setActiveSubjectId(activeId);
      }
    }, (error) => {
      console.log('Using default subjects configuration');
    });

    return () => unsubscribe();
  }, []);

  // Sync teacher accounts configuration from Firestore real-time
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'config', 'teachers'), (docSnap) => {
      if (docSnap.exists() && docSnap.data().items && Array.isArray(docSnap.data().items)) {
        let items: TeacherAccount[] = docSnap.data().items;
        let foundAdmin = false;
        items = items.map(t => {
          if (t.email?.toLowerCase().trim() === 'mygamesprabhu@gmail.com' || t.teacherId.toUpperCase() === 'MAINADMIN' || t.id === 'tch_main_admin') {
            foundAdmin = true;
            return {
              ...t,
              name: 'keerthan Prabhu',
              teacherId: 'MAINADMIN',
              password: 'ADMINDHARMAASTRA',
              department: 'Computer Science and Engineering',
              email: 'mygamesprabhu@gmail.com'
            };
          }
          return t;
        });

        if (!foundAdmin) {
          items = [DEFAULT_TEACHERS[0], ...items];
        }

        setTeachers(items);
      }
    }, (error) => {
      console.log('Using default teachers configuration');
    });

    return () => unsubscribe();
  }, []);

  // Sync student accounts directly from persistent Firestore collection 'students' in real-time
  useEffect(() => {
    let isSubscribed = true;

    const loadStudents = async () => {
      try {
        const unsubscribe = onSnapshot(collection(db, 'students'), async (snapshot) => {
          if (!isSubscribed) return;

          if (!snapshot.empty) {
            const firestoreStudents: StudentAccount[] = snapshot.docs.map(docSnap => {
              const data = docSnap.data();
              const roll = (data.rollNo || docSnap.id).toString().trim().toUpperCase();
              return {
                id: data.id || `std_${roll}`,
                rollNo: roll,
                name: data.name || 'Student',
                passwordHash: data.passwordHash,
                password: data.password,
                faceSnapshot: data.faceSnapshot,
                faceDescriptor: data.faceDescriptor,
                faceEnrolledAt: data.faceEnrolledAt,
                createdAt: data.createdAt || new Date().toISOString()
              };
            });

            // Sort with enrolled faces first, then by creation date
            firestoreStudents.sort((a, b) => {
              if (a.faceSnapshot && !b.faceSnapshot) return -1;
              if (!a.faceSnapshot && b.faceSnapshot) return 1;
              return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            });

            setStudents(firestoreStudents);
            try {
              localStorage.setItem('guardrail_students', JSON.stringify(firestoreStudents));
            } catch (e) {}
          } else {
            // First time initialization: seed default students into Firestore collection
            try {
              for (const std of DEFAULT_STUDENTS) {
                const roll = std.rollNo.trim().toUpperCase();
                const passHash = await hashPassword(std.password || 'student123');
                const docPayload = sanitizeForFirestore({
                  id: std.id,
                  rollNo: roll,
                  name: std.name,
                  passwordHash: passHash,
                  password: std.password,
                  createdAt: std.createdAt || new Date().toISOString()
                });
                await setDoc(doc(db, 'students', roll), docPayload);
              }
            } catch (initErr) {
              console.warn('Initial student directory seed notice:', initErr);
            }
          }
        }, (error) => {
          console.warn('Firestore students collection listener notice:', error);
          // Fallback to local cache if offline
          try {
            const cached = localStorage.getItem('guardrail_students');
            if (cached) {
              setStudents(JSON.parse(cached));
            }
          } catch (e) {}
        });

        return () => {
          isSubscribed = false;
          unsubscribe();
        };
      } catch (err) {
        console.warn('Failed to initialize students snapshot:', err);
      }
    };

    loadStudents();

    return () => {
      isSubscribed = false;
    };
  }, []);

  // Compute selected subject and current questions
  const selectedSubject = subjects.find(s => s.id === activeSubjectId) || subjects[0] || null;
  const questions = selectedSubject ? selectedSubject.questions : (subjects.length === 0 ? [] : QUESTIONS);

  const saveSubjectsToFirestore = async (newSubjects: Subject[], targetActiveId?: string) => {
    const activeId = targetActiveId !== undefined
      ? targetActiveId
      : (newSubjects.some(s => s.id === activeSubjectId) ? activeSubjectId : (newSubjects[0]?.id || ''));
    // Update local state immediately
    setSubjects(newSubjects);
    setActiveSubjectId(activeId);
    try {
      localStorage.setItem('guardrail_subjects', JSON.stringify(newSubjects));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }

    try {
      await setDoc(doc(db, 'config', 'subjects'), sanitizeForFirestore({
        items: newSubjects,
        activeSubjectId: activeId,
        updatedAt: new Date().toISOString()
      }));
    } catch (error) {
      console.warn('Firestore sync config/subjects notice:', error);
    }
  };

  const addSubject = async (
    name: string, 
    code: string, 
    description?: string, 
    durationMinutes: number = 30,
    examPassword?: string,
    creatorTeacherId?: string,
    creatorTeacherName?: string
  ) => {
    const effectiveTeacherId = creatorTeacherId || user?.teacherId || (user?.role === 'admin' ? user?.id : '') || '';
    const effectiveTeacherName = creatorTeacherName || user?.name || 'Instructor';

    const newSubject: Subject = {
      id: `sub_${Date.now()}`,
      name,
      code,
      description: description || `Exam for ${name} (${code})`,
      durationMinutes,
      examPassword: examPassword?.trim() || 'EXAM123',
      isPublished: true,
      createdByTeacherId: effectiveTeacherId,
      createdByTeacherName: effectiveTeacherName,
      questions: [
        {
          id: `q_${Date.now()}_1`,
          text: `Sample question for ${name}`,
          type: 'mcq',
          options: ['Option A', 'Option B', 'Option C', 'Option D'],
          correctAnswer: 0,
          points: 10
        }
      ]
    };

    const updated = [...subjects, newSubject];
    await saveSubjectsToFirestore(updated, newSubject.id);
  };

  const updateSubjectSettings = async (subjectId: string, updates: Partial<Subject>) => {
    const updated = subjects.map(s => {
      if (s.id === subjectId) {
        return {
          ...s,
          ...updates,
          updatedAt: new Date().toISOString()
        };
      }
      return s;
    });
    await saveSubjectsToFirestore(updated);
  };

  const deleteSubject = async (subjectId: string): Promise<{ success: boolean; error?: string }> => {
    const updated = subjects.filter(s => s.id !== subjectId);
    const nextActiveId = updated.length > 0 
      ? (activeSubjectId === subjectId ? updated[0].id : activeSubjectId) 
      : '';
    await saveSubjectsToFirestore(updated, nextActiveId);
    return { success: true };
  };

  const clearAllSubjects = async () => {
    await saveSubjectsToFirestore([], '');
  };

  const updateSubjectQuestions = async (subjectId: string, newQuestions: Question[]) => {
    const updated = subjects.map(s => {
      if (s.id === subjectId) {
        return { ...s, questions: newQuestions, updatedAt: new Date().toISOString() };
      }
      return s;
    });
    await saveSubjectsToFirestore(updated);
  };

  const updateQuestions = async (newQuestions: Question[]) => {
    if (activeSubjectId) {
      await updateSubjectQuestions(activeSubjectId, newQuestions);
    }
  };

  useEffect(() => {
    const s = io();
    setSocket(s);

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // First, protect an active student session so background Firebase Auth does not stomp it
      try {
        const cachedStr = localStorage.getItem('guardrail_user');
        if (cachedStr) {
          const cached = JSON.parse(cachedStr);
          if (cached && cached.role === 'student') {
            setUser(cached);
            setIsAuthReady(true);
            return;
          }
        }
      } catch (e) {}

      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          const email = firebaseUser.email?.toLowerCase().trim();

          // Refresh current teachers list from firestore if possible
          let currentTeachers = teachers;
          try {
            const docSnap = await getDoc(doc(db, 'config', 'teachers'));
            if (docSnap.exists() && docSnap.data().items && Array.isArray(docSnap.data().items)) {
              currentTeachers = docSnap.data().items;
            }
          } catch (e) {}

          const matchedTeacher = email ? (
            currentTeachers.find(t => t.email && t.email.toLowerCase().trim() === email) ||
            DEFAULT_TEACHERS.find(t => t.email && t.email.toLowerCase().trim() === email)
          ) : undefined;

          const isMasterAdminEmail = email === 'mygamesprabhu@gmail.com' || email === 'nandeesh.as.2005@gmail.com';

          if (userDoc.exists()) {
            const data = userDoc.data() as User;
            if (data.role === 'admin') {
              if (!matchedTeacher && !isMasterAdminEmail) {
                localStorage.removeItem('guardrail_user');
                await signOut(auth);
                setUser(null);
                setIsAuthReady(true);
                return;
              }
            }
            const isSuper = isMasterAdminEmail || data.isSuperAdmin === true || data.id?.toUpperCase() === 'MAINADMIN' || data.teacherId?.toUpperCase() === 'MAINADMIN';
            const resolvedUser = { ...data, isSuperAdmin: isSuper };
            localStorage.setItem('guardrail_user', JSON.stringify(resolvedUser));
            setUser(resolvedUser);
          } else {
            if (matchedTeacher || isMasterAdminEmail) {
              const fallbackAdmin: User = {
                id: firebaseUser.uid,
                name: isMasterAdminEmail ? (matchedTeacher?.name || 'keerthan Prabhu') : (matchedTeacher?.name || firebaseUser.displayName || email?.split('@')[0] || 'Teacher'),
                role: 'admin',
                email: firebaseUser.email || undefined,
                isSuperAdmin: isMasterAdminEmail,
                teacherId: matchedTeacher?.teacherId || (isMasterAdminEmail ? 'MAINADMIN' : undefined)
              };
              localStorage.setItem('guardrail_user', JSON.stringify(fallbackAdmin));
              setUser(fallbackAdmin);
            } else {
              localStorage.removeItem('guardrail_user');
              await signOut(auth);
              setUser(null);
            }
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
        }
      } else {
        // If not in a student session, reset user
        try {
          const cachedStr = localStorage.getItem('guardrail_user');
          if (cachedStr) {
            const cached = JSON.parse(cachedStr);
            if (cached && cached.role === 'student') {
              setUser(cached);
              setIsAuthReady(true);
              return;
            }
          }
        } catch (e) {}
        setUser(null);
      }
      setIsAuthReady(true);
    });

    return () => { 
      s.disconnect(); 
      unsubscribe();
    };
  }, []);

  // Sync violations in real-time if session exists
  useEffect(() => {
    if (!sessionId) return;

    const q = query(
      collection(db, 'sessions', sessionId, 'violations'),
      orderBy('timestamp', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newViolations = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Violation[];
      setViolations(newViolations);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `sessions/${sessionId}/violations`);
    });

    return () => unsubscribe();
  }, [sessionId]);

  // Sync session status/score in real-time from Firestore
  useEffect(() => {
    if (!sessionId) return;

    const unsubscribe = onSnapshot(doc(db, 'sessions', sessionId), (docSnap) => {
      if (docSnap.exists()) {
        const rawScore = docSnap.data().trustScore;
        if (typeof rawScore === 'number') {
          const clamped = Math.max(0, Math.min(100, rawScore));
          setTrustScore(clamped);
          trustScoreRef.current = clamped;
          try {
            localStorage.setItem(`guardrail_session_score_${sessionId}`, String(clamped));
          } catch (e) {}
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `sessions/${sessionId}`);
    });

    return () => unsubscribe();
  }, [sessionId]);

  const saveStudentsToFirestore = async (newStudents: StudentAccount[]) => {
    // Immediate local state update and caching
    setStudents(newStudents);
    try {
      localStorage.setItem('guardrail_students', JSON.stringify(newStudents));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
  };

  const registerStudent = async (
    rollNo: string, 
    name: string, 
    password: string, 
    faceSnapshot?: string,
    faceDescriptor?: number[]
  ): Promise<{ success: boolean; error?: string }> => {
    const trimmedRoll = rollNo.trim().toUpperCase();
    const trimmedName = name.trim();
    const trimmedPass = password.trim();

    if (!trimmedRoll || !trimmedName || !trimmedPass) {
      return { success: false, error: 'Please fill in Roll Number, Full Name, and Password.' };
    }

    // 1. Guard: Prevent using Teacher ID or Teacher email as Student Roll No
    const isTeacherId = teachers.some(t => 
      t.teacherId.trim().toUpperCase() === trimmedRoll || 
      (t.email && t.email.trim().toUpperCase() === trimmedRoll)
    );
    if (isTeacherId) {
      return { 
        success: false, 
        error: `"${trimmedRoll}" is an Instructor/Teacher account. It cannot be registered as a Student Roll Number. Please switch to the "Teacher Portal" tab.` 
      };
    }

    // 2. Require camera face snapshot for student biometric registration
    if (!faceSnapshot) {
      return {
        success: false,
        error: 'Biometric Face Photo Required: Please capture your student face photo using your camera before submitting registration.'
      };
    }

    // 3. Compute secure SHA-256 password hash
    const passHash = await hashPassword(trimmedPass);

    // 4. Check if student already exists in persistent Firestore collection 'students'
    const studentDocRef = doc(db, 'students', trimmedRoll);
    let existingDocData: any = null;
    try {
      const snap = await getDoc(studentDocRef);
      if (snap.exists()) {
        existingDocData = snap.data();
      }
    } catch (readErr) {
      console.warn('Student doc pre-check note:', readErr);
    }

    // Also check current state/cache
    const existingInState = students.find(s => s.rollNo.trim().toUpperCase() === trimmedRoll);

    if ((existingDocData && existingDocData.faceSnapshot) || (existingInState && existingInState.faceSnapshot)) {
      return { 
        success: false, 
        error: `Student Roll Number "${trimmedRoll}" already exists with an enrolled facial profile. Please switch to the "Student Login" tab to authenticate.` 
      };
    }

    const newStudent: StudentAccount = {
      id: `std_${trimmedRoll}`,
      rollNo: trimmedRoll,
      name: trimmedName,
      passwordHash: passHash,
      password: trimmedPass, // kept for graceful backward compatibility
      faceSnapshot: faceSnapshot || undefined,
      faceDescriptor: faceDescriptor || undefined,
      faceEnrolledAt: new Date().toISOString(),
      createdAt: existingDocData?.createdAt || existingInState?.createdAt || new Date().toISOString()
    };

    // 5. Write atomically to persistent Firestore database collection 'students'
    try {
      await setDoc(studentDocRef, sanitizeForFirestore(newStudent));
    } catch (writeErr) {
      console.error('Failed to write student to Firestore:', writeErr);
      return {
        success: false,
        error: 'Database error saving student record. Please check network connection and try again.'
      };
    }

    // 6. Update students state and cache
    const updatedList = [
      newStudent,
      ...students.filter(s => s.rollNo.trim().toUpperCase() !== trimmedRoll)
    ];
    setStudents(updatedList);
    try {
      localStorage.setItem('guardrail_students', JSON.stringify(updatedList));
    } catch (e) {}

    return { success: true };
  };

  const loginStudentWithFace = async (
    rollNo: string, 
    password: string, 
    liveFaceDetected: boolean, 
    isBiometricMatched: boolean = false,
    liveFaceSnapshot?: string,
    liveFaceDescriptor?: number[]
  ): Promise<{ success: boolean; error?: string; student?: StudentAccount }> => {
    const trimmedRoll = rollNo.trim().toUpperCase();
    const trimmedPass = password.trim();

    if (!trimmedRoll || !trimmedPass) {
      return { success: false, error: 'Please enter both Student Roll No and Password.' };
    }

    // 1. Guard against Teacher credentials used in Student portal
    const isTeacher = teachers.some(t => 
      t.teacherId.trim().toUpperCase() === trimmedRoll || 
      (t.email && t.email.trim().toUpperCase() === trimmedRoll)
    );
    if (isTeacher) {
      return { 
        success: false, 
        error: `Teacher Account Detected: "${trimmedRoll}" is an Instructor/Teacher account. Please switch to the "Teacher Portal" tab to log in with teacher credentials.` 
      };
    }

    // 2. Require active face in camera
    if (!liveFaceDetected) {
      return { 
        success: false, 
        error: 'Face Authentication Required: No face detected in camera stream. Please align your face in front of the camera.' 
      };
    }

    // 3. Find student in persistent Firestore collection 'students' (with state/cache fallback)
    let matchedStudent: StudentAccount | undefined = undefined;
    try {
      const snap = await getDoc(doc(db, 'students', trimmedRoll));
      if (snap.exists()) {
        const data = snap.data();
        matchedStudent = {
          id: data.id || `std_${trimmedRoll}`,
          rollNo: (data.rollNo || trimmedRoll).toUpperCase(),
          name: data.name || 'Student',
          passwordHash: data.passwordHash,
          password: data.password,
          faceSnapshot: data.faceSnapshot,
          faceDescriptor: data.faceDescriptor,
          faceEnrolledAt: data.faceEnrolledAt,
          createdAt: data.createdAt || new Date().toISOString()
        };
      }
    } catch (fetchErr) {
      console.warn('Direct student Firestore fetch notice:', fetchErr);
    }

    if (!matchedStudent) {
      matchedStudent = students.find(s => s.rollNo.trim().toUpperCase() === trimmedRoll);
    }

    if (!matchedStudent) {
      try {
        const cachedStr = localStorage.getItem('guardrail_students');
        if (cachedStr) {
          const cachedList: StudentAccount[] = JSON.parse(cachedStr);
          matchedStudent = cachedList.find(s => s.rollNo.trim().toUpperCase() === trimmedRoll);
        }
      } catch (e) {}
    }

    if (!matchedStudent) {
      return { 
        success: false, 
        error: `Student Roll No "${trimmedRoll}" is not registered. Please switch to the "Sign In / Register" tab to create your account and enroll your face.` 
      };
    }

    // 4. Strictly verify Student Password using secure SHA-256 hash
    const isPasswordValid = await verifyPassword(
      trimmedPass, 
      matchedStudent.passwordHash, 
      matchedStudent.password
    );
    if (!isPasswordValid) {
      return { 
        success: false, 
        error: `Incorrect password for Student Roll No "${trimmedRoll}". Please check your password and try again.` 
      };
    }

    // 5. Strictly enforce Enrolled Biometric Face Profile presence
    if (!matchedStudent.faceSnapshot) {
      return {
        success: false,
        error: `Biometric Profile Not Enrolled: Student Roll No "${trimmedRoll}" does not have an enrolled face profile. Please switch to the "Sign In / Register" tab to complete facial camera enrollment before logging in.`
      };
    }

    // 6. Strictly enforce Live Biometric Facial Match
    if (!isBiometricMatched) {
      return {
        success: false,
        error: `Biometric Mismatch: The person in front of the camera does NOT match the enrolled biometric profile for Student Roll No "${trimmedRoll}". Access is strictly denied.`
      };
    }

    // Additional metric verification if live descriptor is provided
    if (liveFaceDescriptor && matchedStudent.faceDescriptor && liveFaceDescriptor.length === 128 && matchedStudent.faceDescriptor.length === 128) {
      const metricResult = verifyBiometricIdentity(liveFaceDescriptor, matchedStudent.faceDescriptor, 0.48);
      if (!metricResult.isMatch) {
        return {
          success: false,
          error: `Biometric Verification Failed (${metricResult.similarityScore}% similarity): Live face does not match the enrolled face template for Roll No "${trimmedRoll}". Access is strictly denied.`
        };
      }
    }

    const studentName = matchedStudent.name || 'Registered Student';
    const studentId = matchedStudent.rollNo || trimmedRoll;

    const userData: User = {
      id: studentId,
      name: studentName,
      role: 'student',
      rollNo: studentId,
      faceSnapshot: matchedStudent.faceSnapshot,
      faceDescriptor: matchedStudent.faceDescriptor
    };

    try {
      localStorage.setItem('guardrail_user', JSON.stringify(userData));
      if (auth.currentUser) {
        await signOut(auth).catch(() => {});
      }
      await setDoc(doc(db, 'users', studentId), userData);
    } catch (error) {
      console.warn('Firestore user doc sync notice:', error);
    }

    setUser(userData);
    return { success: true, student: matchedStudent };
  };

  const deleteStudent = async (id: string) => {
    const studentToDelete = students.find(s => s.id === id || s.rollNo === id);
    const roll = studentToDelete?.rollNo || id;

    // Remove from Firestore collection 'students'
    try {
      await deleteDoc(doc(db, 'students', roll.trim().toUpperCase()));
      if (id !== roll) {
        await deleteDoc(doc(db, 'students', id)).catch(() => {});
      }
    } catch (err) {
      console.warn('Firestore delete student error:', err);
    }

    const updated = students.filter(s => s.id !== id && s.rollNo !== id && s.rollNo.toUpperCase() !== roll.toUpperCase());
    setStudents(updated);
    try {
      localStorage.setItem('guardrail_students', JSON.stringify(updated));
    } catch (e) {}
  };

  const clearAllStudents = async () => {
    try {
      const snap = await getDocs(collection(db, 'students'));
      for (const d of snap.docs) {
        await deleteDoc(d.ref).catch(() => {});
      }
    } catch (err) {
      console.warn('Firestore clear students error:', err);
    }
    setStudents([]);
    try {
      localStorage.removeItem('guardrail_students');
    } catch (e) {}
  };

  const saveTeachersToFirestore = async (newTeachers: TeacherAccount[]) => {
    try {
      await setDoc(doc(db, 'config', 'teachers'), {
        items: newTeachers,
        updatedAt: new Date().toISOString()
      });
      setTeachers(newTeachers);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'config/teachers');
    }
  };

  const addTeacher = async (
    teacherId: string, 
    name: string, 
    password: string, 
    department?: string, 
    email?: string
  ): Promise<{ success: boolean; error?: string }> => {
    const trimmedId = teacherId.trim().toLowerCase();
    const trimmedName = name.trim();
    const trimmedEmail = (email || '').trim().toLowerCase();
    const trimmedPass = password.trim();

    if (!trimmedId) {
      return { success: false, error: 'Teacher ID is required.' };
    }
    if (!trimmedName) {
      return { success: false, error: 'Teacher Name is required.' };
    }
    if (!trimmedEmail) {
      return { success: false, error: 'Teacher Email is required for Google Sign-In authorization.' };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return { success: false, error: 'Please provide a valid email format (e.g. teacher@institution.edu).' };
    }

    if (!trimmedPass) {
      return { success: false, error: 'Password is required.' };
    }

    const existingId = teachers.find(t => t.teacherId.toLowerCase() === trimmedId);
    if (existingId) {
      return { success: false, error: `Teacher ID "${teacherId}" is already taken. Please use a unique Teacher ID.` };
    }

    const existingEmail = teachers.find(t => t.email && t.email.toLowerCase().trim() === trimmedEmail);
    if (existingEmail) {
      return { success: false, error: `Teacher Email "${trimmedEmail}" is already registered to ${existingEmail.name} (${existingEmail.teacherId}).` };
    }

    const newTeacher: TeacherAccount = {
      id: `tch_${Date.now()}`,
      teacherId: teacherId.trim(),
      name: trimmedName,
      email: trimmedEmail,
      password: trimmedPass,
      department: department?.trim() || 'General Department',
      createdAt: new Date().toISOString(),
      createdBy: user?.name || 'Main Admin'
    };

    const updated = [...teachers, newTeacher];
    await saveTeachersToFirestore(updated);
    return { success: true };
  };

  const deleteTeacher = async (id: string) => {
    const target = teachers.find(t => t.id === id || t.teacherId === id);
    if (target && (target.teacherId.toUpperCase() === 'MAINADMIN' || target.email?.toLowerCase().trim() === 'mygamesprabhu@gmail.com')) {
      console.warn('Cannot delete Main Admin account');
      return;
    }
    const updated = teachers.filter(t => t.id !== id && t.teacherId !== id);
    await saveTeachersToFirestore(updated);
  };

  const clearAllTeachers = async () => {
    // Retain main admin teacher
    const admin = teachers.find(t => t.teacherId.toUpperCase() === 'MAINADMIN' || t.email?.toLowerCase().trim() === 'mygamesprabhu@gmail.com') || DEFAULT_TEACHERS[0];
    await saveTeachersToFirestore([admin]);
  };

  const loginAsTeacher = async (teacherId: string, password: string): Promise<{ success: boolean; error?: string }> => {
    const rawId = teacherId.trim();
    const rawPass = password.trim();
    const upperId = rawId.toUpperCase();

    // 1. Direct authentication for Main Admin credentials:
    // Teacher ID = MAINADMIN & Password = ADMINDHARMAASTRA
    if (upperId === 'MAINADMIN' && rawPass === 'ADMINDHARMAASTRA') {
      const userData: User = {
        id: 'MAINADMIN',
        name: 'keerthan Prabhu',
        role: 'admin',
        email: 'mygamesprabhu@gmail.com',
        isSuperAdmin: true,
        teacherId: 'MAINADMIN'
      };

      try {
        await setDoc(doc(db, 'users', 'MAINADMIN'), userData);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'users/MAINADMIN');
      }

      setUser(userData);
      return { success: true };
    }

    // 2. Check against registered teacher accounts
    const foundTeacher = teachers.find(t => 
      t.teacherId.trim().toLowerCase() === rawId.toLowerCase() && t.password === rawPass
    );

    // 3. Fallback for legacy admin
    const isLegacyAdmin = (rawId.toLowerCase() === 'admin' || rawId.toLowerCase() === 'teacher') && rawPass === 'admin123';

    if (foundTeacher || isLegacyAdmin) {
      const isThisTeacherMainAdmin = 
        (foundTeacher && foundTeacher.teacherId.trim().toUpperCase() === 'MAINADMIN') ||
        (foundTeacher?.email && foundTeacher.email.toLowerCase().trim() === 'mygamesprabhu@gmail.com');

      const teacherName = foundTeacher ? foundTeacher.name : 'Teacher';
      const tId = foundTeacher ? foundTeacher.teacherId : 'tch_legacy';
      
      const userData: User = {
        id: tId,
        name: teacherName,
        role: 'admin',
        email: foundTeacher?.email || (isThisTeacherMainAdmin ? 'mygamesprabhu@gmail.com' : undefined),
        isSuperAdmin: isThisTeacherMainAdmin,
        teacherId: tId
      };

      try {
        localStorage.setItem('guardrail_user', JSON.stringify(userData));
        await setDoc(doc(db, 'users', tId), userData);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `users/${tId}`);
      }

      setUser(userData);
      return { success: true };
    }

    return { success: false, error: 'Invalid Teacher ID or Password. Please contact Main Admin.' };
  };

  const login = async (id: string, name: string, role: 'student' | 'admin') => {
    // Restrict admin role for manual ID login
    if (role === 'admin') {
      alert('Teacher/Admin login requires Teacher ID & Password or authorized Google Account.');
      return;
    }
    
    const userData: User = { id, name, role };
    try {
      localStorage.setItem('guardrail_user', JSON.stringify(userData));
      await setDoc(doc(db, 'users', id), userData);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${id}`);
    }
    setUser(userData);
  };

  const loginWithGoogle = async (role: 'student' | 'admin'): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const email = result.user.email?.toLowerCase().trim();

      if (role === 'admin') {
        // Refresh teachers from firestore to have the latest list
        let currentTeachers = teachers;
        try {
          const docSnap = await getDoc(doc(db, 'config', 'teachers'));
          if (docSnap.exists() && docSnap.data().items && Array.isArray(docSnap.data().items)) {
            currentTeachers = docSnap.data().items;
            setTeachers(currentTeachers);
          }
        } catch (e) {
          console.warn('Could not refresh teachers from firestore on login:', e);
        }

        const isMasterAdminEmail = email === 'mygamesprabhu@gmail.com' || email === 'nandeesh.as.2005@gmail.com';

        const matchedTeacher = email ? (
          currentTeachers.find(t => t.email && t.email.toLowerCase().trim() === email) ||
          DEFAULT_TEACHERS.find(t => t.email && t.email.toLowerCase().trim() === email)
        ) : undefined;

        if (!matchedTeacher && !isMasterAdminEmail) {
          localStorage.removeItem('guardrail_user');
          await signOut(auth);
          setUser(null);
          return {
            success: false,
            error: `Unregistered Email: "${result.user.email}" is not registered in the Teacher Directory. Please ask Main Admin to add your email in Teacher Management.`
          };
        }

        const displayName = isMasterAdminEmail
          ? (matchedTeacher?.name || 'keerthan Prabhu')
          : (matchedTeacher?.name || result.user.displayName || email?.split('@')[0] || 'Teacher');

        const userData: User = {
          id: result.user.uid,
          name: displayName,
          role: 'admin',
          email: result.user.email || undefined,
          isSuperAdmin: isMasterAdminEmail,
          teacherId: matchedTeacher?.teacherId || (isMasterAdminEmail ? 'MAINADMIN' : undefined)
        };

        try {
          localStorage.setItem('guardrail_user', JSON.stringify(userData));
          await setDoc(doc(db, 'users', result.user.uid), userData);
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, `users/${result.user.uid}`);
        }
        setUser(userData);
        return { success: true };
      } else {
        const userData: User = {
          id: result.user.uid,
          name: result.user.displayName || email?.split('@')[0] || 'Student',
          role: 'student',
          email: result.user.email || undefined
        };

        try {
          localStorage.setItem('guardrail_user', JSON.stringify(userData));
          await setDoc(doc(db, 'users', result.user.uid), userData);
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, `users/${result.user.uid}`);
        }
        setUser(userData);
        return { success: true };
      }
    } catch (error: any) {
      console.error("Google sign-in error:", error);
      if (error?.code === 'auth/popup-closed-by-user') {
        return { success: false, error: 'Sign-in window closed before completing authentication.' };
      }
      return { success: false, error: error?.message || 'Google sign-in failed. Please try again.' };
    }
  };

  const logout = async () => {
    try {
      localStorage.removeItem('guardrail_user');
      localStorage.removeItem('guardrail_session_id');
      await signOut(auth).catch(() => {});
    } catch (e) {}
    setUser(null);
    setSessionId(null);
    setDisqualification(null);
    setCurrentAnswers({});
  };

  const resetDisqualification = () => {
    setDisqualification(null);
  };

  const startExam = async (targetSubjectId?: string, enteredPassword?: string): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'User is not authenticated' };
    
    // Reset any previous termination states
    setDisqualification(null);
    setCurrentAnswers({});
    setLastViolationSnapshot(null);
    setIsAiActive(true);
    setIsFaceDetected(true);

    const chosenSubjectId = targetSubjectId || activeSubjectId;
    const sub = subjects.find(s => s.id === chosenSubjectId) || selectedSubject;

    // Validate Test Password if set by the teacher
    if (sub?.examPassword && sub.examPassword.trim() !== '') {
      const requiredPass = sub.examPassword.trim();
      const providedPass = (enteredPassword || '').trim();

      if (!providedPass) {
        return { 
          success: false, 
          error: `Please enter the Test Password for "${sub.name}" (${sub.code}) to unlock and start the exam.` 
        };
      }

      if (providedPass !== requiredPass) {
        return { 
          success: false, 
          error: `Incorrect Test Password for "${sub.name}". Please check with your teacher/instructor and enter the exact passcode.` 
        };
      }
    }

    const newSessionRef = doc(collection(db, 'sessions'));
    const sessionData = sanitizeForFirestore({
      id: newSessionRef.id,
      studentId: user.id,
      studentRollNo: user.rollNo || user.id,
      studentName: user.name,
      faceSnapshot: user.faceSnapshot || null,
      faceDescriptorPresent: !!(user.faceDescriptor && user.faceDescriptor.length > 0),
      identityVerificationStatus: 'verified',
      identityMatchScore: 100,
      subjectId: sub?.id || 'default',
      subjectName: sub?.name || 'General Exam',
      subjectCode: sub?.code || 'EXAM101',
      createdByTeacherId: sub?.createdByTeacherId || null,
      createdByTeacherName: sub?.createdByTeacherName || null,
      startTime: new Date().toISOString(),
      status: 'active',
      trustScore: 100,
      violationCount: 0,
      lastHeartbeat: new Date().toISOString()
    });
    
    try {
      try {
        localStorage.setItem('guardrail_session_id', newSessionRef.id);
        localStorage.setItem(`guardrail_session_score_${newSessionRef.id}`, '100');
      } catch (e) {}
      await setDoc(newSessionRef, sessionData);
      setSessionId(newSessionRef.id);
      setTrustScore(100);
      trustScoreRef.current = 100;
      processedEventsRef.current.clear();
      setIsAiActive(true);
      setIsFaceDetected(true);
      setIsIdentitySuspended(false);
      setIdentityStatusMessage('Identity verified.');
      return { success: true };
    } catch (error) {
      console.warn('Firestore session init note:', error);
      setSessionId(newSessionRef.id);
      setTrustScore(100);
      trustScoreRef.current = 100;
      processedEventsRef.current.clear();
      setIsAiActive(true);
      setIsFaceDetected(true);
      setIsIdentitySuspended(false);
      setIdentityStatusMessage('Identity verified.');
      return { success: true };
    }
  };

  const exitExamSession = () => {
    try {
      localStorage.removeItem('guardrail_session_id');
    } catch (e) {}
    processedEventsRef.current.clear();
    setSessionId(null);
    setDisqualification(null);
    setIsIdentitySuspended(false);
    setCurrentAnswers({});
    setLastViolationSnapshot(null);
  };

  const submitExam = async (answers: any, options?: { autoSubmitted?: boolean; disqualified?: boolean; reason?: string; screenshot?: string | null }) => {
    let activeSessionId = sessionId;
    if (!activeSessionId) {
      try {
        activeSessionId = localStorage.getItem('guardrail_session_id');
      } catch (e) {}
    }
    if (!activeSessionId) {
      activeSessionId = `sess_${Date.now()}`;
    }

    let activeUser = user;
    if (!activeUser) {
      try {
        const cached = localStorage.getItem('guardrail_user');
        if (cached) activeUser = JSON.parse(cached);
      } catch (e) {}
    }

    const sub = selectedSubject;
    const submittedAt = new Date().toISOString();
    const finalAnswers = answers || currentAnswers || {};
    const finalSnapshot = options?.screenshot || lastViolationSnapshot || null;

    const submissionPayload = sanitizeForFirestore({
      sessionId: activeSessionId,
      studentId: activeUser?.id || 'ANONYMOUS_STUDENT',
      studentName: activeUser?.name || 'Student',
      subjectId: sub?.id || 'default',
      subjectName: sub?.name || 'General Exam',
      subjectCode: sub?.code || 'EXAM101',
      createdByTeacherId: sub?.createdByTeacherId || null,
      createdByTeacherName: sub?.createdByTeacherName || null,
      trustScore: options?.disqualified ? 0 : (typeof trustScoreRef.current === 'number' ? trustScoreRef.current : (typeof trustScore === 'number' ? trustScore : 100)),
      answers: finalAnswers,
      submittedAt,
      autoSubmitted: options?.autoSubmitted || false,
      disqualified: options?.disqualified || false,
      terminationReason: options?.reason || null,
      evidenceScreenshot: finalSnapshot,
      lastViolationSnapshot: finalSnapshot
    });

    // Guaranteed local backup in localStorage
    try {
      localStorage.setItem(`guardrail_submission_${activeSessionId}`, JSON.stringify(submissionPayload));
      localStorage.setItem('guardrail_last_submission', JSON.stringify(submissionPayload));
    } catch (e) {
      console.warn('LocalStorage submission backup error:', e);
    }

    try {
      const firestoreTask = Promise.allSettled([
        setDoc(doc(db, 'submissions', activeSessionId), submissionPayload),
        updateDoc(doc(db, 'sessions', activeSessionId), sanitizeForFirestore({
          status: options?.disqualified ? 'terminated_disqualified' : 'submitted',
          endTime: submittedAt,
          ...(options?.disqualified ? { trustScore: 0, disqualified: true, terminationReason: options?.reason || 'Disqualified' } : {}),
          ...(finalSnapshot ? { lastViolationSnapshot: finalSnapshot } : {})
        }))
      ]);

      // Give Firestore up to 1.5 seconds, then let it finish in background
      await Promise.race([
        firestoreTask,
        new Promise(resolve => setTimeout(resolve, 1500))
      ]);
    } catch (error) {
      console.warn('Firestore submission write notice (answers safely saved locally):', error);
      // Non-blocking so student sees instant submission success confirmation
    }
  };

  const autoSubmitExamOnElectronicDevice = async (screenshot?: string | null, answersOverride?: Record<string | number, any>, deviceClass?: string) => {
    let currentSessionId = sessionId;
    if (!currentSessionId) {
      try {
        currentSessionId = localStorage.getItem('guardrail_session_id');
      } catch (e) {}
    }
    if (!currentSessionId) {
      currentSessionId = `sess_${Date.now()}`;
    }

    let activeUser = user;
    if (!activeUser) {
      try {
        const cached = localStorage.getItem('guardrail_user');
        if (cached) activeUser = JSON.parse(cached);
      } catch (e) {}
    }

    const sub = selectedSubject;
    const finalAnswers = answersOverride || currentAnswers || {};
    const terminationTime = new Date().toISOString();
    const deviceName = deviceClass ? deviceClass.toUpperCase() : 'ELECTRONIC DEVICE';

    const disqInfo: DisqualificationInfo = {
      isDisqualified: true,
      reason: 'Electronic Device Used',
      type: 'ELECTRONIC_DEVICE_USAGE',
      deviceClass: deviceClass || 'cell phone',
      timestamp: terminationTime,
      screenshot: screenshot || null,
      message: `An unauthorized electronic device (${deviceName}) was detected in your camera frame during the examination. Your trust score has been directly set to 30 and your exam has been immediately terminated and automatically submitted.`,
      studentAnswers: finalAnswers,
      subjectName: sub?.name || 'General Exam',
      subjectCode: sub?.code || 'EXAM101'
    };

    // Immediately set trust score directly to 30 and update local state to lock student interface
    setDisqualification(disqInfo);
    setTrustScore(30);
    trustScoreRef.current = 30;
    try {
      localStorage.setItem(`guardrail_session_score_${currentSessionId}`, '30');
    } catch (e) {}

    const submissionPayload = sanitizeForFirestore({
      sessionId: currentSessionId,
      studentId: activeUser?.id || 'ANONYMOUS_STUDENT',
      studentName: activeUser?.name || 'Student',
      subjectId: sub?.id || 'default',
      subjectName: sub?.name || 'General Exam',
      subjectCode: sub?.code || 'EXAM101',
      createdByTeacherId: sub?.createdByTeacherId || null,
      createdByTeacherName: sub?.createdByTeacherName || null,
      trustScore: 30,
      answers: finalAnswers,
      submittedAt: terminationTime,
      autoSubmitted: true,
      disqualified: true,
      electronicDeviceUsed: true,
      terminationReason: 'Electronic Device Used',
      violationType: 'ELECTRONIC_DEVICE_USAGE',
      evidenceScreenshot: screenshot || null
    });

    try {
      localStorage.setItem(`guardrail_submission_${currentSessionId}`, JSON.stringify(submissionPayload));
      localStorage.setItem('guardrail_last_submission', JSON.stringify(submissionPayload));
    } catch (e) {}

    try {
      // 1. Log violation to Firestore
      await addDoc(collection(db, 'sessions', currentSessionId, 'violations'), sanitizeForFirestore({
        sessionId: currentSessionId,
        studentId: activeUser?.id || 'ANONYMOUS_STUDENT',
        type: 'ELECTRONIC_DEVICE_USAGE',
        timestamp: terminationTime,
        details: {
          critical: true,
          autoSubmitted: true,
          reason: 'Electronic device used during exam',
          device: deviceClass || 'cell phone',
          screenshot: screenshot || null
        }
      }));

      // 2. Write submission record marked with trustScore: 30, disqualified, and electronicDeviceUsed: true
      await setDoc(doc(db, 'submissions', currentSessionId), submissionPayload);

      // 3. Update session document
      await updateDoc(doc(db, 'sessions', currentSessionId), sanitizeForFirestore({
        status: 'terminated_electronic_device',
        endTime: terminationTime,
        trustScore: 30,
        disqualified: true,
        electronicDeviceUsed: true,
        terminationReason: 'Electronic Device Used'
      }));
    } catch (error) {
      console.warn('Firestore electronic device auto-submission notice:', error);
    }
  };

  const autoSubmitExamOnMobilePhone = async (screenshot?: string | null, answersOverride?: Record<string | number, any>, deviceClass?: string) => {
    await autoSubmitExamOnElectronicDevice(screenshot, answersOverride, deviceClass || 'cell phone');
  };

  const logViolation = async (type: string, details: any = {}, eventId?: string) => {
    let activeSessionId = sessionId;
    if (!activeSessionId) {
      try {
        activeSessionId = localStorage.getItem('guardrail_session_id');
      } catch (e) {}
    }
    if (!activeSessionId) return;

    let activeUser = user;
    if (!activeUser) {
      try {
        const cached = localStorage.getItem('guardrail_user');
        if (cached) activeUser = JSON.parse(cached);
      } catch (e) {}
    }
    if (!activeUser) return;

    const now = Date.now();

    // 1. Idempotency & Deduplication Filter
    // Purge stale processed event hashes (> 30 seconds)
    for (const [key, timestamp] of processedEventsRef.current.entries()) {
      if (now - timestamp > 30000) {
        processedEventsRef.current.delete(key);
      }
    }

    // Determine event key for deduplication
    const explicitEventId = eventId || details?.eventId;
    const eventKey = explicitEventId 
      ? `explicit_${explicitEventId}`
      : `${type}_${Math.floor(now / 1500)}`; // 1.5-second debounce window for identical violation type

    if (processedEventsRef.current.has(eventKey)) {
      return;
    }
    processedEventsRef.current.set(eventKey, now);

    if (details?.screenshot) {
      setLastViolationSnapshot(details.screenshot);
    }

    // 2. Centralized scoring penalty calculation from PENALTIES policy
    const penalty = getViolationPenalty(type);
    
    // Calculate immediate optimistic local score using trustScoreRef (guaranteed fresh, immune to stale closures)
    const prevScore = typeof trustScoreRef.current === 'number' ? trustScoreRef.current : 100;
    let optimisticScore: number;
    if (type === 'ELECTRONIC_DEVICE_USAGE' || type === 'MOBILE_PHONE_USAGE') {
      optimisticScore = Math.min(prevScore, 30);
    } else {
      optimisticScore = Math.max(0, prevScore - penalty);
    }

    // Update local state and ref immediately so UI displays live deduction with 0 lag
    trustScoreRef.current = optimisticScore;
    setTrustScore(optimisticScore);
    try {
      localStorage.setItem(`guardrail_session_score_${activeSessionId}`, String(optimisticScore));
    } catch (e) {}

    const violationData = sanitizeForFirestore({
      sessionId: activeSessionId,
      studentId: activeUser.id,
      studentRollNo: activeUser.rollNo || activeUser.id,
      studentName: activeUser.name,
      type,
      penalty,
      trustScoreAfter: optimisticScore,
      timestamp: new Date().toISOString(),
      details: details || {}
    });

    // 3. Atomic Firestore Transaction for authoritative calculation & persistence
    try {
      const sessionRef = doc(db, 'sessions', activeSessionId);
      const newViolationRef = doc(collection(db, 'sessions', activeSessionId, 'violations'));

      await runTransaction(db, async (transaction) => {
        const sessionSnap = await transaction.get(sessionRef);
        let authoritativeScore = optimisticScore;
        let prevCount = 0;

        if (sessionSnap.exists()) {
          const sessionData = sessionSnap.data();
          prevCount = sessionData.violationCount || 0;
          const dbScore = typeof sessionData.trustScore === 'number' ? sessionData.trustScore : 100;

          if (type === 'ELECTRONIC_DEVICE_USAGE' || type === 'MOBILE_PHONE_USAGE') {
            authoritativeScore = Math.min(dbScore, 30);
          } else {
            authoritativeScore = Math.max(0, dbScore - penalty);
          }
        }

        // Write the violation record with the authoritative score
        transaction.set(newViolationRef, {
          ...violationData,
          trustScoreAfter: authoritativeScore
        });

        const sessionUpdates: any = {
          trustScore: authoritativeScore,
          violationCount: prevCount + 1,
          lastHeartbeat: new Date().toISOString()
        };

        if (details?.screenshot) {
          sessionUpdates.lastViolationSnapshot = details.screenshot;
          sessionUpdates.lastViolationType = type;
          sessionUpdates.lastViolationTime = new Date().toISOString();
        }

        transaction.update(sessionRef, sessionUpdates);
      });
    } catch (txError) {
      console.warn('Firestore transaction warning in logViolation, falling back to direct write:', txError);
      try {
        await addDoc(collection(db, 'sessions', activeSessionId, 'violations'), violationData);
        await updateDoc(doc(db, 'sessions', activeSessionId), sanitizeForFirestore({
          trustScore: optimisticScore,
          violationCount: increment(1),
          lastHeartbeat: new Date().toISOString(),
          ...(details?.screenshot ? {
            lastViolationSnapshot: details.screenshot,
            lastViolationType: type,
            lastViolationTime: new Date().toISOString()
          } : {})
        }));
      } catch (fallbackError) {
        handleFirestoreError(fallbackError, OperationType.WRITE, `sessions/${activeSessionId}/violations`);
      }
    }
  };

  const isSuperAdmin = React.useMemo(() => {
    if (!user || user.role !== 'admin') return false;
    if (user.isSuperAdmin === true) return true;
    if (user.id && user.id.toUpperCase() === 'MAINADMIN') return true;
    if (user.teacherId && user.teacherId.toUpperCase() === 'MAINADMIN') return true;
    if (user.email && (user.email.toLowerCase().trim() === 'mygamesprabhu@gmail.com' || user.email.toLowerCase().trim() === 'nandeesh.as.2005@gmail.com')) return true;
    return false;
  }, [user]);

  return (
    <ExamContext.Provider value={{ 
      user, sessionId, trustScore, isFaceDetected, setIsFaceDetected, 
      faceCount, setFaceCount, isAiActive, setIsAiActive, aiStatus, setAiStatus,
      isIdentitySuspended, setIsIdentitySuspended, identityStatusMessage, setIdentityStatusMessage, identityMatchScore, setIdentityMatchScore,
      violations, questions, subjects, teachers, students, activeSubjectId,
      selectedSubject, disqualification, currentAnswers, setCurrentAnswers,
      autoSubmitExamOnElectronicDevice, autoSubmitExamOnMobilePhone, resetDisqualification,
      setActiveSubjectId, addSubject, deleteSubject, clearAllSubjects, updateSubjectSettings, updateSubjectQuestions,
      updateQuestions, addTeacher, deleteTeacher, clearAllTeachers, loginAsTeacher, 
      registerStudent, loginStudentWithFace, deleteStudent, clearAllStudents,
      login, loginWithGoogle, logout, startExam, submitExam, exitExamSession, logViolation, socket,
      isAuthReady, isSuperAdmin
    }}>
      {children}
    </ExamContext.Provider>
  );
};

export const useExam = () => {
  const context = useContext(ExamContext);
  if (!context) throw new Error('useExam must be used within an ExamProvider');
  return context;
};

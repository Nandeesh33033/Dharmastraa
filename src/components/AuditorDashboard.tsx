import React, { useEffect, useState, useMemo } from 'react';
import { useExam } from '../ExamContext';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  ShieldAlert, 
  Activity, 
  History, 
  TrendingDown, 
  User, 
  AlertCircle, 
  FileCheck, 
  MoreVertical, 
  Trash2,
  FileEdit, 
  UserPlus, 
  GraduationCap,
  BookOpen,
  Award,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Search,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Layers,
  Clock,
  Check,
  Percent,
  Eye,
  Camera,
  ShieldCheck,
  AlertTriangle,
  X,
  Download,
  FileText,
  Loader2
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { QUESTIONS, Subject } from '../constants';
import { collection, onSnapshot, query, orderBy, limit, doc, deleteDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestoreError';
import { getViolationInfo } from '../utils/violationFormatter';
import { evaluateStudentSubmission, StudentPerformance } from '../utils/scoreCalculator';
import { 
  generateStudentPerformancePDF, 
  generateSubjectClassPerformancePDF, 
  StudentReportData 
} from '../utils/pdfReportGenerator';
import { TeacherQuestionBuilder } from './TeacherQuestionBuilder';
import { TeacherManager } from './TeacherManager';
import { StudentManager } from './StudentManager';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}

export const AuditorDashboard: React.FC = () => {
  const { subjects, questions, user, logout, isSuperAdmin, teachers } = useExam();
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [violations, setViolations] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'submissions' | 'questions' | 'teachers' | 'students'>('submissions');
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sessionToDelete, setSessionToDelete] = useState<any | null>(null);
  const [submissionToDelete, setSubmissionToDelete] = useState<any | null>(null);
  const [showClearAllSessionsModal, setShowClearAllSessionsModal] = useState(false);
  const [showClearAllSubmissionsModal, setShowClearAllSubmissionsModal] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Auto-switch away from teachers tab if not Super Admin
  useEffect(() => {
    if (!isSuperAdmin && activeTab === 'teachers') {
      setActiveTab('submissions');
    }
  }, [isSuperAdmin, activeTab]);

  // Subject Performance filter and view states (Default to first subject)
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>(() => subjects[0]?.id || '');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter subjects for the logged-in teacher (Super Admin sees all subjects)
  const accessibleSubjects = useMemo(() => {
    if (isSuperAdmin) return subjects;
    const currentTeacherId = (user?.teacherId || user?.id || '').trim().toLowerCase();
    const currentTeacherName = (user?.name || '').trim().toLowerCase();
    return subjects.filter(s => {
      const creatorId = (s.createdByTeacherId || '').trim().toLowerCase();
      const creatorName = (s.createdByTeacherName || '').trim().toLowerCase();
      return (creatorId && creatorId === currentTeacherId) || 
             (creatorName && creatorName === currentTeacherName);
    });
  }, [subjects, isSuperAdmin, user]);

  // Keep selectedSubjectFilter synced with accessible subjects
  useEffect(() => {
    if (accessibleSubjects.length > 0) {
      if (!selectedSubjectFilter || (selectedSubjectFilter !== 'all' && !accessibleSubjects.some(s => s.id === selectedSubjectFilter))) {
        setSelectedSubjectFilter(accessibleSubjects[0].id);
      }
    } else {
      setSelectedSubjectFilter('');
    }
  }, [accessibleSubjects]);

  // Submissions filtered by teacher permissions
  const accessibleSubmissions = useMemo(() => {
    if (isSuperAdmin) return submissions;
    const currentTeacherId = (user?.teacherId || user?.id || '').trim().toLowerCase();
    const currentTeacherName = (user?.name || '').trim().toLowerCase();
    const teacherSubIds = new Set(accessibleSubjects.map(s => s.id));
    const teacherSubCodes = new Set(accessibleSubjects.map(s => s.code.toUpperCase()));
    const teacherSubNames = new Set(accessibleSubjects.map(s => s.name.toLowerCase()));

    return submissions.filter(sub => {
      if (sub.createdByTeacherId && sub.createdByTeacherId.trim().toLowerCase() === currentTeacherId) return true;
      if (sub.createdByTeacherName && sub.createdByTeacherName.trim().toLowerCase() === currentTeacherName) return true;
      if (sub.subjectId && teacherSubIds.has(sub.subjectId)) return true;
      if (sub.subjectCode && teacherSubCodes.has(sub.subjectCode.toUpperCase())) return true;
      if (sub.subjectName && teacherSubNames.has(sub.subjectName.toLowerCase())) return true;
      return false;
    });
  }, [submissions, isSuperAdmin, accessibleSubjects, user]);

  // Sessions filtered by teacher permissions
  const accessibleSessions = useMemo(() => {
    if (isSuperAdmin) return sessions;
    const currentTeacherId = (user?.teacherId || user?.id || '').trim().toLowerCase();
    const currentTeacherName = (user?.name || '').trim().toLowerCase();
    const teacherSubIds = new Set(accessibleSubjects.map(s => s.id));
    const teacherSubCodes = new Set(accessibleSubjects.map(s => s.code.toUpperCase()));
    const teacherSubNames = new Set(accessibleSubjects.map(s => s.name.toLowerCase()));
    const allowedSessionIds = new Set(accessibleSubmissions.map(sub => sub.sessionId || sub.id));

    return sessions.filter(sess => {
      if (sess.createdByTeacherId && sess.createdByTeacherId.trim().toLowerCase() === currentTeacherId) return true;
      if (sess.createdByTeacherName && sess.createdByTeacherName.trim().toLowerCase() === currentTeacherName) return true;
      if (sess.subjectId && teacherSubIds.has(sess.subjectId)) return true;
      if (sess.subjectCode && teacherSubCodes.has(sess.subjectCode.toUpperCase())) return true;
      if (sess.subjectName && teacherSubNames.has(sess.subjectName.toLowerCase())) return true;
      if (allowedSessionIds.has(sess.id)) return true;
      return false;
    });
  }, [sessions, isSuperAdmin, accessibleSubjects, accessibleSubmissions, user]);
  const [selectedStudentSubmission, setSelectedStudentSubmission] = useState<any | null>(null);
  const [studentMistakesModal, setStudentMistakesModal] = useState<{
    studentName: string;
    studentId: string;
    subjectName: string;
    subjectCode: string;
    sessionId: string;
    trustScore: number;
    violationCount: number;
    isDisqualified: boolean;
    terminationReason?: string;
    evidenceScreenshot?: string;
    lastViolationSnapshot?: string;
    submittedAt?: string;
  } | null>(null);
  const [studentMistakesList, setStudentMistakesList] = useState<any[]>([]);
  const [isLoadingMistakes, setIsLoadingMistakes] = useState(false);
  const [selectedViolationEvidence, setSelectedViolationEvidence] = useState<{
    image: string;
    studentName: string;
    studentId: string;
    subjectName: string;
    subjectCode: string;
    violationType?: string;
    timestamp?: string;
    trustScore?: number;
  } | null>(null);
  const [expandedSubjectMap, setExpandedSubjectMap] = useState<Record<string, boolean>>({});
  const [downloadingStudentId, setDownloadingStudentId] = useState<string | null>(null);
  const [downloadingSubjectId, setDownloadingSubjectId] = useState<string | null>(null);

  // PDF Report Downloader for an individual student
  const handleDownloadStudentReport = async (submissionItem: any, sessionItem?: any) => {
    const studentSubId = submissionItem?.id || sessionItem?.id || 'temp';
    try {
      setDownloadingStudentId(studentSubId);
      const subject = resolveSubject(submissionItem);
      const sessionId = submissionItem.sessionId || submissionItem.id || sessionItem?.id;

      let violationsList: any[] = [];
      if (sessionId) {
        try {
          const vRef = collection(db, 'sessions', sessionId, 'violations');
          const vSnap = await getDocs(query(vRef, orderBy('timestamp', 'asc')));
          violationsList = vSnap.docs.map(d => d.data());
        } catch (e) {
          console.warn('Could not fetch violations subcollection for PDF:', e);
        }
      }

      const isDisqualified = !!(submissionItem.disqualified || sessionItem?.disqualified);
      const isElectronicDevice = submissionItem.electronicDeviceUsed || sessionItem?.electronicDeviceUsed ||
        submissionItem.status === 'terminated_electronic_device' || sessionItem?.status === 'terminated_electronic_device' ||
        submissionItem.status === 'terminated_mobile_phone' || sessionItem?.status === 'terminated_mobile_phone' ||
        submissionItem.terminationReason?.toLowerCase().includes('electronic') || sessionItem?.terminationReason?.toLowerCase().includes('electronic') ||
        submissionItem.terminationReason?.toLowerCase().includes('phone') || sessionItem?.terminationReason?.toLowerCase().includes('phone') ||
        submissionItem.terminationReason?.toLowerCase().includes('device') || sessionItem?.terminationReason?.toLowerCase().includes('device');

      const evidenceScreenshot = submissionItem.evidenceScreenshot || sessionItem?.evidenceScreenshot;
      const lastViolationSnapshot = submissionItem.lastViolationSnapshot || sessionItem?.lastViolationSnapshot;

      await generateStudentPerformancePDF({
        studentName: submissionItem.studentName || sessionItem?.studentName || 'Student',
        studentId: submissionItem.studentId || sessionItem?.studentId || 'No Roll No',
        subjectName: subject.name,
        subjectCode: subject.code,
        submittedAt: submissionItem.submittedAt || sessionItem?.startTime,
        answers: submissionItem.answers,
        trustScore: Math.max(0, submissionItem.trustScore ?? sessionItem?.trustScore ?? 100),
        isElectronicDevice,
        isDisqualified,
        terminationReason: submissionItem.terminationReason || sessionItem?.terminationReason,
        evidenceScreenshot,
        lastViolationSnapshot,
        violationsList,
        questions: subject.questions && subject.questions.length > 0 ? subject.questions : questions
      });
    } catch (err) {
      console.error('Error generating student PDF report:', err);
    } finally {
      setDownloadingStudentId(null);
    }
  };

  // PDF Report Downloader for all students of a respective subject
  const handleDownloadSubjectReport = async (subject: Subject, items: any[]) => {
    try {
      setDownloadingSubjectId(subject.id);
      const studentReports: StudentReportData[] = await Promise.all(
        items.map(async ({ submission, session, isElectronicDevice }) => {
          const sessionId = submission.sessionId || submission.id || session?.id;
          let violationsList: any[] = [];
          if (sessionId) {
            try {
              const vRef = collection(db, 'sessions', sessionId, 'violations');
              const vSnap = await getDocs(query(vRef, orderBy('timestamp', 'asc')));
              violationsList = vSnap.docs.map(d => d.data());
            } catch (e) {
              // ignore
            }
          }

          return {
            studentName: submission.studentName || session?.studentName || 'Student',
            studentId: submission.studentId || session?.studentId || 'No Roll No',
            subjectName: subject.name,
            subjectCode: subject.code,
            submittedAt: submission.submittedAt || session?.startTime,
            answers: submission.answers,
            trustScore: Math.max(0, submission.trustScore ?? session?.trustScore ?? 100),
            isElectronicDevice,
            isDisqualified: !!(submission.disqualified || session?.disqualified),
            terminationReason: submission.terminationReason || session?.terminationReason,
            violationsList,
            questions: subject.questions && subject.questions.length > 0 ? subject.questions : questions
          };
        })
      );

      generateSubjectClassPerformancePDF({
        subject,
        students: studentReports
      });
    } catch (err) {
      console.error('Error generating subject class PDF report:', err);
    } finally {
      setDownloadingSubjectId(null);
    }
  };

  // Ensure selectedSubjectFilter points to a valid subject or 'all'
  useEffect(() => {
    if (subjects.length > 0) {
      if (!selectedSubjectFilter) {
        setSelectedSubjectFilter(subjects[0].id);
      } else if (selectedSubjectFilter !== 'all' && !subjects.some(s => s.id === selectedSubjectFilter)) {
        setSelectedSubjectFilter(subjects[0].id);
      }
    }
  }, [subjects, selectedSubjectFilter]);

  const handleDeleteSession = async (sessionId: string) => {
    try {
      setDeletingId(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      setSubmissions(prev => prev.filter(s => s.id !== sessionId && s.sessionId !== sessionId));
      if (selectedSession?.id === sessionId) {
        setSelectedSession(null);
      }
      setActiveMenu(null);
      setSessionToDelete(null);

      await deleteDoc(doc(db, 'sessions', sessionId));
      try {
        await deleteDoc(doc(db, 'submissions', sessionId));
      } catch (e) {
        // non-blocking
      }
      setDeletingId(null);
    } catch (error) {
      setDeletingId(null);
      console.warn('Session delete error:', error);
    }
  };

  const handleDeleteSubmission = async (subId: string) => {
    try {
      setDeletingId(subId);
      setSubmissions(prev => prev.filter(s => s.id !== subId));
      if (selectedStudentSubmission?.id === subId) {
        setSelectedStudentSubmission(null);
      }
      setSubmissionToDelete(null);
      await deleteDoc(doc(db, 'submissions', subId));
      setDeletingId(null);
    } catch (error) {
      setDeletingId(null);
      console.warn('Submission delete error:', error);
    }
  };

  const handleClearAllSessions = async () => {
    try {
      setIsBulkDeleting(true);
      const sessionIds = sessions.map(s => s.id);
      setSessions([]);
      setSelectedSession(null);
      setShowClearAllSessionsModal(false);

      for (const id of sessionIds) {
        try {
          await deleteDoc(doc(db, 'sessions', id));
        } catch (e) {
          // ignore single item fail
        }
      }
    } catch (err) {
      console.warn('Failed to clear all sessions:', err);
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleClearAllSubmissions = async () => {
    try {
      setIsBulkDeleting(true);
      const submissionIds = submissions.map(s => s.id);
      setSubmissions([]);
      setSelectedStudentSubmission(null);
      setShowClearAllSubmissionsModal(false);

      for (const id of submissionIds) {
        try {
          await deleteDoc(doc(db, 'submissions', id));
        } catch (e) {
          // ignore single item fail
        }
      }
    } catch (err) {
      console.warn('Failed to clear all submissions:', err);
    } finally {
      setIsBulkDeleting(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = () => setActiveMenu(null);
    if (activeMenu) {
      window.addEventListener('click', handleClickOutside);
    }
    return () => window.removeEventListener('click', handleClickOutside);
  }, [activeMenu]);

  useEffect(() => {
    const q = query(collection(db, 'sessions'), orderBy('startTime', 'desc'), limit(100));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const sessionData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setSessions(sessionData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'sessions');
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'submissions'), orderBy('submittedAt', 'desc'), limit(100));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const submissionData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setSubmissions(submissionData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'submissions');
    });

    return () => unsubscribe();
  }, []);

  const fetchViolations = (sessionId: string) => {
    const q = query(collection(db, 'sessions', sessionId, 'violations'), orderBy('timestamp', 'desc'));
    return onSnapshot(q, (snapshot) => {
      const violationData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setViolations(violationData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `sessions/${sessionId}/violations`);
    });
  };

  useEffect(() => {
    let unsubscribe: any;
    if (selectedSession) {
      unsubscribe = fetchViolations(selectedSession.id);
    }
    return () => unsubscribe?.();
  }, [selectedSession]);

  useEffect(() => {
    let unsubscribe: any;
    if (selectedStudentSubmission) {
      const sessId = selectedStudentSubmission.sessionId || selectedStudentSubmission.id;
      unsubscribe = fetchViolations(sessId);
    }
    return () => unsubscribe?.();
  }, [selectedStudentSubmission]);

  useEffect(() => {
    let unsubscribe: any;
    if (studentMistakesModal?.sessionId) {
      setIsLoadingMistakes(true);
      const q = query(
        collection(db, 'sessions', studentMistakesModal.sessionId, 'violations'),
        orderBy('timestamp', 'desc')
      );
      unsubscribe = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setStudentMistakesList(data);
        setIsLoadingMistakes(false);
      }, (error) => {
        console.warn('Could not load student violations:', error);
        setIsLoadingMistakes(false);
      });
    } else {
      setStudentMistakesList([]);
      setIsLoadingMistakes(false);
    }
    return () => unsubscribe?.();
  }, [studentMistakesModal?.sessionId]);

  // Helper to resolve Subject definition for any submission or session
  const resolveSubject = (item: any): Subject => {
    if (item.subjectId && item.subjectId !== 'default') {
      const matched = subjects.find(s => s.id === item.subjectId);
      if (matched) return matched;
    }
    if (item.subjectCode) {
      const matched = subjects.find(s => s.code?.toUpperCase() === item.subjectCode?.toUpperCase());
      if (matched) return matched;
    }
    if (item.subjectName) {
      const matched = subjects.find(s => s.name?.toLowerCase() === item.subjectName?.toLowerCase());
      if (matched) return matched;
    }
    return (
      subjects[0] || {
        id: 'default',
        name: item.subjectName || 'General Examination',
        code: item.subjectCode || 'EXAM101',
        questions: QUESTIONS
      }
    );
  };

  // Build evaluated student performance items grouped by Subject
  const subjectPerformanceGroups = useMemo(() => {
    const queryTerm = searchQuery.trim().toLowerCase();

    // Map all subjects into dictionary
    const groups: Record<string, {
      subject: Subject;
      items: Array<{
        submission: any;
        session?: any;
        performance: StudentPerformance;
        isElectronicDevice: boolean;
        isBelow30: boolean;
      }>;
    }> = {};

    // Initialize all accessible subjects
    accessibleSubjects.forEach(sub => {
      groups[sub.id] = {
        subject: sub,
        items: []
      };
    });

    // Also include a fallback "General" group if submissions exist with unknown subject (only for admin)
    const fallbackId = 'general_fallback';

    accessibleSubmissions.forEach(subItem => {
      const subj = resolveSubject(subItem);
      const targetSubId = accessibleSubjects.some(s => s.id === subj.id) ? subj.id : (isSuperAdmin ? fallbackId : null);

      if (!targetSubId) return;

      if (!groups[targetSubId]) {
        groups[targetSubId] = {
          subject: subj,
          items: []
        };
      }

      const matchingSession = accessibleSessions.find(s => s.id === subItem.sessionId || s.id === subItem.id);
      const isDisqualified = subItem.disqualified || matchingSession?.disqualified;

      const isElectronicDevice = subItem.electronicDeviceUsed || matchingSession?.electronicDeviceUsed ||
        subItem.status === 'terminated_electronic_device' || matchingSession?.status === 'terminated_electronic_device' ||
        subItem.status === 'terminated_mobile_phone' || matchingSession?.status === 'terminated_mobile_phone' ||
        subItem.terminationReason?.toLowerCase().includes('electronic') || matchingSession?.terminationReason?.toLowerCase().includes('electronic') ||
        subItem.terminationReason?.toLowerCase().includes('phone') || matchingSession?.terminationReason?.toLowerCase().includes('phone') ||
        subItem.terminationReason?.toLowerCase().includes('device') || matchingSession?.terminationReason?.toLowerCase().includes('device') ||
        subItem.violationType === 'ELECTRONIC_DEVICE_USAGE' || matchingSession?.violationType === 'ELECTRONIC_DEVICE_USAGE' ||
        subItem.violationType === 'MOBILE_PHONE_USAGE' || matchingSession?.violationType === 'MOBILE_PHONE_USAGE';

      const trust = Math.max(0, subItem.trustScore ?? matchingSession?.trustScore ?? 100);
      const isBelow30 = !isElectronicDevice && trust <= 30;

      const performance = evaluateStudentSubmission(
        subItem.answers,
        subj.questions && subj.questions.length > 0 ? subj.questions : questions,
        isDisqualified || isElectronicDevice
      );

      // Search query filter check
      const studentName = (subItem.studentName || matchingSession?.studentName || '').toLowerCase();
      const studentId = (subItem.studentId || matchingSession?.studentId || '').toLowerCase();
      const subjName = (subj.name || '').toLowerCase();
      const subjCode = (subj.code || '').toLowerCase();

      const matchesSearch = !queryTerm || 
        studentName.includes(queryTerm) || 
        studentId.includes(queryTerm) || 
        subjName.includes(queryTerm) || 
        subjCode.includes(queryTerm);

      if (matchesSearch) {
        groups[targetSubId].items.push({
          submission: subItem,
          session: matchingSession,
          performance,
          isElectronicDevice,
          isBelow30
        });
      }
    });

    return Object.values(groups).filter(g => {
      if (selectedSubjectFilter && selectedSubjectFilter !== 'all') {
        return g.subject.id === selectedSubjectFilter;
      }
      return true;
    });
  }, [accessibleSubjects, accessibleSubmissions, accessibleSessions, questions, searchQuery, selectedSubjectFilter, isSuperAdmin]);

  // Active selected subject (null when 'all' is selected)
  const activeSubject = useMemo(() => {
    if (!selectedSubjectFilter || selectedSubjectFilter === 'all') return null;
    return accessibleSubjects.find(s => s.id === selectedSubjectFilter) || null;
  }, [accessibleSubjects, selectedSubjectFilter]);

  // Submissions filtered by selected subject (or all submissions if 'all')
  const activeSubmissions = useMemo(() => {
    if (!activeSubject) {
      return accessibleSubmissions;
    }
    return accessibleSubmissions.filter(sub => {
      const resolved = resolveSubject(sub);
      return resolved.id === activeSubject.id;
    });
  }, [accessibleSubmissions, activeSubject]);

  // Sessions filtered by selected subject
  const activeSessions = useMemo(() => {
    if (!activeSubject) {
      return accessibleSessions;
    }
    return accessibleSessions.filter(sess => {
      if (sess.subjectId && sess.subjectId === activeSubject.id) return true;
      if (sess.subjectCode && sess.subjectCode.toUpperCase() === activeSubject.code.toUpperCase()) return true;
      return activeSubmissions.some(sub => (sub.sessionId && sub.sessionId === sess.id) || sub.id === sess.id);
    });
  }, [accessibleSessions, activeSubject, activeSubmissions]);

  // Performance & Proctoring Statistics dynamically reactive to the selected subject
  const filteredStats = useMemo(() => {
    let totalMarksPctSum = 0;
    let scoredCount = 0;
    let totalPassCount = 0;

    activeSubmissions.forEach(sub => {
      const subj = resolveSubject(sub);
      const qList = (subj.questions && subj.questions.length > 0) ? subj.questions : questions;
      const perf = evaluateStudentSubmission(sub.answers, qList, sub.disqualified);
      totalMarksPctSum += perf.percentage;
      scoredCount++;
      if (perf.status === 'passed') totalPassCount++;
    });

    const avgMarks = scoredCount > 0 ? Math.round(totalMarksPctSum / scoredCount) : 0;
    const avgTrust = activeSessions.length > 0 
      ? Math.round(activeSessions.reduce((acc, s) => acc + Math.max(0, s.trustScore ?? 100), 0) / activeSessions.length)
      : (activeSubmissions.length > 0 ? Math.round(activeSubmissions.reduce((acc, s) => acc + Math.max(0, s.trustScore ?? 100), 0) / activeSubmissions.length) : 100);

    const highRiskCount = activeSessions.filter(s => (s.trustScore ?? 100) <= 30 || s.electronicDeviceUsed).length +
      activeSubmissions.filter(s => s.disqualified || s.electronicDeviceUsed).length;

    return {
      avgMarks,
      avgTrust,
      highRiskCount,
      passRate: scoredCount > 0 ? Math.round((totalPassCount / scoredCount) * 100) : 0,
      totalSubmissions: activeSubmissions.length,
      scoredCount
    };
  }, [activeSubmissions, activeSessions, questions]);

  // Backwards-compatible alias for any residual globalStats references
  const globalStats = filteredStats;

  const toggleExpandSubject = (subId: string) => {
    setExpandedSubjectMap(prev => ({
      ...prev,
      [subId]: prev[subId] === undefined ? false : !prev[subId] // default open
    }));
  };

  const chartData = {
    labels: subjectPerformanceGroups.map(g => g.subject.code || g.subject.name.slice(0, 10)),
    datasets: [
      {
        label: 'Attended Students',
        data: subjectPerformanceGroups.map(g => g.items.length),
        backgroundColor: 'rgba(99, 102, 241, 0.6)',
        borderColor: '#6366f1',
        borderWidth: 1,
        borderRadius: 8
      },
      {
        label: 'Avg Score %',
        data: subjectPerformanceGroups.map(g => {
          if (g.items.length === 0) return 0;
          const sum = g.items.reduce((acc, curr) => acc + curr.performance.percentage, 0);
          return Math.round(sum / g.items.length);
        }),
        backgroundColor: 'rgba(16, 185, 129, 0.6)',
        borderColor: '#10b981',
        borderWidth: 1,
        borderRadius: 8
      }
    ]
  };

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-6 text-center">
        <div className="p-8 max-w-md bg-white/5 border border-white/10 rounded-3xl space-y-4">
          <ShieldAlert className="w-12 h-12 text-red-400 mx-auto" />
          <h2 className="text-xl font-bold text-white">Teacher Dashboard Restricted</h2>
          <p className="text-xs text-white/50">
            This dashboard is only accessible to instructor and administrator accounts. You are currently logged in with a student profile.
          </p>
          <button
            onClick={logout}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-bold uppercase tracking-wider text-white cursor-pointer transition-all"
          >
            Log Out & Return to Student Portal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="px-3 py-1 bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 rounded-full text-xs font-bold uppercase tracking-wider">
                Dharmastra Proctor Portal
              </span>
              <div className="px-3 py-1 bg-white/5 rounded-full border border-white/10 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Live Synchronized</span>
              </div>
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white mt-2">
              Dharmastra: Auditor & Performance Dashboard
            </h1>
            <p className="text-white/50 text-xs md:text-sm mt-1">
              Online Exam Proctoring System • Real-time student evaluations, grades, and continuous biometric integrity.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Logged in Teacher/Admin Account Info Badge */}
            <div className={cn(
              "px-3.5 py-1.5 rounded-xl border flex items-center gap-2 text-xs",
              isSuperAdmin ? "bg-amber-500/10 border-amber-500/30 text-amber-300" : "bg-indigo-500/10 border-indigo-500/30 text-indigo-300"
            )}>
              {isSuperAdmin ? (
                <>
                  <ShieldCheck size={15} className="text-amber-400 shrink-0" />
                  <span className="font-bold">Main Admin ({user?.name || 'MAINADMIN'})</span>
                </>
              ) : (
                <>
                  <User size={15} className="text-indigo-400 shrink-0" />
                  <span className="font-medium">Teacher: {user?.name || user?.id}</span>
                </>
              )}
            </div>

            {submissions.length > 0 && (
              <button
                type="button"
                onClick={() => setShowClearAllSubmissionsModal(true)}
                className="px-3.5 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 size={14} /> Clear All Submissions ({submissions.length})
              </button>
            )}

            <button
              type="button"
              onClick={logout}
              title="Log out of Teacher Portal"
              className="px-3 py-2 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <X size={14} /> Logout
            </button>
          </div>
        </div>

        {/* Subject Filter Bar - Switches Top Analytics & Dashboard Context */}
        <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2 text-xs font-bold text-white/80 shrink-0">
            <BookOpen size={16} className="text-indigo-400" />
            <span className="uppercase tracking-wider">Select Subject:</span>
            {activeSubject && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-mono">
                {activeSubject.code}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 custom-scrollbar flex-1">
            <button
              onClick={() => setSelectedSubjectFilter('all')}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer border",
                selectedSubjectFilter === 'all'
                  ? "bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-600/30 ring-2 ring-indigo-400/40"
                  : "bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white"
              )}
            >
              <span>{isSuperAdmin ? "All Subjects" : "All My Subjects"}</span>
              <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono bg-white/15">
                {accessibleSubmissions.length}
              </span>
            </button>

            {accessibleSubjects.map(sub => {
              const count = accessibleSubmissions.filter(s => resolveSubject(s).id === sub.id).length;
              const isSelected = selectedSubjectFilter === sub.id;

              return (
                <button
                  key={sub.id}
                  onClick={() => setSelectedSubjectFilter(sub.id)}
                  className={cn(
                    "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer border",
                    isSelected
                      ? "bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-600/30 ring-2 ring-indigo-400/40"
                      : "bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <span className="font-mono text-indigo-300">[{sub.code}]</span>
                  <span>{sub.name}</span>
                  <span className={cn(
                    "px-2 py-0.5 rounded-md text-[10px] font-mono font-bold",
                    count > 0 ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-white/10 text-white/40"
                  )}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Top Analytics Stats Grid (Changes reactively with selected subject) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-5 rounded-2xl space-y-1">
            <div className="flex justify-between items-start">
              <p className="text-xs font-medium text-white/50 uppercase tracking-wider">Total Submissions</p>
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                <FileCheck size={18} />
              </div>
            </div>
            <p className="text-2xl md:text-3xl font-black text-white">{filteredStats.totalSubmissions}</p>
            <p className="text-[11px] text-white/40 truncate" title={activeSubject ? `[${activeSubject.code}] ${activeSubject.name}` : `Across all ${subjects.length} subjects`}>
              {activeSubject ? `For [${activeSubject.code}] ${activeSubject.name}` : `Across all ${subjects.length} subjects`}
            </p>
          </div>

          <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-5 rounded-2xl space-y-1">
            <div className="flex justify-between items-start">
              <p className="text-xs font-medium text-white/50 uppercase tracking-wider">Avg Exam Score</p>
              <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                <Award size={18} />
              </div>
            </div>
            <p className="text-2xl md:text-3xl font-black text-indigo-300">
              {filteredStats.scoredCount > 0 ? `${filteredStats.avgMarks}%` : '0%'}
            </p>
            <p className="text-[11px] text-emerald-400 font-medium">
              {filteredStats.scoredCount > 0 ? `Pass Rate: ${filteredStats.passRate}%` : 'No submissions yet'}
            </p>
          </div>

          <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-5 rounded-2xl space-y-1">
            <div className="flex justify-between items-start">
              <p className="text-xs font-medium text-white/50 uppercase tracking-wider">Avg Trust Integrity</p>
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                <Activity size={18} />
              </div>
            </div>
            <p className="text-2xl md:text-3xl font-black text-emerald-400">
              {filteredStats.scoredCount > 0 || activeSessions.length > 0 ? `${filteredStats.avgTrust}%` : '100%'}
            </p>
            <p className="text-[11px] text-white/40 truncate">
              {activeSubject
                ? (filteredStats.highRiskCount > 0 ? `${filteredStats.highRiskCount} Flagged at-risk` : 'High integrity (0 flagged)')
                : (filteredStats.highRiskCount > 0 ? `${filteredStats.highRiskCount} Total Flagged` : 'AI Vision & Tab proctoring')}
            </p>
          </div>

          <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-5 rounded-2xl space-y-1">
            <div className="flex justify-between items-start">
              <p className="text-xs font-medium text-white/50 uppercase tracking-wider">
                {activeSubject ? 'Subject Exam Paper' : 'Subject Exam Papers'}
              </p>
              <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400">
                <BookOpen size={18} />
              </div>
            </div>
            <p className="text-2xl md:text-3xl font-black text-sky-300">
              {activeSubject ? `${activeSubject.questions?.length || 0} Questions` : `${subjects.length} Subjects`}
            </p>
            <p className="text-[11px] text-sky-400/80 font-medium truncate">
              {activeSubject
                ? `[${activeSubject.code}] • ${activeSubject.durationMinutes || 30}m (${filteredStats.highRiskCount} Flagged)`
                : `${filteredStats.highRiskCount} Flagged / Disqualified`}
            </p>
          </div>
        </div>

        {/* Main Navigation Tabs */}
        <div className="flex gap-2 border-b border-white/10 pb-px flex-wrap">
          <button 
            onClick={() => setActiveTab('submissions')}
            className={cn(
              "pb-4 px-4 text-xs md:text-sm font-bold transition-all relative flex items-center gap-2 cursor-pointer",
              activeTab === 'submissions' ? "text-indigo-400" : "text-white/40 hover:text-white/70"
            )}
          >
            <FileCheck size={16} /> STUDENT PERFORMANCE (BY SUBJECT)
            <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-mono">
              {submissions.length}
            </span>
            {activeTab === 'submissions' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-400" />}
          </button>

          <button 
            onClick={() => setActiveTab('questions')}
            className={cn(
              "pb-4 px-4 text-xs md:text-sm font-bold transition-all relative flex items-center gap-2 cursor-pointer",
              activeTab === 'questions' ? "text-indigo-400" : "text-white/40 hover:text-white/70"
            )}
          >
            <FileEdit size={16} /> QUESTION PAPER BUILDER
            {activeTab === 'questions' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-400" />}
          </button>

          {/* Teacher Account Creation & Management - Strictly for Main Admin (MAINADMIN / ADMINDHARMAASTRA or mygamesprabhu@gmail.com) */}
          {isSuperAdmin && (
            <button 
              onClick={() => setActiveTab('teachers')}
              className={cn(
                "pb-4 px-4 text-xs md:text-sm font-bold transition-all relative flex items-center gap-2 cursor-pointer",
                activeTab === 'teachers' ? "text-indigo-400" : "text-white/40 hover:text-white/70"
              )}
            >
              <UserPlus size={16} /> TEACHER ACCOUNTS (ADMIN)
              <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-mono">
                {teachers.length}
              </span>
              {activeTab === 'teachers' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-400" />}
            </button>
          )}

          <button 
            onClick={() => setActiveTab('students')}
            className={cn(
              "pb-4 px-4 text-xs md:text-sm font-bold transition-all relative flex items-center gap-2 cursor-pointer",
              activeTab === 'students' ? "text-indigo-400" : "text-white/40 hover:text-white/70"
            )}
          >
            <GraduationCap size={16} /> REGISTERED STUDENTS
            {activeTab === 'students' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-400" />}
          </button>
        </div>

        {/* Tab 1: Student Performance by Subject */}
        {activeTab === 'submissions' && (
          <div className="space-y-8">
            {/* Filter and Search Controls */}
            <div className="p-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <BookOpen size={18} className="text-indigo-400" /> Filter Performance by Subject Paper:
                  </h3>
                  <p className="text-xs text-white/50">
                    Select a subject paper below to inspect the evaluated answer sheets, scores, and captured violation snapshots of attended students.
                  </p>
                </div>

                {/* Search Bar */}
                <div className="relative w-full md:w-80">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
                  <input
                    type="text"
                    placeholder="Search student, roll no, or subject..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-black/50 border border-white/15 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Subject Filter Chips - Specific Subject Selection */}
              <div className="flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar">
                <button
                  onClick={() => setSelectedSubjectFilter('all')}
                  className={cn(
                    "px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2.5 cursor-pointer",
                    selectedSubjectFilter === 'all'
                      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 ring-2 ring-indigo-400"
                      : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <span>All Subjects</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white/10 text-white/70">
                    {submissions.length} Attended
                  </span>
                </button>

                {subjects.map(sub => {
                  const count = submissions.filter(s => {
                    const resolved = resolveSubject(s);
                    return resolved.id === sub.id;
                  }).length;

                  const isSelected = selectedSubjectFilter === sub.id;

                  return (
                    <button
                      key={sub.id}
                      onClick={() => setSelectedSubjectFilter(sub.id)}
                      className={cn(
                        "px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2.5 cursor-pointer",
                        isSelected
                          ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 ring-2 ring-indigo-400"
                          : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                      )}
                    >
                      <span className="font-mono text-indigo-300">[{sub.code}]</span>
                      <span>{sub.name}</span>
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-mono font-bold",
                        count > 0 ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-white/10 text-white/40"
                      )}>
                        {count} Attended
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Subject-Wise Performance List */}
            {subjectPerformanceGroups.length === 0 ? (
              <div className="p-12 rounded-3xl bg-white/5 border border-dashed border-white/20 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center mx-auto">
                  <FileCheck size={24} />
                </div>
                <h4 className="text-base font-bold text-white">No Student Performance Records Found</h4>
                <p className="text-xs text-white/50 max-w-md mx-auto">
                  {searchQuery ? 'No student matched the current search query.' : 'Students who attend this subject examination will have their scored answer papers and integrity logs appear here automatically.'}
                </p>
              </div>
            ) : (
              <div className="space-y-8">
                {subjectPerformanceGroups.map((group) => {
                  const sub = group.subject;
                  const items = group.items;
                  const isExpanded = expandedSubjectMap[sub.id] !== false; // default open

                  // Stats for this subject
                  const avgSubMarks = items.length > 0
                    ? Math.round(items.reduce((acc, curr) => acc + curr.performance.percentage, 0) / items.length)
                    : 0;

                  const avgSubTrust = items.length > 0
                    ? Math.round(items.reduce((acc, curr) => acc + Math.max(0, curr.submission.trustScore ?? 100), 0) / items.length)
                    : 100;

                  const subPassCount = items.filter(i => i.performance.status === 'passed').length;
                  const passRate = items.length > 0 ? Math.round((subPassCount / items.length) * 100) : 0;
                  const maxPossibleMarks = (sub.questions || []).reduce((acc, q) => acc + (q.points || 10), 0);

                  return (
                    <div 
                      key={sub.id} 
                      className="rounded-3xl bg-white/5 border border-white/10 overflow-hidden backdrop-blur-xl shadow-xl space-y-0"
                    >
                      {/* Subject Header Banner */}
                      <div className="p-6 bg-gradient-to-r from-indigo-950/60 via-purple-950/40 to-slate-900/60 border-b border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span className="px-3 py-1 bg-indigo-500/30 text-indigo-200 border border-indigo-500/40 rounded-full text-xs font-mono font-extrabold uppercase tracking-wider">
                              {sub.code || 'EXAM'}
                            </span>
                            <span className="text-xs text-white/50 flex items-center gap-1">
                              <Layers size={13} className="text-indigo-400" /> {sub.questions?.length || 0} Questions
                            </span>
                            <span className="text-xs text-emerald-400/90 font-medium flex items-center gap-1">
                              <Award size={13} /> {maxPossibleMarks} Total Marks
                            </span>
                            <span className="text-xs text-amber-300/90 font-medium flex items-center gap-1">
                              <Clock size={13} /> {sub.durationMinutes || 30} mins
                            </span>
                          </div>
                          <h3 className="text-xl font-bold text-white tracking-tight">{sub.name}</h3>
                          {sub.description && (
                            <p className="text-xs text-white/60 line-clamp-1">{sub.description}</p>
                          )}
                        </div>

                        {/* Subject Aggregate Badges */}
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="px-3.5 py-2 rounded-2xl bg-black/40 border border-white/10 text-center">
                            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Attended</p>
                            <p className="text-base font-black text-white">{items.length} Students</p>
                          </div>

                          <div className="px-3.5 py-2 rounded-2xl bg-black/40 border border-white/10 text-center">
                            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Avg Marks</p>
                            <p className="text-base font-black text-indigo-300">{avgSubMarks}%</p>
                          </div>

                          <div className="px-3.5 py-2 rounded-2xl bg-black/40 border border-white/10 text-center">
                            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Pass Rate</p>
                            <p className="text-base font-black text-emerald-400">{passRate}%</p>
                          </div>

                          <div className="px-3.5 py-2 rounded-2xl bg-black/40 border border-white/10 text-center">
                            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Avg Trust</p>
                            <p className="text-base font-black text-emerald-300">{avgSubTrust}%</p>
                          </div>

                          {/* Teacher Download Subject Performance Report (PDF) */}
                          <button
                            type="button"
                            disabled={items.length === 0 || downloadingSubjectId === sub.id}
                            onClick={() => handleDownloadSubjectReport(sub, items)}
                            className={cn(
                              "px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 shadow-lg cursor-pointer",
                              items.length > 0 
                                ? "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-indigo-600/30 hover:scale-[1.02]"
                                : "bg-white/5 text-white/30 border border-white/10 cursor-not-allowed"
                            )}
                            title={`Download complete PDF performance & proctoring report for ${sub.name}`}
                          >
                            {downloadingSubjectId === sub.id ? (
                              <>
                                <Loader2 size={15} className="animate-spin text-white" />
                                <span>Exporting PDF...</span>
                              </>
                            ) : (
                              <>
                                <Download size={15} className="text-indigo-200" />
                                <span>Download Subject PDF Report</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => toggleExpandSubject(sub.id)}
                            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer"
                            title={isExpanded ? "Collapse subject list" : "Expand subject list"}
                          >
                            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                          </button>
                        </div>
                      </div>

                      {/* Students Performance Table under this Respective Subject */}
                      {isExpanded && (
                        <div className="p-0">
                          {items.length === 0 ? (
                            <div className="p-8 text-center space-y-2">
                              <p className="text-sm font-semibold text-white/70">No student submissions recorded yet for {sub.name}.</p>
                              <p className="text-xs text-white/40">When students take this exam paper and submit, their results will be listed right here.</p>
                            </div>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-left">
                                <thead className="bg-black/30 text-xs font-bold text-white/40 uppercase tracking-wider border-b border-white/5">
                                  <tr>
                                    <th className="px-6 py-4">Student Details</th>
                                    <th className="px-6 py-4">Evaluation / Marks</th>
                                    <th className="px-6 py-4">Grade</th>
                                    <th className="px-6 py-4">Trust Integrity</th>
                                    <th className="px-6 py-4">View Mistakes & Image Proof</th>
                                    <th className="px-6 py-4">Submission Time</th>
                                    <th className="px-6 py-4 text-right">Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                  {items.map(({ submission, session, performance, isElectronicDevice, isBelow30 }) => {
                                    const trust = Math.max(0, submission.trustScore ?? session?.trustScore ?? 100);
                                    const violationCount = session?.violationCount || (submission.violationType ? 1 : 0);
                                    const evidenceImage = submission.evidenceScreenshot || submission.lastViolationSnapshot || session?.lastViolationSnapshot || session?.evidenceScreenshot;
                                    const violationMistakeName = submission.violationType || session?.lastViolationType || (isElectronicDevice ? 'ELECTRONIC_DEVICE_USAGE' : 'PROCTORING_MISTAKE');
                                    const hasMistakes = isElectronicDevice || isBelow30 || violationCount > 0 || !!evidenceImage;

                                    return (
                                      <tr 
                                        key={submission.id}
                                        className={cn(
                                          "transition-colors group",
                                          isElectronicDevice ? "bg-red-950/20 hover:bg-red-950/30" : isBelow30 ? "bg-red-950/10 hover:bg-red-950/20" : "hover:bg-white/5"
                                        )}
                                      >
                                        {/* Column 1: Clean Student Details (No inline mistake button) */}
                                        <td className="px-6 py-4">
                                          <div className="flex items-center gap-3.5">
                                            <div className={cn(
                                              "w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0 border",
                                              isElectronicDevice || isBelow30 
                                                ? "bg-red-500/15 border-red-500/30 text-red-400" 
                                                : "bg-indigo-500/15 border-indigo-500/30 text-indigo-300"
                                            )}>
                                              <User size={19} />
                                            </div>

                                            <div className="min-w-0 space-y-0.5">
                                              <p className={cn(
                                                "font-bold text-sm truncate",
                                                isElectronicDevice || isBelow30 ? "text-red-400 font-black" : "text-white"
                                              )}>
                                                {submission.studentName || 'Student'}
                                              </p>
                                              <div className="flex items-center gap-2">
                                                <span className="text-xs font-mono text-indigo-300/80">{submission.studentId || 'No Roll No'}</span>
                                                {isElectronicDevice && (
                                                  <span className="px-1.5 py-0.2 rounded text-[8px] font-black uppercase tracking-wider bg-red-500/30 text-red-300 border border-red-500/40">
                                                    ⚡ Device
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        </td>

                                        {/* Score / Marks */}
                                        <td className="px-6 py-4">
                                          <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                              <span className="text-sm font-black text-white">
                                                {performance.earnedPoints} / {performance.totalPoints} Marks
                                              </span>
                                              <span className={cn(
                                                "px-2 py-0.5 rounded-full text-[10px] font-bold",
                                                performance.percentage >= 80 ? "bg-emerald-500/20 text-emerald-300" :
                                                performance.percentage >= 50 ? "bg-amber-500/20 text-amber-300" :
                                                "bg-red-500/20 text-red-300"
                                              )}>
                                                {performance.percentage}%
                                              </span>
                                            </div>
                                            <p className="text-[11px] text-white/40">
                                              {performance.correctCount} of {performance.totalQuestions} questions correct
                                            </p>
                                          </div>
                                        </td>

                                        {/* Grade Badge */}
                                        <td className="px-6 py-4">
                                          <span className={cn(
                                            "px-3 py-1 rounded-xl text-xs font-extrabold uppercase tracking-wider inline-block",
                                            performance.grade === 'A+' || performance.grade === 'A' 
                                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                              : performance.grade === 'B' || performance.grade === 'C'
                                                ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                                                : "bg-red-500/20 text-red-400 border border-red-500/30"
                                          )}>
                                            Grade {performance.grade}
                                          </span>
                                        </td>

                                        {/* Trust Score */}
                                        <td className="px-6 py-4">
                                          <div className="space-y-1.5 w-32">
                                            <div className="flex items-center justify-between text-xs font-bold">
                                              <span className="text-white/40 text-[10px] uppercase">Trust</span>
                                              <span className={cn(
                                                isElectronicDevice || trust <= 30 ? "text-red-400 font-black" : "text-emerald-400"
                                              )}>
                                                {trust}%
                                              </span>
                                            </div>
                                            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                                              <div 
                                                className={cn(
                                                  "h-full rounded-full transition-all duration-1000",
                                                  isElectronicDevice || trust <= 30 ? "bg-red-500" : trust > 80 ? "bg-emerald-500" : "bg-amber-500"
                                                )}
                                                style={{ width: `${Math.min(100, Math.max(0, trust))}%` }}
                                              />
                                            </div>
                                          </div>
                                        </td>

                                        {/* Dedicated Column: View Mistakes & Image Proof */}
                                        <td className="px-6 py-4">
                                          <div className="flex items-center gap-2">
                                            {hasMistakes ? (
                                              <div className="flex items-center gap-2">
                                                {/* Photo Proof thumbnail */}
                                                {evidenceImage && (
                                                  <button
                                                    type="button"
                                                    onClick={() => setStudentMistakesModal({
                                                      studentName: submission.studentName || session?.studentName || 'Student',
                                                      studentId: submission.studentId || session?.studentId || 'No Roll No',
                                                      subjectName: sub.name,
                                                      subjectCode: sub.code,
                                                      sessionId: submission.id || submission.sessionId || session?.id,
                                                      trustScore: trust,
                                                      violationCount: violationCount,
                                                      isDisqualified: !!(isElectronicDevice || submission.disqualified || session?.disqualified),
                                                      terminationReason: submission.terminationReason || session?.terminationReason,
                                                      evidenceScreenshot: submission.evidenceScreenshot || session?.evidenceScreenshot,
                                                      lastViolationSnapshot: submission.lastViolationSnapshot || session?.lastViolationSnapshot,
                                                      submittedAt: submission.submittedAt || session?.startTime
                                                    })}
                                                    className="relative rounded-lg overflow-hidden border border-red-500/60 shadow-sm shrink-0 hover:scale-105 transition-transform group/thumb cursor-pointer"
                                                    title="Click to view full photo evidence snapshot"
                                                  >
                                                    <img 
                                                      src={evidenceImage} 
                                                      alt="Proof Snapshot" 
                                                      className="w-10 h-10 object-cover"
                                                      referrerPolicy="no-referrer"
                                                    />
                                                    <div className="absolute inset-0 bg-red-950/20 group-hover/thumb:bg-transparent" />
                                                    <div className="absolute bottom-0 inset-x-0 bg-red-600 text-[7px] font-bold text-white text-center py-0.2 uppercase">
                                                      📸 Proof
                                                    </div>
                                                  </button>
                                                )}

                                                {/* View Mistakes Button */}
                                                <button
                                                  type="button"
                                                  onClick={() => setStudentMistakesModal({
                                                    studentName: submission.studentName || session?.studentName || 'Student',
                                                    studentId: submission.studentId || session?.studentId || 'No Roll No',
                                                    subjectName: sub.name,
                                                    subjectCode: sub.code,
                                                    sessionId: submission.id || submission.sessionId || session?.id,
                                                    trustScore: trust,
                                                    violationCount: violationCount,
                                                    isDisqualified: !!(isElectronicDevice || submission.disqualified || session?.disqualified),
                                                    terminationReason: submission.terminationReason || session?.terminationReason,
                                                    evidenceScreenshot: submission.evidenceScreenshot || session?.evidenceScreenshot,
                                                    lastViolationSnapshot: submission.lastViolationSnapshot || session?.lastViolationSnapshot,
                                                    submittedAt: submission.submittedAt || session?.startTime
                                                  })}
                                                  className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm hover:scale-[1.02]"
                                                >
                                                  <AlertTriangle size={13} className="text-red-400" />
                                                  <span>View Mistakes</span>
                                                  <span className="px-1.5 py-0.2 rounded-full bg-red-600 text-white text-[10px] font-mono font-black">
                                                    {violationCount > 0 ? violationCount : '1'}
                                                  </span>
                                                </button>
                                              </div>
                                            ) : (
                                              <button
                                                type="button"
                                                onClick={() => setStudentMistakesModal({
                                                  studentName: submission.studentName || session?.studentName || 'Student',
                                                  studentId: submission.studentId || session?.studentId || 'No Roll No',
                                                  subjectName: sub.name,
                                                  subjectCode: sub.code,
                                                  sessionId: submission.id || submission.sessionId || session?.id,
                                                  trustScore: trust,
                                                  violationCount: 0,
                                                  isDisqualified: false,
                                                  submittedAt: submission.submittedAt || session?.startTime
                                                })}
                                                className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
                                              >
                                                <ShieldCheck size={13} className="text-emerald-400" />
                                                <span>View Mistakes (0)</span>
                                              </button>
                                            )}
                                          </div>
                                        </td>

                                        {/* Submission Time */}
                                        <td className="px-6 py-4 text-xs text-white/50">
                                          {submission.submittedAt ? new Date(submission.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                                        </td>

                                        {/* Action Buttons */}
                                        <td className="px-6 py-4 text-right">
                                          <div className="flex items-center justify-end gap-2">
                                            {/* Download Student Performance & Mistakes Report in PDF */}
                                            <button
                                              type="button"
                                              disabled={downloadingStudentId === (submission.id || session?.id)}
                                              onClick={() => handleDownloadStudentReport(submission, session)}
                                              className="px-3 py-1.5 bg-gradient-to-r from-purple-600/90 to-indigo-600/90 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-purple-600/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                              title="Download student performance report (PDF) with questions attended, marks, trust score, and mistakes text log"
                                            >
                                              {downloadingStudentId === (submission.id || session?.id) ? (
                                                <Loader2 size={13} className="animate-spin" />
                                              ) : (
                                                <Download size={13} />
                                              )}
                                              <span>PDF Report</span>
                                            </button>

                                            <button
                                              type="button"
                                              onClick={() => setSelectedStudentSubmission(submission)}
                                              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/20 flex items-center gap-1.5 cursor-pointer"
                                            >
                                              <Eye size={13} /> View Answer Sheet
                                            </button>

                                            <button
                                              type="button"
                                              onClick={() => setSubmissionToDelete(submission)}
                                              title="Delete student submission"
                                              className="p-1.5 text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                                            >
                                              <Trash2 size={15} />
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Question Paper Builder */}
        {activeTab === 'questions' && (
          <TeacherQuestionBuilder />
        )}

        {/* Tab 3: Teacher Accounts Manager - Only accessible to Main Admin */}
        {activeTab === 'teachers' && isSuperAdmin && (
          <TeacherManager />
        )}

        {/* Tab 4: Registered Students */}
        {activeTab === 'students' && (
          <StudentManager />
        )}

      </div>

      {/* Comprehensive Student Answer Sheet & Performance Modal */}
      <AnimatePresence>
        {selectedStudentSubmission && (() => {
          const sub = selectedStudentSubmission;
          const subject = resolveSubject(sub);
          const matchingSession = sessions.find(s => s.id === sub.sessionId || s.id === sub.id);
          const isDisqualified = sub.disqualified || matchingSession?.disqualified;
          
          const isElectronicDevice = sub.electronicDeviceUsed || matchingSession?.electronicDeviceUsed ||
            sub.status === 'terminated_electronic_device' || matchingSession?.status === 'terminated_electronic_device' ||
            sub.status === 'terminated_mobile_phone' || matchingSession?.status === 'terminated_mobile_phone' ||
            sub.terminationReason?.toLowerCase().includes('electronic') || matchingSession?.terminationReason?.toLowerCase().includes('electronic') ||
            sub.terminationReason?.toLowerCase().includes('phone') || matchingSession?.terminationReason?.toLowerCase().includes('phone') ||
            sub.terminationReason?.toLowerCase().includes('device') || matchingSession?.terminationReason?.toLowerCase().includes('device');

          const trust = Math.max(0, sub.trustScore ?? matchingSession?.trustScore ?? 100);

          const performance = evaluateStudentSubmission(
            sub.answers,
            subject.questions && subject.questions.length > 0 ? subject.questions : questions,
            isDisqualified || isElectronicDevice
          );

          return (
            <div 
              onClick={() => setSelectedStudentSubmission(null)}
              className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-[#12131c] border border-indigo-500/30 rounded-3xl p-6 md:p-8 max-w-3xl w-full shadow-2xl space-y-6 my-8 text-left max-h-[90vh] overflow-y-auto custom-scrollbar"
              >
                {/* Modal Header */}
                <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-mono font-bold">
                        {subject.code}
                      </span>
                      <span className="text-xs text-white/50">{subject.name}</span>
                    </div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                      {sub.studentName || 'Student'} 
                      <span className="text-sm font-mono text-indigo-300">({sub.studentId || 'No Roll No'})</span>
                    </h2>
                    <p className="text-xs text-white/40">
                      Submitted on {sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : 'N/A'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={downloadingStudentId === sub.id}
                      onClick={() => handleDownloadStudentReport(sub, matchingSession)}
                      className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-purple-600/30 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {downloadingStudentId === sub.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Download size={14} />
                      )}
                      <span>Download PDF Report</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedStudentSubmission(null)}
                      className="p-2 text-white/40 hover:text-white rounded-xl bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>

                {/* Performance Summary Banner */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-center space-y-0.5">
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Score / Marks</p>
                    <p className="text-xl font-black text-white">
                      {performance.earnedPoints} <span className="text-xs text-white/40">/ {performance.totalPoints}</span>
                    </p>
                    <p className="text-xs font-bold text-emerald-400">{performance.percentage}%</p>
                  </div>

                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-center space-y-0.5">
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Grade</p>
                    <p className="text-xl font-black text-indigo-300">Grade {performance.grade}</p>
                    <p className="text-xs font-bold text-white/50">{performance.status.toUpperCase()}</p>
                  </div>

                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-center space-y-0.5">
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Trust Integrity</p>
                    <p className={cn("text-xl font-black", isElectronicDevice || trust <= 30 ? "text-red-400" : "text-emerald-400")}>
                      {trust}%
                    </p>
                    <p className="text-xs font-medium text-white/50">Proctored</p>
                  </div>

                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-center space-y-0.5">
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Accuracy</p>
                    <p className="text-xl font-black text-white">
                      {performance.correctCount} / {performance.totalQuestions}
                    </p>
                    <p className="text-xs font-medium text-white/50">Questions Correct</p>
                  </div>
                </div>

                {/* Electronic Device / Flags Warning & Captured Snapshot */}
                {(isElectronicDevice || (sub.evidenceScreenshot || sub.lastViolationSnapshot)) && (
                  <div className="p-4 rounded-2xl bg-red-950/40 border border-red-500/50 text-red-200 text-xs space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="font-black text-red-400 uppercase tracking-wide text-xs flex items-center gap-1.5">
                          📸 Proctoring Mistake Snapshot Captured
                        </p>
                        <p className="text-white/70">
                          {isElectronicDevice 
                            ? "An unauthorized electronic device or proctoring violation was detected during this student's exam session."
                            : "A proctoring integrity alert was recorded with camera evidence snapshot during the exam."}
                        </p>
                      </div>
                      {(sub.evidenceScreenshot || sub.lastViolationSnapshot) && (
                        <button
                          type="button"
                          onClick={() => setSelectedViolationEvidence({
                            image: sub.evidenceScreenshot || sub.lastViolationSnapshot,
                            studentName: sub.studentName || 'Student',
                            studentId: sub.studentId || 'No ID',
                            subjectName: sub.subjectName || 'Exam Paper',
                            subjectCode: sub.subjectCode || 'N/A',
                            violationType: sub.violationType || (isElectronicDevice ? 'ELECTRONIC_DEVICE_USAGE' : 'PROCTORING_MISTAKE'),
                            timestamp: sub.lastViolationTime || sub.submittedAt,
                            trustScore: trust
                          })}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold shrink-0 flex items-center gap-1.5 shadow-lg shadow-red-600/30 transition-all cursor-pointer"
                        >
                          <Eye size={13} /> View Full Photo
                        </button>
                      )}
                    </div>

                    {(sub.evidenceScreenshot || sub.lastViolationSnapshot) && (
                      <div className="relative rounded-xl overflow-hidden border border-red-500/40 max-w-sm">
                        <img 
                          src={sub.evidenceScreenshot || sub.lastViolationSnapshot} 
                          alt="Captured Mistake Evidence" 
                          className="w-full h-44 object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Question-by-Question Evaluation Breakdown */}
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <FileCheck size={16} className="text-indigo-400" /> Question-by-Question Answer Breakdown:
                  </h3>

                  <div className="space-y-3">
                    {performance.questionResults.map((qRes, idx) => {
                      return (
                        <div 
                          key={String(qRes.questionId)} 
                          className={cn(
                            "p-4 rounded-2xl border transition-all space-y-3",
                            qRes.status === 'correct' 
                              ? "bg-emerald-950/20 border-emerald-500/30" 
                              : qRes.status === 'partial'
                                ? "bg-amber-950/20 border-amber-500/30"
                                : "bg-red-950/20 border-red-500/30"
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded uppercase tracking-wider bg-white/10 text-white/70">
                                Question {idx + 1} • {qRes.type.replace('_', ' ').toUpperCase()}
                              </span>
                              <p className="text-sm font-semibold text-white mt-1 leading-snug">
                                {qRes.questionText}
                              </p>
                            </div>

                            <div className="text-right shrink-0">
                              <span className={cn(
                                "px-2.5 py-1 rounded-xl text-xs font-black inline-flex items-center gap-1",
                                qRes.status === 'correct' ? "bg-emerald-500/20 text-emerald-300" :
                                qRes.status === 'partial' ? "bg-amber-500/20 text-amber-300" :
                                "bg-red-500/20 text-red-300"
                              )}>
                                {qRes.status === 'correct' && <CheckCircle2 size={13} />}
                                {qRes.status === 'incorrect' && <XCircle size={13} />}
                                {qRes.status === 'partial' && <HelpCircle size={13} />}
                                {qRes.earnedPoints} / {qRes.maxPoints} Pts
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                            <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
                              <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest block">
                                Student's Submitted Answer:
                              </span>
                              <p className={cn(
                                "font-semibold",
                                qRes.status === 'correct' ? "text-emerald-300" : "text-red-300"
                              )}>
                                {qRes.studentAnswerText}
                              </p>
                            </div>

                            <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
                              <span className="text-[10px] font-bold text-emerald-400/70 uppercase tracking-widest block">
                                Official Answer Key / Key Concepts:
                              </span>
                              <p className="font-semibold text-emerald-300">
                                {qRes.correctAnswerText}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Proctor Violations Timeline in Modal */}
                {violations.length > 0 && (
                  <div className="space-y-3 pt-4 border-t border-white/10">
                    <h4 className="text-xs font-bold text-white/40 uppercase tracking-widest">
                      Proctoring Violation Timeline ({violations.length} Events)
                    </h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                      {violations.map((v, i) => (
                        <div key={i} className="p-3 bg-white/5 rounded-xl border border-white/5 flex items-center justify-between text-xs">
                          <span className="font-bold text-red-400">{getViolationInfo(v.type, v.details).title}</span>
                          <span className="text-[10px] text-white/40">{new Date(v.timestamp).toLocaleTimeString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Modal Footer */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setSelectedStudentSubmission(null)}
                    className="px-5 py-2.5 bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })()}

        {/* Delete Submission Modal */}
        {submissionToDelete && (
          <div 
            onClick={() => setSubmissionToDelete(null)}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#14151f] border border-red-500/30 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl space-y-6 text-left"
            >
              <div className="flex items-center gap-4">
                <div className="p-3 bg-red-500/20 text-red-400 rounded-2xl border border-red-500/30 shrink-0">
                  <Trash2 size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Delete Student Submission?</h3>
                  <p className="text-xs text-white/50">This action permanently removes the student's evaluated paper.</p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-red-950/30 border border-red-500/20 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-white/60">Student Name:</span>
                  <span className="font-bold text-white">{submissionToDelete.studentName || 'Student'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/60">Student Roll / USN:</span>
                  <span className="font-mono font-bold text-indigo-300">{submissionToDelete.studentId || 'N/A'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/60">Subject:</span>
                  <span className="text-white font-medium">{submissionToDelete.subjectName || submissionToDelete.subjectCode || 'General'}</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSubmissionToDelete(null)}
                  className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white/70 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deletingId === submissionToDelete.id}
                  onClick={() => handleDeleteSubmission(submissionToDelete.id)}
                  className="px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-red-600/30 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  <Trash2 size={15} /> {deletingId === submissionToDelete.id ? 'Deleting...' : 'Yes, Delete Record'}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Clear All Sessions Modal */}
        {showClearAllSessionsModal && (
          <div 
            onClick={() => setShowClearAllSessionsModal(false)}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#14151f] border border-red-500/30 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl space-y-6 text-left"
            >
              <div className="flex items-center gap-4">
                <div className="p-3 bg-red-500/20 text-red-400 rounded-2xl border border-red-500/30 shrink-0">
                  <Trash2 size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Clear All Active Sessions?</h3>
                  <p className="text-xs text-white/50">This will purge all {sessions.length} live session record(s).</p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-red-950/30 border border-red-500/20 space-y-2 text-xs">
                <p className="text-white/80 leading-relaxed font-medium">
                  Warning: All {sessions.length} active exam proctoring sessions, real-time trust meters, and violation logs will be removed immediately.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowClearAllSessionsModal(false)}
                  className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white/70 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isBulkDeleting}
                  onClick={handleClearAllSessions}
                  className="px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-red-600/30 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  <Trash2 size={15} /> {isBulkDeleting ? 'Purging All...' : `Yes, Clear All (${sessions.length})`}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Clear All Submissions Modal */}
        {showClearAllSubmissionsModal && (
          <div 
            onClick={() => setShowClearAllSubmissionsModal(false)}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#14151f] border border-red-500/30 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl space-y-6 text-left"
            >
              <div className="flex items-center gap-4">
                <div className="p-3 bg-red-500/20 text-red-400 rounded-2xl border border-red-500/30 shrink-0">
                  <Trash2 size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Clear All Exam Submissions?</h3>
                  <p className="text-xs text-white/50">This will purge all {submissions.length} submitted answer paper(s).</p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-red-950/30 border border-red-500/20 space-y-2 text-xs">
                <p className="text-white/80 leading-relaxed font-medium">
                  Warning: All {submissions.length} evaluated student answer sheets and timestamps will be permanently deleted from the database.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowClearAllSubmissionsModal(false)}
                  className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white/70 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isBulkDeleting}
                  onClick={handleClearAllSubmissions}
                  className="px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-red-600/30 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  <Trash2 size={15} /> {isBulkDeleting ? 'Purging All...' : `Yes, Clear All (${submissions.length})`}
                </button>
              </div>
            </motion.div>
          </div>
        )}
        {/* Student Mistakes and Violations Modal */}
        {studentMistakesModal && (() => {
          const matchingSession = sessions.find(s => s.id === studentMistakesModal.sessionId);
          const matchingSubmission = submissions.find(s => s.id === studentMistakesModal.sessionId || s.sessionId === studentMistakesModal.sessionId);
          const modalTrustScore = matchingSubmission?.trustScore !== undefined
            ? matchingSubmission.trustScore
            : (matchingSession?.trustScore !== undefined
              ? matchingSession.trustScore
              : studentMistakesModal.trustScore);

          return (
            <div 
              onClick={() => setStudentMistakesModal(null)}
              className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto"
            >
              <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-[#14151f] border-2 border-red-500/40 rounded-3xl p-6 md:p-7 max-w-3xl w-full shadow-2xl space-y-6 text-left my-8 max-h-[90vh] flex flex-col"
              >
                {/* Modal Header */}
                <div className="flex items-start justify-between gap-4 shrink-0">
                  <div className="flex items-center gap-3.5">
                    <div className={cn(
                      "p-3 rounded-2xl border shrink-0",
                      studentMistakesModal.isDisqualified || modalTrustScore <= 30 || studentMistakesList.length > 0 || (studentMistakesModal.evidenceScreenshot || studentMistakesModal.lastViolationSnapshot)
                        ? "bg-red-500/20 text-red-400 border-red-500/30"
                        : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                    )}>
                      {studentMistakesModal.isDisqualified || modalTrustScore <= 30 || studentMistakesList.length > 0 || (studentMistakesModal.evidenceScreenshot || studentMistakesModal.lastViolationSnapshot) ? (
                        <AlertTriangle size={24} />
                      ) : (
                        <ShieldCheck size={24} />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-lg font-bold text-white">
                          Proctoring Mistakes & Violation Log
                        </h3>
                        <span className={cn(
                          "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider",
                          studentMistakesModal.isDisqualified || modalTrustScore <= 30
                            ? "bg-red-500/30 text-red-300 border border-red-500/50"
                            : modalTrustScore < 80
                              ? "bg-amber-500/30 text-amber-300 border border-amber-500/50"
                              : "bg-emerald-500/30 text-emerald-300 border border-emerald-500/50"
                        )}>
                          {studentMistakesModal.isDisqualified ? 'Disqualified' : modalTrustScore <= 30 ? 'High Risk' : modalTrustScore < 80 ? 'Flagged' : 'Verified Clean'}
                        </span>
                      </div>
                      <p className="text-xs text-white/50 mt-0.5">
                        Student: <span className="font-bold text-white">{studentMistakesModal.studentName}</span> ({studentMistakesModal.studentId}) &bull; Subject: <span className="font-mono text-indigo-300">[{studentMistakesModal.subjectCode}]</span> {studentMistakesModal.subjectName}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setStudentMistakesModal(null)}
                    className="p-2 text-white/40 hover:text-white rounded-xl bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Status & Trust Overview Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
                  <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
                    <p className="text-[10px] font-bold text-white/40 uppercase">Integrity Score</p>
                    <p className={cn(
                      "text-xl font-black mt-0.5",
                      modalTrustScore <= 30 ? "text-red-400" : modalTrustScore < 80 ? "text-amber-400" : "text-emerald-400"
                    )}>
                      {modalTrustScore}%
                    </p>
                    <div className="w-full h-1.5 bg-white/10 rounded-full mt-1.5 overflow-hidden">
                      <div 
                        className={cn(
                          "h-full rounded-full",
                          modalTrustScore <= 30 ? "bg-red-500" : modalTrustScore < 80 ? "bg-amber-500" : "bg-emerald-500"
                        )} 
                        style={{ width: `${Math.min(100, Math.max(0, modalTrustScore))}%` }}
                      />
                    </div>
                  </div>

                <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
                  <p className="text-[10px] font-bold text-white/40 uppercase">Mistakes Detected</p>
                  <p className={cn(
                    "text-xl font-black mt-0.5",
                    studentMistakesList.length > 0 || studentMistakesModal.violationCount > 0 ? "text-red-400" : "text-emerald-400"
                  )}>
                    {Math.max(studentMistakesList.length, studentMistakesModal.violationCount)}
                  </p>
                  <p className="text-[10px] text-white/40 mt-1">Logged during session</p>
                </div>

                <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
                  <p className="text-[10px] font-bold text-white/40 uppercase">Session Status</p>
                  <p className="text-xs font-bold text-white mt-1">
                    {studentMistakesModal.isDisqualified ? 'Auto-Terminated' : 'Completed Normally'}
                  </p>
                  <p className="text-[10px] text-white/40 truncate">
                    {studentMistakesModal.terminationReason || 'Standard submission'}
                  </p>
                </div>

                <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
                  <p className="text-[10px] font-bold text-white/40 uppercase">Exam Timestamp</p>
                  <p className="text-xs font-mono font-bold text-indigo-300 mt-1">
                    {studentMistakesModal.submittedAt 
                      ? new Date(studentMistakesModal.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) 
                      : 'Recorded'}
                  </p>
                  <p className="text-[10px] text-white/40">
                    {studentMistakesModal.submittedAt ? new Date(studentMistakesModal.submittedAt).toLocaleDateString() : ''}
                  </p>
                </div>
              </div>

              {/* Scrollable Mistakes Content Body */}
              <div className="overflow-y-auto space-y-4 pr-1 custom-scrollbar flex-1">
                {/* Highlighted Evidence Snapshot if Available */}
                {(studentMistakesModal.evidenceScreenshot || studentMistakesModal.lastViolationSnapshot) && (
                  <div className="p-4 rounded-2xl bg-red-950/40 border-2 border-red-500/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-red-300 font-bold text-xs">
                        <Camera size={16} className="text-red-400" />
                        <span>📸 Captured Photo Evidence During Mistake</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedViolationEvidence({
                          image: studentMistakesModal.evidenceScreenshot || studentMistakesModal.lastViolationSnapshot!,
                          studentName: studentMistakesModal.studentName,
                          studentId: studentMistakesModal.studentId,
                          subjectName: studentMistakesModal.subjectName,
                          subjectCode: studentMistakesModal.subjectCode,
                          violationType: 'ELECTRONIC_DEVICE_USAGE',
                          timestamp: studentMistakesModal.submittedAt,
                          trustScore: studentMistakesModal.trustScore
                        })}
                        className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <Eye size={12} /> View Full Photo
                      </button>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-4">
                      <div 
                        onClick={() => setSelectedViolationEvidence({
                          image: studentMistakesModal.evidenceScreenshot || studentMistakesModal.lastViolationSnapshot!,
                          studentName: studentMistakesModal.studentName,
                          studentId: studentMistakesModal.studentId,
                          subjectName: studentMistakesModal.subjectName,
                          subjectCode: studentMistakesModal.subjectCode,
                          violationType: 'ELECTRONIC_DEVICE_USAGE',
                          timestamp: studentMistakesModal.submittedAt,
                          trustScore: studentMistakesModal.trustScore
                        })}
                        className="relative rounded-xl overflow-hidden border border-red-500/50 max-w-[200px] shrink-0 cursor-pointer group"
                      >
                        <img 
                          src={studentMistakesModal.evidenceScreenshot || studentMistakesModal.lastViolationSnapshot} 
                          alt="Mistake Snapshot" 
                          className="w-full h-28 object-cover group-hover:scale-105 transition-transform"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-red-950/20 group-hover:bg-transparent transition-colors" />
                        <div className="absolute bottom-0 inset-x-0 bg-black/80 text-[8px] font-mono text-center py-0.5 text-white/80">
                          Click to enlarge
                        </div>
                      </div>

                      <div className="space-y-1 text-xs text-left w-full">
                        <p className="font-bold text-red-200">
                          AI Proctor Camera Snap: Unauthorized Device or Integrity Breach
                        </p>
                        <p className="text-white/70 text-[11px] leading-relaxed">
                          This high-definition photo snapshot was recorded by the camera when the proctoring engine detected an infraction (e.g. mobile phone in camera field, severe gaze diversion, or secondary person).
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Individual Mistakes Breakdown List */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-white/50 uppercase tracking-wider flex items-center gap-2">
                    <History size={14} className="text-indigo-400" /> Logged Mistake Events ({studentMistakesList.length})
                  </h4>

                  {isLoadingMistakes ? (
                    <div className="p-8 text-center text-xs text-white/40">
                      Loading mistake logs...
                    </div>
                  ) : studentMistakesList.length > 0 ? (
                    <div className="space-y-2.5">
                      {studentMistakesList.map((mistake, idx) => {
                        const info = getViolationInfo(mistake.type);
                        const mistakePhoto = mistake.details?.screenshot || mistake.screenshot;

                        return (
                          <div 
                            key={mistake.id || idx}
                            className="p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-start justify-between gap-3 transition-colors"
                          >
                            <div className="flex items-start gap-3">
                              <div className="p-2 rounded-xl bg-red-500/20 text-red-400 border border-red-500/30 shrink-0 mt-0.5">
                                <AlertCircle size={16} />
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-xs font-bold text-white">
                                    {info.title || mistake.type}
                                  </p>
                                  <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-red-500/20 text-red-300 border border-red-500/30">
                                    {info.severity || 'HIGH'} SEVERITY
                                  </span>
                                </div>
                                <p className="text-[11px] text-white/60 leading-relaxed">
                                  {info.description || 'Infraction against exam proctoring guidelines.'}
                                </p>
                                {mistake.details && typeof mistake.details === 'object' && Object.keys(mistake.details).length > 0 && (
                                  <div className="flex items-center gap-2 text-[10px] text-white/40 font-mono pt-0.5">
                                    {mistake.details.intensity && <span>Intensity: {mistake.details.intensity}</span>}
                                    {mistake.details.count && <span>Count: {mistake.details.count}</span>}
                                    {mistake.details.device && <span>Detected: {mistake.details.device}</span>}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="text-right shrink-0 space-y-1">
                              <span className="text-[11px] font-mono text-white/50 block">
                                {mistake.timestamp 
                                  ? new Date(mistake.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                                  : 'Recorded'}
                              </span>

                              {mistakePhoto && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedViolationEvidence({
                                    image: mistakePhoto,
                                    studentName: studentMistakesModal.studentName,
                                    studentId: studentMistakesModal.studentId,
                                    subjectName: studentMistakesModal.subjectName,
                                    subjectCode: studentMistakesModal.subjectCode,
                                    violationType: mistake.type,
                                    timestamp: mistake.timestamp,
                                    trustScore: studentMistakesModal.trustScore
                                  })}
                                  className="px-2 py-0.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 rounded text-[9px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors"
                                >
                                  <Camera size={10} /> Photo
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : studentMistakesModal.isDisqualified || studentMistakesModal.trustScore <= 30 ? (
                    <div className="p-4 rounded-2xl bg-red-950/30 border border-red-500/30 space-y-1 text-xs">
                      <p className="font-bold text-red-300">Exam Integrity Breach Detected</p>
                      <p className="text-white/70">
                        {studentMistakesModal.terminationReason || 'An unauthorized action or device was detected causing trust score penalty and session flagging.'}
                      </p>
                    </div>
                  ) : (
                    /* Clean Audit State */
                    <div className="p-6 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 text-center space-y-2">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
                        <CheckCircle2 size={24} />
                      </div>
                      <p className="text-sm font-bold text-emerald-300">No Proctoring Mistakes Detected</p>
                      <p className="text-xs text-white/60 max-w-md mx-auto leading-relaxed">
                        This student maintained 100% exam compliance throughout the session. No looking away, face disappearances, background audio, or unauthorized devices were logged.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-between pt-2 border-t border-white/10 shrink-0 gap-3">
                <span className="text-[11px] text-white/40 truncate">
                  AI Proctor Audit System &bull; Tamper-Evident Logs
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const matchedSub = submissions.find(s => s.id === studentMistakesModal.sessionId || s.sessionId === studentMistakesModal.sessionId);
                      const matchedSess = sessions.find(s => s.id === studentMistakesModal.sessionId);
                      handleDownloadStudentReport(matchedSub || {
                        studentName: studentMistakesModal.studentName,
                        studentId: studentMistakesModal.studentId,
                        trustScore: studentMistakesModal.trustScore,
                        submittedAt: studentMistakesModal.submittedAt,
                        subjectName: studentMistakesModal.subjectName,
                        subjectCode: studentMistakesModal.subjectCode,
                        disqualified: studentMistakesModal.isDisqualified,
                        terminationReason: studentMistakesModal.terminationReason,
                        evidenceScreenshot: studentMistakesModal.evidenceScreenshot,
                        lastViolationSnapshot: studentMistakesModal.lastViolationSnapshot
                      }, matchedSess);
                    }}
                    className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-purple-600/30 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download size={14} />
                    <span>Download PDF Report</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStudentMistakesModal(null)}
                    className="px-5 py-2 bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        );
      })()}

        {/* Full Violation Evidence Photo Modal */}
        {selectedViolationEvidence && (
          <div 
            onClick={() => setSelectedViolationEvidence(null)}
            className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#14151f] border-2 border-red-500/60 rounded-3xl p-6 max-w-2xl w-full shadow-2xl space-y-5 text-left overflow-hidden"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-red-500/20 text-red-400 rounded-2xl border border-red-500/30 shrink-0">
                    <Camera size={24} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      Proctoring Violation Evidence Snapshot
                      <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-red-500/20 text-red-300 border border-red-500/40">
                        {selectedViolationEvidence.violationType || 'INTEGRITY_ALERT'}
                      </span>
                    </h3>
                    <p className="text-xs text-white/50">
                      Captured during exam for <span className="font-bold text-white">{selectedViolationEvidence.studentName}</span> ({selectedViolationEvidence.studentId})
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedViolationEvidence(null)}
                  className="p-2 text-white/40 hover:text-white rounded-xl bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              {/* High Resolution Image Container */}
              <div className="relative rounded-2xl overflow-hidden border-2 border-red-500/50 bg-black shadow-inner">
                <img 
                  src={selectedViolationEvidence.image} 
                  alt="Student Mistake Photo" 
                  className="w-full max-h-[480px] object-contain mx-auto"
                  referrerPolicy="no-referrer"
                />
              </div>

              {/* Context metadata badge bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-[10px] font-bold text-white/40 uppercase">Subject Paper</p>
                  <p className="text-xs font-bold text-white truncate">{selectedViolationEvidence.subjectName}</p>
                  <p className="text-[10px] font-mono text-indigo-300">{selectedViolationEvidence.subjectCode}</p>
                </div>

                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-[10px] font-bold text-white/40 uppercase">Student Roll No</p>
                  <p className="text-xs font-mono font-bold text-indigo-300">{selectedViolationEvidence.studentId}</p>
                </div>

                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-[10px] font-bold text-white/40 uppercase">Trust Score</p>
                  <p className={cn(
                    "text-xs font-black",
                    (selectedViolationEvidence.trustScore ?? 100) <= 30 ? "text-red-400" : "text-amber-400"
                  )}>
                    {selectedViolationEvidence.trustScore ?? 30}%
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-[10px] font-bold text-white/40 uppercase">Capture Timestamp</p>
                  <p className="text-xs font-mono text-white/70">
                    {selectedViolationEvidence.timestamp 
                      ? new Date(selectedViolationEvidence.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) 
                      : 'Live Captured'}
                  </p>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setSelectedViolationEvidence(null)}
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/30 cursor-pointer"
                >
                  Close Evidence Viewer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

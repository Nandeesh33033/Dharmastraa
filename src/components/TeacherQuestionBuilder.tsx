import React, { useState, useEffect } from 'react';
import { useExam } from '../ExamContext';
import { Question, QUESTIONS, Subject } from '../constants';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Trash2, 
  Save, 
  FileText, 
  CheckCircle2, 
  HelpCircle, 
  ListOrdered, 
  CheckSquare, 
  ToggleLeft, 
  PenTool, 
  RotateCcw,
  Sparkles,
  Layers,
  Award,
  BookOpen,
  Clock,
  X,
  Radio,
  Sliders,
  Check,
  KeyRound,
  Lock,
  Copy,
  Edit3,
  AlertCircle,
  Users,
  GraduationCap,
  Eye,
  FileCheck
} from 'lucide-react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { evaluateStudentSubmission } from '../utils/scoreCalculator';

export const TeacherQuestionBuilder: React.FC = () => {
  const { 
    subjects, 
    activeSubjectId, 
    setActiveSubjectId, 
    addSubject, 
    deleteSubject,
    clearAllSubjects,
    updateSubjectSettings,
    updateSubjectQuestions,
    isSuperAdmin,
    user
  } = useExam();

  // Filter subjects for the logged-in teacher (Super Admin sees all subjects)
  const accessibleSubjects = React.useMemo(() => {
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

  const selectedSubject = React.useMemo(() => {
    if (accessibleSubjects.length === 0) return null;
    return accessibleSubjects.find(s => s.id === activeSubjectId) || accessibleSubjects[0];
  }, [accessibleSubjects, activeSubjectId]);

  // Keep activeSubjectId in sync with accessible subjects
  useEffect(() => {
    if (accessibleSubjects.length > 0) {
      if (!activeSubjectId || !accessibleSubjects.some(s => s.id === activeSubjectId)) {
        setActiveSubjectId(accessibleSubjects[0].id);
      }
    }
  }, [accessibleSubjects]);

  const [editingQuestions, setEditingQuestions] = useState<Question[]>([]);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [showAddSubjectModal, setShowAddSubjectModal] = useState(false);
  const [showClearAllSubjectsModal, setShowClearAllSubjectsModal] = useState(false);
  const [newSubName, setNewSubName] = useState('');
  const [newSubCode, setNewSubCode] = useState('');
  const [newSubDesc, setNewSubDesc] = useState('');
  const [newSubDuration, setNewSubDuration] = useState('30');
  const [newSubPassword, setNewSubPassword] = useState('EXAM123');

  // Edit Existing Subject Settings Modal state
  const [showEditSubjectModal, setShowEditSubjectModal] = useState(false);
  const [editSubName, setEditSubName] = useState('');
  const [editSubCode, setEditSubCode] = useState('');
  const [editSubDesc, setEditSubDesc] = useState('');
  const [editSubDuration, setEditSubDuration] = useState('30');
  const [editSubPassword, setEditSubPassword] = useState('');
  const [copiedPass, setCopiedPass] = useState(false);

  const [subjectToDelete, setSubjectToDelete] = useState<{ id: string; name: string; code: string } | null>(null);
  const [showClearAllQuestionsModal, setShowClearAllQuestionsModal] = useState(false);
  const [notification, setNotification] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'submissions'), orderBy('submittedAt', 'desc'), limit(100));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSubmissions(data);
    }, (err) => {
      console.warn('Could not load submissions in question builder:', err);
    });
    return () => unsubscribe();
  }, []);

  const showToast = (message: string, type: 'error' | 'success' = 'error') => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleClearAllQuestions = async () => {
    const defaultStarter: Question = {
      id: `q_${Date.now()}_1`,
      text: 'Enter your new question prompt...',
      type: 'mcq',
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      correctAnswer: 0,
      points: 10
    };
    setEditingQuestions([defaultStarter]);
    if (activeSubjectId) {
      await updateSubjectQuestions(activeSubjectId, [defaultStarter]);
    }
    setShowClearAllQuestionsModal(false);
    showToast('Question paper cleared and reset to fresh starter question.', 'success');
  };

  // Keep local editing state synced with active selected subject
  useEffect(() => {
    if (selectedSubject && selectedSubject.questions) {
      setEditingQuestions(selectedSubject.questions);
    } else if (accessibleSubjects.length > 0) {
      setEditingQuestions(accessibleSubjects[0].questions || QUESTIONS);
    } else {
      setEditingQuestions([]);
    }
  }, [selectedSubject, activeSubjectId, accessibleSubjects.length]);

  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubName.trim() || !newSubCode.trim()) {
      showToast('Please provide a valid Subject Name and Subject Code.');
      return;
    }

    const duration = parseInt(newSubDuration) || 30;
    const password = newSubPassword.trim() || 'EXAM123';
    const creatorId = user?.teacherId || user?.id;
    const creatorName = user?.name || 'Instructor';

    await addSubject(
      newSubName.trim(), 
      newSubCode.trim().toUpperCase(), 
      newSubDesc.trim(), 
      duration,
      password,
      creatorId,
      creatorName
    );
    
    setNewSubName('');
    setNewSubCode('');
    setNewSubDesc('');
    setNewSubDuration('30');
    setNewSubPassword('EXAM123');
    setShowAddSubjectModal(false);
    showToast(`Created subject "${newSubName.trim()}" successfully!`, 'success');
  };

  const handleOpenEditSubjectModal = () => {
    if (!selectedSubject) return;
    setEditSubName(selectedSubject.name);
    setEditSubCode(selectedSubject.code);
    setEditSubDesc(selectedSubject.description || '');
    setEditSubDuration(String(selectedSubject.durationMinutes || 30));
    setEditSubPassword(selectedSubject.examPassword || 'EXAM123');
    setShowEditSubjectModal(true);
  };

  const handleSaveSubjectSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubject) return;
    if (!editSubName.trim() || !editSubCode.trim()) {
      showToast('Please provide a valid Subject Name and Subject Code.');
      return;
    }

    const duration = parseInt(editSubDuration) || 30;
    const password = editSubPassword.trim() || 'EXAM123';
    
    await updateSubjectSettings(selectedSubject.id, {
      name: editSubName.trim(),
      code: editSubCode.trim().toUpperCase(),
      description: editSubDesc.trim(),
      durationMinutes: duration,
      examPassword: password
    });

    setShowEditSubjectModal(false);
    showToast(`Updated settings for "${editSubName.trim()}"`, 'success');
  };

  const handleConfirmDeleteSubject = async () => {
    if (!subjectToDelete) return;
    const result = await deleteSubject(subjectToDelete.id);
    if (result && !result.success) {
      showToast(result.error || 'Cannot delete subject.');
    } else {
      showToast(`Subject "${subjectToDelete.name}" deleted.`, 'success');
    }
    setSubjectToDelete(null);
  };

  const handleConfirmClearAllSubjects = async () => {
    await clearAllSubjects();
    setShowClearAllSubjectsModal(false);
    showToast('All exam subjects have been deleted.', 'success');
  };

  const handleAddQuestion = (type: 'mcq' | 'multiple_select' | 'true_false' | 'short_answer' = 'mcq') => {
    const newId = `q_${Date.now()}`;
    let newQ: Question;

    if (type === 'mcq') {
      newQ = {
        id: newId,
        text: 'Enter your multiple choice question prompt here...',
        type: 'mcq',
        options: ['Option A', 'Option B', 'Option C', 'Option D'],
        correctAnswer: 0,
        points: 10
      };
    } else if (type === 'multiple_select') {
      newQ = {
        id: newId,
        text: 'Enter your multiple select question here (students can pick multiple answers)...',
        type: 'multiple_select',
        options: ['Option A', 'Option B', 'Option C', 'Option D'],
        correctAnswer: [0, 1],
        points: 15
      };
    } else if (type === 'true_false') {
      newQ = {
        id: newId,
        text: 'Enter your True/False statement here...',
        type: 'true_false',
        options: ['True', 'False'],
        correctAnswer: 0, // 0 = True, 1 = False
        points: 5
      };
    } else {
      newQ = {
        id: newId,
        text: 'Enter your short answer question here...',
        type: 'short_answer',
        correctAnswer: 'Sample model answer or key grading terms...',
        points: 10
      };
    }

    setEditingQuestions(prev => [...prev, newQ]);
  };

  const handleRemoveQuestion = (id: string | number) => {
    if (editingQuestions.length <= 1) {
      showToast('The subject question paper must contain at least one question.');
      return;
    }
    setEditingQuestions(prev => prev.filter(q => q.id !== id));
  };

  const handleTypeChange = (id: string | number, newType: 'mcq' | 'multiple_select' | 'true_false' | 'short_answer') => {
    setEditingQuestions(prev => prev.map(q => {
      if (q.id !== id) return q;

      if (newType === 'mcq') {
        return {
          ...q,
          type: 'mcq',
          options: q.options && q.options.length > 0 ? q.options : ['Option A', 'Option B', 'Option C', 'Option D'],
          correctAnswer: 0
        };
      } else if (newType === 'multiple_select') {
        return {
          ...q,
          type: 'multiple_select',
          options: q.options && q.options.length > 0 ? q.options : ['Option A', 'Option B', 'Option C', 'Option D'],
          correctAnswer: [0]
        };
      } else if (newType === 'true_false') {
        return {
          ...q,
          type: 'true_false',
          options: ['True', 'False'],
          correctAnswer: 0
        };
      } else {
        return {
          ...q,
          type: 'short_answer',
          options: undefined,
          correctAnswer: 'Expected key concepts or answer summary'
        };
      }
    }));
  };

  const handleTextChange = (id: string | number, text: string) => {
    setEditingQuestions(prev => prev.map(q => q.id === id ? { ...q, text } : q));
  };

  const handlePointsChange = (id: string | number, points: number) => {
    setEditingQuestions(prev => prev.map(q => q.id === id ? { ...q, points: Math.max(1, points) } : q));
  };

  const handleOptionTextChange = (qId: string | number, optIdx: number, newText: string) => {
    setEditingQuestions(prev => prev.map(q => {
      if (q.id !== qId || !q.options) return q;
      const updatedOpts = [...q.options];
      updatedOpts[optIdx] = newText;
      return { ...q, options: updatedOpts };
    }));
  };

  const handleAddOption = (qId: string | number) => {
    setEditingQuestions(prev => prev.map(q => {
      if (q.id !== qId) return q;
      const existingOpts = q.options || [];
      const newOptName = `Option ${String.fromCharCode(65 + existingOpts.length)}`;
      return { ...q, options: [...existingOpts, newOptName] };
    }));
  };

  const handleRemoveOption = (qId: string | number, optIdx: number) => {
    setEditingQuestions(prev => prev.map(q => {
      if (q.id !== qId || !q.options) return q;
      if (q.options.length <= 2) {
        showToast('Multiple choice questions must have at least 2 options.');
        return q;
      }
      const updatedOpts = q.options.filter((_, idx) => idx !== optIdx);
      
      let newCorrect = q.correctAnswer;
      if (q.type === 'mcq') {
        if (typeof q.correctAnswer === 'number') {
          if (q.correctAnswer === optIdx) newCorrect = 0;
          else if (q.correctAnswer > optIdx) newCorrect = q.correctAnswer - 1;
        }
      } else if (q.type === 'multiple_select' && Array.isArray(q.correctAnswer)) {
        newCorrect = q.correctAnswer
          .filter(idx => idx !== optIdx)
          .map(idx => idx > optIdx ? idx - 1 : idx);
        if (newCorrect.length === 0) newCorrect = [0];
      }

      return { ...q, options: updatedOpts, correctAnswer: newCorrect };
    }));
  };

  const handleSelectCorrectMCQ = (qId: string | number, optIdx: number) => {
    setEditingQuestions(prev => prev.map(q => q.id === qId ? { ...q, correctAnswer: optIdx } : q));
  };

  const handleToggleCorrectMultipleSelect = (qId: string | number, optIdx: number) => {
    setEditingQuestions(prev => prev.map(q => {
      if (q.id !== qId) return q;
      const current = Array.isArray(q.correctAnswer) ? q.correctAnswer : [];
      let updated: number[];
      if (current.includes(optIdx)) {
        if (current.length === 1) return q;
        updated = current.filter(i => i !== optIdx);
      } else {
        updated = [...current, optIdx];
      }
      return { ...q, correctAnswer: updated };
    }));
  };

  const handleShortAnswerCorrectChange = (qId: string | number, answerText: string) => {
    setEditingQuestions(prev => prev.map(q => q.id === qId ? { ...q, correctAnswer: answerText } : q));
  };

  const handleSaveAndPublish = async () => {
    if (!activeSubjectId) return;
    setSaveStatus('saving');
    try {
      await updateSubjectQuestions(activeSubjectId, editingQuestions);
      setSaveStatus('saved');
      showToast('Question paper published successfully!', 'success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      showToast('Failed to save question paper. Please try again.');
      setSaveStatus('idle');
    }
  };

  const totalPoints = editingQuestions.reduce((sum, q) => sum + (q.points || 10), 0);

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* Subject Management Header Card */}
      <div className="p-8 rounded-3xl bg-gradient-to-r from-indigo-900/60 via-purple-900/40 to-slate-900/80 border border-indigo-500/30 backdrop-blur-xl shadow-2xl space-y-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-600/30 text-indigo-400 rounded-2xl border border-indigo-500/40">
                <BookOpen size={28} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight">Teacher Subject & Exam Paper Builder</h2>
                <p className="text-xs text-indigo-200/70 font-medium">Create subjects, customize question types, options, and answer keys.</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {isSuperAdmin && accessibleSubjects.length > 0 && (
              <button
                type="button"
                onClick={() => setShowClearAllSubjectsModal(true)}
                className="px-4 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 border border-red-500/20"
                title="Delete all subjects at once"
              >
                <Trash2 size={16} /> Delete All Subjects
              </button>
            )}
            <button
              onClick={() => setShowAddSubjectModal(true)}
              className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2 border border-indigo-400/30"
            >
              <Plus size={18} /> Create New Subject
            </button>
          </div>
        </div>

        {/* Subjects Selector Cards Grid */}
        <div className="space-y-3">
          <label className="text-xs font-bold text-white/50 uppercase tracking-wider flex items-center gap-2">
            <Sliders size={14} className="text-indigo-400" /> Select Active Exam Subject:
          </label>
          
          {accessibleSubjects.length === 0 ? (
            <div className="p-8 rounded-2xl bg-white/5 border border-dashed border-white/20 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center mx-auto">
                <BookOpen size={24} />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-bold text-white">No Exam Subjects Available</h4>
                <p className="text-xs text-white/50 max-w-md mx-auto">
                  {isSuperAdmin 
                    ? "All exam subjects have been deleted. Click below to create a new subject paper and start building questions."
                    : `You have not created any exam subjects under your teacher account (${user?.id}) yet. Click below to create your first exam paper.`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddSubjectModal(true)}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all inline-flex items-center gap-2"
              >
                <Plus size={16} /> Create New Subject Now
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {accessibleSubjects.map((s) => {
                const isActive = s.id === activeSubjectId;
                const qCount = s.questions?.length || 0;
                const pointsSum = (s.questions || []).reduce((acc, curr) => acc + (curr.points || 10), 0);

                return (
                  <div
                    key={s.id}
                    onClick={() => setActiveSubjectId(s.id)}
                    className={`p-5 rounded-2xl border transition-all cursor-pointer relative flex flex-col justify-between gap-3 ${
                      isActive 
                        ? 'bg-indigo-600/25 border-indigo-500 text-white shadow-xl shadow-indigo-600/10 ring-2 ring-indigo-500/40' 
                        : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                          isActive ? 'bg-indigo-500 text-white' : 'bg-white/10 text-white/60'
                        }`}>
                          {s.code}
                        </span>
                        
                        <div className="flex items-center gap-2">
                          {isActive && (
                            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <Check size={12} /> Selected
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSubjectToDelete({ id: s.id, name: s.name, code: s.code });
                            }}
                            title="Delete Subject"
                            className="p-1.5 text-white/40 hover:text-red-400 hover:bg-red-500/20 rounded-lg transition-all"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      <h3 className="font-bold text-base text-white leading-snug">{s.name}</h3>
                      {s.description && (
                        <p className="text-xs text-white/60 line-clamp-2">{s.description}</p>
                      )}

                      {/* Test Password indicator */}
                      <div className="inline-flex items-center gap-1.5 text-[11px] font-mono font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg mt-1">
                        <Lock size={12} className="text-amber-400" />
                        <span>Passcode: <strong>{s.examPassword || 'EXAM123'}</strong></span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs font-semibold text-white/50">
                      <span className="flex items-center gap-1 text-indigo-300">
                        <Layers size={13} /> {qCount} Qs
                      </span>
                      <span className="flex items-center gap-1 text-emerald-400">
                        <Award size={13} /> {pointsSum} Pts
                      </span>
                      <span className="flex items-center gap-1 text-purple-300 font-bold">
                        <Users size={13} /> {submissions.filter(sub => sub.subjectId === s.id || sub.subjectCode === s.code || sub.subjectName === s.name).length} Attended
                      </span>
                      <span className="flex items-center gap-1 text-amber-300">
                        <Clock size={13} /> {s.durationMinutes || 30}m
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Selected Subject Details & Actions Toolbar */}
      {selectedSubject ? (
        <>
          <div className="p-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-bold uppercase tracking-wider">
                Editing: {selectedSubject.code}
              </span>
              <h3 className="text-xl font-bold text-white">{selectedSubject.name}</h3>
            </div>
            <p className="text-xs text-white/50">
              Customize questions, option choices, point weightage, and answer keys for this subject.
            </p>

            {/* Test Password Badge & Edit Trigger */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-mono font-bold">
                <KeyRound size={14} className="text-amber-400" />
                <span>Test Password: <strong className="text-white bg-black/40 px-2 py-0.5 rounded border border-amber-500/30">{selectedSubject.examPassword || 'EXAM123'}</strong></span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(selectedSubject.examPassword || 'EXAM123');
                    setCopiedPass(true);
                    setTimeout(() => setCopiedPass(false), 2000);
                  }}
                  className="p-1 hover:bg-amber-500/20 rounded text-amber-300 hover:text-white transition-colors"
                  title="Copy Test Password"
                >
                  {copiedPass ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                </button>
              </div>

              <button
                type="button"
                onClick={handleOpenEditSubjectModal}
                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
              >
                <Sliders size={13} className="text-indigo-400" /> Edit Test Passcode & Details
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto shrink-0">
            <button
              onClick={handleSaveAndPublish}
              disabled={saveStatus === 'saving'}
              className="flex-1 md:flex-none px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-xs font-bold shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 border border-emerald-400/30"
            >
              {saveStatus === 'saving' ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving Subject...
                </>
              ) : saveStatus === 'saved' ? (
                <>
                  <CheckCircle2 size={18} className="text-white" />
                  Saved & Published!
                </>
              ) : (
                <>
                  <Save size={18} />
                  Save Questions for {selectedSubject.code}
                </>
              )}
            </button>
          </div>
        </div>

      {/* Add New Question Formats Toolbar */}
      <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex flex-wrap items-center justify-between gap-4">
        <span className="text-xs font-bold text-white/60 uppercase tracking-wider flex items-center gap-2">
          <Plus size={16} className="text-indigo-400" /> Add Question to {selectedSubject?.code || 'Subject'}:
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleAddQuestion('mcq')}
            className="px-3.5 py-2 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-200 text-xs font-bold rounded-xl border border-indigo-500/30 transition-all flex items-center gap-1.5"
          >
            <ListOrdered size={14} /> + Single Choice (MCQ)
          </button>
          <button
            onClick={() => handleAddQuestion('multiple_select')}
            className="px-3.5 py-2 bg-violet-600/20 hover:bg-violet-600/40 text-violet-200 text-xs font-bold rounded-xl border border-violet-500/30 transition-all flex items-center gap-1.5"
          >
            <CheckSquare size={14} /> + Multiple Select
          </button>
          <button
            onClick={() => handleAddQuestion('true_false')}
            className="px-3.5 py-2 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-200 text-xs font-bold rounded-xl border border-emerald-500/30 transition-all flex items-center gap-1.5"
          >
            <ToggleLeft size={14} /> + True / False
          </button>
          <button
            onClick={() => handleAddQuestion('short_answer')}
            className="px-3.5 py-2 bg-amber-600/20 hover:bg-amber-600/40 text-amber-200 text-xs font-bold rounded-xl border border-amber-500/30 transition-all flex items-center gap-1.5"
          >
            <PenTool size={14} /> + Short Answer
          </button>
          {editingQuestions.length > 1 && (
            <button
              onClick={() => setShowClearAllQuestionsModal(true)}
              className="px-3.5 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold rounded-xl border border-red-500/20 transition-all flex items-center gap-1.5 ml-2"
              title="Delete all questions in this subject paper"
            >
              <Trash2 size={14} /> Clear All Questions ({editingQuestions.length})
            </button>
          )}
        </div>
      </div>

      {/* Questions List */}
      <div className="space-y-6">
        <AnimatePresence>
          {editingQuestions.map((q, qIdx) => (
            <motion.div
              key={q.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="p-6 md:p-8 rounded-3xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-xl space-y-6 relative group"
            >
              {/* Question Card Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-xl bg-indigo-600 text-white font-bold text-sm flex items-center justify-center shrink-0">
                    Q{qIdx + 1}
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-white">Question #{qIdx + 1}</h3>
                    <p className="text-[10px] text-white/40 uppercase tracking-widest">
                      Type: {(q.type || 'mcq').replace('_', ' ')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                  {/* Question Type Selection */}
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Type:</label>
                    <select
                      value={q.type || 'mcq'}
                      onChange={(e) => handleTypeChange(q.id, e.target.value as any)}
                      className="bg-black/60 text-white text-xs font-bold px-3 py-1.5 rounded-xl border border-white/15 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="mcq">Single Choice (MCQ)</option>
                      <option value="multiple_select">Multiple Select (Checkboxes)</option>
                      <option value="true_false">True / False</option>
                      <option value="short_answer">Short Answer / Essay</option>
                    </select>
                  </div>

                  {/* Points Input */}
                  <div className="flex items-center gap-1.5">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Points:</label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={q.points || 10}
                      onChange={(e) => handlePointsChange(q.id, parseInt(e.target.value) || 1)}
                      className="w-16 bg-black/60 text-emerald-400 font-bold text-xs text-center py-1.5 rounded-xl border border-white/15 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* Delete Question Button */}
                  <button
                    onClick={() => handleRemoveQuestion(q.id)}
                    title="Delete Question"
                    className="p-2 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              {/* Question Text Prompt */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-white/60 uppercase tracking-wider flex items-center gap-2">
                  <HelpCircle size={14} className="text-indigo-400" /> Question Prompt / Statement
                </label>
                <textarea
                  rows={2}
                  value={q.text}
                  onChange={(e) => handleTextChange(q.id, e.target.value)}
                  placeholder="Enter the question text here..."
                  className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all leading-relaxed"
                />
              </div>

              {/* MCQ & Multiple Select Options Section */}
              {(q.type === 'mcq' || q.type === 'multiple_select' || !q.type) && (
                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-white/60 uppercase tracking-wider flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-emerald-400" /> Options ({q.options?.length || 0}) & Answer Key:
                    </label>
                    <span className="text-[10px] text-indigo-300/80 font-medium italic">
                      {q.type === 'multiple_select' 
                        ? '👉 Click option button to toggle as correct key' 
                        : '👉 Click option button to select as single correct key'}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {q.options?.map((opt, optIdx) => {
                      const isCorrect = q.type === 'multiple_select'
                        ? Array.isArray(q.correctAnswer) && q.correctAnswer.includes(optIdx)
                        : q.correctAnswer === optIdx;

                      return (
                        <div key={optIdx} className="flex items-center gap-3">
                          {/* Option Button Selector */}
                          <button
                            type="button"
                            onClick={() => {
                              if (q.type === 'multiple_select') {
                                handleToggleCorrectMultipleSelect(q.id, optIdx);
                              } else {
                                handleSelectCorrectMCQ(q.id, optIdx);
                              }
                            }}
                            className={`w-9 h-9 rounded-xl font-bold text-xs flex items-center justify-center shrink-0 transition-all border ${
                              isCorrect 
                                ? 'bg-emerald-500 text-white border-emerald-400 shadow-md shadow-emerald-500/30' 
                                : 'bg-white/5 text-white/40 border-white/10 hover:border-white/30'
                            }`}
                            title={isCorrect ? 'Correct Answer' : 'Mark as Correct'}
                          >
                            {isCorrect ? '✓' : String.fromCharCode(65 + optIdx)}
                          </button>

                          {/* Option Text Input */}
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) => handleOptionTextChange(q.id, optIdx, e.target.value)}
                            placeholder={`Option ${String.fromCharCode(65 + optIdx)}`}
                            className={`flex-1 bg-black/40 border rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all ${
                              isCorrect ? 'border-emerald-500/50 bg-emerald-950/20 font-semibold' : 'border-white/10'
                            }`}
                          />

                          {/* Delete Option Button */}
                          <button
                            type="button"
                            onClick={() => handleRemoveOption(q.id, optIdx)}
                            className="p-2.5 text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all shrink-0"
                            title="Remove Option"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Add Option Button */}
                  <button
                    type="button"
                    onClick={() => handleAddOption(q.id)}
                    className="mt-2 text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 transition-all"
                  >
                    <Plus size={14} /> + Add Option Choice
                  </button>
                </div>
              )}

              {/* True / False Section */}
              {q.type === 'true_false' && (
                <div className="space-y-3 pt-2">
                  <label className="text-xs font-bold text-white/60 uppercase tracking-wider flex items-center gap-2">
                    <ToggleLeft size={14} className="text-emerald-400" /> Correct Statement Answer:
                  </label>
                  <div className="flex gap-4">
                    {['True', 'False'].map((label, idx) => {
                      const isCorrect = q.correctAnswer === idx;
                      return (
                        <button
                          key={label}
                          type="button"
                          onClick={() => handleSelectCorrectMCQ(q.id, idx)}
                          className={`flex-1 py-4 rounded-2xl text-sm font-bold border transition-all flex items-center justify-center gap-2 ${
                            isCorrect 
                              ? 'bg-emerald-600 text-white border-emerald-400 shadow-lg shadow-emerald-500/20' 
                              : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'
                          }`}
                        >
                          <CheckCircle2 size={18} className={isCorrect ? 'text-white' : 'opacity-0'} />
                          {label} {isCorrect && '(Correct Key)'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Short Answer Section */}
              {q.type === 'short_answer' && (
                <div className="space-y-3 pt-2">
                  <label className="text-xs font-bold text-white/60 uppercase tracking-wider flex items-center gap-2">
                    <PenTool size={14} className="text-amber-400" /> Expected Model Answer / Evaluation Criteria:
                  </label>
                  <textarea
                    rows={2}
                    value={typeof q.correctAnswer === 'string' ? q.correctAnswer : ''}
                    onChange={(e) => handleShortAnswerCorrectChange(q.id, e.target.value)}
                    placeholder="Enter key concepts or model answer for teacher grading..."
                    className="w-full bg-black/40 border border-amber-500/30 rounded-2xl p-4 text-amber-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all"
                  />
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Floating Bottom Bar */}
      <div className="sticky bottom-8 z-30 p-4 rounded-2xl bg-black/80 backdrop-blur-2xl border border-white/15 shadow-2xl flex items-center justify-between gap-4">
        <div className="text-xs text-white/60 font-medium">
          Subject <span className="text-white font-bold">{selectedSubject?.code}</span> has{' '}
          <span className="text-indigo-400 font-bold">{editingQuestions.length} questions</span> ({totalPoints} Total Points)
        </div>
        <button
          onClick={handleSaveAndPublish}
          disabled={saveStatus === 'saving'}
          className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-indigo-600/40 transition-all flex items-center gap-2"
        >
          {saveStatus === 'saving' ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save size={16} /> Save & Publish Subject Questions
            </>
          )}
        </button>
      </div>
      </>
      ) : (
        <div className="p-12 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-white/40">
            <Layers size={28} />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-white">No Exam Subject Selected</h3>
            <p className="text-xs text-white/50 max-w-sm mx-auto">
              Create an exam subject paper using the button above to start configuring questions, answer keys, and test passcodes.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddSubjectModal(true)}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all inline-flex items-center gap-2"
          >
            <Plus size={16} /> Create New Subject
          </button>
        </div>
      )}

      {/* Create Subject Modal */}
      <AnimatePresence>
        {showAddSubjectModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-full max-w-lg bg-slate-900 border border-indigo-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-600/30 text-indigo-400 rounded-xl border border-indigo-500/40">
                    <BookOpen size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Create New Subject</h3>
                    <p className="text-xs text-white/50">Add a subject option to the teacher dashboard</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAddSubjectModal(false)}
                  className="p-2 text-white/40 hover:text-white rounded-xl hover:bg-white/10 transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleCreateSubject} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-white/70 uppercase tracking-wider">Subject Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Data Structures & Algorithms"
                    value={newSubName}
                    onChange={(e) => setNewSubName(e.target.value)}
                    className="w-full bg-black/50 border border-white/15 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-white/70 uppercase tracking-wider">Subject Code</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. CS201"
                      value={newSubCode}
                      onChange={(e) => setNewSubCode(e.target.value)}
                      className="w-full bg-black/50 border border-white/15 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-white/70 uppercase tracking-wider">Exam Duration (Mins)</label>
                    <input
                      type="number"
                      required
                      min="5"
                      max="180"
                      value={newSubDuration}
                      onChange={(e) => setNewSubDuration(e.target.value)}
                      className="w-full bg-black/50 border border-white/15 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    />
                  </div>
                </div>

                {/* Test Access Password Field */}
                <div className="space-y-1.5 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                      <KeyRound size={14} /> Test Access Password (Exam Passcode) *
                    </label>
                    <span className="text-[10px] text-amber-400 font-mono font-bold">Mandatory for Students</span>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-amber-400" size={16} />
                    <input
                      type="text"
                      required
                      placeholder="e.g. CS101PASS or EXAM2026"
                      value={newSubPassword}
                      onChange={(e) => setNewSubPassword(e.target.value)}
                      className="w-full bg-black/60 border border-amber-500/40 rounded-xl pl-10 pr-4 py-3 text-sm text-white font-mono placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
                    />
                  </div>
                  <p className="text-[11px] text-amber-200/70">
                    Students must enter this exact password in the student portal before beginning the test.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-white/70 uppercase tracking-wider">Description (Optional)</label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Midterm proctored examination covering arrays, linked lists, and trees..."
                    value={newSubDesc}
                    onChange={(e) => setNewSubDesc(e.target.value)}
                    className="w-full bg-black/50 border border-white/15 rounded-xl p-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>

                <div className="pt-4 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAddSubjectModal(false)}
                    className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white/70 rounded-xl text-xs font-bold transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all"
                  >
                    Create Subject & Passcode
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Subject Settings & Passcode Modal */}
      <AnimatePresence>
        {showEditSubjectModal && selectedSubject && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-full max-w-lg bg-slate-900 border border-indigo-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-amber-500/20 text-amber-300 rounded-xl border border-amber-500/40">
                    <KeyRound size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Edit Subject & Test Passcode</h3>
                    <p className="text-xs text-white/50">Update passcode, duration, and test settings</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowEditSubjectModal(false)}
                  className="p-2 text-white/40 hover:text-white rounded-xl hover:bg-white/10 transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSaveSubjectSettings} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-white/70 uppercase tracking-wider">Subject Name</label>
                  <input
                    type="text"
                    required
                    value={editSubName}
                    onChange={(e) => setEditSubName(e.target.value)}
                    className="w-full bg-black/50 border border-white/15 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-white/70 uppercase tracking-wider">Subject Code</label>
                    <input
                      type="text"
                      required
                      value={editSubCode}
                      onChange={(e) => setEditSubCode(e.target.value)}
                      className="w-full bg-black/50 border border-white/15 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-white/70 uppercase tracking-wider">Duration (Mins)</label>
                    <input
                      type="number"
                      required
                      min="5"
                      max="180"
                      value={editSubDuration}
                      onChange={(e) => setEditSubDuration(e.target.value)}
                      className="w-full bg-black/50 border border-white/15 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    />
                  </div>
                </div>

                {/* Test Passcode Field */}
                <div className="space-y-1.5 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                      <KeyRound size={14} /> Test Access Password (Exam Passcode) *
                    </label>
                    <span className="text-[10px] text-amber-400 font-mono font-bold">Mandatory for Students</span>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-amber-400" size={16} />
                    <input
                      type="text"
                      required
                      placeholder="e.g. CS101PASS"
                      value={editSubPassword}
                      onChange={(e) => setEditSubPassword(e.target.value)}
                      className="w-full bg-black/60 border border-amber-500/40 rounded-xl pl-10 pr-4 py-3 text-sm text-white font-mono placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
                    />
                  </div>
                  <p className="text-[11px] text-amber-200/70">
                    Share this passcode with students who are authorized to unlock and take this exam.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-white/70 uppercase tracking-wider">Description (Optional)</label>
                  <textarea
                    rows={2}
                    value={editSubDesc}
                    onChange={(e) => setEditSubDesc(e.target.value)}
                    className="w-full bg-black/50 border border-white/15 rounded-xl p-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>

                <div className="pt-4 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowEditSubjectModal(false)}
                    className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white/70 rounded-xl text-xs font-bold transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/30 transition-all flex items-center gap-1.5"
                  >
                    <Save size={16} /> Save Changes & Passcode
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* Delete Subject Confirmation Modal */}
        {subjectToDelete && (
          <div 
            onClick={() => setSubjectToDelete(null)}
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
                  <h3 className="text-lg font-bold text-white">Delete Subject Paper?</h3>
                  <p className="text-xs text-white/50">This action cannot be undone.</p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-red-950/30 border border-red-500/20 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/60">Subject Name:</span>
                  <span className="font-bold text-white">{subjectToDelete.name}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/60">Course Code:</span>
                  <span className="font-mono font-bold text-indigo-300">{subjectToDelete.code}</span>
                </div>
              </div>

              <p className="text-xs text-white/60 leading-relaxed">
                All questions, answer keys, time duration configurations, and passcodes for this subject will be permanently deleted from the active curriculum.
              </p>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSubjectToDelete(null)}
                  className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white/70 rounded-xl text-xs font-bold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteSubject}
                  className="px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-red-600/30 transition-all flex items-center gap-2"
                >
                  <Trash2 size={15} /> Yes, Delete Subject
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Clear All Questions in Subject Modal */}
        {showClearAllQuestionsModal && (
          <div 
            onClick={() => setShowClearAllQuestionsModal(false)}
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
                  <h3 className="text-lg font-bold text-white">Clear All Questions?</h3>
                  <p className="text-xs text-white/50">Subject: {selectedSubject?.name || 'Active Subject'}</p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-red-950/30 border border-red-500/20 space-y-2 text-xs">
                <p className="text-white/80 leading-relaxed font-medium">
                  Warning: All {editingQuestions.length} questions, answer options, and marking schemes in this subject paper will be cleared and reset to a fresh single starter question.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowClearAllQuestionsModal(false)}
                  className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white/70 rounded-xl text-xs font-bold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleClearAllQuestions}
                  className="px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-red-600/30 transition-all flex items-center gap-2"
                >
                  <Trash2 size={15} /> Yes, Clear All Questions
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Clear All Subjects Modal */}
        {showClearAllSubjectsModal && (
          <div 
            onClick={() => setShowClearAllSubjectsModal(false)}
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
                  <h3 className="text-lg font-bold text-white">Delete All Subjects?</h3>
                  <p className="text-xs text-white/50">{subjects.length} subject papers will be removed</p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-red-950/30 border border-red-500/20 space-y-2 text-xs">
                <p className="text-white/80 leading-relaxed font-medium">
                  Warning: All {subjects.length} subject exam papers, questions, answer keys, duration timers, and test passcodes will be deleted at once. You can create brand new subjects at any time.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowClearAllSubjectsModal(false)}
                  className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white/70 rounded-xl text-xs font-bold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmClearAllSubjects}
                  className="px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-red-600/30 transition-all flex items-center gap-2"
                >
                  <Trash2 size={15} /> Yes, Delete All Subjects
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Floating Toast Notification */}
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border text-xs font-bold backdrop-blur-xl ${
              notification.type === 'error'
                ? 'bg-red-950/90 text-red-200 border-red-500/40'
                : 'bg-emerald-950/90 text-emerald-200 border-emerald-500/40'
            }`}
          >
            {notification.type === 'error' ? <AlertCircle size={16} className="text-red-400 shrink-0" /> : <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />}
            <span>{notification.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

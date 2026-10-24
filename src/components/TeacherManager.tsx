import React, { useState } from 'react';
import { useExam } from '../ExamContext';
import { TeacherAccount } from '../constants';
import { motion, AnimatePresence } from 'motion/react';
import { 
  UserPlus, 
  Users, 
  KeyRound, 
  Trash2, 
  Eye, 
  EyeOff, 
  Copy, 
  Check, 
  ShieldCheck, 
  Building, 
  Search,
  Mail,
  AlertCircle,
  Info
} from 'lucide-react';

export const TeacherManager: React.FC = () => {
  const { teachers, addTeacher, deleteTeacher, clearAllTeachers, user, isSuperAdmin } = useExam();

  const [teacherId, setTeacherId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [department, setDepartment] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  
  // Track visible passwords by ID
  const [showPasswordMap, setShowPasswordMap] = useState<Record<string, boolean>>({});
  // Track copied status
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [teacherToDelete, setTeacherToDelete] = useState<{ id: string; name: string; teacherId: string } | null>(null);
  const [showClearAllModal, setShowClearAllModal] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);

  if (!isSuperAdmin) {
    return (
      <div className="p-8 rounded-3xl bg-red-950/20 border border-red-500/30 text-center space-y-4 max-w-xl mx-auto my-12">
        <div className="w-12 h-12 bg-red-500/20 text-red-400 rounded-2xl flex items-center justify-center mx-auto">
          <AlertCircle size={28} />
        </div>
        <h3 className="text-lg font-bold text-white">Access Restricted</h3>
        <p className="text-xs text-white/60 leading-relaxed">
          Teacher account creation is restricted to the Super Administrator. Please log in with the authorized Admin Teacher ID (<code className="text-amber-300 font-bold">MAINADMIN</code>) or authorized email (<code className="text-amber-300 font-bold">mygamesprabhu@gmail.com</code>).
        </p>
      </div>
    );
  }

  const togglePasswordVisibility = (id: string) => {
    setShowPasswordMap(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopyCredentials = (teacher: TeacherAccount) => {
    const textToCopy = `Teacher Account Credentials:
Name: ${teacher.name}
Teacher ID: ${teacher.teacherId}
Authorized Email: ${teacher.email || 'None'}
Password: ${teacher.password}
Department: ${teacher.department || 'General'}`;

    navigator.clipboard.writeText(textToCopy);
    setCopiedId(teacher.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleCreateTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!teacherId.trim() || !name.trim() || !password.trim() || !email.trim()) {
      setFormError('Please fill in all required fields (Teacher ID, Name, Email, and Password).');
      return;
    }

    setIsAdding(true);
    try {
      const res = await addTeacher(teacherId, name, password, department, email);
      if (res && !res.success) {
        setFormError(res.error || 'Failed to create teacher.');
      } else {
        setFormSuccess(`Teacher account "${name}" created successfully with authorized email ${email}.`);
        setTeacherId('');
        setName('');
        setEmail('');
        setPassword('');
        setDepartment('');
        setTimeout(() => setFormSuccess(null), 5000);
      }
    } catch (err: any) {
      console.error('Failed to add teacher account:', err);
      setFormError(err?.message || 'Error occurred while saving teacher account.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleConfirmDeleteTeacher = async () => {
    if (!teacherToDelete) return;
    if (teacherToDelete.teacherId.toUpperCase() === 'MAINADMIN') {
      setTeacherToDelete(null);
      return;
    }
    await deleteTeacher(teacherToDelete.id);
    setTeacherToDelete(null);
  };

  const handleConfirmClearAllTeachers = async () => {
    try {
      setIsClearingAll(true);
      await clearAllTeachers();
      setShowClearAllModal(false);
    } catch (err) {
      console.error('Failed to clear teachers:', err);
    } finally {
      setIsClearingAll(false);
    }
  };

  const filteredTeachers = teachers.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.teacherId.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (t.email && t.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (t.department && t.department.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* Top Banner Header */}
      <div className="p-8 rounded-3xl bg-gradient-to-r from-indigo-900/60 via-purple-900/40 to-slate-900/80 border border-indigo-500/30 backdrop-blur-xl shadow-2xl space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-600/30 text-indigo-400 rounded-2xl border border-indigo-500/40">
                <Users size={28} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight">Teacher & Evaluator Management Portal</h2>
                <p className="text-xs text-indigo-200/70 font-medium">Create credentials & authorized Google emails for teachers to log in and manage exams.</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400 text-xs font-semibold">
            <ShieldCheck size={16} /> Main Admin Authorized
          </div>
        </div>

        {/* Info Box */}
        <div className="p-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/20 text-indigo-200/90 text-xs flex items-start gap-3">
          <Info size={18} className="text-indigo-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Teachers can log in using either their <strong className="text-white">Teacher ID & Password</strong> or by clicking <strong className="text-white">"Sign in with Google"</strong> using their registered email. Only emails explicitly authorized in this directory will be granted access; unregistered emails will be blocked.
          </p>
        </div>
      </div>

      {/* Main Grid: Form + Directory */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Create Teacher Form */}
        <div className="lg:col-span-5">
          <div className="p-6 md:p-8 rounded-3xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-xl space-y-6 sticky top-28">
            <div className="flex items-center gap-3 border-b border-white/10 pb-4">
              <div className="p-2.5 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30">
                <UserPlus size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Add New Teacher</h3>
                <p className="text-xs text-white/50">Register Email & Credentials</p>
              </div>
            </div>

            {formError && (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-start gap-2.5 animate-shake">
                <AlertCircle size={16} className="shrink-0 text-red-400 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            {formSuccess && (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-start gap-2.5">
                <Check size={16} className="shrink-0 text-emerald-400 mt-0.5" />
                <span>{formSuccess}</span>
              </div>
            )}

            <form onSubmit={handleCreateTeacher} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-white/70 uppercase tracking-wider flex items-center gap-2">
                  <KeyRound size={14} className="text-indigo-400" /> Teacher ID (Username) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. TCH103 or smith_prof"
                  value={teacherId}
                  onChange={(e) => setTeacherId(e.target.value)}
                  className="w-full bg-black/50 border border-white/15 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
                <p className="text-[10px] text-white/40 ml-1">Used for manual ID/Password login.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-white/70 uppercase tracking-wider flex items-center gap-2">
                  <Users size={14} className="text-indigo-400" /> Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Prof. Sarah Connor"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-black/50 border border-white/15 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-white/70 uppercase tracking-wider flex items-center gap-2">
                  <Mail size={14} className="text-sky-400" /> Teacher Email (Google Sign-In) *
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. teacher.name@institution.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-black/50 border border-white/15 rounded-xl px-4 py-3 text-sm text-sky-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50 font-mono"
                />
                <p className="text-[10px] text-sky-400/70 ml-1">Google login will only allow this specific email.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-white/70 uppercase tracking-wider flex items-center gap-2">
                  <KeyRound size={14} className="text-emerald-400" /> Password *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Pass@2026"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-black/50 border border-white/15 rounded-xl px-4 py-3 text-sm text-emerald-300 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-white/70 uppercase tracking-wider flex items-center gap-2">
                  <Building size={14} className="text-amber-400" /> Department / Note (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Computer Science & AI Dept"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full bg-black/50 border border-white/15 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>

              <button
                type="submit"
                disabled={isAdding}
                className="w-full mt-2 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isAdding ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Registering Teacher...
                  </>
                ) : (
                  <>
                    <UserPlus size={16} /> Register Teacher Account
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Registered Teachers List */}
        <div className="lg:col-span-7 space-y-6">
          {/* List Header + Search */}
          <div className="p-6 rounded-3xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  Authorized Teachers Directory ({teachers.length})
                </h3>
                <p className="text-xs text-white/50">Manage accounts, verify authorized emails, or revoke access.</p>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative w-full sm:w-64">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
                  <input
                    type="text"
                    placeholder="Search teacher, ID, or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                {teachers.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setShowClearAllModal(true)}
                    className="px-3.5 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0"
                    title="Delete all created teacher accounts"
                  >
                    <Trash2 size={14} /> Clear All ({teachers.length - 1})
                  </button>
                )}
              </div>
            </div>

            {/* Teachers Cards List */}
            <div className="space-y-4 pt-2">
              {filteredTeachers.length === 0 ? (
                <div className="p-8 text-center rounded-2xl bg-black/20 border border-white/5 space-y-2">
                  <Users size={32} className="mx-auto text-white/20" />
                  <p className="text-sm font-semibold text-white/50">No teachers found matching your search.</p>
                </div>
              ) : (
                <AnimatePresence>
                  {filteredTeachers.map((t) => {
                    const isPasswordVisible = !!showPasswordMap[t.id];
                    const isCopied = copiedId === t.id;
                    const isAdmin = t.teacherId.toUpperCase() === 'MAINADMIN' || t.email?.toLowerCase().trim() === 'mygamesprabhu@gmail.com';

                    return (
                      <motion.div
                        key={t.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="p-5 rounded-2xl bg-black/40 border border-white/10 hover:border-white/20 transition-all space-y-4 relative group"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-extrabold uppercase tracking-wider">
                                {t.teacherId}
                              </span>
                              {isAdmin && (
                                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm shadow-amber-500/10">
                                  <ShieldCheck size={12} className="text-amber-400" /> Admin
                                </span>
                              )}
                              {t.department && (
                                <span className="text-[10px] text-white/40 font-medium">
                                  • {t.department}
                                </span>
                              )}
                            </div>
                            <h4 className="text-base font-bold text-white">{t.name}</h4>
                            {t.email && (
                              <div className="flex items-center gap-1.5 text-xs text-sky-300/90 font-mono">
                                <Mail size={13} className="text-sky-400" />
                                <span>{t.email}</span>
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 font-sans font-semibold border border-sky-500/20">
                                  Google Authorized
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleCopyCredentials(t)}
                              title="Copy Teacher Credentials"
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
                                isCopied 
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' 
                                  : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white'
                              }`}
                            >
                              {isCopied ? <Check size={14} /> : <Copy size={14} />}
                              {isCopied ? 'Copied!' : 'Copy Info'}
                            </button>

                            {!isAdmin ? (
                              <button
                                onClick={() => setTeacherToDelete({ id: t.id, name: t.name, teacherId: t.teacherId })}
                                title="Delete Teacher Account"
                                className="p-2 text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all cursor-pointer"
                              >
                                <Trash2 size={16} />
                              </button>
                            ) : (
                              <div
                                title="Admin account cannot be deleted"
                                className="px-2.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] font-bold flex items-center gap-1 cursor-default select-none"
                              >
                                <ShieldCheck size={13} className="text-amber-400" />
                                <span>Protected</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Credentials Details Bar */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-white/10 text-xs">
                          <div className="bg-white/5 rounded-xl p-2.5 border border-white/5 flex items-center justify-between">
                            <span className="text-white/40 text-[10px] font-bold uppercase tracking-wider">Teacher ID:</span>
                            <span className="font-mono font-bold text-indigo-300">{t.teacherId}</span>
                          </div>

                          <div className="bg-white/5 rounded-xl p-2.5 border border-white/5 flex items-center justify-between">
                            <span className="text-white/40 text-[10px] font-bold uppercase tracking-wider">Password:</span>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-emerald-400">
                                {isPasswordVisible ? t.password : '••••••••'}
                              </span>
                              <button
                                type="button"
                                onClick={() => togglePasswordVisibility(t.id)}
                                className="p-1 text-white/40 hover:text-white transition-all cursor-pointer"
                              >
                                {isPasswordVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                              </button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Delete Teacher Confirmation Modal */}
      {teacherToDelete && (
        <div 
          onClick={() => setTeacherToDelete(null)}
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-[#14151f] border border-red-500/30 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl space-y-6 text-left"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-red-500/20 text-red-400 rounded-2xl border border-red-500/30 shrink-0">
                <Trash2 size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Remove Teacher Account?</h3>
                <p className="text-xs text-white/50">This teacher will no longer be able to log in.</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-red-950/30 border border-red-500/20 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/60">Teacher Name:</span>
                <span className="font-bold text-white">{teacherToDelete.name}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/60">Teacher ID:</span>
                <span className="font-mono font-bold text-indigo-300">{teacherToDelete.teacherId}</span>
              </div>
            </div>

            <p className="text-xs text-white/60 leading-relaxed">
              Teacher access to question papers, student monitoring, and evaluation dashboard will be revoked.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setTeacherToDelete(null)}
                className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white/70 rounded-xl text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteTeacher}
                className="px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-red-600/30 transition-all flex items-center gap-2"
              >
                <Trash2 size={15} /> Yes, Remove Teacher
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Teachers Confirmation Modal */}
      {showClearAllModal && (
        <div 
          onClick={() => setShowClearAllModal(false)}
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-[#14151f] border border-red-500/30 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl space-y-6 text-left"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-red-500/20 text-red-400 rounded-2xl border border-red-500/30 shrink-0">
                <Trash2 size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Reset Teacher Directory?</h3>
                <p className="text-xs text-white/50">This will remove all {teachers.length - 1} custom teacher accounts.</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-red-950/30 border border-red-500/20 space-y-2 text-xs">
              <p className="text-white/80 leading-relaxed font-medium">
                Warning: All created secondary teacher credentials will be revoked. The default administrator account (<span className="font-mono text-indigo-300">ADMIN-01</span>) will remain preserved to maintain administrative access.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowClearAllModal(false)}
                className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white/70 rounded-xl text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isClearingAll}
                onClick={handleConfirmClearAllTeachers}
                className="px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-red-600/30 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                <Trash2 size={15} /> {isClearingAll ? 'Clearing All...' : `Yes, Clear Teachers (${teachers.length - 1})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

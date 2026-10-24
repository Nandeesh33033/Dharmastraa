import React, { useState } from 'react';
import { useExam } from '../ExamContext';
import { Users, User, Trash2, Search, GraduationCap, ScanFace, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';

export const StudentManager: React.FC = () => {
  const { students, deleteStudent, clearAllStudents } = useExam();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [studentToDelete, setStudentToDelete] = useState<{ id: string; name: string; rollNo: string } | null>(null);
  const [showClearAllModal, setShowClearAllModal] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);

  const filteredStudents = students.filter(s => 
    s.rollNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleConfirmDeleteStudent = async () => {
    if (!studentToDelete) return;
    await deleteStudent(studentToDelete.id);
    setStudentToDelete(null);
  };

  const handleConfirmClearAll = async () => {
    try {
      setIsClearingAll(true);
      await clearAllStudents();
      setShowClearAllModal(false);
    } catch (err) {
      console.error('Failed to clear students:', err);
    } finally {
      setIsClearingAll(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <GraduationCap className="text-emerald-400" size={24} /> Registered Students Directory
          </h2>
          <p className="text-xs text-white/40 mt-0.5">
            Total {students.length} student(s) enrolled with biometric face authentication records.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" size={16} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by Roll No or Name..."
              className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
          </div>

          {students.length > 0 && (
            <button
              type="button"
              onClick={() => setShowClearAllModal(true)}
              className="px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0"
              title="Delete all registered student records"
            >
              <Trash2 size={14} /> Clear All ({students.length})
            </button>
          )}
        </div>
      </div>

      {/* Students Grid */}
      {filteredStudents.length === 0 ? (
        <div className="p-12 text-center bg-white/5 border border-white/10 rounded-3xl space-y-3">
          <Users size={40} className="mx-auto text-white/20" />
          <p className="text-sm font-semibold text-white/60">No registered students found.</p>
          <p className="text-xs text-white/40">Students who register via the student sign-in portal will appear here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredStudents.map((std) => (
            <motion.div
              key={std.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white/5 border border-white/10 p-5 rounded-2xl space-y-4 hover:border-emerald-500/30 transition-all flex flex-col justify-between"
            >
              <div className="flex items-start gap-4">
                {/* Face Snapshot thumbnail */}
                {std.faceSnapshot ? (
                  <div 
                    onClick={() => setSelectedPhoto(std.faceSnapshot || null)}
                    className="relative w-14 h-14 rounded-2xl overflow-hidden border-2 border-emerald-500/40 shrink-0 cursor-pointer group shadow"
                  >
                    <img src={std.faceSnapshot} alt={std.name} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <ScanFace size={16} className="text-white" />
                    </div>
                  </div>
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center text-white/40 shrink-0">
                    <User size={24} />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      {std.rollNo}
                    </span>
                    {std.faceSnapshot && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-emerald-400">
                        <CheckCircle2 size={11} /> Face Enrolled
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-white mt-1 truncate">{std.name}</h3>
                  <p className="text-[10px] text-white/40 mt-0.5">
                    Registered: {new Date(std.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                <div className="text-[11px] text-white/50">
                  Password: <span className="font-mono text-white/70">••••••</span>
                </div>

                <button
                  type="button"
                  onClick={() => setStudentToDelete({ id: std.id, name: std.name, rollNo: std.rollNo })}
                  className="p-1.5 hover:bg-red-500/20 text-white/40 hover:text-red-400 rounded-lg transition-colors"
                  title="Delete Student"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Delete Student Confirmation Modal */}
      {studentToDelete && (
        <div 
          onClick={() => setStudentToDelete(null)}
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
                <h3 className="text-lg font-bold text-white">Remove Student Record?</h3>
                <p className="text-xs text-white/50">This student will no longer be able to log in.</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-red-950/30 border border-red-500/20 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/60">Student Name:</span>
                <span className="font-bold text-white">{studentToDelete.name}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/60">USN / Roll Number:</span>
                <span className="font-mono font-bold text-emerald-300">{studentToDelete.rollNo}</span>
              </div>
            </div>

            <p className="text-xs text-white/60 leading-relaxed">
              Enrolled facial recognition credentials and local account access will be revoked.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStudentToDelete(null)}
                className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white/70 rounded-xl text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteStudent}
                className="px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-red-600/30 transition-all flex items-center gap-2"
              >
                <Trash2 size={15} /> Yes, Remove Student
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Students Confirmation Modal */}
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
                <h3 className="text-lg font-bold text-white">Purge All Student Records?</h3>
                <p className="text-xs text-white/50">This will remove all {students.length} enrolled student(s).</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-red-950/30 border border-red-500/20 space-y-2 text-xs">
              <p className="text-white/80 leading-relaxed font-medium">
                Warning: All registered student USNs, passwords, and biometric face authentication profiles will be deleted from the database directory.
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
                onClick={handleConfirmClearAll}
                className="px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-red-600/30 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                <Trash2 size={15} /> {isClearingAll ? 'Clearing All...' : `Yes, Delete All (${students.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal to view enlarged biometric photo */}
      {selectedPhoto && (
        <div 
          onClick={() => setSelectedPhoto(null)}
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-[#12131a] border border-emerald-500/30 p-6 rounded-3xl max-w-sm w-full text-center space-y-4 shadow-2xl"
          >
            <h3 className="text-sm font-bold text-white flex items-center justify-center gap-2">
              <ScanFace className="text-emerald-400" size={18} /> Enrolled Biometric Face Photo
            </h3>
            <div className="w-56 h-56 mx-auto rounded-2xl overflow-hidden border-2 border-emerald-500 shadow-xl">
              <img src={selectedPhoto} alt="Enrolled Face" className="w-full h-full object-cover" />
            </div>
            <p className="text-xs text-white/50">Biometric reference captured during student registration.</p>
            <button
              onClick={() => setSelectedPhoto(null)}
              className="px-6 py-2.5 bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs font-bold transition-all border border-white/10"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

import React from 'react';
import { useExam } from '../ExamContext';
import { Shield, AlertTriangle, Users, Activity, Clock, User } from 'lucide-react';
import { motion } from 'motion/react';

export const ProctorDashboard: React.FC = () => {
  const { trustScore, violations, faceCount, user, isFaceDetected } = useExam();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white tracking-tight">Proctor Control Center</h2>
        <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Live Feed Active</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Integrity Card */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-5 rounded-3xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="p-2 bg-indigo-500/20 rounded-xl text-indigo-400">
              <Shield size={20} />
            </div>
            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Integrity</span>
          </div>
          <div>
            <p className="text-3xl font-bold text-white">{trustScore}%</p>
            <div className="mt-2 w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${trustScore}%` }}
                className={`h-full ${trustScore > 80 ? 'bg-emerald-500' : trustScore > 50 ? 'bg-amber-500' : 'bg-red-500'}`}
              />
            </div>
          </div>
        </div>

        {/* Presence Card */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-5 rounded-3xl space-y-4">
          <div className="flex items-center justify-between">
            <div className={`p-2 rounded-xl ${faceCount === 1 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
              <Users size={20} />
            </div>
            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Presence</span>
          </div>
          <div>
            <p className="text-3xl font-bold text-white">{faceCount}</p>
            <p className="text-[10px] font-medium text-white/40 uppercase tracking-wider mt-1">
              {faceCount === 1 ? 'Correct Presence' : 'Violation Detected'}
            </p>
          </div>
        </div>
      </div>

      {/* Student Profile & Biometric Status */}
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-5 rounded-3xl flex items-center gap-4">
        {user?.faceSnapshot ? (
          <div className="w-12 h-12 rounded-2xl overflow-hidden border border-emerald-500/40 shrink-0">
            <img src={user.faceSnapshot} alt={user.name} className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20 shrink-0">
            <User size={24} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white truncate">{user?.name || 'Registered Student'}</p>
          <p className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-wider">
            USN: {user?.rollNo || user?.id || 'N/A'}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider ${
            violations.some(v => v.type === 'IDENTITY_MISMATCH')
              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
          }`}>
            {violations.some(v => v.type === 'IDENTITY_MISMATCH') ? 'IDENTITY MISMATCH' : 'BIOMETRIC MATCH ✓'}
          </div>
          <div className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-tighter ${isFaceDetected ? 'bg-white/10 text-white/70' : 'bg-red-500/20 text-red-400'}`}>
            {isFaceDetected ? 'FACE VISIBLE' : 'FACE ABSENT'}
          </div>
        </div>
      </div>

      {/* Violation Summary */}
      <div className="space-y-3">
        <h3 className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] px-1">Session Summary</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-white/5 p-3 rounded-2xl border border-white/5 text-center">
            <p className="text-lg font-bold text-white">{violations.length}</p>
            <p className="text-[8px] font-bold text-white/30 uppercase tracking-widest">Total Alerts</p>
          </div>
          <div className="bg-white/5 p-3 rounded-2xl border border-white/5 text-center">
            <p className="text-lg font-bold text-red-400">{violations.filter(v => v.type === 'IDENTITY_MISMATCH').length}</p>
            <p className="text-[8px] font-bold text-red-300/60 uppercase tracking-widest">Identity Mismatch</p>
          </div>
          <div className="bg-white/5 p-3 rounded-2xl border border-white/5 text-center">
            <p className="text-lg font-bold text-white">{violations.filter(v => ['MULTIPLE_FACES', 'BACKGROUND_PERSON', 'BACKGROUND_PERSON_DETECTED'].includes(v.type)).length}</p>
            <p className="text-[8px] font-bold text-white/30 uppercase tracking-widest">Multi-Person</p>
          </div>
          <div className="bg-white/5 p-3 rounded-2xl border border-white/5 text-center">
            <p className="text-lg font-bold text-white">{violations.filter(v => v.type === 'FACE_MISSING').length}</p>
            <p className="text-[8px] font-bold text-white/30 uppercase tracking-widest">Face Absent</p>
          </div>
        </div>
      </div>
    </div>
  );
};

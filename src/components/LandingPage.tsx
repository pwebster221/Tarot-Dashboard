import React from 'react';
import { motion } from 'motion/react';

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[#050508] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient Background Glows */}
      <div className="absolute top-[-100px] left-[-100px] w-[400px] h-[400px] bg-[#2a0d4e]/40 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-100px] right-[-100px] w-[500px] h-[500px] bg-purple-900/20 rounded-full blur-[150px] pointer-events-none"></div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md bg-[#0D0D12] border border-slate-800 rounded-2xl p-8 shadow-2xl z-10"
      >
        <div className="mb-8 text-center flex flex-col items-center">
            <img src="/logo.jpg" alt="Paths of Reverence Logo" className="w-20 h-20 mb-4 rounded-full border-2 border-[#DEB564]/50 shadow-[0_0_20px_rgba(212,175,55,0.4)] object-cover" />
            <h1 className="text-2xl font-serif font-semibold tracking-wide text-[#DEB564]">Paths of Reverence</h1>
            <p className="text-[10px] uppercase tracking-widest text-[#DEB564]/80 mt-1">Tarot Repository</p>
        </div>

        <h2 className="text-xl font-serif text-[#FFFAE3] mb-6 text-center">Access Archives</h2>

        <div className="flex flex-col items-center gap-4">
          <a
            href="/api/auth/login"
            className="w-full bg-[#DEB564] hover:bg-[#DEB564]/90 text-[#050508] rounded-xl py-2.5 font-medium transition-all transform active:scale-[0.98] text-center no-underline block"
          >
            Sign In
          </a>
          <p className="text-xs text-slate-500 text-center">
            Sign in with your Paths of Reverence account.
          </p>
        </div>
      </motion.div>
    </div>
  );
}

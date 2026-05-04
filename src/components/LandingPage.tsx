import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Mail, Lock, User as UserIcon } from 'lucide-react';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  sendPasswordResetEmail,
  updateProfile
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

export function LandingPage() {
  const [view, setView] = useState<'login' | 'register' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (view === 'register') {
        if (!name.trim()) {
          throw new Error("Please provide a Reader name.");
        }
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName: name });
        
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          name: name.trim(),
          email: email.trim(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

      } else if (view === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else if (view === 'forgot') {
        await sendPasswordResetEmail(auth, email);
        setResetSent(true);
        setLoading(false);
        return;
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        setError('This email is already registered.');
      } else if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        setError('Invalid email or password.');
      } else {
        setError(err.message || 'An error occurred. Please try again.');
        if (err.message && err.message.includes('auth/operation-not-allowed')) {
          setError('Email/Password sign-in is not enabled. Please enable it in the Firebase Console: Authentication -> Sign-in method.');
        }
      }
    } finally {
      setLoading(false);
    }
  };

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

        <h2 className="text-xl font-serif text-[#FFFAE3] mb-6 text-center">
          {view === 'login' ? 'Access Archives' : view === 'register' ? 'Register as Reader' : 'Reset Password'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}
          
          {resetSent && view === 'forgot' && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-sm">
              Password reset email sent! Check your inbox.
            </div>
          )}

          {view === 'register' && (
            <div className="space-y-1">
              <label className="text-sm text-slate-400 block ml-1">Reader Name</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-500">
                  <UserIcon size={18} />
                </div>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#1A1A24] border border-slate-700/50 rounded-xl py-2.5 pl-10 pr-4 text-[#FFFAE3] placeholder-slate-500 focus:outline-none focus:border-[#DEB564]/50 focus:ring-1 focus:ring-[#DEB564]/50 transition-all"
                  placeholder="E.g. The Oracle"
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-sm text-slate-400 block ml-1">Email</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-500">
                <Mail size={18} />
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#1A1A24] border border-slate-700/50 rounded-xl py-2.5 pl-10 pr-4 text-[#FFFAE3] placeholder-slate-500 focus:outline-none focus:border-[#DEB564]/50 focus:ring-1 focus:ring-[#DEB564]/50 transition-all"
                placeholder="reader@tarot.com"
              />
            </div>
          </div>

          {view !== 'forgot' && (
            <div className="space-y-1">
              <label className="text-sm text-slate-400 block ml-1">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-500">
                  <Lock size={18} />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#1A1A24] border border-slate-700/50 rounded-xl py-2.5 pl-10 pr-4 text-[#FFFAE3] placeholder-slate-500 focus:outline-none focus:border-[#DEB564]/50 focus:ring-1 focus:ring-[#DEB564]/50 transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#DEB564] hover:bg-[#DEB564] text-[#FFFAE3] rounded-xl py-2.5 font-medium transition-all transform active:scale-[0.98] mt-2 disabled:opacity-70"
          >
            {loading ? 'Processing...' : view === 'login' ? 'Sign In' : view === 'register' ? 'Create Account' : 'Send Reset Link'}
          </button>
        </form>

        <div className="mt-8 flex flex-col gap-2 items-center text-sm">
          {view === 'login' ? (
            <>
              <button onClick={() => { setView('forgot'); setError(null); setResetSent(false); }} className="text-slate-400 hover:text-[#FFFAE3] transition-colors">
                Forgot your password?
              </button>
              <div className="flex gap-1 text-slate-500">
                New to the archives? 
                <button onClick={() => { setView('register'); setError(null); }} className="text-[#DEB564]/80 hover:text-[#DEB564] font-medium">Create an account</button>
              </div>
            </>
          ) : (
            <div className="flex gap-1 text-slate-500">
              Already have an account? 
              <button onClick={() => { setView('login'); setError(null); }} className="text-[#DEB564]/80 hover:text-[#DEB564] font-medium">Sign in</button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

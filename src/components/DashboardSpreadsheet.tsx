import React, { useState, useEffect } from 'react';
import { Reading } from '../types';
import { Sparkles, Loader2 } from 'lucide-react';
import Markdown from 'react-markdown';
import { generateTrendInsight as getTrendInsight } from '../lib/ai';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { useAuth } from '../lib/AuthContext';

interface DashboardSpreadsheetProps {
  readings: Reading[];
}

const TREND_DOC_ID = '__trend__latest';
const TREND_READING_ID = '__trend__';
const TREND_INSIGHT_KEY = 'latest';

export function DashboardSpreadsheet({ readings }: DashboardSpreadsheetProps) {
  const { currentUser } = useAuth();
  const [insight, setInsight] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      try {
        const ref = doc(db, 'users', currentUser.uid, 'insights', TREND_DOC_ID);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          setInsight(data.text ?? null);
          const ts = data.updatedAt as Timestamp | undefined;
          setGeneratedAt(ts ? ts.toDate() : null);
        }
      } catch (err) {
        console.error('Failed to load saved trend insight', err);
      }
    })();
  }, [currentUser]);

  const generateTrendInsight = async () => {
    if (!currentUser) {
      setError('You must be signed in to generate insights.');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const result = await getTrendInsight(readings.slice(0, 50));
      setInsight(result);
      setGeneratedAt(new Date());

      const ref = doc(db, 'users', currentUser.uid, 'insights', TREND_DOC_ID);
      const existing = await getDoc(ref);
      if (existing.exists()) {
        await updateDoc(ref, { text: result, updatedAt: serverTimestamp() });
      } else {
        await setDoc(ref, {
          readingId: TREND_READING_ID,
          insightKey: TREND_INSIGHT_KEY,
          text: result,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0D0D12] text-sm overflow-hidden">
      
      {/* Header & Oracle Option */}
      <div className="flex items-center gap-4 p-4 border-b border-white/5 bg-white/5 shrink-0">
         <h2 className="text-[#DEB564] font-serif text-lg mr-auto">Readings Dashboard</h2>
         <span className="text-[#FFFAE3]/50">{readings.length} readings</span>
         <button 
           onClick={generateTrendInsight}
           disabled={generating || readings.length === 0}
           className="px-4 py-2 bg-[#2a0d4e]/60 text-[#FFFAE3] border border-[#DEB564]/30 rounded flex items-center gap-2 hover:bg-[#2a0d4e]/80 transition-colors disabled:opacity-50"
         >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Analyze Trends
         </button>
      </div>

      {insight && (
        <div className="p-6 border-b border-white/5 bg-[#2a0d4e]/40 max-h-[300px] overflow-y-auto shrink-0">
           <div className="flex items-baseline gap-3 mb-2">
             <h3 className="text-[#DEB564] font-serif text-lg">Trend Insight</h3>
             {generatedAt && (
               <span className="text-[10px] text-[#FFFAE3]/40 uppercase tracking-wider">
                 Generated {generatedAt.toLocaleString()}
               </span>
             )}
           </div>
           <div className="markdown-body prose prose-invert max-w-none text-sm text-amber-100/80">
              <Markdown>{insight}</Markdown>
           </div>
        </div>
      )}
      {error && (
        <div className="p-4 bg-red-900/20 text-red-400 border-b border-red-900/30 shrink-0">
          Error: {error}
        </div>
      )}

      {/* Spreadsheet Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse min-w-[1000px]">
          <thead className="sticky top-0 bg-[#12121a] z-10 text-[10px] uppercase tracking-wider text-[#FFFAE3]/40 shadow">
            <tr>
              <th className="p-3 font-medium border-b border-white/5 w-32">Date</th>
              <th className="p-3 font-medium border-b border-white/5 w-48">Querent</th>
              <th className="p-3 font-medium border-b border-white/5">Question</th>
              <th className="p-3 font-medium border-b border-white/5 w-48">Spread Type</th>
              <th className="p-3 font-medium border-b border-white/5 w-64">Cards (First 3)</th>
            </tr>
          </thead>
          <tbody>
            {readings.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-[#FFFAE3]/30 italic">No readings match the current filters.</td>
              </tr>
            ) : (
              readings.map(r => (
                <tr key={r.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                  <td className="p-3 whitespace-nowrap text-[#FFFAE3]/70">{new Date(r.date).toLocaleDateString()}</td>
                  <td className="p-3 text-[#FFFAE3]/80 truncate max-w-[12rem]">{r.querent}</td>
                  <td className="p-3 text-amber-100/90 truncate max-w-md">{r.question}</td>
                  <td className="p-3 text-[#FFFAE3]/50">{r.type.replace(/_/g, ' ')}</td>
                  <td className="p-3 text-[#FFFAE3]/60 text-xs">
                    <div className="flex flex-wrap gap-1">
                      {r.drawnCards.slice(0, 3).map((dc, i) => (
                        <span key={i} className="inline-block bg-white/5 px-2 py-0.5 rounded text-[10px] border border-white/10 uppercase" title={`${dc.card.name} (${dc.isReversed ? 'Rev' : 'Up'})`}>
                          {dc.card.name}
                        </span>
                      ))}
                      {r.drawnCards.length > 3 && <span className="opacity-50 text-[10px] self-center">+{r.drawnCards.length - 3}</span>}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

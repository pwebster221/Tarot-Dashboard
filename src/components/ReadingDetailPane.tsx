import React, { useState, useEffect } from 'react';
import { Check, Sun, ArrowLeft, Sparkles, Loader2, Edit2, Save, Bookmark } from 'lucide-react';
import { DrawnCard, Reading } from '../types';
import Markdown from 'react-markdown';
import { generateDeepInterpretation, generateOracleInsight, fetchCardMeaning } from '../lib/ai';
import { useExtraReasoning } from '../lib/useExtraReasoning';
import { ExtraReasoningToggle } from './ExtraReasoningToggle';

interface ReadingDetailPaneProps {
  reading: Reading | null;
  selectedCard: DrawnCard | null;
  onDeselectCard?: () => void;
}

export function ReadingDetailPane({ reading, selectedCard, onDeselectCard }: ReadingDetailPaneProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [insightCache, setInsightCache] = useState<Record<string, string>>({}); // newly generated
  const [savedInsights, setSavedInsights] = useState<Record<string, string>>({}); // API-backed saved insights keyed by cardId
  const [isEditingMeaning, setIsEditingMeaning] = useState(false);
  const [editedMeaning, setEditedMeaning] = useState('');
  const [customMeanings, setCustomMeanings] = useState<Record<string, string>>({});
  // Gates meaning edits until persisted annotations have loaded, so a save can't
  // overwrite the note with a stale-empty customMeanings map (data-loss guard).
  const [annotationsLoaded, setAnnotationsLoaded] = useState(false);
  // Canonical card meanings fetched from the graph, keyed by card name.
  const [cardMeanings, setCardMeanings] = useState<Record<string, string>>({});
  // Independent per-card interpretation summaries, keyed the same as saved insights
  // (`card-<cardId>-<positionName>`). Feed the whole-spread Oracle synthesis and
  // gate it (Oracle requires every card interpreted). Mode-independent (latest wins).
  const [summaryCache, setSummaryCache] = useState<Record<string, string>>({});
  // Shared "Extra reasoning" preference (default on) — governs deep + oracle.
  const [extraReasoning, toggleExtraReasoning] = useExtraReasoning();

  // Fetch annotations (note + saved insights) whenever the displayed reading changes.
  useEffect(() => {
    if (!reading) return;
    setAnnotationsLoaded(false);
    (async () => {
      try {
        const res = await fetch(`/api/readings/${reading.id}/annotations`, { credentials: 'include' });
        if (!res.ok) throw new Error(`annotations fetch ${res.status}`);
        const data = await res.json() as { note: string | null; savedInsights: Array<{ card_id: string; text: string; summary?: string }> };

        // Hydrate saved insights: card_id in the API maps directly to the cacheKey used in state.
        const hydratedInsights: Record<string, string> = {};
        const hydratedSummaries: Record<string, string> = {};
        for (const s of data.savedInsights) {
          if (s.card_id) {
            hydratedInsights[s.card_id] = s.text;
            if (s.summary) hydratedSummaries[s.card_id] = s.summary;
          }
        }
        setSavedInsights(hydratedInsights);
        // Saved summaries count toward the Oracle gate across sessions.
        setSummaryCache(prev => ({ ...hydratedSummaries, ...prev }));

        // Hydrate custom meanings: stored as JSON in the single note field.
        if (data.note) {
          try {
            const parsed = JSON.parse(data.note);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              setCustomMeanings(parsed as Record<string, string>);
            }
          } catch {
            // Not JSON — ignore (plain text notes from older data; not used by this UI).
          }
        } else {
          setCustomMeanings({});
        }
      } catch (err) {
        console.error('[ReadingDetailPane] annotations fetch failed — degrading to empty state', err);
        // Don't crash the pane; leave state as-is.
      } finally {
        setAnnotationsLoaded(true);
      }
    })();
  }, [reading?.id]);

  // Fetch the canonical General Meaning from the graph when a card is selected.
  useEffect(() => {
    const name = selectedCard?.card.name;
    if (!name || cardMeanings[name] !== undefined) return;
    (async () => {
      const meaning = await fetchCardMeaning(name);
      if (meaning) setCardMeanings(prev => ({ ...prev, [name]: meaning }));
    })();
  }, [selectedCard?.card.name, cardMeanings]);

  // Reset edit state when card changes
  useEffect(() => {
    setIsEditingMeaning(false);
    if (selectedCard && reading) {
      setEditedMeaning(customMeanings[`${reading.id}_${selectedCard.position.id}`] ?? selectedCard.specificMeaning ?? '');
    }
  }, [selectedCard, reading, customMeanings]);

  const toggleSaveInsight = async (cacheKey: string, text: string) => {
    if (!reading) return;
    const isSaved = !!savedInsights[cacheKey];
    // Optimistic update
    if (isSaved) {
      setSavedInsights(prev => {
        const updated = { ...prev };
        delete updated[cacheKey];
        return updated;
      });
    } else {
      setSavedInsights(prev => ({ ...prev, [cacheKey]: text }));
    }
    // Persist
    try {
      if (isSaved) {
        await fetch(`/api/readings/${reading.id}/insights/saved`, {
          method: 'DELETE',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cardId: cacheKey }),
        });
      } else {
        await fetch(`/api/readings/${reading.id}/insights/saved`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          // Persist the card's summary alongside (per-card keys match summaryCache).
          body: JSON.stringify({ cardId: cacheKey, text, summary: summaryCache[cacheKey] || '' }),
        });
      }
    } catch (err) {
      console.error('[ReadingDetailPane] insight toggle persist failed', err);
      // Revert optimistic update on failure
      if (isSaved) {
        setSavedInsights(prev => ({ ...prev, [cacheKey]: text }));
      } else {
        setSavedInsights(prev => {
          const updated = { ...prev };
          delete updated[cacheKey];
          return updated;
        });
      }
    }
  };

  if (!reading) return null;

  const handleGenerateInterpretation = async () => {
    if (!selectedCard) return;
    // Fresh-insight cache is keyed by reasoning mode so toggling regenerates
    // instead of returning the other mode's cached result.
    const cacheKey = `card-${selectedCard.card.id}-${selectedCard.position.name}-${extraReasoning ? 'r' : 's'}`;
    if (insightCache[cacheKey]) return; // already generated for this mode

    setIsGenerating(true);
    try {
      // Pass the "Specific Meaning in Spread" the user actually sees — a custom
      // per-position edit takes precedence over the card's default meaning.
      const resolvedMeaning =
        customMeanings[`${reading.id}_${selectedCard.position.id}`] ?? selectedCard.specificMeaning ?? '';
      const cardForAI = { ...selectedCard, specificMeaning: resolvedMeaning };
      const { result, summary } = await generateDeepInterpretation(cardForAI, reading, extraReasoning);
      setInsightCache(prev => ({ ...prev, [cacheKey]: result }));
      // Store the independent summary (mode-independent key, matches saved-insight key).
      const sk = `card-${selectedCard.card.id}-${selectedCard.position.name}`;
      if (summary) setSummaryCache(prev => ({ ...prev, [sk]: summary }));
    } catch (err: any) {
      console.error(err);
      setInsightCache(prev => ({ ...prev, [cacheKey]: `Error generating insight: ${err.message}` }));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateOracleInsight = async () => {
    const cacheKey = `oracle-${reading.id}-${extraReasoning ? 'r' : 's'}`;
    if (insightCache[cacheKey]) return;
    if (!allCardsInterpreted) return; // gated: interpret every card first

    setIsGenerating(true);
    try {
      // Attach each card's independent interpretation summary so the synthesis
      // builds on the per-card (persona-grounded) reads.
      const readingWithSummaries = {
        ...reading,
        drawnCards: reading.drawnCards.map(dc => ({
          ...dc,
          summary: summaryCache[`card-${dc.card.id}-${dc.position.name}`] || '',
        })),
      };
      const insight = await generateOracleInsight(readingWithSummaries, extraReasoning);
      setInsightCache(prev => ({ ...prev, [cacheKey]: insight }));
    } catch (err: any) {
      console.error(err);
      setInsightCache(prev => ({ ...prev, [cacheKey]: `Error generating insight: ${err.message}` }));
    } finally {
      setIsGenerating(false);
    }
  };

  const currentDetailInsight = selectedCard ? insightCache[`card-${selectedCard.card.id}-${selectedCard.position.name}-${extraReasoning ? 'r' : 's'}`] : null;
  const currentOracleInsight = !selectedCard ? insightCache[`oracle-${reading.id}-${extraReasoning ? 'r' : 's'}`] : null;

  // Oracle gate: every drawn card must have a completed interpretation (summary)
  // before the whole-spread synthesis can run.
  const cardSummaryKey = (dc: DrawnCard) => `card-${dc.card.id}-${dc.position.name}`;
  const interpretedCount = reading.drawnCards.filter(dc => !!summaryCache[cardSummaryKey(dc)]).length;
  const allCardsInterpreted = reading.drawnCards.length > 0 && interpretedCount === reading.drawnCards.length;

  return (
    <section className="hidden lg:flex w-[450px] bg-black/40 border-l border-white/10 flex-col h-full overflow-y-auto">
      <div className="p-8 pb-4">
        {selectedCard ? (
          <>
            {onDeselectCard && (
              <button 
                onClick={onDeselectCard} 
                className="mb-6 flex items-center gap-2 text-[#FFFAE3]/40 hover:text-[#FFFAE3] transition-colors text-sm"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Overview</span>
              </button>
            )}
            <div className="text-center mb-8">
              <div className="relative inline-block">
                <div className="w-40 h-64 bg-[#0D0D12] border-2 border-[#DEB564]/50 rounded-xl mx-auto shadow-[0_0_40px_rgba(212,175,55,0.15)] overflow-hidden relative group">
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent z-10"></div>
                  <div className="p-4 text-center absolute bottom-4 w-full z-20">
                     <p className="text-amber-200 font-serif text-xl tracking-widest uppercase">{selectedCard.card.name}</p>
                     <p className="text-[10px] text-[#DEB564]/60 uppercase tracking-widest mt-1">{selectedCard.card.arcana} {selectedCard.card.numeral}</p>
                  </div>
                  <div className="w-full h-full opacity-30 flex items-center justify-center">
                    <Sun className="w-24 h-24 text-[#DEB564]" strokeWidth={1} />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="text-[10px] uppercase tracking-widest text-[#DEB564]/80 mb-2">Position: {selectedCard.position.name}</h3>
                <p className="text-xs text-[#FFFAE3]/50 italic mb-2">{selectedCard.position.description}</p>
                <div className="bg-white/5 border border-white/10 p-3 rounded-lg relative group">
                   <div className="flex items-center justify-between mb-2">
                     <h4 className="text-[10px] uppercase text-[#FFFAE3]/40">Specific Meaning in Spread</h4>
                     {!isEditingMeaning ? (
                       <button
                         onClick={() => { if (annotationsLoaded) setIsEditingMeaning(true); }}
                         disabled={!annotationsLoaded}
                         className="text-[#FFFAE3]/40 hover:text-[#DEB564] transition-colors opacity-0 group-hover:opacity-100 p-1 disabled:opacity-30 disabled:cursor-not-allowed"
                         title={annotationsLoaded ? "Edit meaning" : "Loading saved meanings…"}
                       >
                         <Edit2 className="w-3 h-3" />
                       </button>
                     ) : (
                       <button
                         onClick={async () => {
                           setIsEditingMeaning(false);
                           const posId = `${reading.id}_${selectedCard.position.id}`;
                           const updated = { ...customMeanings, [posId]: editedMeaning };
                           setCustomMeanings(updated);
                           // Persist custom meanings as JSON in the single per-reading note.
                           try {
                             await fetch(`/api/readings/${reading.id}/note`, {
                               method: 'PUT',
                               credentials: 'include',
                               headers: { 'Content-Type': 'application/json' },
                               body: JSON.stringify({ text: JSON.stringify(updated) }),
                             });
                           } catch (err) {
                             console.error('[ReadingDetailPane] note persist failed', err);
                           }
                         }}
                         className="text-[#DEB564] hover:text-[#DEB564]/80 transition-colors p-1 flex items-center gap-1"
                         title="Save meaning"
                       >
                         <Save className="w-3 h-3" />
                         <span className="text-[10px]">Save</span>
                       </button>
                     )}
                   </div>
                   
                   {!isEditingMeaning ? (
                     <p className="text-sm text-amber-100/90 leading-relaxed whitespace-pre-wrap">
                       {customMeanings[`${reading.id}_${selectedCard.position.id}`] ?? selectedCard.specificMeaning ?? 'No specific meaning provided.'}
                     </p>
                   ) : (
                     <textarea
                       autoFocus
                       className="w-full bg-black/40 border border-white/20 rounded-md p-2 text-sm text-amber-100/90 leading-relaxed focus:outline-none focus:border-[#DEB564]/50 resize-y min-h-[100px]"
                       value={editedMeaning}
                       onChange={(e) => setEditedMeaning(e.target.value)}
                     />
                   )}
                </div>
              </div>

              <div>
                <h3 className="text-[10px] uppercase tracking-widest text-[#DEB564]/80 mb-2">General Meaning</h3>
                <p className="text-sm text-[#FFFAE3]/80 leading-relaxed whitespace-pre-wrap">
                  {cardMeanings[selectedCard.card.name] ?? selectedCard.card.generalMeaning}
                </p>
              </div>

              <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>

              <div>
                <h3 className="text-[10px] uppercase tracking-widest text-[#DEB564]/80 mb-2 border-b border-[#DEB564]/20 pb-2">
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-3 h-3 text-[#DEB564]" /> AI Deep Interpretation
                  </span>
                </h3>
                  
                {(() => {
                  const cacheKey = `card-${selectedCard.card.id}-${selectedCard.position.name}`;
                  const saved = savedInsights[cacheKey];
                  const current = currentDetailInsight;
                  
                  return (
                    <div className="space-y-4 mt-4">
                      {saved && (
                        <div className="bg-emerald-950/20 rounded-lg p-4 border border-emerald-500/30">
                          <div className="flex items-center justify-between mb-2 pb-2 border-b border-emerald-500/20">
                            <h4 className="text-[10px] uppercase tracking-widest text-emerald-400 flex items-center gap-2">
                               <Bookmark className="w-3 h-3 fill-emerald-400" /> Saved Archive
                            </h4>
                            <button onClick={() => toggleSaveInsight(cacheKey, saved)} className="text-emerald-400 hover:text-emerald-300 transition-colors" title="Remove from Archives">
                              <Bookmark className="w-4 h-4 fill-emerald-500/20" />
                            </button>
                          </div>
                          <div className="prose prose-invert prose-sm prose-p:leading-relaxed max-w-none text-emerald-100/80">
                             <Markdown>{saved}</Markdown>
                          </div>
                        </div>
                      )}
                      
                      {current && (!saved || current !== saved) && (
                        <div className="bg-[#2a0d4e]/40 rounded-lg p-4 border border-[#DEB564]/20">
                          <div className="flex items-center justify-between mb-2 pb-2 border-b border-[#DEB564]/20">
                            <h4 className="text-[10px] uppercase tracking-widest text-[#DEB564]/80">Fresh Insight</h4>
                            <button onClick={() => toggleSaveInsight(cacheKey, current)} className="text-[#FFFAE3]/40 hover:text-emerald-400 transition-colors" title="Save to Archives">
                              <Bookmark className="w-4 h-4 opacity-50 hover:opacity-100" />
                            </button>
                          </div>
                          <div className="prose prose-invert prose-sm prose-p:leading-relaxed max-w-none text-[#FFFAE3]/90">
                             <Markdown>{current}</Markdown>
                          </div>
                        </div>
                      )}
                      
                      <ExtraReasoningToggle checked={extraReasoning} onToggle={toggleExtraReasoning} />

                      <button
                        onClick={handleGenerateInterpretation}
                        disabled={isGenerating}
                        className="w-full py-3 bg-[#2a0d4e]/60 border border-[#DEB564]/30 text-[#FFFAE3]/90 rounded-lg text-xs hover:bg-[#2a0d4e]/60 transition-all font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        {isGenerating ? (extraReasoning ? "Reasoning…" : "Consulting Graph…") : current || saved ? "Regenerate Insight" : extraReasoning ? "Ask Oracle (Deep Reasoning)" : "Ask Oracle (Use Context Graph)"}
                      </button>
                    </div>
                  );
                })()}
              </div>

            </div>
          </>
        ) : (
          <div className="flex flex-col h-full text-center py-10">
             <h3 className="text-xl font-serif text-amber-200 mb-2">Reading Overview</h3>
             <p className="text-xs text-[#FFFAE3]/60 mb-8 italic">Select a card in the spread to view its extensive insights.</p>
             
             <div className="text-left w-full space-y-6">
                <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                   <h4 className="text-[10px] uppercase tracking-widest text-[#DEB564] mb-1">Querent & Question</h4>
                   <p className="text-[#FFFAE3]/90 text-sm font-medium">{reading.querent}</p>
                   <p className="text-[#FFFAE3]/60 text-sm leading-relaxed mt-1">"{reading.question}"</p>
                </div>
                
                {reading.summary && (
                  <div>
                     <h4 className="text-[10px] uppercase tracking-widest text-[#DEB564]/80 mb-1">Reader's Notes</h4>
                     <p className="text-amber-100/80 text-sm leading-relaxed whitespace-pre-wrap">{reading.summary}</p>
                  </div>
                )}

                {reading.interpretations && Object.entries(reading.interpretations).map(([key, value]) => {
                  // Only display global or large interpretation notes here
                  if (!value || ['past', 'present', 'future', 'challenge', 'above', 'below', 'advice', 'external', 'hopes_fears', 'outcome'].includes(key.toLowerCase())) return null;
                  if (reading.drawnCards.some(c => c.position.id === key || c.position.name === key)) return null;
                  
                  return (
                    <div key={key} className="mt-6">
                      <h4 className="text-[10px] uppercase tracking-widest text-[#DEB564]/80 mb-1">
                        {key === 'spread' ? 'Spread Interpretation' : key === 'combined' ? 'Combined Interpretation' : `Interpretation: ${key}`}
                      </h4>
                      <div className="text-amber-100/90 text-sm leading-relaxed whitespace-pre-wrap bg-white/5 p-4 rounded-lg border border-white/5">
                        <Markdown>{value}</Markdown>
                      </div>
                    </div>
                  );
                })}
                
                <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent my-6"></div>

                <div>
                  <h3 className="text-[10px] uppercase tracking-widest text-[#DEB564]/80 mb-2 border-b border-[#DEB564]/20 pb-2">
                    <span className="flex items-center gap-2">
                      <Sparkles className="w-3 h-3 text-[#DEB564]" /> AI Oracle Insight
                    </span>
                  </h3>
                  
                  {(() => {
                    const cacheKey = `oracle-${reading.id}`;
                    const saved = savedInsights[cacheKey];
                    const current = currentOracleInsight;
                  
                    return (
                      <div className="space-y-4 mt-4">
                        {saved && (
                          <div className="bg-emerald-950/20 rounded-lg p-4 border border-emerald-500/30">
                            <div className="flex items-center justify-between mb-2 pb-2 border-b border-emerald-500/20">
                              <h4 className="text-[10px] uppercase tracking-widest text-emerald-400 flex items-center gap-2">
                                 <Bookmark className="w-3 h-3 fill-emerald-400" /> Saved Archive
                              </h4>
                              <button onClick={() => toggleSaveInsight(cacheKey, saved)} className="text-emerald-400 hover:text-emerald-300 transition-colors" title="Remove from Archives">
                                <Bookmark className="w-4 h-4 fill-emerald-500/20" />
                              </button>
                            </div>
                            <div className="prose prose-invert prose-sm prose-p:leading-relaxed max-w-none text-emerald-100/80">
                               <Markdown>{saved}</Markdown>
                            </div>
                          </div>
                        )}
                        
                        {current && (!saved || current !== saved) && (
                          <div className="bg-[#2a0d4e]/40 rounded-lg p-4 border border-[#DEB564]/20">
                            <div className="flex items-center justify-between mb-2 pb-2 border-b border-[#DEB564]/20">
                              <h4 className="text-[10px] uppercase tracking-widest text-[#DEB564]/80">Fresh Insight</h4>
                              <button onClick={() => toggleSaveInsight(cacheKey, current)} className="text-[#FFFAE3]/40 hover:text-emerald-400 transition-colors" title="Save to Archives">
                                <Bookmark className="w-4 h-4 opacity-50 hover:opacity-100" />
                              </button>
                            </div>
                            <div className="prose prose-invert prose-sm prose-p:leading-relaxed max-w-none text-[#FFFAE3]/90">
                               <Markdown>{current}</Markdown>
                            </div>
                          </div>
                        )}
                        
                        <ExtraReasoningToggle checked={extraReasoning} onToggle={toggleExtraReasoning} />

                        {!allCardsInterpreted && (
                          <div className="text-[10px] text-[#DEB564]/70 bg-[#DEB564]/5 border border-[#DEB564]/20 rounded-md px-3 py-2 text-center">
                            Interpret every card first — {interpretedCount}/{reading.drawnCards.length} done.
                            The whole-spread synthesis builds on each card’s interpretation.
                          </div>
                        )}
                        <button
                          onClick={handleGenerateOracleInsight}
                          disabled={isGenerating || !allCardsInterpreted}
                          title={!allCardsInterpreted ? `Interpret all ${reading.drawnCards.length} cards first (${interpretedCount} done)` : undefined}
                          className="w-full py-4 bg-[#2a0d4e]/60 border border-[#DEB564]/30 text-[#FFFAE3]/90 rounded-lg text-sm hover:bg-[#2a0d4e]/60 transition-all font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                          {isGenerating ? (extraReasoning ? "Reasoning…" : "Synthesizing Insight…") : current || saved ? "Regenerate Insight" : extraReasoning ? "Generate Oracle Insight (Deep Reasoning)" : "Generate Oracle Insight"}
                        </button>
                      </div>
                    );
                  })()}
                </div>
             </div>
          </div>
        )}
      </div>
        
    </section>
  );
}

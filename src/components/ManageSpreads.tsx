import React, { useEffect, useState } from 'react';
import { X, Lock, Plus, Save, Loader2 } from 'lucide-react';
import { fetchSpreads, updateSpread, createSpread, SpreadRow } from '../lib/spreads';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface FormState {
  spreadType: string;   // '' when editing an existing spread (identity comes from selected)
  name: string;
  description: string;
  positionNames: string[];
  locked: boolean;
  isNew: boolean;
}

const NEW_ID = '__new__';

export function ManageSpreads({ open, onClose }: Props) {
  const [spreads, setSpreads] = useState<SpreadRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null); // spreadType | NEW_ID
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setSpreads(await fetchSpreads());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) { setError(null); setSelected(null); setForm(null); void load(); }
  }, [open]);

  const selectSpread = (s: SpreadRow) => {
    setError(null);
    setSelected(s.spreadType);
    const names = s.positionNames.length ? s.positionNames
      : Array.from({ length: s.positionCount }, (_, i) => `Position ${i + 1}`);
    setForm({
      spreadType: '', name: s.name || '', description: s.description || '',
      positionNames: names, locked: s.locked, isNew: false,
    });
  };

  const startNew = () => {
    setError(null);
    setSelected(NEW_ID);
    setForm({ spreadType: '', name: '', description: '', positionNames: ['Position 1'], locked: false, isNew: true });
  };

  const setCardCount = (n: number) => {
    if (!form || form.locked) return;
    const count = Math.max(1, Math.min(32, n || 1));
    const names = Array.from({ length: count }, (_, i) => form.positionNames[i] ?? `Position ${i + 1}`);
    setForm({ ...form, positionNames: names });
  };

  const save = async () => {
    if (!form) return;
    setSaving(true); setError(null);
    try {
      if (form.isNew) {
        if (!form.name.trim()) throw new Error('Name is required');
        await createSpread({
          spreadType: form.name, // server slugifies
          name: form.name.trim(),
          description: form.description,
          positionNames: form.positionNames,
        });
      } else if (selected) {
        await updateSpread(selected, {
          name: form.name.trim(),
          description: form.description,
          positionNames: form.locked ? undefined : form.positionNames,
        });
      }
      await load();
      setSelected(null); setForm(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-4xl h-[80vh] bg-[#0D0D12] border border-[#DEB564]/20 rounded-xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-sm uppercase tracking-widest text-[#DEB564]">Manage Spreads</h2>
          <button onClick={onClose} className="text-[#FFFAE3]/50 hover:text-[#FFFAE3] transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Spread list */}
          <div className="w-64 border-r border-white/10 flex flex-col">
            <div className="flex-1 overflow-y-auto p-2">
              {loading ? (
                <div className="flex items-center justify-center h-24 text-[#FFFAE3]/40"><Loader2 className="w-5 h-5 animate-spin" /></div>
              ) : spreads.map((s) => (
                <button
                  key={s.spreadType}
                  onClick={() => selectSpread(s)}
                  className={`w-full text-left px-3 py-2 rounded-md mb-1 transition-colors ${selected === s.spreadType ? 'bg-[#2a0d4e]/60 border border-[#DEB564]/30' : 'hover:bg-white/5 border border-transparent'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[#FFFAE3]/90 truncate">{s.name || s.spreadType}</span>
                    {s.locked && <Lock className="w-3 h-3 text-[#DEB564]/50 flex-shrink-0" />}
                  </div>
                  <div className="text-[10px] text-[#FFFAE3]/40">{s.positionCount} cards · {s.readingCount} readings</div>
                </button>
              ))}
            </div>
            <button onClick={startNew} className="m-2 py-2 flex items-center justify-center gap-2 text-xs bg-[#DEB564]/10 text-[#DEB564] border border-[#DEB564]/30 rounded-md hover:bg-[#DEB564]/20 transition-colors">
              <Plus className="w-4 h-4" /> New Spread
            </button>
          </div>

          {/* Editor */}
          <div className="flex-1 overflow-y-auto p-6">
            {!form ? (
              <div className="h-full flex items-center justify-center text-[#FFFAE3]/40 text-sm">Select a spread to edit, or create a new one.</div>
            ) : (
              <div className="space-y-5">
                {form.locked && (
                  <div className="flex items-center gap-2 text-[10px] text-[#DEB564]/70 bg-[#DEB564]/5 border border-[#DEB564]/20 rounded-md px-3 py-2">
                    <Lock className="w-3 h-3" /> This spread has readings — card count and position names are locked. Description stays editable.
                  </div>
                )}
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-[#DEB564]/80 mb-1">Name</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full bg-black/40 border border-white/20 rounded-md p-2 text-sm text-[#FFFAE3]/90 focus:outline-none focus:border-[#DEB564]/50" />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-[#DEB564]/80 mb-1"># of Cards</label>
                  <input type="number" min={1} max={32} value={form.positionNames.length} disabled={form.locked}
                    onChange={(e) => setCardCount(parseInt(e.target.value, 10))}
                    className="w-24 bg-black/40 border border-white/20 rounded-md p-2 text-sm text-[#FFFAE3]/90 focus:outline-none focus:border-[#DEB564]/50 disabled:opacity-40 disabled:cursor-not-allowed" />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-[#DEB564]/80 mb-1">Position Names</label>
                  <div className="space-y-2">
                    {form.positionNames.map((pn, i) => (
                      <input key={i} value={pn} disabled={form.locked}
                        onChange={(e) => {
                          const names = [...form.positionNames]; names[i] = e.target.value; setForm({ ...form, positionNames: names });
                        }}
                        className="w-full bg-black/40 border border-white/20 rounded-md p-2 text-sm text-[#FFFAE3]/90 focus:outline-none focus:border-[#DEB564]/50 disabled:opacity-40 disabled:cursor-not-allowed" />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-[#DEB564]/80 mb-1">Description (Spread Detail)</label>
                  <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full min-h-[140px] bg-black/40 border border-white/20 rounded-md p-2 text-sm text-[#FFFAE3]/90 leading-relaxed resize-y focus:outline-none focus:border-[#DEB564]/50" />
                  <p className="text-[10px] text-[#FFFAE3]/40 mt-1">Included in the whole-reading Oracle & Trend interpretations for this spread.</p>
                </div>
                {error && <div className="text-xs text-red-400">{error}</div>}
                <button onClick={save} disabled={saving}
                  className="w-full py-3 bg-[#2a0d4e]/60 border border-[#DEB564]/30 text-[#FFFAE3]/90 rounded-lg text-xs hover:bg-[#2a0d4e]/80 transition-all font-medium flex items-center justify-center gap-2 disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {form.isNew ? 'Create Spread' : 'Save Changes'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

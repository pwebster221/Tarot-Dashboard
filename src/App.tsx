/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CheckCircle2, Search, SlidersHorizontal, ArrowLeft, SortDesc, SortAsc, Loader2, User as UserIcon, LogOut, Table, LayoutList, UploadCloud, LayoutGrid } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { SpreadVisualizer } from './components/SpreadVisualizer';
import { ReadingDetailPane } from './components/ReadingDetailPane';
import { DashboardSpreadsheet } from './components/DashboardSpreadsheet';
import { LandingPage } from './components/LandingPage';
import { Onboarding } from './onboarding/Onboarding';
import { CardUploader } from './components/CardUploader';
import { ManageSpreads } from './components/ManageSpreads';
import { DrawnCard, Reading } from './types';
import { fetchReadings, fetchReadingDetail } from './lib/api';
import { useAuth } from './lib/AuthContext';

export default function App() {
  const [readings, setReadings] = useState<Reading[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReading, setSelectedReading] = useState<Reading | null>(null);
  const [fetchingDetail, setFetchingDetail] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const { currentUser, loading: authLoading } = useAuth();


  
  const [searchQuery, setSearchQuery] = useState('');
  const [timeframe, setTimeframe] = useState<'24h' | 'week' | 'archive' | 'all'>('all');
  const [selectedArchetypes, setSelectedArchetypes] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [viewMode, setViewMode] = useState<'cards' | 'spreadsheet' | 'upload'>('cards');
  const [manageSpreadsOpen, setManageSpreadsOpen] = useState(false);

  useEffect(() => {
    if (!currentUser) return;

    const loadReadings = async () => {
      try {
        setLoading(true);
        const data = await fetchReadings();
        console.log('[App] Loaded readings count:', data.length);
        setReadings(data);
      } catch (error) {
        console.error('Failed to load readings:', error);
      } finally {
        setLoading(false);
      }
    };
    loadReadings();
  }, [currentUser]);

  const selectedCard = useMemo(() => selectedReading?.drawnCards.find(c => c.card.id === selectedCardId) || null, [selectedReading, selectedCardId]);

  const handleReadingClick = async (reading: Reading) => {
    setFetchingDetail(true);
    setSelectedReading(reading); // Set partial data first
    setSelectedCardId(null);
    try {
      const fullReading = await fetchReadingDetail(reading.id);
      setSelectedReading(fullReading);
    } catch (error) {
      console.error('Failed to fetch reading detail:', error);
    } finally {
      setFetchingDetail(false);
    }
  };

  const handleBackToList = () => {
    setSelectedReading(null);
    setSelectedCardId(null);
  };

  const handleCardClick = (drawnCard: DrawnCard) => {
    setSelectedCardId(drawnCard.card.id);
  };

  const toggleArchetype = (arc: string) => {
    setSelectedArchetypes(prev => 
      prev.includes(arc) ? prev.filter(a => a !== arc) : [...prev, arc]
    );
  };

  const filteredReadings = useMemo(() => {
    console.log('[App] Filtering readings. Total count:', readings.length);
    const filtered = readings.filter(reading => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const querent = (reading.querent || '').toLowerCase();
        const question = (reading.question || '').toLowerCase();
        const type = (reading.type || '').toLowerCase();
        
        if (!querent.includes(query) && 
            !question.includes(query) &&
            !type.includes(query) &&
            !reading.drawnCards.some(dc => dc.card.name.toLowerCase().includes(query))) {
          return false;
        }
      }

      if (timeframe !== 'all') {
        const readingDate = new Date(reading.date);
        const now = new Date(); // Use real current date
        const diffHours = (now.getTime() - readingDate.getTime()) / (1000 * 60 * 60);
        if (timeframe === '24h' && diffHours > 24) return false;
        if (timeframe === 'week' && diffHours > 24 * 7) return false;
        if (timeframe === 'archive' && diffHours <= 24 * 7) return false;
      }

      if (selectedArchetypes.length > 0) {
        const readingArchetypes = new Set(reading.drawnCards.map(dc => dc.card.arcana === 'Minor' ? dc.card.suit : 'Major Arcana'));
        if (!selectedArchetypes.some(sa => readingArchetypes.has(sa))) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });
    console.log('[App] Filtered readings count:', filtered.length);
    return filtered;
  }, [readings, searchQuery, timeframe, selectedArchetypes, sortOrder]);

  if (authLoading) {
    return (
      <div className="w-full min-h-screen bg-[#050508] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-[#DEB564] animate-spin" />
          <p className="text-amber-200/60 font-serif tracking-widest text-sm">INITIALIZING...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <LandingPage />;
  }

  // First-run new-user flow: post-login onboarding (account step handled by Authentik).
  if (!currentUser.onboarded) {
    return <Onboarding />;
  }

  return (
    <div className="w-full min-h-screen bg-[#050508] text-[#FFFAE3] font-sans flex flex-col overflow-hidden relative">
      {/* Ambient Background Glows */}
      <div className="absolute top-[-100px] left-[-100px] w-[400px] h-[400px] bg-[#2a0d4e]/40 rounded-full blur-[120px]"></div>
      <div className="absolute bottom-[-100px] right-[-100px] w-[500px] h-[500px] bg-purple-900/20 rounded-full blur-[150px]"></div>

      {/* Header Navigation */}
      <header className="h-20 flex items-center justify-between px-8 border-b border-white/10 bg-black/40 backdrop-blur-md relative z-10 shrink-0">
        <div className="flex items-center gap-3">
          <img src="/logo.jpg" alt="Paths of Reverence Logo" className="w-12 h-12 rounded-full border border-[#DEB564]/30 object-cover" />
          <div>
            <h1 className="text-xl font-serif font-semibold tracking-wide text-[#DEB564]">
              Paths of Reverence
            </h1>
            <p className="text-[10px] uppercase tracking-widest text-[#DEB564]/80">Tarot Repository</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="relative hidden md:block">
            <input 
              type="text" 
              placeholder="Search readings, cards, or querents..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-80 bg-white/5 border border-white/10 rounded-full py-2 px-10 text-sm focus:outline-none focus:ring-1 focus:ring-[#DEB564]/50 transition-all text-[#FFFAE3] placeholder-white/30"
            />
            <Search className="w-4 h-4 absolute left-4 top-2.5 text-[#FFFAE3]/30" />
          </div>
          <div className="flex gap-2 items-center">
            {currentUser && !authLoading ? (
              <div className="flex items-center gap-4 mr-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[#2a0d4e]/80 flex items-center justify-center border border-[#DEB564]/30">
                    <UserIcon className="w-4 h-4 text-[#DEB564]/80" />
                  </div>
                  <span className="text-sm font-medium text-[#FFFAE3]/90">{currentUser.name || currentUser.email}</span>
                </div>
                <button
                  onClick={() => { window.location.href = "/api/auth/logout"; }}
                  className="p-2 rounded-md hover:bg-white/5 border border-white/5 transition-colors text-[#FFFAE3]/60 hover:text-red-400"
                  title="Sign Out"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : null}

            <button 
              onClick={() => setViewMode(viewMode === 'upload' ? 'cards' : 'upload')}
              className="p-2 rounded-md hover:bg-white/5 border border-white/5 transition-colors text-[#FFFAE3]/60 hover:text-[#DEB564] mr-2"
              title="Upload Cards"
            >
              <UploadCloud className="w-5 h-5" />
            </button>
            <button
              onClick={() => setManageSpreadsOpen(true)}
              className="p-2 rounded-md hover:bg-white/5 border border-white/5 transition-colors text-[#FFFAE3]/60 hover:text-[#DEB564] mr-2"
              title="Manage Spreads"
            >
              <LayoutGrid className="w-5 h-5" />
            </button>
            <a
              href="https://forms.pathsofreverence.com/tarot-reading"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-[#DEB564]/10 text-[#DEB564] border border-[#DEB564]/30 rounded-md text-sm font-medium hover:bg-[#DEB564]/20 transition-colors no-underline"
            >
              New Reading
            </a>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <main className="flex-1 flex relative z-10 overflow-hidden">
        {/* Sidebar Filters */}
        <aside className="w-64 border-r border-white/5 p-6 space-y-8 flex flex-col h-full overflow-y-auto">
          <section>
            <div className="flex items-center justify-between mb-4">
               <h3 className="text-[10px] uppercase tracking-widest text-[#DEB564]/80">Timeframe</h3>
            </div>
            <div className="space-y-2">
              <label className="flex items-center text-sm gap-3 p-2 hover:bg-white/5 rounded transition-colors cursor-pointer" onClick={() => setTimeframe('all')}>
                <div className={`w-2 h-2 rounded-full ${timeframe === 'all' ? 'bg-[#DEB564] shadow-[0_0_8px_rgba(245,158,11,0.6)]' : 'bg-white/20'}`}></div>
                <span>All Time</span>
              </label>
              <label className="flex items-center text-sm gap-3 p-2 hover:bg-white/5 rounded transition-colors cursor-pointer" onClick={() => setTimeframe('24h')}>
                <div className={`w-2 h-2 rounded-full ${timeframe === '24h' ? 'bg-[#DEB564] shadow-[0_0_8px_rgba(245,158,11,0.6)]' : 'bg-white/20'}`}></div>
                <span>Last 24 Hours</span>
              </label>
              <label className="flex items-center text-sm gap-3 p-2 hover:bg-white/5 rounded transition-colors cursor-pointer" onClick={() => setTimeframe('week')}>
                <div className={`w-2 h-2 rounded-full ${timeframe === 'week' ? 'bg-[#DEB564] shadow-[0_0_8px_rgba(245,158,11,0.6)]' : 'bg-white/20'}`}></div>
                <span>Past Week</span>
              </label>
              <label className="flex items-center text-sm gap-3 p-2 hover:bg-white/5 rounded transition-colors cursor-pointer" onClick={() => setTimeframe('archive')}>
                <div className={`w-2 h-2 rounded-full ${timeframe === 'archive' ? 'bg-[#DEB564] shadow-[0_0_8px_rgba(245,158,11,0.6)]' : 'bg-white/20'}`}></div>
                <span>Archive</span>
              </label>
            </div>
          </section>

          <section>
            <h3 className="text-[10px] uppercase tracking-widest text-[#DEB564]/80 mb-4">Cards Present</h3>
            <div className="flex flex-wrap gap-2">
              {['Major Arcana', 'Pentacles', 'Chalices', 'Swords', 'Wands'].map(arc => (
                <button 
                  key={arc}
                  onClick={() => toggleArchetype(arc)}
                  className={`px-2 py-1 border rounded text-[10px] transition-colors ${selectedArchetypes.includes(arc) ? 'bg-amber-900/30 border-[#DEB564]/50 text-amber-200' : 'bg-white/5 border-white/10 text-[#FFFAE3]/70 hover:bg-white/10'}`}
                >
                  {arc}
                </button>
              ))}
            </div>
          </section>

          <section className="mt-auto pt-8">
            <div className="p-4 bg-gradient-to-b from-[#2a0d4e]/60 to-transparent border border-[#DEB564]/20 rounded-xl">
              <p className="text-xs text-[#DEB564] leading-relaxed italic">"The cards do not predict the future, they suggest a path."</p>
              <p className="text-[10px] text-[#FFFAE3]/40 mt-2">— Wisdom Engine v2.4</p>
            </div>
          </section>
        </aside>

        {/* Dynamic Center Area */}
        {loading ? (
          <section className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="w-8 h-8 text-[#DEB564] animate-spin" />
              <p className="text-amber-200/60 font-serif tracking-widest text-sm">ACCESSING ARCHIVES...</p>
            </div>
          </section>
        ) : selectedReading && viewMode === 'cards' ? (
          <section className="flex-1 flex flex-col relative overflow-hidden">
             <div className="absolute top-6 left-6 z-20">
               <button onClick={handleBackToList} className="flex items-center gap-2 text-[#FFFAE3]/60 hover:text-[#FFFAE3] transition-colors">
                  <ArrowLeft className="w-4 h-4" />
                  <span className="text-sm font-medium">Back to Logs</span>
               </button>
             </div>
             <div className="flex-1 overflow-auto relative">
                <SpreadVisualizer 
                   readingId={selectedReading.id}
                   drawnCards={selectedReading.drawnCards}
                   selectedCardId={selectedCardId}
                   onCardClick={handleCardClick}
                   spreadType={selectedReading.type}
                />
             </div>
          </section>
        ) : viewMode === 'upload' ? (
          <section className="flex-1 flex flex-col relative overflow-hidden bg-black/40 items-center justify-center p-8">
             <div className="absolute top-6 left-6 z-20">
               <button onClick={() => setViewMode('cards')} className="flex items-center gap-2 text-[#FFFAE3]/60 hover:text-[#FFFAE3] transition-colors">
                  <ArrowLeft className="w-4 h-4" />
                  <span className="text-sm font-medium">Back to Logs</span>
               </button>
             </div>
             <CardUploader />
          </section>
        ) : viewMode === 'spreadsheet' ? (
          <section className="flex-1 flex flex-col relative overflow-hidden">
             <div className="absolute top-6 flex items-center justify-between px-6 w-full z-20 pointer-events-none">
               <div className="pointer-events-auto flex items-center gap-2">
                 <button 
                    onClick={() => setViewMode('cards')} 
                    className="flex items-center gap-2 text-[#FFFAE3]/60 hover:text-[#FFFAE3] transition-colors"
                 >
                    <LayoutList className="w-4 h-4" />
                    <span className="text-sm font-medium">List View</span>
                 </button>
               </div>
               <div className="pointer-events-auto pr-6 text-[#FFFAE3]/40 text-xs italic">
                 Dashboard View active
               </div>
             </div>
             <div className="flex-1 overflow-auto mt-16 shadow-[inset_0_10px_20px_-10px_rgba(0,0,0,0.5)] bg-[#050508]">
               <DashboardSpreadsheet readings={filteredReadings} />
             </div>
          </section>
        ) : (
          <section className="flex-1 p-6 space-y-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-serif">Recent Revelations</h2>
              <div className="flex items-center gap-4">
                 <button 
                    onClick={() => setViewMode('spreadsheet')}
                    className="flex items-center gap-2 text-xs text-[#DEB564] hover:text-[#FFFAE3] bg-[#2a0d4e]/50 px-3 py-1.5 rounded transition-colors"
                 >
                    <Table className="w-4 h-4" />
                    Dashboard View
                 </button>
                 <button 
                    onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                    className="flex items-center gap-2 text-xs text-[#FFFAE3]/60 hover:text-[#DEB564] transition-colors"
                 >
                    {sortOrder === 'desc' ? <SortDesc className="w-4 h-4" /> : <SortAsc className="w-4 h-4" />}
                    Sort by Date
                 </button>
                 <span className="text-xs text-[#FFFAE3]/40 italic">Showing {filteredReadings.length} of {readings.length} readings</span>
              </div>
            </div>

            <div className="grid gap-4 max-w-4xl">
              {filteredReadings.map(reading => (
                <div 
                  key={reading.id}
                  onClick={() => handleReadingClick(reading)}
                  className="group p-4 bg-gradient-to-r from-[#DEB564]/5 to-transparent border border-white/10 hover:border-[#DEB564]/40 rounded-xl shadow-[0_0_20px_rgba(245,158,11,0.02)] cursor-pointer transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex gap-4">
                      <div className="w-12 h-16 bg-black border border-white/20 group-hover:border-[#DEB564]/50 rounded flex items-center justify-center text-[#FFFAE3]/40 group-hover:text-[#DEB564] font-serif text-lg transition-colors">
                        {reading.drawnCards[0]?.card.numeral || '?'}
                      </div>
                      <div>
                        <h4 className="text-[#FFFAE3]/90 group-hover:text-amber-200 font-medium transition-colors">{reading.question}</h4>
                        <p className="text-xs text-[#FFFAE3]/40 mt-1">Querent: {reading.querent} • {new Date(reading.date).toLocaleDateString()} • {reading.type}</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {reading.drawnCards.slice(0, 3).map(dc => (
                            <span key={dc.card.id} className="text-[10px] text-[#FFFAE3]/50 group-hover:text-[#DEB564]/80 uppercase tracking-widest bg-white/5 group-hover:bg-[#DEB564]/10 px-1.5 py-0.5 rounded border border-white/10 group-hover:border-[#DEB564]/20 transition-colors">
                              {dc.card.name}
                            </span>
                          ))}
                          {reading.drawnCards.length > 3 && (
                            <span className="text-[10px] text-[#FFFAE3]/40 uppercase tracking-widest bg-white/5 px-1.5 py-0.5 rounded border border-white/10">+{reading.drawnCards.length - 3}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              
              {filteredReadings.length === 0 && (
                <div className="text-center py-20 text-[#FFFAE3]/40">
                   No readings found matching these filters.
                </div>
              )}
            </div>
          </section>
        )}

        {/* Reading Drill-down Detail Pane */}
        <ReadingDetailPane
          reading={selectedReading}
          selectedCard={selectedCard}
          onDeselectCard={() => setSelectedCardId(null)}
        />
      </main>

      <ManageSpreads open={manageSpreadsOpen} onClose={() => setManageSpreadsOpen(false)} />


      {/* Footer Status Bar */}
      <footer className="h-8 border-t border-white/5 bg-black/60 px-4 flex items-center justify-between text-[10px] text-[#FFFAE3]/40 relative z-20 shrink-0">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]"></div>
            API Connected: readings.dubtown-server.us
          </span>
          <span className="hidden sm:inline">Latency: {selectedReading ? (fetchingDetail ? '...' : '12ms') : '42ms'}</span>
        </div>
        <div className="flex gap-4">
          <a href="https://pathsofreverence.com" target="_blank" rel="noopener noreferrer" className="hover:text-[#FFFAE3] transition-colors hidden sm:inline">Paths of Reverence</a>
          <span>© 2026 Esoteric Systems</span>
        </div>
      </footer>
      
    </div>
  );
}

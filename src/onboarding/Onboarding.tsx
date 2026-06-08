/* Onboarding.tsx — the post-login first-run experience.

   "One skeleton, two lenses": the Archetypal (warm/professional) and Mystical
   (tarot/ceremony) lenses share the same Welcome → Profile → Readings → Library
   skeleton, switchable live. Account creation already happened in Authentik
   (the invitation-only enrollment flow), so both lenses open at Welcome with the
   account stage shown pre-completed.

   On finish, the chosen lens + collected profile are persisted via
   POST /api/onboarding/complete; AuthContext.refresh() then flips
   currentUser.onboarded → true and App drops into the dashboard. */

import React from 'react';
import { useAuth } from '../lib/AuthContext';
import { T, useIsCompact, ILogout } from './primitives';
import { ArchetypalLens } from './ArchetypalLens';
import { MysticalLens } from './MysticalLens';

type Lens = 'archetypal' | 'mystical';
type CompletePayload = { lens: Lens; displayName?: string; birthDate?: string; birthTime?: string; birthPlace?: string };

// account creation is handled by Authentik upstream; the in-app tour opens at Welcome
const START_STEP = 1;

export function Onboarding() {
  const { currentUser, refresh } = useAuth();
  const compact = useIsCompact();
  const [lens, setLens] = React.useState<Lens>((currentUser?.lens as Lens) || 'archetypal');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const initialName = currentUser?.name || currentUser?.displayName || '';

  const handleComplete = async (payload: CompletePayload) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, lens }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await refresh();
      // refresh() flips currentUser.onboarded → App unmounts this component.
    } catch (e) {
      console.error('[onboarding] complete failed:', e);
      setError('Could not save your setup — please try again.');
      setSubmitting(false);
    }
  };

  const LensComponent = lens === 'mystical' ? MysticalLens : ArchetypalLens;

  // lens switch — two pills, floated top-right above the lens chrome
  const pill = (active: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
    fontFamily: T.sans, fontSize: 12, fontWeight: 600, letterSpacing: '0.02em',
    border: `1px solid ${active ? T.goldBorder : 'rgba(255,255,255,0.10)'}`,
    background: active ? 'rgba(222,181,100,0.16)' : 'rgba(255,255,255,0.03)',
    color: active ? T.gold : T.slate4,
    transition: `all .2s ${T.ease}`,
  });

  return (
    <div style={{ position: 'fixed', inset: 0, width: '100%', height: '100vh', overflow: 'hidden', background: T.ground }}>
      {/* lens switch + sign out */}
      <div style={{ position: 'absolute', top: compact ? 8 : 16, right: compact ? 8 : 20, zIndex: 50, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, padding: 4, borderRadius: 999, background: 'rgba(10,10,16,0.6)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', border: `1px solid ${T.borderSoft}` }}>
          <button onClick={() => setLens('archetypal')} style={pill(lens === 'archetypal')} aria-pressed={lens === 'archetypal'}>
            <span aria-hidden>△</span> Archetypal
          </button>
          <button onClick={() => setLens('mystical')} style={pill(lens === 'mystical')} aria-pressed={lens === 'mystical'}>
            <span aria-hidden>☾</span> Mystical
          </button>
        </div>
        <button
          onClick={() => { window.location.href = '/api/auth/logout'; }}
          title="Sign out"
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 999, cursor: 'pointer', background: 'rgba(10,10,16,0.6)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', border: `1px solid ${T.borderSoft}`, color: T.slate4 }}
        >
          <ILogout size={16} />
        </button>
      </div>

      <LensComponent
        compact={compact}
        startStep={START_STEP}
        initialName={initialName}
        onComplete={handleComplete}
      />

      {/* submit/error overlay */}
      {(submitting || error) && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 60, display: 'flex', justifyContent: 'center', padding: 16, pointerEvents: 'none' }}>
          <div style={{ pointerEvents: 'auto', fontFamily: T.sans, fontSize: 13, padding: '10px 18px', borderRadius: 12, background: error ? 'rgba(60,12,12,0.85)' : 'rgba(10,10,16,0.85)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', border: `1px solid ${error ? 'rgba(248,113,113,0.4)' : T.goldBorder}`, color: error ? '#fca5a5' : T.cream }}>
            {error || 'Saving your setup…'}
          </div>
        </div>
      )}
    </div>
  );
}

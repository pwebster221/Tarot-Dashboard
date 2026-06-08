/* MysticalLens.tsx — Lens 1 · "The Mystical Lens"
   Ported from the Claude Design handoff (lens-mystical.jsx). B + C combined:
   the progressing orbital ring AND the tutorial five-card spread, side by side,
   both advancing per step. Tarot/mystical voice.

   Integration deltas from the mockup:
   - `startStep`/account-done: account creation happens in Authentik before this
     renders, so the first stage (Mercury · The Fool) shows pre-completed and the
     panel opens at Welcome.
   - birth fields wired to state; `onComplete` fires on the final "Enter the
     Repository" button with the collected profile + chosen lens. */

import React from 'react';
import {
  T, prefersReduced, fade, Logo, Eyebrow, Wordmark, Starfield, AmbientGlows,
  GoldButton, GhostButton, TextButton, Field,
  IUser, IMail, ILock, IArrow, IBack, IShield, ICal, IClock, IPin,
  ISpark, IEye, ILayers, ISearch,
} from './primitives';

export function MysticalLens({ compact, startStep = 0, initialName = '', onComplete }: any) {
  const [step, setStep] = React.useState(startStep);
  const [done, setDone] = React.useState(false);
  const [name, setName] = React.useState(initialName);
  const [addBirth, setAddBirth] = React.useState(false);
  const [birthDate, setBirthDate] = React.useState('');
  const [birthTime, setBirthTime] = React.useState('');
  const [birthPlace, setBirthPlace] = React.useState('');

  // each stage = a planetary node (the seven paths) AND a Major Arcana card
  const STAGES = [
    { glyph: '☿', planet: 'Mercury', role: 'The Messenger', num: '0', card: 'The Fool', face: '#1b1430', label: 'Enter' },
    { glyph: '☉', planet: 'Sun', role: 'The Heart', num: 'I', card: 'The Magician', face: '#1d1726', label: 'Welcome' },
    { glyph: '☾', planet: 'Moon', role: 'The Self', num: 'II', card: 'High Priestess', face: '#101a26', label: 'Profile' },
    { glyph: '♃', planet: 'Jupiter', role: 'The Guide', num: 'X', card: 'Wheel of Fortune', face: '#1e1726', label: 'Reading' },
    { glyph: '♄', planet: 'Saturn', role: 'The Keeper', num: 'XVII', card: 'The Star', face: '#101e22', label: 'Archive' },
  ];
  const total = STAGES.length;
  const next = () => setStep((s: number) => Math.min(s + 1, total - 1));
  const back = () => setStep((s: number) => Math.max(s - 1, startStep));
  const reader = name.trim() || 'Reader';
  const prog = done ? 1 : step / (total - 1);
  const finish = () => onComplete && onComplete({ lens: 'mystical', displayName: name.trim(), birthDate, birthTime, birthPlace });

  /* orbital ring */
  const OrbitMap = ({ S = 270 }: any) => {
    const c = S / 2, R = S * 0.36, C = 2 * Math.PI * R;
    const pt = (k: number, rr: number) => { const a = (-90 + k * (360 / total)) * (Math.PI / 180); return [c + rr * Math.cos(a), c + rr * Math.sin(a)]; };
    return (
      <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} style={{ overflow: 'visible' }}>
        <defs><radialGradient id="mlCore" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="rgba(222,181,100,0.35)" /><stop offset="100%" stopColor="rgba(222,181,100,0)" /></radialGradient></defs>
        <circle cx={c} cy={c} r={R + 22} fill="none" stroke="rgba(255,255,255,0.05)" />
        <circle cx={c} cy={c} r={R} fill="none" stroke="rgba(255,255,255,0.10)" />
        <circle cx={c} cy={c} r={R} fill="none" stroke={T.gold} strokeWidth="1.6" strokeLinecap="round" strokeDasharray={`${prog * C} ${C}`} transform={`rotate(-90 ${c} ${c})`} style={{ transition: prefersReduced ? 'none' : `stroke-dasharray .7s ${T.ease}`, filter: 'drop-shadow(0 0 5px rgba(222,181,100,0.5))' }} />
        <circle cx={c} cy={c} r={40} fill="url(#mlCore)" />
        {STAGES.map((n, k) => {
          const [x, y] = pt(k, R); const reached = done || k <= step; const active = !done && k === step;
          const [lx, ly] = pt(k, R + 26);
          return (
            <g key={k}>
              <circle cx={x} cy={y} r={active ? 15 : 11} fill={reached ? 'rgba(222,181,100,0.14)' : 'rgba(255,255,255,0.03)'} stroke={reached ? T.gold : 'rgba(255,255,255,0.2)'} strokeWidth={active ? 1.6 : 1} style={{ transition: `all .3s ${T.ease}`, ...(active && !prefersReduced ? { animation: `arcPulse 3.5s ${T.ease} infinite` } : {}) }} />
              <text x={x} y={y} dy="0.35em" textAnchor="middle" style={{ fontFamily: T.serif, fontSize: active ? 15 : 12, fill: reached ? T.gold : 'rgba(255,255,255,0.35)', transition: 'all .3s' }}>{n.glyph}</text>
              <text x={lx} y={ly} dy="0.35em" textAnchor={Math.abs(lx - c) < 6 ? 'middle' : (lx > c ? 'start' : 'end')} style={{ fontFamily: T.sans, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', fill: reached ? 'rgba(255,250,227,0.65)' : 'rgba(255,255,255,0.22)', transition: 'all .3s' }}>{n.label}</text>
            </g>
          );
        })}
        <foreignObject x={c - 22} y={c - 22} width="44" height="44"><div style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Logo size={38} glow /></div></foreignObject>
      </svg>
    );
  };

  /* tutorial spread — crossfade/rotate reveal (no backface dependency) */
  const FlipCard = ({ idx, w, h }: any) => {
    const flipped = idx <= step || done; const active = idx === step && !done; const c = STAGES[idx];
    const tr = prefersReduced ? 'opacity .3s' : `opacity .4s ${T.ease}, transform .55s ${T.ease}`;
    return (
      <div style={{ width: w, height: h, position: 'relative', perspective: 700, flexShrink: 0 }}>
        {/* back */}
        <div style={{ position: 'absolute', inset: 0, borderRadius: 8, background: 'repeating-linear-gradient(45deg,#120f1d,#120f1d 5px,#16121f 5px,#16121f 10px)', border: '1.5px solid rgba(222,181,100,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: flipped ? 0 : 1, transform: `rotateY(${flipped ? -90 : 0}deg)`, transformOrigin: 'center', transition: tr }}>
          <span style={{ color: T.goldDim, fontSize: w * 0.32 }}>✦</span>
        </div>
        {/* face */}
        <div style={{ position: 'absolute', inset: 0, borderRadius: 8, background: `radial-gradient(120% 90% at 50% 0%, ${c.face} 0%, #0D0D12 75%)`, border: `1.5px solid ${active ? T.gold : 'rgba(255,255,255,0.18)'}`, boxShadow: active ? '0 0 20px rgba(222,181,100,0.4)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: flipped ? 1 : 0, transform: `rotateY(${flipped ? 0 : 90}deg)`, transformOrigin: 'center', transition: `${tr}${prefersReduced ? '' : ` ${flipped ? '.15s' : '0s'}`}, border .3s, box-shadow .3s` }}>
          <div style={{ fontFamily: T.serif, fontSize: w * 0.34, color: active ? T.gold : 'rgba(222,181,100,0.5)' }}>{c.num}</div>
          <div style={{ position: 'absolute', bottom: 6, left: 0, right: 0, textAlign: 'center', fontFamily: T.sans, fontSize: 7, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.amber200, opacity: 0.9, whiteSpace: 'nowrap', overflow: 'hidden' }}>{c.card}</div>
        </div>
      </div>
    );
  };

  const S = STAGES[step];
  const glass: React.CSSProperties = { background: 'rgba(10,10,16,0.66)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', border: `1px solid ${T.border}`, borderRadius: 20 };

  let panel;
  if (done) {
    panel = (<Swap k="done">
      <Eyebrow>The spread is complete · the orbit closed</Eyebrow>
      <h2 style={{ fontFamily: T.serif, fontSize: compact ? 26 : 30, color: T.cream, margin: '8px 0 12px', lineHeight: 1.1 }}>Five cards, one cycle.</h2>
      <p style={{ fontFamily: T.sans, fontSize: 14, lineHeight: 1.7, color: T.slate4, marginBottom: 24 }}>Welcome, {reader}. The cards drawn here were only an introduction — the readings you keep from now on are your own. The repository is open.</p>
      <GoldButton full icon={<IArrow size={17} />} onClick={finish}>Enter the Repository</GoldButton>
      <div style={{ marginTop: 12, textAlign: 'center' }}><TextButton onClick={() => { setDone(false); setStep(startStep); }}>Lay the spread again</TextButton></div>
    </Swap>);
  } else if (step === 0) {
    panel = (<Swap k="0">
      <Eyebrow>{S.glyph} {S.planet} · {S.card}</Eyebrow>
      <h2 style={{ fontFamily: T.serif, fontSize: 28, color: T.cream, margin: '7px 0 16px' }}>Register as Reader</h2>
      <GhostButton full lead={<IShield size={18} />} style={{ padding: '13px 20px', fontWeight: 600 }}>Continue with Authentik</GhostButton>
      <div style={{ fontFamily: T.sans, fontSize: 11, color: T.slate5, textAlign: 'center', margin: '8px 0 16px' }}>One identity across the Paths of Reverence</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}><div style={{ flex: 1, height: 1, background: T.border }} /><span style={{ fontFamily: T.sans, fontSize: 11, color: T.slate5 }}>or by email</span><div style={{ flex: 1, height: 1, background: T.border }} /></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Reader Name" icon={<IUser size={17} />} value={name} onChange={setName} placeholder="E.g. The Oracle" />
        <Field label="Email" icon={<IMail size={17} />} value="" onChange={() => {}} placeholder="reader@pathsofreverence.com" />
        <Field label="Password" type="password" icon={<ILock size={17} />} value="" onChange={() => {}} placeholder="••••••••" />
      </div>
    </Swap>);
  } else if (step === 1) {
    panel = (<Swap k="1">
      <Eyebrow>{S.glyph} {S.planet} · {S.card}</Eyebrow>
      <h2 style={{ fontFamily: T.serif, fontSize: 28, color: T.cream, margin: '7px 0 12px' }}>One archive, fully searchable</h2>
      <p style={{ fontFamily: T.sans, fontSize: 13.5, lineHeight: 1.65, color: T.slate4, marginBottom: 20 }}>The Magician keeps every tool within reach. So does the dashboard: each spread you draw, the meaning of every card in its place, and the interpretation that follows — held together and searchable.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
        {[[<ILayers size={18} />, 'A searchable archive', 'Filter by timeframe, querent, or the cards present.'], [<IEye size={18} />, 'Card-by-card meaning', 'Open any spread and read each position on its own.'], [<ISpark size={18} />, 'Repository synthesis', 'Insight drawn across the whole spread from cross-tradition sources.']].map(([ic, t, b]: any, i: number) => (
          <div key={i} style={{ display: 'flex', gap: 13, alignItems: 'flex-start' }}><div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(222,181,100,0.10)', border: `1px solid ${T.goldBorder}`, color: T.gold, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{ic}</div><div><div style={{ fontFamily: T.sans, fontWeight: 600, fontSize: 13.5, color: T.cream }}>{t}</div><div style={{ fontFamily: T.sans, fontSize: 12.5, lineHeight: 1.5, color: T.slate4, marginTop: 1 }}>{b}</div></div></div>
        ))}
      </div>
    </Swap>);
  } else if (step === 2) {
    panel = (<Swap k="2">
      <Eyebrow>{S.glyph} {S.planet} · {S.card}</Eyebrow>
      <h2 style={{ fontFamily: T.serif, fontSize: 28, color: T.cream, margin: '7px 0 8px' }}>The reader, and the chart</h2>
      <p style={{ fontFamily: T.sans, fontSize: 13, lineHeight: 1.55, color: T.slate4, marginBottom: 16 }}>The High Priestess knows the value of what is named. Your reader name marks every reading as yours; birth details — if you give them — root each interpretation in your natal chart: not the snapshot of a single moment, but a living record of everything you have moved through since.</p>
      <Field label="Reader Name" icon={<IUser size={17} />} value={name} onChange={setName} placeholder="E.g. The Oracle" style={{ marginBottom: 14 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', cursor: 'pointer' }} onClick={() => setAddBirth((v: boolean) => !v)}>
        <div style={{ fontFamily: T.sans, fontSize: 13, color: T.cream }}>Add birth details <span style={{ color: T.slate5, fontStyle: 'italic' }}>· optional</span></div>
        <div style={{ width: 40, height: 23, borderRadius: 12, background: addBirth ? T.gold : 'rgba(255,255,255,0.12)', position: 'relative', transition: 'background .25s', flexShrink: 0 }}><div style={{ position: 'absolute', top: 2.5, left: addBirth ? 19 : 2.5, width: 18, height: 18, borderRadius: '50%', background: addBirth ? T.ink : '#fff', transition: `left .25s ${T.ease}` }} /></div>
      </div>
      {addBirth && (<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11, marginTop: 6, ...fade() }}>
        <Field label="Birth date" icon={<ICal size={16} />} value={birthDate} onChange={setBirthDate} placeholder="MM / DD / YYYY" />
        <Field label="Birth time" icon={<IClock size={16} />} value={birthTime} onChange={setBirthTime} placeholder="07:34 AM" />
        <Field label="Birth place" icon={<IPin size={16} />} value={birthPlace} onChange={setBirthPlace} placeholder="City, region" style={{ gridColumn: '1 / -1' }} />
      </div>)}
    </Swap>);
  } else if (step === 3) {
    panel = (<Swap k="3">
      <Eyebrow>{S.glyph} {S.planet} · {S.card}</Eyebrow>
      <h2 style={{ fontFamily: T.serif, fontSize: 28, color: T.cream, margin: '7px 0 8px' }}>A home for your readings</h2>
      <p style={{ fontFamily: T.sans, fontSize: 13, lineHeight: 1.55, color: T.slate4, marginBottom: 18 }}>However you draw a reading is yours. This is simply where you keep it — and what keeping it makes possible.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
        {[[<ILayers size={18} />, 'Record every reading', 'Each spread, its question, and the cards drawn — held in one place instead of scattered across notebooks.'], [<IEye size={18} />, 'Return to them anytime', 'Open any past reading and revisit each card as it sat in the spread.'], [<ISpark size={18} />, 'Draw on the Repository', 'Cross-tradition databases surface unexpected connections in the cards’ messages — insight you would not reach alone.']].map(([ic, t, b]: any, i: number) => (
          <div key={i} style={{ display: 'flex', gap: 13, alignItems: 'flex-start' }}><div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(222,181,100,0.10)', border: `1px solid ${T.goldBorder}`, color: T.gold, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{ic}</div><div><div style={{ fontFamily: T.sans, fontWeight: 600, fontSize: 13.5, color: T.cream }}>{t}</div><div style={{ fontFamily: T.sans, fontSize: 12.5, lineHeight: 1.5, color: T.slate4, marginTop: 1 }}>{b}</div></div></div>
        ))}
      </div>
    </Swap>);
  } else {
    panel = (<Swap k="4">
      <Eyebrow>{S.glyph} {S.planet} · {S.card}</Eyebrow>
      <h2 style={{ fontFamily: T.serif, fontSize: 28, color: T.cream, margin: '7px 0 16px' }}>Orienting the archive</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {[[<ISearch size={18} />, 'Search the archive', 'Any reading by card, question, or querent — across any timeframe.'], [<ILayers size={18} />, 'The card database', 'An explorable library of every card and how it threads through different cultures and traditions.'], [<ISpark size={18} />, 'Alder, your guide', 'A companion that slowly calibrates to your own lens on the Tarot, reflecting your inner world back to you.']].map(([ic, t, b]: any, i: number) => (
          <div key={i} style={{ display: 'flex', gap: 13, alignItems: 'center', padding: '11px 14px', border: `1px solid ${T.border}`, borderRadius: 11, background: 'rgba(255,255,255,0.02)' }}><div style={{ color: T.gold }}>{ic}</div><div><div style={{ fontFamily: T.sans, fontWeight: 600, fontSize: 13.5, color: T.cream }}>{t}</div><div style={{ fontFamily: T.sans, fontSize: 12, lineHeight: 1.4, color: T.slate4, marginTop: 1 }}>{b}</div></div></div>
        ))}
      </div>
    </Swap>);
  }

  const leftVisual = (
    <React.Fragment>
      <OrbitMap S={compact ? 176 : 270} />
      <div style={{ display: 'flex', gap: compact ? 7 : 11, alignItems: 'flex-end', marginTop: compact ? 4 : 10 }}>
        {STAGES.map((_, i) => (
          <div key={i} style={{ transform: `translateY(${i % 2 ? 0 : -10}px)`, transition: `transform .4s ${T.ease}` }}>
            <FlipCard idx={i} w={compact ? (i === step && !done ? 42 : 36) : (i === step && !done ? 76 : 64)} h={compact ? (i === step && !done ? 60 : 50) : (i === step && !done ? 112 : 94)} />
          </div>
        ))}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: 10.5, color: T.slate5, letterSpacing: '0.08em', marginTop: compact ? 6 : 16, textAlign: 'center' }}>
        {done ? 'CYCLE COMPLETE · 5 / 5' : `STAGE ${step + 1} / ${total} · ${S.planet.toUpperCase()} · ${S.card.toUpperCase()}`}
      </div>
    </React.Fragment>
  );

  return (
    <div className="arc" style={{ position: 'relative', width: '100%', height: '100%', background: 'radial-gradient(140% 120% at 50% 0%, #0c0820 0%, #050508 60%)', fontFamily: T.sans, overflow: compact ? 'auto' : 'hidden', display: 'flex', flexDirection: compact ? 'column' : 'row', alignItems: 'center' }}>
      <Starfield count={90} />
      <AmbientGlows a="#2a0d4e" b="rgba(106,61,154,0.20)" />

      {/* LEFT — orbit + spread */}
      <div style={{ position: 'relative', zIndex: 2, flex: compact ? '0 0 auto' : '1 1 0', width: compact ? '100%' : 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: compact ? '12px 16px 2px' : '34px 30px', gap: 4 }}>
        {!compact && <div style={{ marginBottom: 14 }}><Wordmark size="lg" /></div>}
        {leftVisual}
      </div>

      {/* RIGHT — glass content */}
      <div className="arc-scroll" style={{ position: 'relative', zIndex: 2, width: compact ? '90%' : 460, maxWidth: 460, marginRight: compact ? 0 : 52, marginBottom: compact ? 14 : 0, padding: compact ? 18 : 30, ...glass, boxShadow: '0 30px 90px rgba(0,0,0,0.6)', maxHeight: compact ? 'none' : '88%', overflowY: 'auto' }}>
        {panel}
        {!done && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 24 }}>
            {step > startStep ? <GhostButton onClick={back} lead={<IBack size={16} />} style={{ padding: '10px 16px' }}>Back</GhostButton> : <span style={{ fontFamily: T.sans, fontSize: 12.5, color: T.slate5 }} />}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {step === 2 && <TextButton onClick={next}>Skip</TextButton>}
              <GoldButton onClick={step === total - 1 ? () => setDone(true) : next} icon={<IArrow size={16} />}>{step === total - 1 ? 'Enter' : 'Continue'}</GoldButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* local fade-swap (kept inline so the lens is self-contained) */
function Swap({ k, children, style }: any) {
  return <div key={k} style={{ ...(prefersReduced ? {} : { animation: `arcFade .45s ${T.ease} both` }), ...style }}>{children}</div>;
}

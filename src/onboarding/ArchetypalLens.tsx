/* ArchetypalLens.tsx — Lens 2 · "The Archetypal Lens"
   Ported from the Claude Design handoff (lens-archetypal.jsx). Same skeleton,
   professional + warm voice. No tarot terminology: cards become Archetypes,
   readings become Sessions; nine neutral archetypes calibrate into a structure
   that fits the user. Same palette, warmer composition, no starfield/glyphs.

   Integration deltas: account creation happens in Authentik before this renders,
   so the stepper opens at Welcome with "Account" already checked; `onComplete`
   fires on the final "Open the Library" button with the collected profile. */

import React from 'react';
import {
  T, prefersReduced, fade, Wordmark, Eyebrow, GoldButton, GhostButton, Field,
  IUser, IMail, ILock, IArrow, IBack, ICheck, ISpark, ICal, IClock, IPin,
  ICompass, ILayers, ISearch, IShield,
} from './primitives';

export function ArchetypalLens({ compact, startStep = 0, initialName = '', onComplete }: any) {
  const [step, setStep] = React.useState(startStep);
  const [done, setDone] = React.useState(false);
  const [name, setName] = React.useState(initialName);
  const [birthDate, setBirthDate] = React.useState('');
  const [birthTime, setBirthTime] = React.useState('');
  const [birthPlace, setBirthPlace] = React.useState('');
  const [showChart, setShowChart] = React.useState(false);

  const STEPS = ['Account', 'Welcome', 'Profile', 'Readings', 'Library'];
  const total = STEPS.length;
  const next = () => setStep((s: number) => Math.min(s + 1, total - 1));
  const back = () => setStep((s: number) => Math.max(s - 1, startStep));
  const prog = done ? 1 : step / (total - 1);
  const finish = () => onComplete && onComplete({ lens: 'archetypal', displayName: name.trim(), birthDate, birthTime, birthPlace });

  // nine neutral, universal archetypes — settle into structure as we calibrate
  const ARCH = [
    { m: 'S', n: 'The Seeker' }, { m: 'R', n: 'The Ruler' }, { m: 'G', n: 'The Sage' },
    { m: 'C', n: 'The Creator' }, { m: 'K', n: 'The Caregiver' }, { m: 'B', n: 'The Rebel' },
    { m: 'L', n: 'The Lover' }, { m: 'M', n: 'The Magician' }, { m: 'I', n: 'The Innocent' },
  ];
  const litCount = Math.round(prog * ARCH.length);
  // stable pseudo-random scatter per tile
  const jitter = (i: number) => { const r = (n: number) => ((Math.sin((i + 1) * n) * 43758.5) % 1 + 1) % 1; return { dx: (r(12.9) - 0.5) * 22, dy: (r(78.2) - 0.5) * 22, rot: (r(3.7) - 0.5) * 16 }; };

  const CalibrationGrid = ({ tile = 96, gap = 12 }: any) => (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(3, ${tile}px)`, gap }}>
        {ARCH.map((a, i) => {
          const lit = i < litCount; const j = jitter(i);
          return (
            <div key={i} style={{
              width: tile, height: tile, borderRadius: 14,
              background: lit ? 'linear-gradient(160deg, rgba(222,181,100,0.14), rgba(222,181,100,0.04))' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${lit ? T.goldBorder : 'rgba(255,255,255,0.08)'}`,
              boxShadow: lit ? '0 0 18px rgba(222,181,100,0.16)' : 'none',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
              transform: lit ? 'none' : `translate(${j.dx}px, ${j.dy}px) rotate(${j.rot}deg)`,
              opacity: lit ? 1 : 0.42,
              transition: prefersReduced ? 'opacity .3s' : `all .55s ${T.ease}`,
            }}>
              <div style={{ fontFamily: T.serif, fontSize: tile * 0.32, color: lit ? T.gold : 'rgba(255,250,227,0.45)', lineHeight: 1, transition: 'color .4s' }}>{a.m}</div>
              <div style={{ fontFamily: T.sans, fontSize: 8.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: lit ? T.amber200 : 'rgba(255,250,227,0.35)', whiteSpace: 'nowrap' }}>{a.n}</div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 20, width: tile * 3 + gap * 2 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
          <Eyebrow>Calibration</Eyebrow>
          <span style={{ fontFamily: T.mono, fontSize: 12, color: T.gold }}>{Math.round(prog * 100)}%</span>
        </div>
        <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${prog * 100}%`, borderRadius: 3, background: `linear-gradient(90deg, ${T.gold}, ${T.goldLt})`, transition: prefersReduced ? 'none' : `width .6s ${T.ease}`, boxShadow: '0 0 8px rgba(222,181,100,0.5)' }} />
        </div>
        <div style={{ fontFamily: T.sans, fontSize: 11.5, color: T.slate4, marginTop: 9, lineHeight: 1.5 }}>
          {done ? 'Your archetypes have settled into a structure that fits you.' : 'Neutral archetypes settle into structure as the system learns how yours have expressed.'}
        </div>
      </div>
    </div>
  );

  let panel;
  if (done) {
    panel = (<Swap k="done">
      <Eyebrow>You're all set</Eyebrow>
      <h2 style={{ fontFamily: T.serif, fontSize: compact ? 26 : 30, color: T.cream, margin: '8px 0 12px', lineHeight: 1.1 }}>Your archetypes are taking shape</h2>
      <p style={{ fontFamily: T.sans, fontSize: 14, lineHeight: 1.7, color: T.slate4, marginBottom: 24 }}>Welcome, {name.trim() || 'and good to have you'}. As you record readings, the library keeps calibrating — the archetypes settling into the language that makes the most sense to you.</p>
      <GoldButton full icon={<IArrow size={17} />} onClick={finish}>Open the Library</GoldButton>
      <div style={{ marginTop: 12, textAlign: 'center' }}><TextButton onClick={() => { setDone(false); setStep(startStep); }}>Restart the tour</TextButton></div>
    </Swap>);
  } else if (step === 0) {
    panel = (<Swap k="0">
      <Eyebrow>Create your account</Eyebrow>
      <h2 style={{ fontFamily: T.serif, fontSize: 28, color: T.cream, margin: '7px 0 16px' }}>Join the studio</h2>
      <GhostButton full lead={<IShield size={18} />} style={{ padding: '13px 20px', fontWeight: 600 }}>Continue with Authentik</GhostButton>
      <div style={{ fontFamily: T.sans, fontSize: 11, color: T.slate5, textAlign: 'center', margin: '8px 0 16px' }}>Single sign-on — one account across everything</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}><div style={{ flex: 1, height: 1, background: T.border }} /><span style={{ fontFamily: T.sans, fontSize: 11, color: T.slate5 }}>or sign up with email</span><div style={{ flex: 1, height: 1, background: T.border }} /></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Your name" icon={<IUser size={17} />} value={name} onChange={setName} placeholder="First name or what you go by" />
        <Field label="Email" icon={<IMail size={17} />} value="" onChange={() => {}} placeholder="you@example.com" />
        <Field label="Password" type="password" icon={<ILock size={17} />} value="" onChange={() => {}} placeholder="••••••••" />
      </div>
    </Swap>);
  } else if (step === 1) {
    panel = (<Swap k="1">
      <Eyebrow>Welcome</Eyebrow>
      <h2 style={{ fontFamily: T.serif, fontSize: 28, color: T.cream, margin: '7px 0 12px' }}>A living library of archetypes</h2>
      <p style={{ fontFamily: T.sans, fontSize: 13.5, lineHeight: 1.6, color: T.slate4, marginBottom: 16 }}>
        Archetypes are the larger-than-life figures every culture recognizes — the Seeker, the Ruler, the Sage. Often they are forces inside us we cast outward, because up close they feel too large to own. Meeting them on symbolic ground is a way to recognize the patterns you are already living.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
        {[[<ILayers size={18} />, 'Yours, projected outward', 'The figures you cast into the world are reflections of your own inner forces.'], [<ICompass size={18} />, 'Met through readings', 'Not classes or fortune-telling — a way to recognize a pattern you are already living.'], [<ISpark size={18} />, 'Spoken in your language', 'The library calibrates to your worldview, reflecting it back in terms that land for you.']].map(([ic, t, b]: any, i: number) => (
          <div key={i} style={{ display: 'flex', gap: 13, alignItems: 'flex-start' }}><div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(222,181,100,0.10)', border: `1px solid ${T.goldBorder}`, color: T.gold, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{ic}</div><div><div style={{ fontFamily: T.sans, fontWeight: 600, fontSize: 13.5, color: T.cream }}>{t}</div><div style={{ fontFamily: T.sans, fontSize: 12.5, lineHeight: 1.5, color: T.slate4, marginTop: 1 }}>{b}</div></div></div>
        ))}
      </div>
    </Swap>);
  } else if (step === 2) {
    panel = (<Swap k="2">
      <Eyebrow>A little about you</Eyebrow>
      <h2 style={{ fontFamily: T.serif, fontSize: 28, color: T.cream, margin: '7px 0 8px' }}>Help us calibrate</h2>
      <p style={{ fontFamily: T.sans, fontSize: 13, lineHeight: 1.55, color: T.slate4, marginBottom: 16 }}>Your name personalizes the library. Your birth date sets the baseline every reading calibrates against.</p>
      <Field label="Your name" icon={<IUser size={17} />} value={name} onChange={setName} placeholder="First name or what you go by" style={{ marginBottom: 13 }} />
      <Field label="Birth date" icon={<ICal size={17} />} value={birthDate} onChange={setBirthDate} placeholder="MM / DD / YYYY" />
      <div style={{ fontFamily: T.sans, fontSize: 11, color: T.slate5, margin: '7px 0 2px 2px' }}>Required · Arcanum is for ages 13 and up.</div>
      {birthDate.trim() && (<div style={{ marginTop: 14, ...fade() }}>
        <div style={{ border: `1px solid ${T.goldBorder}`, background: 'linear-gradient(160deg, rgba(222,181,100,0.10), rgba(222,181,100,0.03))', borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ fontFamily: T.sans, fontWeight: 600, fontSize: 12.5, color: T.cream }}>Want to shorten the calibration phase?</div>
          <div style={{ fontFamily: T.sans, fontSize: 12, lineHeight: 1.5, color: T.slate4, marginTop: 3 }}>
            Adding your birth time and location can cut it by up to <span style={{ color: T.gold, fontWeight: 600 }}>ten days</span>.
            <button onClick={() => setShowChart((v: boolean) => !v)} title="What is a birth chart?" style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.gold, fontSize: 14, fontWeight: 700, padding: '0 4px', lineHeight: 1, verticalAlign: 'top' }}>*</button>
          </div>
        </div>
        {showChart && (<div style={{ marginTop: 10, border: `1px solid ${T.border}`, borderRadius: 12, padding: '13px 15px', background: 'rgba(255,255,255,0.02)', ...fade() }}>
          <Eyebrow>What a birth chart actually is</Eyebrow>
          <p style={{ fontFamily: T.sans, fontSize: 12, lineHeight: 1.6, color: T.slate4, margin: '7px 0 0' }}>A precise map of where every major body in the solar system sat at the moment you took your first breath. The premise is a measurable one: the gravitational fields of distant planets — forces we never consciously feel — register on a newborn’s developing nervous system in those first moments. Your time and place fix that map exactly. No mysticism required — think of it as the most precise timestamp you will ever own.</p>
        </div>)}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11, marginTop: 12 }}>
          <Field label="Birth time" optional icon={<IClock size={16} />} value={birthTime} onChange={setBirthTime} placeholder="07:34 AM" />
          <Field label="Birth place" optional icon={<IPin size={16} />} value={birthPlace} onChange={setBirthPlace} placeholder="City, region" />
        </div>
      </div>)}
    </Swap>);
  } else if (step === 3) {
    panel = (<Swap k="3">
      <Eyebrow>Orientation</Eyebrow>
      <h2 style={{ fontFamily: T.serif, fontSize: 28, color: T.cream, margin: '7px 0 8px' }}>How a reading works</h2>
      <p style={{ fontFamily: T.sans, fontSize: 13, lineHeight: 1.55, color: T.slate4, marginBottom: 16 }}>Not a class and not a fortune — a way to meet what you have been carrying.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
        {[['Recognize a pattern', 'Each reading surfaces an archetype you are already projecting into the world — often one too big or too distasteful to claim head-on.'], ['Meet it symbolically', 'Engaging the figure on symbolic ground lets you re-address it where it actually lives: inside you.'], ['It calibrates to you', 'The system learns your lexicon and reflects your inner world back, so every reading speaks in a language you understand.']].map(([t, b]: any, i: number) => (
          <div key={i} style={{ display: 'flex', gap: 13, alignItems: 'flex-start' }}><div style={{ width: 28, height: 28, borderRadius: '50%', border: `1px solid ${T.goldBorder}`, color: T.gold, fontFamily: T.serif, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div><div><div style={{ fontFamily: T.sans, fontWeight: 600, fontSize: 14, color: T.cream }}>{t}</div><div style={{ fontFamily: T.sans, fontSize: 12.5, lineHeight: 1.55, color: T.slate4, marginTop: 1 }}>{b}</div></div></div>
        ))}
      </div>
    </Swap>);
  } else {
    panel = (<Swap k="4">
      <Eyebrow>Your library</Eyebrow>
      <h2 style={{ fontFamily: T.serif, fontSize: 28, color: T.cream, margin: '7px 0 16px' }}>Finding your way around</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {[[<ISearch size={18} />, 'Search the library', 'Find any reading or archetype across your library — over any span of time.'], [<ILayers size={18} />, 'The archetype database', 'An explorable map of every archetype and how the same pattern surfaces across cultures and traditions.'], [<ISpark size={18} />, 'Alder, your guide', 'A companion that calibrates to your worldview over time, reflecting your patterns back in language that fits you.']].map(([ic, t, b]: any, i: number) => (
          <div key={i} style={{ display: 'flex', gap: 13, alignItems: 'center', padding: '11px 14px', border: `1px solid ${T.border}`, borderRadius: 11, background: 'linear-gradient(to right, rgba(222,181,100,0.05), transparent)' }}><div style={{ color: T.gold }}>{ic}</div><div><div style={{ fontFamily: T.sans, fontWeight: 600, fontSize: 13.5, color: T.cream }}>{t}</div><div style={{ fontFamily: T.sans, fontSize: 12, lineHeight: 1.4, color: T.slate4, marginTop: 1 }}>{b}</div></div></div>
        ))}
      </div>
    </Swap>);
  }

  const stepper = (
    <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 6 : 10, flexWrap: 'wrap' }}>
      {STEPS.map((s, k) => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: compact ? 6 : 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, opacity: done || k <= step ? 1 : 0.4, transition: 'opacity .3s' }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.sans, fontSize: 10.5, fontWeight: 600, background: (done || k < step) ? T.gold : (k === step ? 'transparent' : 'transparent'), color: (done || k < step) ? T.ink : T.gold, border: k === step && !done ? `1.5px solid ${T.gold}` : (done || k < step ? 'none' : `1px solid ${T.border}`) }}>
              {(done || k < step) ? <ICheck size={12} /> : k + 1}
            </div>
            <span style={{ fontFamily: T.sans, fontSize: 12, fontWeight: k === step && !done ? 600 : 400, color: k === step && !done ? T.cream : T.slate4 }}>{s}</span>
          </div>
          {k < STEPS.length - 1 && <div style={{ width: compact ? 10 : 18, height: 1, background: (done || k < step) ? T.goldDim : T.border }} />}
        </div>
      ))}
    </div>
  );

  return (
    <div className="arc" style={{ position: 'relative', width: '100%', height: '100%', background: 'linear-gradient(160deg, #0b0a10 0%, #08070b 55%, #0c0a08 100%)', fontFamily: T.sans, overflow: compact ? 'auto' : 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* warm glow, no starfield */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: -160, right: -120, width: 520, height: 520, background: 'rgba(222,181,100,0.10)', borderRadius: '50%', filter: 'blur(150px)' }} />
        <div style={{ position: 'absolute', bottom: -180, left: -120, width: 480, height: 480, background: 'rgba(120,70,30,0.16)', borderRadius: '50%', filter: 'blur(150px)' }} />
      </div>

      {/* top chrome — hidden on mobile to reclaim vertical space */}
      {!compact && (
        <div style={{ position: 'relative', zIndex: 2, padding: '22px 36px', borderBottom: `1px solid ${T.borderSoft}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <Wordmark />
        </div>
      )}

      <div style={{ position: 'relative', zIndex: 2, flex: 1, display: 'flex', flexDirection: compact ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: compact ? 12 : 56, padding: compact ? '10px 18px 14px' : '20px 48px', overflowY: compact ? 'visible' : 'hidden' }}>
        {/* LEFT — calibration grid */}
        <div style={{ flexShrink: 0, transform: 'none' }}>
          <CalibrationGrid tile={compact ? 44 : 96} gap={compact ? 8 : 12} />
        </div>

        {/* RIGHT — content card */}
        <div className="arc-scroll" style={{ width: compact ? '100%' : 452, maxWidth: 452, background: T.panel2, border: `1px solid ${T.border}`, borderRadius: 20, padding: compact ? 16 : 30, boxShadow: '0 24px 70px rgba(0,0,0,0.5)', maxHeight: compact ? 'none' : '90%', overflowY: 'auto' }}>
          {panel}
          {!done && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 24 }}>
              {step > startStep ? <GhostButton onClick={back} lead={<IBack size={16} />} style={{ padding: '10px 16px' }}>Back</GhostButton> : <span />}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <GoldButton onClick={step === total - 1 ? () => setDone(true) : next} icon={<IArrow size={16} />}>{step === total - 1 ? 'Finish' : 'Continue'}</GoldButton>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* bottom stepper */}
      {!done && !compact && (
        <div style={{ position: 'relative', zIndex: 2, padding: '16px 36px', borderTop: `1px solid ${T.borderSoft}`, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
          {stepper}
        </div>
      )}
    </div>
  );
}

/* local fade-swap + text button (kept inline so the lens is self-contained) */
function Swap({ k, children, style }: any) {
  return <div key={k} style={{ ...(prefersReduced ? {} : { animation: `arcFade .45s ${T.ease} both` }), ...style }}>{children}</div>;
}
function TextButton({ children, onClick, style }: any) {
  const [h, setH] = React.useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: T.sans, fontSize: 13.5, color: h ? T.cream : T.slate4, transition: 'color .2s', padding: '6px 4px', ...style }}>
      {children}
    </button>
  );
}

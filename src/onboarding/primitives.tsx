/* primitives.tsx — Arcanum onboarding design primitives.
   Ported verbatim from the Claude Design handoff bundle (shared.jsx).
   Tokens lifted from the live app (App.tsx / LandingPage.tsx / index.css):
   ground #050508, panel #0D0D12, input #1A1A24, gold #DEB564, cream #FFFAE3,
   purple-glow #2a0d4e; Playfair Display + Inter + JetBrains Mono; lucide-style
   1.5px line icons; framer-motion-style fades. Kept self-contained (its own
   SVG icon set) so the onboarding renders pixel-identical to the mockup. */

import React from 'react';

export const T = {
  ground: '#050508',
  panel: '#0D0D12',
  panel2: '#101019',
  input: '#1A1A24',
  gold: '#DEB564',
  goldLt: '#F0D38A',
  goldDim: 'rgba(222,181,100,0.55)',
  cream: '#FFFAE3',
  amber200: '#FDE9B8',
  purple: '#2a0d4e',
  ink: '#1a1206',
  slate4: '#94a3b8',
  slate5: '#6b7280',
  border: 'rgba(255,255,255,0.10)',
  borderSoft: 'rgba(255,255,255,0.06)',
  goldBorder: 'rgba(222,181,100,0.30)',
  emerald: '#34d399',
  serif: '"Playfair Display", Georgia, serif',
  sans: '"Inter", system-ui, -apple-system, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
  ease: 'cubic-bezier(0.22,0.61,0.36,1)',
};

export const prefersReduced =
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── one-time keyframes ─────────────────────────────────────── */
if (typeof document !== 'undefined' && !document.getElementById('arc-kf')) {
  const s = document.createElement('style');
  s.id = 'arc-kf';
  s.textContent = `
  @keyframes arcFade{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
  @keyframes arcFadeIn{from{opacity:0}to{opacity:1}}
  @keyframes arcPulse{0%,100%{box-shadow:0 0 0 0 rgba(222,181,100,0.0)}50%{box-shadow:0 0 18px 2px rgba(222,181,100,0.28)}}
  @keyframes arcTwinkle{0%,100%{opacity:.15}50%{opacity:.7}}
  @keyframes arcSpinSlow{to{transform:rotate(360deg)}}
  @keyframes arcDraw{from{stroke-dashoffset:var(--len)}to{stroke-dashoffset:0}}
  .arc-scroll::-webkit-scrollbar{width:7px;height:7px}
  .arc-scroll::-webkit-scrollbar-thumb{background:rgba(222,181,100,0.2);border-radius:4px}
  .arc-scroll::-webkit-scrollbar-track{background:transparent}
  .arc *{box-sizing:border-box}
  .arc-focusable:focus-visible{outline:2px solid ${T.goldBorder};outline-offset:2px}
  `;
  document.head.appendChild(s);
}

export const fade = (delay = 0): React.CSSProperties =>
  prefersReduced ? {} : { animation: `arcFade .5s ${T.ease} ${delay}s both` };

/* ── icons (lucide-ish, 1.5px stroke) ───────────────────────── */
export function Icon({ d, size = 18, fill = 'none', sw = 1.6, children, style }: any) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}
      stroke="currentColor" strokeWidth={sw} strokeLinecap="round"
      strokeLinejoin="round" style={{ flexShrink: 0, ...style }}>
      {d ? <path d={d} /> : children}
    </svg>
  );
}
export const IUser = (p: any) => <Icon {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a7 7 0 0 1 14 0v1" /></Icon>;
export const IMail = (p: any) => <Icon {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></Icon>;
export const ILock = (p: any) => <Icon {...p}><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Icon>;
export const IArrow = (p: any) => <Icon {...p} d="M5 12h14M13 6l6 6-6 6" />;
export const IBack = (p: any) => <Icon {...p} d="M19 12H5M11 6l-6 6 6 6" />;
export const ICheck = (p: any) => <Icon {...p} d="M5 13l4 4L19 7" />;
export const ISpark = (p: any) => <Icon {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><path d="M12 8.5 13 11l2.5 1L13 13l-1 2.5L11 13l-2.5-1L11 11z" /></Icon>;
export const IShield = (p: any) => <Icon {...p}><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /><path d="M9.5 12l1.8 1.8L15 10" /></Icon>;
export const ICal = (p: any) => <Icon {...p}><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></Icon>;
export const IClock = (p: any) => <Icon {...p}><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></Icon>;
export const IPin = (p: any) => <Icon {...p}><path d="M12 21s7-5.5 7-11a7 7 0 0 0-14 0c0 5.5 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></Icon>;
export const ICompass = (p: any) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></Icon>;
export const ILayers = (p: any) => <Icon {...p}><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></Icon>;
export const IStar = (p: any) => <Icon {...p}><path d="m12 3 2.4 5.6L20 9.2l-4 4 1 5.8L12 16l-5 3 1-5.8-4-4 5.6-.6z" /></Icon>;
export const ISearch = (p: any) => <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Icon>;
export const ISliders = (p: any) => <Icon {...p}><path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M18 18h2" /><circle cx="16" cy="6" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="16" cy="18" r="2" /></Icon>;
export const ITable = (p: any) => <Icon {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 10v10" /></Icon>;
export const ILogout = (p: any) => <Icon {...p}><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /><path d="M10 12h10M16 8l4 4-4 4" /></Icon>;
export const IEye = (p: any) => <Icon {...p}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Icon>;

/* ── atmosphere ─────────────────────────────────────────────── */
export function AmbientGlows({ a = '#2a0d4e', b = 'rgba(76,29,149,0.22)' }: any) {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', top: -120, left: -120, width: 440, height: 440, background: a, opacity: 0.4, borderRadius: '50%', filter: 'blur(120px)' }} />
      <div style={{ position: 'absolute', bottom: -140, right: -120, width: 520, height: 520, background: b, borderRadius: '50%', filter: 'blur(150px)' }} />
    </div>
  );
}

export function Starfield({ count = 70, seed = 7 }: any) {
  const stars = React.useMemo(() => {
    let s = seed; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    return Array.from({ length: count }, () => ({
      x: rnd() * 100, y: rnd() * 100, r: rnd() * 1.6 + 0.4,
      d: rnd() * 4 + 2, delay: rnd() * 4,
    }));
  }, [count, seed]);
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {stars.map((st, i) => (
        <span key={i} style={{
          position: 'absolute', left: st.x + '%', top: st.y + '%',
          width: st.r, height: st.r, borderRadius: '50%',
          background: i % 7 === 0 ? T.gold : '#fff',
          opacity: 0.3,
          animation: prefersReduced ? 'none' : `arcTwinkle ${st.d}s ease-in-out ${st.delay}s infinite`,
        }} />
      ))}
    </div>
  );
}

export function Logo({ size = 48, glow = false }: any) {
  return (
    <img src="/logo.jpg" alt="Paths of Reverence" style={{
      width: size, height: size, borderRadius: '50%', objectFit: 'cover',
      border: `1px solid ${T.goldBorder}`,
      boxShadow: glow ? '0 0 22px rgba(222,181,100,0.35)' : 'none',
    }} />
  );
}

export function Eyebrow({ children, style }: any) {
  return <div style={{ fontFamily: T.sans, fontSize: 10, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: T.goldDim, ...style }}>{children}</div>;
}

export function Wordmark({ size = 'md' }: any) {
  const big = size === 'lg';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <Logo size={big ? 56 : 44} glow={big} />
      <div>
        <div style={{ fontFamily: T.serif, fontWeight: 600, fontSize: big ? 24 : 19, letterSpacing: '0.01em', color: T.gold, whiteSpace: 'nowrap' }}>Paths of Reverence</div>
        <Eyebrow style={{ marginTop: 2, fontSize: big ? 11 : 10 }}>Tarot Repository</Eyebrow>
      </div>
    </div>
  );
}

/* ── buttons ────────────────────────────────────────────────── */
export function GoldButton({ children, onClick, full, icon, disabled, style }: any) {
  const [h, setH] = React.useState(false);
  return (
    <button className="arc-focusable" onClick={onClick} disabled={disabled}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
        width: full ? '100%' : 'auto', padding: '12px 22px', borderRadius: 12,
        border: 'none', cursor: disabled ? 'default' : 'pointer',
        fontFamily: T.sans, fontWeight: 600, fontSize: 14, letterSpacing: '0.01em', whiteSpace: 'nowrap',
        background: disabled ? 'rgba(222,181,100,0.25)' : (h ? T.goldLt : T.gold),
        color: T.ink, opacity: disabled ? 0.6 : 1,
        boxShadow: h && !disabled ? '0 0 24px rgba(222,181,100,0.35)' : 'none',
        transition: `background .2s ${T.ease}, box-shadow .3s ${T.ease}`, ...style,
      }}>
      {children}{icon}
    </button>
  );
}

export function GhostButton({ children, onClick, full, icon, lead, style }: any) {
  const [h, setH] = React.useState(false);
  return (
    <button className="arc-focusable" onClick={onClick}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
        width: full ? '100%' : 'auto', padding: '11px 20px', borderRadius: 12,
        cursor: 'pointer', fontFamily: T.sans, fontWeight: 500, fontSize: 14,
        background: h ? 'rgba(222,181,100,0.16)' : 'rgba(222,181,100,0.08)',
        border: `1px solid ${h ? T.goldDim : T.goldBorder}`, color: T.gold,
        transition: `all .2s ${T.ease}`, ...style,
      }}>
      {lead}{children}{icon}
    </button>
  );
}

export function TextButton({ children, onClick, style }: any) {
  const [h, setH] = React.useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: T.sans, fontSize: 13.5, color: h ? T.cream : T.slate4, transition: 'color .2s', padding: '6px 4px', ...style }}>
      {children}
    </button>
  );
}

/* ── form field ─────────────────────────────────────────────── */
export function Field({ label, icon, type = 'text', value, onChange, placeholder, optional, style }: any) {
  const [f, setF] = React.useState(false);
  return (
    <label style={{ display: 'block', ...style }}>
      <div style={{ fontFamily: T.sans, fontSize: 12.5, color: T.slate4, marginBottom: 6, marginLeft: 2 }}>
        {label}{optional && <span style={{ color: T.slate5, fontStyle: 'italic' }}> · optional</span>}
      </div>
      <div style={{ position: 'relative' }}>
        {icon && <div style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: f ? T.goldDim : T.slate5, transition: 'color .2s' }}>{icon}</div>}
        <input type={type} value={value} placeholder={placeholder}
          onChange={(e) => onChange && onChange(e.target.value)}
          onFocus={() => setF(true)} onBlur={() => setF(false)}
          style={{
            width: '100%', background: T.input,
            border: `1px solid ${f ? T.goldBorder : 'rgba(255,255,255,0.10)'}`,
            boxShadow: f ? `0 0 0 1px ${T.goldBorder}` : 'none',
            borderRadius: 12, padding: icon ? '11px 14px 11px 40px' : '11px 14px',
            color: T.cream, fontFamily: T.sans, fontSize: 14, outline: 'none',
            transition: `border .2s, box-shadow .2s`,
          }} />
      </div>
    </label>
  );
}

/* ── progress dots ──────────────────────────────────────────── */
export function StepDots({ n, i, onJump }: any) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {Array.from({ length: n }, (_, k) => (
        <button key={k} onClick={() => onJump && k <= i && onJump(k)}
          style={{
            width: k === i ? 22 : 7, height: 7, borderRadius: 4, border: 'none',
            background: k === i ? T.gold : (k < i ? T.goldDim : 'rgba(255,255,255,0.18)'),
            cursor: onJump && k <= i ? 'pointer' : 'default', padding: 0,
            transition: `all .3s ${T.ease}`,
          }} />
      ))}
    </div>
  );
}

/* fade-on-change wrapper keyed by step */
export function Swap({ k, children, style }: any) {
  return <div key={k} style={{ ...(prefersReduced ? {} : { animation: `arcFade .45s ${T.ease} both` }), ...style }}>{children}</div>;
}

/** Viewport-driven compact (mobile) flag — replaces the canvas `compact` prop. */
export function useIsCompact(breakpoint = 860) {
  const [compact, setCompact] = React.useState(
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false,
  );
  React.useEffect(() => {
    const onResize = () => setCompact(window.innerWidth < breakpoint);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);
  return compact;
}

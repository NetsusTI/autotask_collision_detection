'use client';

import { useEffect, useState } from 'react';

interface TicketPresence {
  ticketId: string;
  ticketNumber: string | null;
  users: string[];
}

interface CollisionEvent {
  ts: number;
  ticketId: string;
  ticketNumber: string | null;
  users: string[];
}

const API_KEY = '-_-ErJy9v64XRiDbpuPFZ3uLs4nVFmXm';
const ADMIN_PASSWORD = 'netsus2026';

type ThemePref = 'auto' | 'light' | 'dark';
type ResolvedTheme = 'light' | 'dark';
const THEME_STORAGE_KEY = 'netsus_admin_theme';

const PALETTE: Record<ResolvedTheme, Record<string, string>> = {
  dark: {
    pageBg: 'linear-gradient(135deg, #0a0e1a 0%, #0f1628 100%)',
    text: '#fff',
    cardBg: 'rgba(255,255,255,0.04)',
    cardBorder: 'rgba(255,255,255,0.08)',
    accentBorder: 'rgba(249,115,22,0.3)',
    dim: 'rgba(255,255,255,0.4)',
    faint: 'rgba(255,255,255,0.25)',
    headerBg: 'rgba(255,255,255,0.03)',
    headerBorder: 'rgba(255,255,255,0.07)',
    chipBg: 'rgba(255,255,255,0.1)',
    chipBg2: 'rgba(255,255,255,0.06)',
    inputBg: 'rgba(255,255,255,0.06)',
    inputBorder: 'rgba(255,255,255,0.12)',
    dashedBorder: 'rgba(255,255,255,0.1)',
    emptyBg: 'rgba(255,255,255,0.02)',
    iconBg: 'rgba(255,255,255,0.06)',
  },
  light: {
    pageBg: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)',
    text: '#0f172a',
    cardBg: '#ffffff',
    cardBorder: 'rgba(15,23,42,0.1)',
    accentBorder: 'rgba(234,88,12,0.35)',
    dim: 'rgba(15,23,42,0.55)',
    faint: 'rgba(15,23,42,0.38)',
    headerBg: 'rgba(255,255,255,0.75)',
    headerBorder: 'rgba(15,23,42,0.08)',
    chipBg: 'rgba(15,23,42,0.08)',
    chipBg2: 'rgba(15,23,42,0.05)',
    inputBg: 'rgba(15,23,42,0.04)',
    inputBorder: 'rgba(15,23,42,0.15)',
    dashedBorder: 'rgba(15,23,42,0.15)',
    emptyBg: 'rgba(15,23,42,0.02)',
    iconBg: 'rgba(15,23,42,0.05)',
  },
};

function resolveTheme(pref: ThemePref): ResolvedTheme {
  if (pref === 'light' || pref === 'dark') return pref;
  if (typeof matchMedia === 'undefined') return 'dark';
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function ThemeToggle({ pref, onChange }: { pref: ThemePref; onChange: (p: ThemePref) => void }) {
  const opts: { v: ThemePref; label: string }[] = [
    { v: 'auto', label: 'Auto' },
    { v: 'light', label: '☀️' },
    { v: 'dark', label: '🌙' },
  ];
  return (
    <div style={{ display: 'inline-flex', background: 'rgba(128,128,128,0.15)', borderRadius: 8, padding: 2, gap: 2 }}>
      {opts.map(o => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          style={{
            border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer',
            background: pref === o.v ? 'linear-gradient(135deg, #f97316, #ea580c)' : 'transparent',
            color: pref === o.v ? '#fff' : 'inherit', fontWeight: pref === o.v ? 600 : 400,
          }}
        >{o.label}</button>
      ))}
    </div>
  );
}

export default function AdminPage() {
  const [auth, setAuth] = useState(false);
  const [pwd, setPwd] = useState('');
  const [pwdError, setPwdError] = useState(false);
  const [tickets, setTickets] = useState<TicketPresence[]>([]);
  const [history, setHistory] = useState<CollisionEvent[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'live' | 'history'>('live');

  const [themePref, setThemePref] = useState<ThemePref>('auto');
  const [resolved, setResolved] = useState<ResolvedTheme>('dark');

  useEffect(() => {
    if (sessionStorage.getItem('netsus_admin') === '1') setAuth(true);
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemePref | null;
    const pref = stored === 'light' || stored === 'dark' ? stored : 'auto';
    setThemePref(pref);
    setResolved(resolveTheme(pref));
  }, []);

  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const handler = () => { if (themePref === 'auto') setResolved(resolveTheme('auto')); };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [themePref]);

  function changeTheme(p: ThemePref) {
    setThemePref(p);
    setResolved(resolveTheme(p));
    localStorage.setItem(THEME_STORAGE_KEY, p);
  }

  function login() {
    if (pwd === ADMIN_PASSWORD) {
      sessionStorage.setItem('netsus_admin', '1');
      setAuth(true);
    } else {
      setPwdError(true);
      setTimeout(() => setPwdError(false), 2000);
    }
  }

  async function fetchData() {
    try {
      const [presRes, histRes] = await Promise.all([
        fetch('/api/presence/status', { headers: { 'x-api-key': API_KEY } }),
        fetch('/api/presence/history', { headers: { 'x-api-key': API_KEY } }),
      ]);
      const presence: TicketPresence[] = await presRes.json().catch(() => []);
      const hist: CollisionEvent[] = await histRes.json().catch(() => []);
      setTickets(Array.isArray(presence) ? presence : []);
      setHistory(Array.isArray(hist) ? hist : []);
      setLastUpdate(new Date());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!auth) return;
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [auth]);

  const p = PALETTE[resolved];

  if (!auth) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: p.pageBg, color: p.text,
        fontFamily: "'Segoe UI', system-ui, sans-serif", position: 'relative',
      }}>
        <div style={{ position: 'absolute', top: 20, right: 20 }}>
          <ThemeToggle pref={themePref} onChange={changeTheme} />
        </div>
        <div style={{
          background: p.cardBg, border: `1px solid ${p.cardBorder}`,
          borderRadius: 20, padding: '40px 36px', width: 320, textAlign: 'center',
        }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, margin: '0 auto 20px',
            background: 'linear-gradient(135deg, #f97316, #ea580c)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, boxShadow: '0 4px 16px rgba(249,115,22,0.4)',
          }}>⚡</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: p.text, marginBottom: 4 }}>Panel de Administración</div>
          <div style={{ fontSize: 12, color: p.dim, marginBottom: 28 }}>Autotask CoView · Netsus</div>
          <input
            type="password"
            placeholder="Contraseña"
            value={pwd}
            onChange={e => setPwd(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && login()}
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14,
              background: p.inputBg,
              border: `1px solid ${pwdError ? '#ef4444' : p.inputBorder}`,
              color: p.text, boxSizing: 'border-box', outline: 'none', marginBottom: 12,
            }}
          />
          {pwdError && <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 10 }}>Contraseña incorrecta</div>}
          <button onClick={login} style={{
            width: '100%', padding: '10px', borderRadius: 10, fontSize: 14, fontWeight: 600,
            background: 'linear-gradient(135deg, #f97316, #ea580c)', color: '#fff',
            border: 'none', cursor: 'pointer',
          }}>Ingresar</button>
        </div>
        <style>{`input::placeholder { color: ${p.faint}; }`}</style>
      </div>
    );
  }

  const totalUsers = tickets.reduce((acc, t) => acc + t.users.length, 0);

  return (
    <div style={{
      minHeight: '100vh',
      background: p.pageBg,
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      color: p.text,
    }}>
      {/* Header */}
      <div style={{
        borderBottom: `1px solid ${p.headerBorder}`, padding: '0 40px',
        background: p.headerBg, backdropFilter: 'blur(10px)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #f97316, #ea580c)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, boxShadow: '0 4px 12px rgba(249,115,22,0.4)',
            }}>⚡</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Collision Detection</div>
              <div style={{ fontSize: 11, color: p.dim, marginTop: -2 }}>Netsus · Panel de control</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: p.dim }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e', animation: 'pulse 2s infinite' }} />
              En vivo · {lastUpdate.toLocaleTimeString('es-CL')}
            </div>
            <ThemeToggle pref={themePref} onChange={changeTheme} />
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 40px' }}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 32 }}>
          {[
            { label: 'Tickets activos', value: tickets.length, icon: '🎫' },
            { label: 'Técnicos ocupados', value: totalUsers, icon: '👥' },
            { label: 'Colisiones hoy', value: history.filter(e => Date.now() - e.ts < 86400000).length, icon: '⚠️' },
          ].map(({ label, value, icon }) => (
            <div key={label} style={{
              background: p.cardBg, border: `1px solid ${p.cardBorder}`,
              borderRadius: 16, padding: '20px 24px',
            }}>
              <div style={{ fontSize: 22, marginBottom: 8 }}>{icon}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#f97316' }}>{value}</div>
              <div style={{ fontSize: 12, color: p.dim, marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {(['live', 'history'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '6px 18px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
              background: tab === t ? 'linear-gradient(135deg, #f97316, #ea580c)' : p.chipBg2,
              color: tab === t ? '#fff' : p.text,
            }}>
              {t === 'live' ? '🟢 En vivo' : '📋 Historial'}
            </button>
          ))}
        </div>

        {tab === 'live' ? (
          loading ? (
            <div style={{ textAlign: 'center', padding: '80px 0', color: p.faint, fontSize: 14 }}>Cargando...</div>
          ) : tickets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 0', background: p.emptyBg, border: `1px dashed ${p.dashedBorder}`, borderRadius: 20 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 15, color: p.dim }}>Sin colisiones activas</div>
              <div style={{ fontSize: 12, color: p.faint, marginTop: 4 }}>Todos los técnicos trabajan sin conflictos</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {tickets.map(({ ticketId, ticketNumber, users }) => (
                <div key={ticketId} style={{
                  background: p.cardBg,
                  border: `1px solid ${users.length > 1 ? p.accentBorder : p.cardBorder}`,
                  borderRadius: 16, padding: '18px 24px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{
                      width: 42, height: 42, borderRadius: 12,
                      background: users.length > 1 ? 'rgba(249,115,22,0.15)' : p.iconBg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                    }}>
                      {users.length > 1 ? '⚠️' : '🎫'}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{ticketNumber ?? `#${ticketId}`}</div>
                      <div style={{ fontSize: 12, color: p.dim, marginTop: 2 }}>
                        {users.length} técnico{users.length > 1 ? 's' : ''} activo{users.length > 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {users.map((user, i) => (
                      <span key={user} style={{
                        padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                        background: i === 0 ? 'linear-gradient(135deg, #f97316, #ea580c)' : p.chipBg,
                        color: i === 0 ? '#fff' : p.text,
                        boxShadow: i === 0 ? '0 2px 8px rgba(249,115,22,0.3)' : 'none',
                      }}>{user}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {history.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: p.faint, fontSize: 14 }}>
                Sin colisiones registradas aún
              </div>
            ) : history.map((e, i) => (
              <div key={i} style={{
                background: p.chipBg2, border: `1px solid ${p.headerBorder}`,
                borderRadius: 12, padding: '14px 20px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 16 }}>⚠️</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{e.ticketNumber ?? `#${e.ticketId}`}</div>
                    <div style={{ fontSize: 11, color: p.faint, marginTop: 2 }}>
                      {new Date(e.ts).toLocaleString('es-CL')}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {e.users.map((u, j) => (
                    <span key={u} style={{
                      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                      background: j === 0 ? 'rgba(249,115,22,0.2)' : p.chipBg2,
                      color: j === 0 ? '#f97316' : p.dim,
                    }}>{u}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        input::placeholder { color: ${p.faint}; }
      `}</style>
    </div>
  );
}

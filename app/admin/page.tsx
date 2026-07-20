'use client';

import { useEffect, useState } from 'react';
import { Montserrat } from 'next/font/google';
import { Icon } from '@/lib/icons';

const montserrat = Montserrat({ subsets: ['latin'], weight: ['300', '400', '600', '800'] });

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

interface NotifLogEntry {
  type: string;
  title: string;
  body: string;
  ticketId?: string;
  ticketNumber?: string;
  ticketUrl?: string;
  targets?: string[];
  ts: number;
}

interface FeedbackItem {
  id: string;
  resource_name: string;
  type: string;
  message: string;
  created_at: string;
}

const FEEDBACK_META: Record<string, { label: string; color: string }> = {
  mejorar: { label: 'Mejorar', color: '#3867E9' },
  agregar: { label: 'Agregar', color: '#22c55e' },
  quitar:  { label: 'Quitar', color: '#f97316' },
  otro:    { label: 'Otro', color: '#8C52FF' },
};

const NOTIF_META: Record<string, { icon: Parameters<typeof Icon>[0]['name']; color: string; tint: string }> = {
  collision:   { icon: 'alert-triangle', color: '#ef4444', tint: 'rgba(239,68,68,0.12)' },
  ping:        { icon: 'megaphone',      color: '#f97316', tint: 'rgba(249,115,22,0.12)' },
  liberation:  { icon: 'check-circle',   color: '#22c55e', tint: 'rgba(34,197,94,0.12)' },
  n1_queue:    { icon: 'inbox',          color: '#3867E9', tint: 'rgba(56,103,233,0.12)' },
  n2_assign:   { icon: 'user-plus',      color: '#f97316', tint: 'rgba(249,115,22,0.12)' },
  n3_client:   { icon: 'message-square', color: '#f97316', tint: 'rgba(249,115,22,0.12)' },
  n4_sla:      { icon: 'timer',          color: '#ef4444', tint: 'rgba(239,68,68,0.12)' },
  n5_critical: { icon: 'flame',          color: '#ef4444', tint: 'rgba(239,68,68,0.12)' },
};
const NOTIF_META_DEFAULT = { icon: 'bell' as const, color: '#3867E9', tint: 'rgba(56,103,233,0.12)' };

function relTime(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60) return 'ahora';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  return `hace ${Math.floor(hrs / 24)} d`;
}

const API_KEY = '-_-ErJy9v64XRiDbpuPFZ3uLs4nVFmXm';
const ADMIN_PASSWORD = 'netsus2026';

type ThemePref = 'auto' | 'light' | 'dark';
type ResolvedTheme = 'light' | 'dark';
const THEME_STORAGE_KEY = 'netsus_admin_theme';

const PALETTE: Record<ResolvedTheme, Record<string, string>> = {
  dark: {
    pageBg: 'linear-gradient(135deg, #190637 0%, #0d0320 100%)',
    text: '#fff',
    cardBg: 'rgba(255,255,255,0.04)',
    cardBorder: 'rgba(255,255,255,0.08)',
    accentBorder: 'rgba(239,68,68,0.35)',
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
    pageBg: 'linear-gradient(135deg, #F3F3F3 0%, #e7e7ec 100%)',
    text: '#3B3B3B',
    cardBg: '#ffffff',
    cardBorder: 'rgba(59,59,59,0.1)',
    accentBorder: 'rgba(239,68,68,0.35)',
    dim: 'rgba(59,59,59,0.97)',
    faint: 'rgba(59,59,59,0.85)',
    headerBg: 'rgba(255,255,255,0.75)',
    headerBorder: 'rgba(59,59,59,0.08)',
    chipBg: 'rgba(59,59,59,0.08)',
    chipBg2: 'rgba(59,59,59,0.05)',
    inputBg: 'rgba(59,59,59,0.04)',
    inputBorder: 'rgba(59,59,59,0.15)',
    dashedBorder: 'rgba(59,59,59,0.15)',
    emptyBg: 'rgba(59,59,59,0.02)',
    iconBg: 'rgba(59,59,59,0.05)',
  },
};

const ACCENT = '#3867E9';

function resolveTheme(pref: ThemePref): ResolvedTheme {
  if (pref === 'light' || pref === 'dark') return pref;
  if (typeof matchMedia === 'undefined') return 'dark';
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function ThemeToggle({ pref, onChange }: { pref: ThemePref; onChange: (p: ThemePref) => void }) {
  const opts: { v: ThemePref; label: React.ReactNode }[] = [
    { v: 'auto', label: 'Auto' },
    { v: 'light', label: <Icon name="sun" size={13} /> },
    { v: 'dark', label: <Icon name="moon" size={13} /> },
  ];
  return (
    <div style={{ display: 'inline-flex', background: 'rgba(128,128,128,0.15)', borderRadius: 8, padding: 2, gap: 2 }}>
      {opts.map(o => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          style={{
            border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer',
            display: 'flex', alignItems: 'center',
            background: pref === o.v ? ACCENT : 'transparent',
            color: pref === o.v ? '#fff' : 'inherit', fontWeight: pref === o.v ? 600 : 400,
          }}
        >{o.label}</button>
      ))}
    </div>
  );
}

const FOOTER_HEIGHT = 44;

function Footer({ color, background, border }: { color: string; background: string; border: string }) {
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, height: FOOTER_HEIGHT, zIndex: 20,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', fontSize: 11, color,
      background, borderTop: `1px solid ${border}`, backdropFilter: 'blur(10px)',
    }}>
      <b style={{ color: ACCENT, fontWeight: 800 }}>netsus</b>&nbsp;· Innovación Tecnológica
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
  const [tab, setTab] = useState<'live' | 'history' | 'notifications' | 'feedback'>('live');
  const [online, setOnline] = useState(0);
  const [teamConfigured, setTeamConfigured] = useState(false);
  const [notifLog, setNotifLog] = useState<NotifLogEntry[]>([]);
  const [notifTotal, setNotifTotal] = useState(0);
  const [notifLoadingMore, setNotifLoadingMore] = useState(false);
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([]);
  const [feedbackTotal, setFeedbackTotal] = useState(0);
  const [feedbackLoadingMore, setFeedbackLoadingMore] = useState(false);

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
      const [presRes, histRes, onlineRes, notifRes, feedbackRes] = await Promise.all([
        fetch('/api/presence/status', { headers: { 'x-api-key': API_KEY } }),
        fetch('/api/presence/history', { headers: { 'x-api-key': API_KEY } }),
        fetch('/api/team/online', { headers: { 'x-api-key': API_KEY } }),
        fetch('/api/notifications/log?offset=0&limit=50', { headers: { 'x-api-key': API_KEY } }),
        fetch('/api/feedback?offset=0&limit=50', { headers: { 'x-api-key': API_KEY } }),
      ]);
      const presence: TicketPresence[] = await presRes.json().catch(() => []);
      const hist: CollisionEvent[] = await histRes.json().catch(() => []);
      const onlineData = await onlineRes.json().catch(() => ({ online: 0, configured: false }));
      const notifData = await notifRes.json().catch(() => ({ events: [], total: 0 }));
      const feedbackData = await feedbackRes.json().catch(() => ({ items: [], total: 0 }));
      setTickets(Array.isArray(presence) ? presence : []);
      setHistory(Array.isArray(hist) ? hist : []);
      setOnline(onlineData.online ?? 0);
      setTeamConfigured(!!onlineData.configured);
      setNotifLog(Array.isArray(notifData.events) ? notifData.events : []);
      setNotifTotal(notifData.total ?? 0);
      setFeedbackItems(Array.isArray(feedbackData.items) ? feedbackData.items : []);
      setFeedbackTotal(feedbackData.total ?? 0);
      setLastUpdate(new Date());
    } finally {
      setLoading(false);
    }
  }

  async function loadMoreNotifs() {
    setNotifLoadingMore(true);
    try {
      const res = await fetch(`/api/notifications/log?offset=${notifLog.length}&limit=50`, { headers: { 'x-api-key': API_KEY } });
      const data = await res.json().catch(() => ({ events: [], total: notifTotal }));
      setNotifLog(prev => [...prev, ...(Array.isArray(data.events) ? data.events : [])]);
      setNotifTotal(data.total ?? notifTotal);
    } finally {
      setNotifLoadingMore(false);
    }
  }

  async function loadMoreFeedback() {
    setFeedbackLoadingMore(true);
    try {
      const res = await fetch(`/api/feedback?offset=${feedbackItems.length}&limit=50`, { headers: { 'x-api-key': API_KEY } });
      const data = await res.json().catch(() => ({ items: [], total: feedbackTotal }));
      setFeedbackItems(prev => [...prev, ...(Array.isArray(data.items) ? data.items : [])]);
      setFeedbackTotal(data.total ?? feedbackTotal);
    } finally {
      setFeedbackLoadingMore(false);
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
      <div className={montserrat.className} style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        background: p.pageBg, color: p.text, fontWeight: 400, position: 'relative',
      }}>
        <div style={{ position: 'absolute', top: 20, right: 20 }}>
          <ThemeToggle pref={themePref} onChange={changeTheme} />
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            background: p.cardBg, border: `1px solid ${p.cardBorder}`,
            borderRadius: 20, padding: '40px 36px', width: 320, textAlign: 'center',
          }}>
            <img src="/netsus-logo.png" alt="netsus" style={{ height: 28, margin: '0 auto 24px', display: 'block' }} />
            <div style={{ fontSize: 16, fontWeight: 800, color: p.text, marginBottom: 4 }}>Panel de Administración</div>
            <div style={{ fontSize: 12, color: p.dim, marginBottom: 28 }}>Autotask CoView · Netsus</div>
            <input
              type="password"
              placeholder="Contraseña"
              value={pwd}
              onChange={e => setPwd(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && login()}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14, fontFamily: 'inherit',
                background: p.inputBg,
                border: `1px solid ${pwdError ? '#ef4444' : p.inputBorder}`,
                color: p.text, boxSizing: 'border-box', outline: 'none', marginBottom: 12,
              }}
            />
            {pwdError && <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 10 }}>Contraseña incorrecta</div>}
            <button onClick={login} style={{
              width: '100%', padding: '10px', borderRadius: 10, fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
              background: ACCENT, color: '#fff',
              border: 'none', cursor: 'pointer',
            }}>Ingresar</button>
          </div>
        </div>
        <Footer color={p.faint} background={p.headerBg} border={p.headerBorder} />
        <style>{`input::placeholder { color: ${p.faint}; }`}</style>
      </div>
    );
  }

  const busyTechs = new Set(tickets.flatMap(t => t.users)).size;
  const available = teamConfigured ? Math.max(0, online - busyTechs) : null;
  const collisionsToday = history.filter(e => Date.now() - e.ts < 86400000).length;

  return (
    <div className={montserrat.className} style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      background: p.pageBg, color: p.text, fontWeight: 400,
    }}>
      {/* Header */}
      <div style={{
        borderBottom: `1px solid ${p.headerBorder}`, padding: '0 40px',
        background: p.headerBg, backdropFilter: 'blur(10px)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src="/netsus-logo.png" alt="netsus" style={{ height: 22 }} />
            <div style={{ width: 1, height: 28, background: p.headerBorder }} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 800 }}>Autotask CoView</div>
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

      <div style={{ maxWidth: 900, margin: '0 auto', padding: `40px 40px ${FOOTER_HEIGHT + 24}px`, width: '100%', boxSizing: 'border-box', flex: 1 }}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, marginBottom: 32 }}>
          {[
            { label: 'Tickets activos', value: String(tickets.length), icon: 'ticket' as const, color: ACCENT },
            { label: 'Técnicos ocupados', value: String(busyTechs), icon: 'users' as const, color: ACCENT },
            {
              label: teamConfigured ? 'Técnicos disponibles' : 'Disponibles (requiere n1–n5)',
              value: available === null ? '—' : String(available),
              icon: 'user' as const, color: '#22c55e',
            },
            { label: 'Colisiones hoy', value: String(collisionsToday), icon: 'alert-triangle' as const, color: '#ef4444' },
          ].map(({ label, value, icon, color }) => (
            <div key={label} style={{
              background: p.cardBg, border: `1px solid ${p.cardBorder}`,
              borderRadius: 16, padding: '20px 24px',
            }}>
              <div style={{ marginBottom: 8, color }}><Icon name={icon} size={22} /></div>
              <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: p.dim, marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {(['live', 'history', 'notifications', 'feedback'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '6px 18px', borderRadius: 20, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', border: 'none',
              display: 'flex', alignItems: 'center', gap: 6,
              background: tab === t ? ACCENT : p.chipBg2,
              color: tab === t ? '#fff' : p.text,
            }}>
              <Icon name={t === 'live' ? 'circle' : t === 'history' ? 'clipboard-list' : t === 'notifications' ? 'bell' : 'message-square'} size={13} />
              {t === 'live' ? 'En vivo' : t === 'history' ? 'Historial' : t === 'notifications' ? 'Centro de Notificaciones' : 'Feedback'}
            </button>
          ))}
        </div>

        {tab === 'live' ? (
          loading ? (
            <div style={{ textAlign: 'center', padding: '80px 0', color: p.faint, fontSize: 14 }}>Cargando...</div>
          ) : tickets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 0', background: p.emptyBg, border: `1px dashed ${p.dashedBorder}`, borderRadius: 20 }}>
              <div style={{ marginBottom: 12, color: '#22c55e', display: 'flex', justifyContent: 'center' }}><Icon name="check-circle" size={40} /></div>
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
                      background: users.length > 1 ? 'rgba(239,68,68,0.15)' : p.iconBg,
                      color: users.length > 1 ? '#ef4444' : ACCENT,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon name={users.length > 1 ? 'alert-triangle' : 'ticket'} size={18} />
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
                        background: i === 0 ? ACCENT : p.chipBg,
                        color: i === 0 ? '#fff' : p.text,
                      }}>{user}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : tab === 'history' ? (
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
                  <span style={{ color: '#ef4444', display: 'flex' }}><Icon name="alert-triangle" size={16} /></span>
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
                      background: j === 0 ? 'rgba(56,103,233,0.2)' : p.chipBg2,
                      color: j === 0 ? ACCENT : p.dim,
                    }}>{u}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : tab === 'notifications' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {notifLog.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '80px 0', background: p.emptyBg, border: `1px dashed ${p.dashedBorder}`, borderRadius: 20 }}>
                <div style={{ marginBottom: 12, color: ACCENT, display: 'flex', justifyContent: 'center' }}><Icon name="inbox" size={40} /></div>
                <div style={{ fontSize: 15, color: p.dim }}>Sin notificaciones aún</div>
                <div style={{ fontSize: 12, color: p.faint, marginTop: 4 }}>Aquí aparecerán colisiones, avisos y alertas de Autotask (n1–n5) de todo el equipo</div>
              </div>
            ) : (
              <>
                {notifLog.map((n, i) => {
                  const meta = NOTIF_META[n.type] ?? NOTIF_META_DEFAULT;
                  return (
                    <div key={i} style={{
                      background: p.chipBg2, border: `1px solid ${p.headerBorder}`,
                      borderLeft: `3px solid ${meta.color}`,
                      borderRadius: 12, padding: '12px 18px',
                      display: 'flex', alignItems: 'flex-start', gap: 12,
                    }}>
                      <div style={{ color: meta.color, marginTop: 2, flexShrink: 0 }}><Icon name={meta.icon} size={17} /></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{n.title}</div>
                        <div style={{ fontSize: 12, color: p.dim, marginTop: 2 }}>{n.body}</div>
                        <div style={{ fontSize: 11, color: p.faint, marginTop: 4, display: 'flex', gap: 6, alignItems: 'center' }}>
                          {(n.ticketNumber || n.ticketId) && (
                            <span style={{ color: ACCENT, fontWeight: 600 }}>{n.ticketNumber ?? `#${n.ticketId}`}</span>
                          )}
                          <span>·</span>
                          <span>{relTime(n.ts)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {notifLog.length < notifTotal && (
                  <button onClick={loadMoreNotifs} disabled={notifLoadingMore} style={{
                    margin: '4px auto 0', padding: '8px 20px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                    fontFamily: 'inherit', cursor: notifLoadingMore ? 'default' : 'pointer', border: `1px solid ${p.inputBorder}`,
                    background: p.chipBg2, color: p.dim,
                  }}>
                    {notifLoadingMore ? 'Cargando...' : `Cargar más (${notifTotal - notifLog.length} restantes)`}
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {feedbackItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '80px 0', background: p.emptyBg, border: `1px dashed ${p.dashedBorder}`, borderRadius: 20 }}>
                <div style={{ marginBottom: 12, color: ACCENT, display: 'flex', justifyContent: 'center' }}><Icon name="message-square" size={40} /></div>
                <div style={{ fontSize: 15, color: p.dim }}>Sin feedback aún</div>
                <div style={{ fontSize: 12, color: p.faint, marginTop: 4 }}>Lo que envíen los técnicos desde la extensión aparecerá aquí</div>
              </div>
            ) : (
              <>
                {feedbackItems.map((f) => {
                  const meta = FEEDBACK_META[f.type] ?? FEEDBACK_META.otro;
                  return (
                    <div key={f.id} style={{
                      background: p.chipBg2, border: `1px solid ${p.headerBorder}`,
                      borderLeft: `3px solid ${meta.color}`,
                      borderRadius: 12, padding: '12px 18px',
                      display: 'flex', alignItems: 'flex-start', gap: 12,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{
                            padding: '2px 9px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                            background: `${meta.color}22`, color: meta.color,
                          }}>{meta.label}</span>
                          <span style={{ fontSize: 12, fontWeight: 600 }}>{f.resource_name}</span>
                        </div>
                        <div style={{ fontSize: 13, color: p.text, lineHeight: 1.4 }}>{f.message}</div>
                        <div style={{ fontSize: 11, color: p.faint, marginTop: 6 }}>{relTime(new Date(f.created_at).getTime())}</div>
                      </div>
                    </div>
                  );
                })}
                {feedbackItems.length < feedbackTotal && (
                  <button onClick={loadMoreFeedback} disabled={feedbackLoadingMore} style={{
                    margin: '4px auto 0', padding: '8px 20px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                    fontFamily: 'inherit', cursor: feedbackLoadingMore ? 'default' : 'pointer', border: `1px solid ${p.inputBorder}`,
                    background: p.chipBg2, color: p.dim,
                  }}>
                    {feedbackLoadingMore ? 'Cargando...' : `Cargar más (${feedbackTotal - feedbackItems.length} restantes)`}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <Footer color={p.faint} background={p.headerBg} border={p.headerBorder} />

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        input::placeholder { color: ${p.faint}; }
      `}</style>
    </div>
  );
}

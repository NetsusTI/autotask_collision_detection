'use client';

import { useEffect, useState } from 'react';

interface TicketPresence {
  ticketId: string;
  ticketNumber: string | null;
  users: string[];
}

const API_KEY = '-_-ErJy9v64XRiDbpuPFZ3uLs4nVFmXm';

export default function AdminPage() {
  const [tickets, setTickets] = useState<TicketPresence[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);

  async function fetchPresence() {
    try {
      const res = await fetch('/api/presence/status', {
        headers: { 'x-api-key': API_KEY },
      });
      const presence: TicketPresence[] = await res.json().catch(() => []);
      setTickets(Array.isArray(presence) ? presence : []);
      setLastUpdate(new Date());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPresence();
    const interval = setInterval(fetchPresence, 10000);
    return () => clearInterval(interval);
  }, []);

  const totalUsers = tickets.reduce((acc, t) => acc + t.users.length, 0);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0e1a 0%, #0f1628 100%)',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      color: '#fff',
    }}>

      {/* Header */}
      <div style={{
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        padding: '0 40px',
        background: 'rgba(255,255,255,0.03)',
        backdropFilter: 'blur(10px)',
        position: 'sticky',
        top: 0,
        zIndex: 10,
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
              <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.3px' }}>Collision Detection</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: -2 }}>Netsus · Panel de control</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e', animation: 'pulse 2s infinite' }} />
            En vivo · {lastUpdate.toLocaleTimeString('es-CL')}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 40px' }}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 40 }}>
          {[
            { label: 'Tickets activos', value: tickets.length, icon: '🎫' },
            { label: 'Técnicos ocupados', value: totalUsers, icon: '👥' },
            { label: 'Colisiones', value: tickets.filter(t => t.users.length > 1).length, icon: '⚠️' },
          ].map(({ label, value, icon }) => (
            <div key={label} style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 16, padding: '20px 24px',
            }}>
              <div style={{ fontSize: 22, marginBottom: 8 }}>{icon}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#f97316' }}>{value}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Ticket list */}
        <div style={{ marginBottom: 16, fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Tickets en uso
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: 'rgba(255,255,255,0.25)', fontSize: 14 }}>
            Cargando...
          </div>
        ) : tickets.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '80px 0',
            background: 'rgba(255,255,255,0.02)',
            border: '1px dashed rgba(255,255,255,0.1)',
            borderRadius: 20,
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)' }}>Sin colisiones activas</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>Todos los técnicos trabajan sin conflictos</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {tickets.map(({ ticketId, ticketNumber, users }) => (
              <div key={ticketId} style={{
                background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${users.length > 1 ? 'rgba(249,115,22,0.3)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 16, padding: '18px 24px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                transition: 'all 0.2s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: 12,
                    background: users.length > 1 ? 'rgba(249,115,22,0.15)' : 'rgba(255,255,255,0.06)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18,
                  }}>
                    {users.length > 1 ? '⚠️' : '🎫'}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{ticketNumber ?? `#${ticketId}`}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                      {users.length} técnico{users.length > 1 ? 's' : ''} activo{users.length > 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {users.map((user, i) => (
                    <span key={user} style={{
                      padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                      background: i === 0 ? 'linear-gradient(135deg, #f97316, #ea580c)' : 'rgba(255,255,255,0.1)',
                      color: '#fff',
                      boxShadow: i === 0 ? '0 2px 8px rgba(249,115,22,0.3)' : 'none',
                    }}>
                      {user}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

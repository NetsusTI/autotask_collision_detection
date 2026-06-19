'use client';

import { useEffect, useState } from 'react';

interface TicketPresence {
  ticketId: string;
  users: string[];
}

const API_KEY = '-_-ErJy9v64XRiDbpuPFZ3uLs4nVFmXm';

export default function AdminPage() {
  const [tickets, setTickets] = useState<TicketPresence[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  async function fetchPresence() {
    const res = await fetch('/api/ticket-lock/status', {
      headers: { 'x-api-key': API_KEY },
    });

    const locks: Record<string, string> = await res.json().catch(() => ({}));

    const presenceRes = await fetch('/api/presence/status', {
      headers: { 'x-api-key': API_KEY },
    });
    const presence: Record<string, string[]> = await presenceRes.json().catch(() => ({}));

    const merged: TicketPresence[] = Object.entries(presence).map(([ticketId, users]) => ({
      ticketId,
      users,
    }));

    setTickets(merged);
    setLastUpdate(new Date());
  }

  useEffect(() => {
    fetchPresence();
    const interval = setInterval(fetchPresence, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '32px', background: '#0f0f1a', minHeight: '100vh', color: '#eee' }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <h1 style={{ color: '#e67e22', fontSize: 22, marginBottom: 4 }}>
          Panel — Autotask Collision Detection
        </h1>
        <p style={{ color: '#888', fontSize: 13, marginBottom: 32 }}>
          Actualización automática cada 10s · Última: {lastUpdate.toLocaleTimeString('es-CL')}
        </p>

        {tickets.length === 0 ? (
          <div style={{ color: '#555', textAlign: 'center', marginTop: 80, fontSize: 15 }}>
            Sin colisiones activas
          </div>
        ) : (
          tickets.map(({ ticketId, users }) => (
            <div key={ticketId} style={{
              background: '#1e1e2e', borderRadius: 10, padding: '16px 20px',
              marginBottom: 12, borderLeft: '4px solid #e67e22',
            }}>
              <div style={{ fontSize: 13, color: '#888', marginBottom: 6 }}>Ticket #{ticketId}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {users.map((u) => (
                  <span key={u} style={{
                    background: '#e67e22', color: '#fff', borderRadius: 20,
                    padding: '3px 12px', fontSize: 13, fontWeight: 600,
                  }}>
                    {u}
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

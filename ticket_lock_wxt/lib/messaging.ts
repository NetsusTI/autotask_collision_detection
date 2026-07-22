// Protocolo de mensajes entre el content script (por pestaña, corre en la página
// de Autotask) y el side panel (una sola página de extensión que sigue a la
// pestaña activa). El side panel no toca el DOM del ticket — todo el estado
// viaja por mensajes.

export interface OtherUser { name: string; minutes: number; }

export type TicketState =
  | { kind: 'idle' }
  | { kind: 'solo'; ticketLabel: string; ticketTitle?: string }
  | { kind: 'collision'; others: OtherUser[]; ticketLabel: string; ticketTitle?: string }
  | { kind: 'liberated'; ticketLabel: string; ticketTitle?: string }
  | { kind: 'paused'; secsLeft: number };

export interface TicketWarnings {
  offline: boolean;
  historyCount: number | null;
  assignedTo: string | null;
}

export interface StatePayload {
  state: TicketState;
  warnings: TicketWarnings;
}

export interface StateMessage {
  type: 'NSB_STATE';
  payload: StatePayload;
}

export type ActionKind =
  | { action: 'ping' }
  | { action: 'finish' }
  | { action: 'pause'; minutes: number }
  | { action: 'cancelPause' };

export type ActionMessage = { type: 'NSB_ACTION' } & ActionKind;

export interface RequestStateMessage {
  type: 'NSB_REQUEST_STATE';
}

export type ContentToPanelMessage = StateMessage;
export type PanelToContentMessage = ActionMessage | RequestStateMessage;

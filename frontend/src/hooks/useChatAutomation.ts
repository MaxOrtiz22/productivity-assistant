/**
 * useChatAutomation.ts
 *
 * Hook principal para manejar:
 * - Conversación con el chat
 * - Propuestas de cambios
 * - Confirmación/rechazo
 * - Sincronización con Local Storage
 */

import { useState, useCallback, useEffect } from 'react';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface TaskChange {
  action: 'add' | 'modify' | 'delete';
  id?: string;
  name: string;
  deadline?: string;
  difficulty?: number;
  priority?: string;
  estimated_hours?: number;
  description?: string;
}

export interface CalendarEvent {
  date: string;
  time: string;
  task_id: string;
  title: string;
  hours: number;
}

export interface Proposal {
  understanding: string;
  tasks: TaskChange[];
  calendar: CalendarEvent[];
  conflicts: string[];
  explanation: string;
}

export interface AppState {
  tasks: any[];
  calendar: any[];
  notes: any[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Resuelve la URL del backend para Vite (VITE_BACKEND_URL)
 * y como fallback CRA (REACT_APP_BACKEND_URL).
 * Si ninguna está definida, cae a localhost para desarrollo local.
 */
function resolveBackendUrl(): string {
  // Vite expone variables de entorno en import.meta.env
  try {
    const viteUrl = (import.meta as any).env?.VITE_BACKEND_URL;
    if (viteUrl) return viteUrl;
  } catch { /* CRA no soporta import.meta */ }

  // Fallback CRA
  const craUrl = (typeof process !== 'undefined')
    ? (process.env as any).REACT_APP_BACKEND_URL
    : undefined;
  if (craUrl) return craUrl;

  return 'http://localhost:8000';
}

// ── Hook principal ─────────────────────────────────────────────────────────────

export function useChatAutomation() {
  const BACKEND_URL = resolveBackendUrl();

  const [conversationId, setConversationId] = useState<string>('');
  const [messages,       setMessages]       = useState<Message[]>([]);
  const [proposal,       setProposal]       = useState<Proposal | null>(null);
  const [proposalLoading,setProposalLoading]= useState(false);
  const [appState,       setAppState]       = useState<AppState>(loadFromLocalStorage());
  const [error,          setError]          = useState<string | null>(null);

  // Cargar conversación guardada al montar
  useEffect(() => {
    const savedConvId = localStorage.getItem('activeConversationId');
    if (savedConvId) {
      setConversationId(savedConvId);
      loadConversationHistory(savedConvId);
      loadCalendarEvents(savedConvId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Local Storage ─────────────────────────────────────────────────────────

  function loadFromLocalStorage(): AppState {
    try {
      const saved = localStorage.getItem('appState');
      if (saved) return JSON.parse(saved);
    } catch (err) {
      console.error('Error cargando del localStorage:', err);
    }
    return { tasks: [], calendar: [], notes: [] };
  }

  function saveToLocalStorage(state: AppState) {
    try {
      localStorage.setItem('appState', JSON.stringify(state));
    } catch (err) {
      console.error('Error guardando a localStorage:', err);
    }
  }

  function saveMessagesToLocalStorage(msgs: Message[]) {
    try {
      localStorage.setItem('chatMessages', JSON.stringify(msgs));
    } catch (err) {
      console.error('Error guardando mensajes:', err);
    }
  }

  function saveDraftProposal(prop: Proposal | null) {
    try {
      if (prop) localStorage.setItem('draftProposal', JSON.stringify(prop));
      else      localStorage.removeItem('draftProposal');
    } catch (err) {
      console.error('Error guardando borrador:', err);
    }
  }

  // ── Carga de eventos del calendario ───────────────────────────────────────

  /**
   * Obtiene los eventos del backend (ambas fuentes: app_state + calendar_state)
   * y actualiza appState.calendar.
   */
  const loadCalendarEvents = useCallback(
    async (convId: string) => {
      if (!convId) return;
      try {
        const response = await fetch(`${BACKEND_URL}/api/calendar/${convId}`);
        if (response.ok) {
          const data = await response.json();
          setAppState(prev => {
            const updated = { ...prev, calendar: data.events || [] };
            saveToLocalStorage(updated);
            return updated;
          });
        }
      } catch (err) {
        console.error('Error cargando eventos del calendario:', err);
      }
    },
    [BACKEND_URL]
  );

  // ── Historial de conversación ─────────────────────────────────────────────

  const loadConversationHistory = useCallback(
    async (convId: string) => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/conversation/${convId}`);
        if (response.ok) {
          const data = await response.json();
          const msgs: Message[] = data.messages.map((msg: any) => ({
            role:      msg.role,
            content:   msg.content,
            timestamp: msg.timestamp,
          }));
          setMessages(msgs);
          saveMessagesToLocalStorage(msgs);

          if (data.has_proposed_changes) {
            const drafted = localStorage.getItem('draftProposal');
            if (drafted) setProposal(JSON.parse(drafted));
          }
        }
      } catch (err) {
        console.error('Error cargando historial:', err);
      }
    },
    [BACKEND_URL]
  );

  // ── Chat ──────────────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (userMessage: string) => {
      if (!userMessage.trim()) return;

      setError(null);
      setProposalLoading(true);

      try {
        // 1. Agregar mensaje del usuario
        const newMessage: Message = {
          role:      'user',
          content:   userMessage,
          timestamp: new Date().toISOString(),
        };
        const updatedMessages = [...messages, newMessage];
        setMessages(updatedMessages);
        saveMessagesToLocalStorage(updatedMessages);

        // 2. Enviar al backend
        const response = await fetch(`${BACKEND_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message:         userMessage,
            conversation_id: conversationId || undefined,
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.detail || `Error ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // 3. Guardar conversation_id si es la primera vez
        const activeConvId = conversationId || data.conversation_id;
        if (!conversationId && data.conversation_id) {
          setConversationId(data.conversation_id);
          localStorage.setItem('activeConversationId', data.conversation_id);
        }

        // 4. Manejar tipos de respuesta
        if (data.type === 'calendar_proposal') {
          // Propuesta de evento jerárquico (create_calendar_event=true)
          const aiMessage: Message = {
            role:      'assistant',
            content:   data.reasoning || 'Propuesta de calendario generada.',
            timestamp: new Date().toISOString(),
          };
          const finalMessages = [...updatedMessages, aiMessage];
          setMessages(finalMessages);
          saveMessagesToLocalStorage(finalMessages);
          // No mostramos ProposalCard para este tipo aún
          // TODO: implementar tarjeta específica para calendar_proposal

        } else {
          // Propuesta regular de tareas/calendario
          const aiMessage: Message = {
            role:      'assistant',
            content:   data.explanation || 'Propuesta generada.',
            timestamp: new Date().toISOString(),
          };
          const finalMessages = [...updatedMessages, aiMessage];
          setMessages(finalMessages);
          saveMessagesToLocalStorage(finalMessages);

          if (data.proposed_changes) {
            const newProposal: Proposal = {
              understanding: data.understanding || '',
              tasks:         data.proposed_changes.tasks     || [],
              calendar:      data.proposed_changes.calendar  || [],
              conflicts:     data.proposed_changes.conflicts || [],
              explanation:   data.proposed_changes.explanation || '',
            };
            setProposal(newProposal);
            saveDraftProposal(newProposal);
          }
        }

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Error desconocido';
        setError(errorMsg);
        console.error('Error enviando mensaje:', err);
      } finally {
        setProposalLoading(false);
      }
    },
    [conversationId, messages, BACKEND_URL]
  );

  // ── Confirmación / rechazo / ajuste ───────────────────────────────────────

  const confirmChanges = useCallback(
    async () => {
      if (!conversationId || !proposal) {
        setError('No hay propuesta para confirmar');
        return;
      }

      setProposalLoading(true);
      setError(null);

      try {
        const response = await fetch(`${BACKEND_URL}/api/confirm-changes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversation_id: conversationId }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.detail || `Error ${response.status}`);
        }

        const data = await response.json();

        // Actualizar estado local con el nuevo estado del backend
        const newState = data.new_state as AppState;
        setAppState(newState);
        saveToLocalStorage(newState);

        // Limpiar propuesta
        setProposal(null);
        saveDraftProposal(null);

        // Sincronizar calendario (incluye calendar_state jerárquico)
        await loadCalendarEvents(conversationId);

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Error desconocido';
        setError(errorMsg);
        console.error('Error confirmando cambios:', err);
      } finally {
        setProposalLoading(false);
      }
    },
    [conversationId, proposal, BACKEND_URL, loadCalendarEvents]
  );

  const rejectProposal = useCallback(() => {
    setProposal(null);
    saveDraftProposal(null);
  }, []);

  const adjustProposal = useCallback(
    async (adjustment: string) => {
      if (!conversationId || !adjustment.trim()) {
        setError('Mensaje de ajuste vacío');
        return;
      }

      setProposalLoading(true);
      setError(null);

      try {
        const response = await fetch(`${BACKEND_URL}/api/adjust-proposal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversation_id: conversationId, adjustment }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.detail || `Error ${response.status}`);
        }

        const data = await response.json();

        const adjustmentMessage: Message = {
          role: 'user', content: adjustment, timestamp: new Date().toISOString(),
        };
        const aiMessage: Message = {
          role: 'assistant', content: data.explanation || '', timestamp: new Date().toISOString(),
        };
        const updatedMessages = [...messages, adjustmentMessage, aiMessage];
        setMessages(updatedMessages);
        saveMessagesToLocalStorage(updatedMessages);

        if (data.proposed_changes) {
          const newProposal: Proposal = {
            understanding: data.understanding || '',
            tasks:         data.proposed_changes.tasks     || [],
            calendar:      data.proposed_changes.calendar  || [],
            conflicts:     data.proposed_changes.conflicts || [],
            explanation:   data.proposed_changes.explanation || '',
          };
          setProposal(newProposal);
          saveDraftProposal(newProposal);
        }

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Error desconocido';
        setError(errorMsg);
        console.error('Error ajustando propuesta:', err);
      } finally {
        setProposalLoading(false);
      }
    },
    [conversationId, messages, BACKEND_URL]
  );

  // ── Retorno ───────────────────────────────────────────────────────────────

  return {
    messages,
    conversationId,
    sendMessage,
    proposal,
    proposalLoading,
    confirmChanges,
    rejectProposal,
    adjustProposal,
    appState,
    error,
    setError,
  };
}
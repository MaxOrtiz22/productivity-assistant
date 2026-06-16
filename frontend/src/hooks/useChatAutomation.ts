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

// Tipos
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

// Hook principal
export function useChatAutomation() {
  // URL del backend
  const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
  
  // Estado de la conversación
  const [conversationId, setConversationId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  
  // Estado de la propuesta (lo que la IA sugiere, aún no aplicado)
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [proposalLoading, setProposalLoading] = useState(false);
  
  // Estado de la aplicación (tareas, calendario, notas)
  const [appState, setAppState] = useState<AppState>(loadFromLocalStorage());
  
  // Estados de UI
  const [error, setError] = useState<string | null>(null);
  
  // Cargar conversación guardada si existe
  useEffect(() => {
    const savedConvId = localStorage.getItem('activeConversationId');
    if (savedConvId) {
      console.log('Cargando conversación:', savedConvId);
      setConversationId(savedConvId);
      // Opcionalmente: cargar el historial de mensajes desde el backend
      loadConversationHistory(savedConvId);
      loadCalendarEvents(savedConvId);
    }
  }, []);
  
  // ========================================================================
  // FUNCIONES DE LOCAL STORAGE
  // ========================================================================
  
  /**
   * Carga el estado de la aplicación desde Local Storage
   */
  function loadFromLocalStorage(): AppState {
    try {
      const saved = localStorage.getItem('appState');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (err) {
      console.error('Error cargando del localStorage:', err);
    }
    
    return {
      tasks: [],
      calendar: [],
      notes: []
    };
  }
  
  /**
   * Guarda el estado en Local Storage
   */
  function saveToLocalStorage(state: AppState) {
    try {
      localStorage.setItem('appState', JSON.stringify(state));
    } catch (err) {
      console.error('Error guardando a localStorage:', err);
    }
  }
  
  /**
   * Guarda el historial de mensajes en Local Storage
   */
  function saveMessagesToLocalStorage(msgs: Message[]) {
    try {
      localStorage.setItem('chatMessages', JSON.stringify(msgs));
    } catch (err) {
      console.error('Error guardando mensajes:', err);
    }
  }
  
  /**
   * Guarda la propuesta en borrador
   */
  function saveDraftProposal(prop: Proposal | null) {
    try {
      if (prop) {
        localStorage.setItem('draftProposal', JSON.stringify(prop));
      } else {
        localStorage.removeItem('draftProposal');
      }
    } catch (err) {
      console.error('Error guardando borrador:', err);
    }
  }
  
// ========================================================================
// FUNCIONES DE CARGA (primero)
// ========================================================================

/**
 * Carga eventos del calendario desde el backend
 */
const loadCalendarEvents = useCallback(
  async (convId: string) => {
    if (!convId) return;
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/calendar/${convId}`);
      if (response.ok) {
        const data = await response.json();
        console.log('Eventos cargados:', data.events);
        
        // Usar setState funcional para evitar dependencias
        setAppState(prevState => {
          const updatedState = {
            ...prevState,           // Funcional: no necesita appState en dependencias
            calendar: data.events || []
          };
          saveToLocalStorage(updatedState);
          return updatedState;
        });
      }
    } catch (err) {
      console.error('Error cargando eventos del calendario:', err);
    }
  },
  [BACKEND_URL]    // Solo BACKEND_URL en dependencias
);

/**
 * Carga el historial de una conversación (opcional, para debugging)
 */
const loadConversationHistory = useCallback(
  async (convId: string) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/conversation/${convId}`);
      if (response.ok) {
        const data = await response.json();
        const msgs: Message[] = data.messages.map((msg: any) => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp
        }));
        setMessages(msgs);
        saveMessagesToLocalStorage(msgs);
        
        if (data.has_proposed_changes) {
          const drafted = localStorage.getItem('draftProposal');
          if (drafted) {
            setProposal(JSON.parse(drafted));
          }
        }
      }
    } catch (err) {
      console.error('Error cargando historial:', err);
    }
  },
  [BACKEND_URL]
);

  // ========================================================================
  // FUNCIONES DEL CHAT
  // ========================================================================
  
  /**
   * Envía un mensaje al backend
   */
  const sendMessage = useCallback(
    async (userMessage: string) => {
      if (!userMessage.trim()) return;
      
      setError(null);
      setProposalLoading(true);
      
      try {
        // 1. Agregar mensaje del usuario al historial local
        const newMessage: Message = {
          role: 'user',
          content: userMessage,
          timestamp: new Date().toISOString()
        };
        const updatedMessages = [...messages, newMessage];
        setMessages(updatedMessages);
        saveMessagesToLocalStorage(updatedMessages);
        
        // 2. Enviar al backend
        const response = await fetch(`${BACKEND_URL}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: userMessage,
            conversation_id: conversationId || undefined
          })
        });
        
        if (!response.ok) {
          throw new Error(`Error del backend: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // 3. Si es la primera vez, guardar conversation_id
        if (!conversationId) {
          setConversationId(data.conversation_id);
          localStorage.setItem('activeConversationId', data.conversation_id);
        }
        
        // 4. Agregar respuesta de la IA al historial
        const aiMessage: Message = {
          role: 'assistant',
          content: data.explanation,
          timestamp: new Date().toISOString()
        };
        const finalMessages = [...updatedMessages, aiMessage];
        setMessages(finalMessages);
        saveMessagesToLocalStorage(finalMessages);
        
        // 5. Mostrar propuesta (sin aplicarla)
        const newProposal: Proposal = {
          understanding: data.understanding,
          tasks: data.proposed_changes.tasks,
          calendar: data.proposed_changes.calendar,
          conflicts: data.proposed_changes.conflicts,
          explanation: data.proposed_changes.explanation
        };
        setProposal(newProposal);
        saveDraftProposal(newProposal);
        
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
  
  // ========================================================================
  // FUNCIONES DE PROPUESTA
  // ========================================================================
  
  /**
   * Confirma los cambios propuestos y los aplica
   */
  const confirmChanges = useCallback(
    async () => {
      if (!conversationId || !proposal) {
        setError('No hay propuesta para confirmar');
        return;
      }
      
      setProposalLoading(true);
      setError(null);
      
      try {
        // 1. Enviar confirmación al backend
        const response = await fetch(`${BACKEND_URL}/api/confirm-changes`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            conversation_id: conversationId
          })
        });
        
        if (!response.ok) {
          throw new Error(`Error al confirmar: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log("Cambios confirmados:", data);
        
        // 2. Actualizar estado local con los cambios aplicados
        const newState = data.new_state as AppState;
        setAppState(newState);
        saveToLocalStorage(newState);
        
        // 3. Limpiar propuesta temporal
        setProposal(null);
        saveDraftProposal(null);

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
  
  /**
   * Rechaza la propuesta actual
   */
  const rejectProposal = useCallback(
    () => {
      setProposal(null);
      saveDraftProposal(null);
      // El usuario puede escribir de nuevo
    },
    []
  );
  
  /**
   * Ajusta la propuesta (usuario quiere cambios)
   */
  const adjustProposal = useCallback(
    async (adjustment: string) => {
      if (!conversationId || !adjustment.trim()) {
        setError('Mensaje de ajuste vacío');
        return;
      }
      
      setProposalLoading(true);
      setError(null);
      
      try {
        // 1. Enviar ajuste al backend
        const response = await fetch(`${BACKEND_URL}/api/adjust-proposal`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            conversation_id: conversationId,
            adjustment
          })
        });
        
        if (!response.ok) {
          throw new Error(`Error al ajustar: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // 2. Actualizar historial de mensajes
        const adjustmentMessage: Message = {
          role: 'user',
          content: adjustment,
          timestamp: new Date().toISOString()
        };
        const aiMessage: Message = {
          role: 'assistant',
          content: data.explanation,
          timestamp: new Date().toISOString()
        };
        const updatedMessages = [...messages, adjustmentMessage, aiMessage];
        setMessages(updatedMessages);
        saveMessagesToLocalStorage(updatedMessages);
        
        // 3. Mostrar nueva propuesta
        const newProposal: Proposal = {
          understanding: data.understanding,
          tasks: data.proposed_changes.tasks,
          calendar: data.proposed_changes.calendar,
          conflicts: data.proposed_changes.conflicts,
          explanation: data.proposed_changes.explanation
        };
        setProposal(newProposal);
        saveDraftProposal(newProposal);
        
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
  
  // ========================================================================
  // RETORNO
  // ========================================================================
  
  return {
    // Chat
    messages,
    conversationId,
    sendMessage,
    
    // Propuesta
    proposal,
    proposalLoading,
    confirmChanges,
    rejectProposal,
    adjustProposal,
    
    // App State
    appState,
    
    // UI
    error,
    setError
  };
}
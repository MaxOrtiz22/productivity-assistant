/**
 * ProductivityApp.tsx
 * 
 * Componente principal que integra:
 * - Chat dump
 * - Vista previa de cambios
 * - Botones de acción
 * - Visualización del calendario/tareas
 */

import React, { useState, useRef, useEffect } from 'react';
import { useChatAutomation, Message, Proposal } from '../hooks/useChatAutomation';
import './ProductivityApp.css'

export function ProductivityApp() {
  const {
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
    setError
  } = useChatAutomation();
  
  const [inputValue, setInputValue] = useState('');
  const [adjustmentValue, setAdjustmentValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll al final del chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  const handleSendMessage = () => {
    if (inputValue.trim() && !proposalLoading) {
      sendMessage(inputValue);
      setInputValue('');
    }
  };
  
  const handleAdjustProposal = () => {
    if (adjustmentValue.trim() && !proposalLoading) {
      adjustProposal(adjustmentValue);
      setAdjustmentValue('');
    }
  };
  
  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      handleSendMessage();
    }
  };
  
  return (
    <div className="productivity-app">
      {/* Header */}
      <header className="app-header">
        <h1>Productivity Assistant</h1>
        <p className="subtitle">Escribe lo que tienes que hacer. La IA organiza tu calendario.</p>
      </header>
      
      <div className="app-container">
        {/* Sidebar: Chat */}
        <section className="chat-section">
          <div className="chat-header">
            <h2>Chat</h2>
            {conversationId && (
              <span className="conversation-id">ID: {conversationId.slice(0, 8)}...</span>
            )}
          </div>
          
          {/* Historial de mensajes */}
          <div className="messages-container">
            {messages.length === 0 ? (
              <div className="empty-state">
                <p>Empieza escribiendo lo que tienes que hacer hoy.</p>
                <p className="hint">Ejemplo: "Tengo proyecto X el viernes, meeting martes 3pm..."</p>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div key={idx} className={`message message-${msg.role}`}>
                  <div className="message-header">
                    <span className="role">{msg.role === 'user' ? 'Tú' : 'IA'}</span>
                    <span className="time">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="message-content">{msg.content}</div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
          
          {/* Input del chat */}
          <div className="chat-input-area">
            {error && (
              <div className="error-message">
                <span>{error}</span>
                <button onClick={() => setError(null)}>×</button>
              </div>
            )}
            
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Escribe lo que tienes que hacer (Ctrl+Enter para enviar)..."
              disabled={proposalLoading}
              rows={3}
            />
            
            <button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || proposalLoading}
              className="send-button"
            >
              {proposalLoading ? 'Analizando...' : 'Enviar'}
            </button>
          </div>
        </section>
        
        {/* Main: Propuesta o App State */}
        <section className="main-section">
          {proposal ? (
            <ProposalPreview
              proposal={proposal}
              loading={proposalLoading}
              onConfirm={confirmChanges}
              onReject={rejectProposal}
              onAdjust={adjustProposal}
              adjustmentValue={adjustmentValue}
              onAdjustmentChange={setAdjustmentValue}
              handleAdjust={handleAdjustProposal}
            />
          ) : (
            <AppStateView appState={appState} />
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * Componente: Vista previa de la propuesta
 */
interface ProposalPreviewProps {
  proposal: Proposal;
  loading: boolean;
  onConfirm: () => void;
  onReject: () => void;
  onAdjust: (adjustment: string) => void;
  adjustmentValue: string;
  onAdjustmentChange: (value: string) => void;
  handleAdjust: () => void;
}

function ProposalPreview({
  proposal,
  loading,
  onConfirm,
  onReject,
  onAdjust,
  adjustmentValue,
  onAdjustmentChange,
  handleAdjust
}: ProposalPreviewProps) {
  const [showFullProposal, setShowFullProposal] = useState(false);
  
  const tasksToAdd = proposal.tasks.filter(t => t.action === 'add').length;
  const tasksToModify = proposal.tasks.filter(t => t.action === 'modify').length;
  const tasksToDelete = proposal.tasks.filter(t => t.action === 'delete').length;
  
  return (
    <div className="proposal-preview">
      <div className="proposal-header">
        <h2>Propuesta de cambios</h2>
        <p className="understanding">{proposal.understanding}</p>
      </div>
      
      {/* Summary de cambios */}
      <div className="proposal-summary">
        <div className="summary-item">
          <span className="label">Tareas nuevas</span>
          <span className="count add">{tasksToAdd}</span>
        </div>
        <div className="summary-item">
          <span className="label">Modificadas</span>
          <span className="count modify">{tasksToModify}</span>
        </div>
        <div className="summary-item">
          <span className="label">Eliminadas</span>
          <span className="count delete">{tasksToDelete}</span>
        </div>
        <div className="summary-item">
          <span className="label">Eventos calendario</span>
          <span className="count">{proposal.calendar.length}</span>
        </div>
      </div>
      
      {/* Advertencias de conflictos */}
      {proposal.conflicts.length > 0 && (
        <div className="conflicts-section">
          <h3>⚠️ Posibles conflictos:</h3>
          <ul>
            {proposal.conflicts.map((conflict, idx) => (
              <li key={idx}>{conflict}</li>
            ))}
          </ul>
        </div>
      )}
      
      {/* Explicación detallada */}
      <div className="explanation-section">
        <h3>Plan detallado</h3>
        <div className="explanation-text">{proposal.explanation}</div>
      </div>
      
      {/* Detalles completos (expandible) */}
      {showFullProposal && (
        <div className="full-proposal-details">
          <h3>Detalles técnicos</h3>
          
          <div className="tasks-detail">
            <h4>Cambios a tareas:</h4>
            {proposal.tasks.length === 0 ? (
              <p className="no-items">Sin cambios a tareas</p>
            ) : (
              <ul>
                {proposal.tasks.map((task, idx) => (
                  <li key={idx} className={`task-change ${task.action}`}>
                    <span className="action">{task.action.toUpperCase()}</span>
                    <span className="name">{task.name}</span>
                    {task.deadline && <span className="deadline">{task.deadline}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          
          <div className="calendar-detail">
            <h4>Eventos de calendario:</h4>
            {proposal.calendar.length === 0 ? (
              <p className="no-items">Sin eventos de calendario</p>
            ) : (
              <ul>
                {proposal.calendar.map((event, idx) => (
                  <li key={idx}>
                    {event.date} {event.time} - {event.title} ({event.hours}h)
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      
      <button
        onClick={() => setShowFullProposal(!showFullProposal)}
        className="toggle-details-button"
      >
        {showFullProposal ? 'Ocultar' : 'Ver'} detalles técnicos
      </button>
      
      {/* Sección de ajustes */}
      <div className="adjustment-section">
        <h3>¿Quieres ajustar algo?</h3>
        <textarea
          value={adjustmentValue}
          onChange={(e) => onAdjustmentChange(e.target.value)}
          placeholder="Ej: 'Pero no quiero trabajar el jueves', 'Agrega otra tarea...'..."
          rows={2}
          disabled={loading}
        />
        <button
          onClick={handleAdjust}
          disabled={!adjustmentValue.trim() || loading}
          className="adjust-button"
        >
          {loading ? 'Analizando...' : 'Preguntar/Ajustar'}
        </button>
      </div>
      
      {/* Botones de acción principales */}
      <div className="proposal-actions">
        <button
          onClick={onReject}
          disabled={loading}
          className="btn btn-reject"
        >
          Rechazar
        </button>
        
        <button
          onClick={onConfirm}
          disabled={loading}
          className="btn btn-confirm"
        >
          {loading ? 'Aplicando...' : 'Confirmar y aplicar'}
        </button>
      </div>
    </div>
  );
}

/**
 * Componente: Vista del estado actual de la app
 */
interface AppStateViewProps {
  appState: any;
}

function AppStateView({ appState }: AppStateViewProps) {
  return (
    <div className="app-state-view">
      <div className="app-header">
        <h2>Tu calendario y tareas</h2>
      </div>
      
      <div className="state-sections">
        {/* Tareas */}
        <section className="state-section">
          <h3>📝 Tareas ({appState.tasks.length})</h3>
          {appState.tasks.length === 0 ? (
            <p className="empty">Escribe en el chat para agregar tareas</p>
          ) : (
            <ul className="tasks-list">
              {appState.tasks.map((task, idx) => (
                <li key={idx} className={`task-item priority-${task.priority}`}>
                  <div className="task-name">{task.name}</div>
                  <div className="task-meta">
                    {task.deadline && <span className="deadline">{task.deadline}</span>}
                    {task.estimated_hours && <span className="hours">{task.estimated_hours}h</span>}
                    {task.difficulty && <span className="difficulty">Dif: {task.difficulty}/5</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        
        {/* Calendario */}
        <section className="state-section">
          <h3>📅 Calendario ({appState.calendar.length})</h3>
          {appState.calendar.length === 0 ? (
            <p className="empty">Los eventos aparecerán aquí</p>
          ) : (
            <ul className="calendar-list">
              {appState.calendar.map((event, idx) => (
                <li key={idx} className="calendar-item">
                  <div className="event-date">{event.date}</div>
                  <div className="event-time">{event.time}</div>
                  <div className="event-title">{event.title}</div>
                  <div className="event-duration">{event.hours}h</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      
      <p className="hint">
        💡 Escribe en el chat para agregar más tareas o cambios
      </p>
    </div>
  );
}
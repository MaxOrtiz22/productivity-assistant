/**
 * ProductivityApp.tsx — Layout v4
 * Sidebar colapsable + 3 vistas: Chat (split), Tareas (full), Calendario (full)
 */

import React, { useState, useRef, useEffect } from 'react';
import { useChatAutomation } from '../hooks/useChatAutomation';
import { Calendar } from './calendar';
import './ProductivityApp.css';

// ============================================================
// ICONS
// ============================================================

const IconPanel = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M9 3v18" />
  </svg>
);

const IconChat = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const IconTasks = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 11 12 14 22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
);

const IconCalendar = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const IconSend = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
  </svg>
);

// ============================================================
// UTILS
// ============================================================

function getGreeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Buenos días';
  if (h >= 12 && h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

type ViewType = 'chat' | 'tasks' | 'calendar';
type ChatState = ReturnType<typeof useChatAutomation>;

// ============================================================
// SIDEBAR
// ============================================================

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  activeView: ViewType;
  onViewChange: (v: ViewType) => void;
  taskCount: number;
  eventCount: number;
}

function Sidebar({ collapsed, onToggle, activeView, onViewChange, taskCount, eventCount }: SidebarProps) {
  const items: { id: ViewType; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'chat',       label: 'Chat',       icon: <IconChat /> },
    { id: 'tasks',      label: 'Tareas',     icon: <IconTasks />, badge: taskCount || undefined },
    { id: 'calendar',   label: 'Calendario', icon: <IconCalendar />, badge: eventCount || undefined },
  ];

  return (
    <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}>
      <div className="sidebar__top">
        <button className="sidebar__toggle" onClick={onToggle} title="Alternar barra lateral">
          <IconPanel />
        </button>
        {!collapsed && <span className="sidebar__brand">PA</span>}
      </div>

      <nav className="sidebar__nav">
        {items.map(item => (
          <button
            key={item.id}
            className={`sidebar__item${activeView === item.id ? ' sidebar__item--active' : ''}`}
            onClick={() => onViewChange(item.id)}
            title={collapsed ? item.label : undefined}
          >
            <span className="sidebar__item-icon">{item.icon}</span>
            {!collapsed && <span className="sidebar__item-label">{item.label}</span>}
            {!collapsed && item.badge !== undefined && item.badge > 0 && (
              <span className="sidebar__item-badge">{item.badge}</span>
            )}
          </button>
        ))}
      </nav>

      {/* Badge de eventos en calendario (siempre visible) */}
      <div className="sidebar__calendar-info">
        <div className="sidebar__calendar-badge">
          <IconCalendar />
          <span className="sidebar__calendar-count">{eventCount}</span>
        </div>
      </div>
    </aside>
  );
}

// ============================================================
// PROPOSAL CARD
// ============================================================

interface ProposalCardProps {
  proposal: any;
  loading: boolean;
  onConfirm: () => void;
  onReject: () => void;
  onAdjust: (text: string) => void;
}

function ProposalCard({ proposal, loading, onConfirm, onReject, onAdjust }: ProposalCardProps) {
  const [adjustText, setAdjustText] = useState('');
  const [showAdjust, setShowAdjust] = useState(false);

  const addCount = proposal.tasks.filter((t: any) => t.action === 'add').length;
  const modCount = proposal.tasks.filter((t: any) => t.action === 'modify').length;
  const delCount = proposal.tasks.filter((t: any) => t.action === 'delete').length;

  return (
    <div className="proposal-card">
      <span className="proposal-card__tag">Propuesta</span>

      {proposal.understanding && (
        <p className="proposal-card__context">{proposal.understanding}</p>
      )}

      <div className="proposal-stats">
        <div className="pstat">
          <span className="pstat__num pstat__num--add">{addCount}</span>
          <span className="pstat__lbl">Nuevas</span>
        </div>
        <div className="pstat">
          <span className="pstat__num pstat__num--mod">{modCount}</span>
          <span className="pstat__lbl">Modificadas</span>
        </div>
        <div className="pstat">
          <span className="pstat__num pstat__num--del">{delCount}</span>
          <span className="pstat__lbl">Eliminadas</span>
        </div>
        <div className="pstat">
          <span className="pstat__num">{proposal.calendar.length}</span>
          <span className="pstat__lbl">Eventos</span>
        </div>
      </div>

      {proposal.conflicts?.length > 0 && (
        <div className="proposal-card__conflicts">
          {proposal.conflicts.map((c: string, i: number) => (
            <p key={i}>{c}</p>
          ))}
        </div>
      )}

      <p className="proposal-card__explanation">{proposal.explanation}</p>

      {showAdjust && (
        <div className="proposal-card__adjust">
          <textarea
            className="adjust-textarea"
            value={adjustText}
            onChange={e => setAdjustText(e.target.value)}
            placeholder="Describe los cambios que necesitas..."
            rows={2}
            disabled={loading}
          />
          <button
            className="btn btn--outline"
            onClick={() => {
              onAdjust(adjustText);
              setAdjustText('');
              setShowAdjust(false);
            }}
            disabled={!adjustText.trim() || loading}
          >
            {loading ? 'Analizando...' : 'Enviar ajuste'}
          </button>
        </div>
      )}

      <div className="proposal-card__actions">
        <button className="btn btn--ghost" onClick={onReject} disabled={loading}>
          Descartar
        </button>
        <button
          className="btn btn--outline"
          onClick={() => setShowAdjust(v => !v)}
          disabled={loading}
        >
          Ajustar
        </button>
        <button className="btn btn--primary" onClick={onConfirm} disabled={loading}>
          {loading ? 'Aplicando...' : 'Confirmar'}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// CHAT VIEW
// ============================================================

function ChatView({ state }: { state: ChatState }) {
  const {
    messages,
    sendMessage,
    proposal,
    proposalLoading,
    confirmChanges,
    rejectProposal,
    adjustProposal,
    error,
    setError,
  } = state;

  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const hasMessages = messages.length > 0;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, proposal]);

  const doSend = () => {
    if (!input.trim() || proposalLoading) return;
    sendMessage(input.trim());
    setInput('');
    if (taRef.current) taRef.current.style.height = 'auto';
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  };

  const onTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
  };

  return (
    <div className="chat-view">
      <div className="chat-body">
        <div className="chat-body__inner">
          {!hasMessages ? (
            <div className="welcome">
              <h1 className="welcome__title">{getGreeting()}</h1>
              <p className="welcome__sub">¿Con qué empezamos?</p>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => (
                <div key={i} className={`msg msg--${msg.role}`}>
                  <div className="msg__bubble">{msg.content}</div>
                </div>
              ))}

              {proposal && (
                <ProposalCard
                  proposal={proposal}
                  loading={proposalLoading}
                  onConfirm={confirmChanges}
                  onReject={rejectProposal}
                  onAdjust={adjustProposal}
                />
              )}

              <div ref={endRef} />
            </>
          )}
        </div>
      </div>

      <div className="chat-footer">
        <div className="chat-footer__inner">
          {error && (
            <div className="chat-error">
              <span>{error}</span>
              <button onClick={() => setError(null)}>×</button>
            </div>
          )}
          <div className={`chat-inputbox${proposalLoading ? ' chat-inputbox--busy' : ''}`}>
            <textarea
              ref={taRef}
              className="chat-inputbox__field"
              value={input}
              onChange={onTextChange}
              onKeyDown={onKeyDown}
              placeholder="Escribe lo que tienes que hacer..."
              disabled={proposalLoading}
              rows={1}
            />
            <button
              className="chat-inputbox__send"
              onClick={doSend}
              disabled={!input.trim() || proposalLoading}
            >
              {proposalLoading ? <span className="dot-spin" /> : <IconSend />}
            </button>
          </div>
          <p className="chat-footer__hint">Enter para enviar · Shift+Enter para nueva línea</p>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// TASKS VIEW (Full-width)
// ============================================================

function TasksView({ tasks }: { tasks: any[] }) {
  if (tasks.length === 0) {
    return (
      <div className="empty-view">
        <span className="empty-view__icon"><IconTasks /></span>
        <h2 className="empty-view__title">Sin tareas</h2>
        <p className="empty-view__sub">Ve al chat y dile a la IA qué tienes que hacer</p>
      </div>
    );
  }

  return (
    <div className="module-view">
      <div className="module-header">
        <h2 className="module-header__title">Tareas</h2>
        <span className="module-header__badge">{tasks.length}</span>
      </div>
      <div className="module-list">
        {tasks.map((task, i) => (
          <div key={i} className={`task-item task-item--${task.priority || 'medium'}`}>
            <div className="task-item__name">{task.name}</div>
            <div className="task-item__meta">
              {task.deadline && <span>{task.deadline}</span>}
              {task.estimated_hours && <span>{task.estimated_hours}h</span>}
              {task.difficulty && <span>Dif {task.difficulty}/5</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// CALENDAR VIEW (Full-width)
// ============================================================

function CalendarView({ events }: { events: any[] }) {
  return (
    <div className="module-view">
      <div className="module-header">
        <h2 className="module-header__title">Calendario</h2>
        <span className="module-header__badge">{events.length}</span>
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Calendar events={events} />
      </div>
    </div>
  );
}

// ============================================================
// ROOT
// ============================================================

export function ProductivityApp() {
  const [collapsed, setCollapsed] = useState(false);
  const [view, setView] = useState<ViewType>('chat');
  const chatState = useChatAutomation();

  return (
    <div className="app">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed(c => !c)}
        activeView={view}
        onViewChange={setView}
        taskCount={chatState.appState.tasks.length}
        eventCount={chatState.appState.calendar.length}
      />
      <main className="app-main">
        {view === 'chat' && (
          <div className="app-split">
            <div className="app-split__left">
              <ChatView state={chatState} />
            </div>
            <div className="app-split__right">
              <Calendar events={chatState.appState.calendar} />
            </div>
          </div>
        )}
        {view === 'tasks' && <TasksView tasks={chatState.appState.tasks} />}
        {view === 'calendar' && <CalendarView events={chatState.appState.calendar} />}
      </main>
    </div>
  );
}
/**
 * Calendar.tsx
 * 
 * Calendario visual con vista semanal/mensual y eventos distribuidos.
 * Muestra eventos de ambas fuentes: app_state.calendar y calendar_state.entries
 */

import React, { useMemo } from 'react';

interface CalendarEvent {
  id: string;
  date: string;      // YYYY-MM-DD
  time: string;      // HH:MM
  title: string;
  hours: number;
  type?: string;
}

interface CalendarProps {
  events: CalendarEvent[];
  onSelectDate?: (date: string) => void;
}

const calendarStyles = `
  .calendar {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 1.5rem;
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-body);
  }

  .calendar__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--border);
  }

  .calendar__month-title {
    font-size: 20px;
    font-family: var(--font-mono);
    font-weight: 700;
    color: var(--text);
    margin: 0;
  }

  .calendar__nav-btn {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--secondary);
    padding: 0.5rem 1rem;
    border-radius: var(--radius);
    font-size: 13px;
    font-family: var(--font-mono);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .calendar__nav-btn:hover {
    background: rgba(168, 196, 224, 0.1);
    border-color: var(--secondary);
  }

  .calendar__weekdays {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
    margin-bottom: 0.75rem;
  }

  .calendar__weekday {
    text-align: center;
    font-size: 12px;
    font-weight: 700;
    color: var(--muted);
    padding: 0.5rem 0;
    font-family: var(--font-mono);
  }

  .calendar__days {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
    flex: 1;
    overflow-y: auto;
    margin-bottom: 1rem;
  }

  .calendar__day {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.5rem;
    min-height: 100px;
    display: flex;
    flex-direction: column;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .calendar__day:hover {
    border-color: var(--accent);
    background: rgba(232, 157, 184, 0.04);
  }

  .calendar__day--empty {
    background: transparent;
    border: none;
    cursor: default;
  }

  .calendar__day--empty:hover {
    border: none;
    background: transparent;
  }

  .calendar__day--today {
    border-color: var(--accent);
    background: rgba(232, 157, 184, 0.08);
  }

  .calendar__day-number {
    font-size: 13px;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 0.4rem;
    font-family: var(--font-mono);
  }

  .calendar__day-events {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    overflow: hidden;
  }

  .calendar__event-chip {
    display: flex;
    align-items: center;
    gap: 4px;
    background: rgba(168, 196, 224, 0.15);
    border-left: 2px solid var(--secondary);
    padding: 2px 4px;
    border-radius: 3px;
    font-size: 10px;
    color: var(--text);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .calendar__event-time {
    font-family: var(--font-mono);
    font-weight: 700;
    color: var(--accent);
    flex-shrink: 0;
  }

  .calendar__event-title {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .calendar__event-more {
    font-size: 9px;
    color: var(--muted);
    padding: 1px 3px;
    font-family: var(--font-mono);
  }

  .calendar__footer {
    text-align: center;
    padding-top: 0.75rem;
    border-top: 1px solid var(--border);
  }

  .calendar__footer-text {
    font-size: 13px;
    color: var(--muted);
    margin: 0;
  }
`;

export function Calendar({ events, onSelectDate }: CalendarProps) {
  // Obtener mes/año actual
  const today = new Date();
  const [currentMonth, setCurrentMonth] = React.useState(today.getMonth());
  const [currentYear, setCurrentYear] = React.useState(today.getFullYear());

  // Agrupar eventos por fecha
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach(event => {
      const key = event.date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(event);
    });
    return map;
  }, [events]);

  // Días del mes actual
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
  const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
  const daysInMonth = lastDayOfMonth.getDate();
  const startingDayOfWeek = firstDayOfMonth.getDay();

  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const emptyDays = Array.from({ length: startingDayOfWeek }, () => null);
  const calendarDays = [...emptyDays, ...daysArray];

  const monthName = firstDayOfMonth.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  return (
    <div className="calendar">
      {/* Header con navegación */}
      <div className="calendar__header">
        <button className="calendar__nav-btn" onClick={handlePrevMonth}>
          ← Anterior
        </button>
        <h2 className="calendar__month-title">
          {monthName.charAt(0).toUpperCase() + monthName.slice(1)}
        </h2>
        <button className="calendar__nav-btn" onClick={handleNextMonth}>
          Siguiente →
        </button>
      </div>

      {/* Grid de días de semana */}
      <div className="calendar__weekdays">
        {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(day => (
          <div key={day} className="calendar__weekday">
            {day}
          </div>
        ))}
      </div>

      {/* Grid de días */}
      <div className="calendar__days">
        {calendarDays.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} className="calendar__day calendar__day--empty" />;
          }

          const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dayEvents = eventsByDate.get(dateStr) || [];
          const isToday = 
            day === today.getDate() &&
            currentMonth === today.getMonth() &&
            currentYear === today.getFullYear();

          return (
            <div
              key={day}
              className={`calendar__day${isToday ? ' calendar__day--today' : ''}`}
              onClick={() => onSelectDate?.(dateStr)}
            >
              <div className="calendar__day-number">{day}</div>
              
              {dayEvents.length > 0 && (
                <div className="calendar__day-events">
                  {dayEvents.slice(0, 2).map(ev => (
                    <div
                      key={ev.id}
                      className="calendar__event-chip"
                      title={`${ev.time} - ${ev.title} (${ev.hours}h)`}
                    >
                      <span className="calendar__event-time">{ev.time}</span>
                      <span className="calendar__event-title">{ev.title}</span>
                    </div>
                  ))}
                  
                  {dayEvents.length > 2 && (
                    <div className="calendar__event-more">
                      +{dayEvents.length - 2} más
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Info de eventos totales */}
      <div className="calendar__footer">
        <p className="calendar__footer-text">
          Total: <strong>{events.length}</strong> evento{events.length !== 1 ? 's' : ''}
        </p>
      </div>
    </div>
  );
}
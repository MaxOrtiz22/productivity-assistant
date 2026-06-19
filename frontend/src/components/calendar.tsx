/**
 * calendar.tsx - Versión 3 niveles
 * 
 * Toggle entre:
 * - Vista Mensual (Macro): Solo eventos principales
 * - Vista Semanal (Meso): SubTasks distribuidas por día
 * - Vista Diaria (Micro): TimeSlots con horarios exactos + resumen
 * 
 * Reemplaza frontend/src/components/calendar.tsx
 */

import React, { useMemo, useState } from 'react';

interface CalendarEvent {
  id: string;
  date: string;      // YYYY-MM-DD
  time: string;      // HH:MM
  title: string;
  hours: number;
  type?: string;
  parent_event?: string;
}

interface CalendarProps {
  events: CalendarEvent[];
}

// ============================================================
// VIEW: MENSUAL (Macro)
// ============================================================

function MonthlyView({ events }: { events: CalendarEvent[] }) {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach(event => {
      const key = event.date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(event);
    });
    return map;
  }, [events]);

  const firstDay = new Date(currentYear, currentMonth, 1);
  const lastDay = new Date(currentYear, currentMonth + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();

  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const emptyDays = Array.from({ length: startingDayOfWeek }, () => null);
  const calendarDays = [...emptyDays, ...daysArray];

  const monthName = firstDay.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

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
    <div className="calendar-view__monthly">
      {/* Header */}
      <div className="calendar-header">
        <button className="calendar-nav-btn" onClick={handlePrevMonth}>
          ‹ Anterior
        </button>
        <h2 className="calendar-title">
          {monthName.charAt(0).toUpperCase() + monthName.slice(1)}
        </h2>
        <button className="calendar-nav-btn" onClick={handleNextMonth}>
          Siguiente ›
        </button>
      </div>

      {/* Weekday headers */}
      <div className="calendar-weekdays">
        {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(day => (
          <div key={day} className="calendar-weekday">
            {day}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="calendar-days">
        {calendarDays.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} className="calendar-day calendar-day--empty" />;
          }

          const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dayEvents = eventsByDate.get(dateStr) || [];
          const isToday =
            day === today.getDate() &&
            currentMonth === today.getMonth() &&
            currentYear === today.getFullYear();

          // En vista mensual, solo mostrar evento principal (sin hora)
          const mainEvent = dayEvents.length > 0 ? dayEvents[0] : null;

          return (
            <div
              key={day}
              className={`calendar-day${isToday ? ' calendar-day--today' : ''}`}
            >
              <div className="calendar-day-number">{day}</div>
              {mainEvent && (
                <div className="calendar-day-main-event" title={mainEvent.title}>
                  {mainEvent.title}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="calendar-footer">
        <p className="calendar-footer-text">
          Total: <strong>{events.length}</strong> evento{events.length !== 1 ? 's' : ''}
        </p>
      </div>
    </div>
  );
}

// ============================================================
// VIEW: SEMANAL (Meso)
// ============================================================

function WeeklyView({ events }: { events: CalendarEvent[] }) {
  const today = new Date();
  const [weekStart, setWeekStart] = useState(getWeekStart(today));

  function getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
  }

  function getWeekEnd(start: Date): Date {
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return end;
  }

  const weekEnd = getWeekEnd(weekStart);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach(event => {
      const key = event.date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(event);
    });
    return map;
  }, [events]);

  const daysOfWeek = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const handlePrevWeek = () => {
    setWeekStart(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  };

  const handleNextWeek = () => {
    setWeekStart(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  };

  const weekLabel = `${weekStart.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })}`;

  return (
    <div className="calendar-view__weekly">
      {/* Header */}
      <div className="calendar-header">
        <button className="calendar-nav-btn" onClick={handlePrevWeek}>
          ‹ Anterior
        </button>
        <h2 className="calendar-title">Semana: {weekLabel}</h2>
        <button className="calendar-nav-btn" onClick={handleNextWeek}>
          Siguiente ›
        </button>
      </div>

      {/* Days with events */}
      <div className="weekly-days">
        {daysOfWeek.map((day, idx) => {
          const dateStr = day.toISOString().split('T')[0];
          const dayEvents = eventsByDate.get(dateStr) || [];
          const isToday = day.toDateString() === today.toDateString();

          const dayName = day.toLocaleDateString('es-ES', { weekday: 'long', month: 'short', day: 'numeric' });

          return (
            <div
              key={idx}
              className={`weekly-day${isToday ? ' weekly-day--today' : ''}`}
            >
              <div className="weekly-day-header">{dayName}</div>
              
              {dayEvents.length > 0 ? (
                <div className="weekly-day-tasks">
                  {dayEvents.map(event => (
                    <div key={event.id} className="weekly-task-item">
                      <div className="weekly-task-time">{event.time}</div>
                      <div className="weekly-task-title">{event.title}</div>
                      {event.parent_event && (
                        <div className="weekly-task-parent">{event.parent_event}</div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="weekly-day-empty">Sin tareas</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// VIEW: DIARIA (Micro)
// ============================================================

function DailyView({ events }: { events: CalendarEvent[] }) {
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState(today);

  const dateStr = selectedDate.toISOString().split('T')[0];
  const todayEvents = events.filter(e => e.date === dateStr).sort((a, b) => a.time.localeCompare(b.time));

  const tomorrowDate = new Date(selectedDate);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = tomorrowDate.toISOString().split('T')[0];
  const tomorrowEvents = events.filter(e => e.date === tomorrowStr);

  const handlePrevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d);
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d);
  };

  const dateLabel = selectedDate.toLocaleDateString('es-ES', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="calendar-view__daily">
      {/* Header */}
      <div className="calendar-header">
        <button className="calendar-nav-btn" onClick={handlePrevDay}>
          ‹ Anterior
        </button>
        <h2 className="calendar-title">{dateLabel}</h2>
        <button className="calendar-nav-btn" onClick={handleNextDay}>
          Siguiente ›
        </button>
      </div>

      {/* Main content */}
      <div className="daily-container">
        {/* Left: Hourly grid */}
        <div className="daily-grid">
          {todayEvents.length > 0 ? (
            <div className="daily-timeslots">
              {todayEvents.map(event => (
                <div key={event.id} className="daily-timeslot">
                  <div className="timeslot-time">{event.time}</div>
                  <div className="timeslot-block">
                    <div className="timeslot-title">{event.title}</div>
                    <div className="timeslot-duration">{event.hours}h</div>
                    {event.parent_event && (
                      <div className="timeslot-parent">{event.parent_event}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="daily-empty">
              <p>Sin tareas programadas para hoy</p>
            </div>
          )}
        </div>

        {/* Right: Summary */}
        <div className="daily-summary">
          <div className="summary-section">
            <h3 className="summary-title">Hoy ({dateLabel})</h3>
            {todayEvents.length > 0 ? (
              <div className="summary-items">
                {todayEvents.map(event => (
                  <div key={event.id} className="summary-item">
                    <div className="summary-item-time">{event.time}</div>
                    <div className="summary-item-title">{event.title}</div>
                  </div>
                ))}
                <div className="summary-total">
                  Total: {todayEvents.reduce((sum, e) => sum + e.hours, 0).toFixed(1)}h
                </div>
              </div>
            ) : (
              <p className="summary-empty">Sin tareas</p>
            )}
          </div>

          <div className="summary-section">
            <h3 className="summary-title">Mañana</h3>
            {tomorrowEvents.length > 0 ? (
              <div className="summary-items">
                {tomorrowEvents.slice(0, 3).map(event => (
                  <div key={event.id} className="summary-item">
                    <div className="summary-item-time">{event.time}</div>
                    <div className="summary-item-title">{event.title}</div>
                  </div>
                ))}
                {tomorrowEvents.length > 3 && (
                  <div className="summary-more">+{tomorrowEvents.length - 3} más</div>
                )}
              </div>
            ) : (
              <p className="summary-empty">Sin tareas</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function Calendar({ events }: CalendarProps) {
  const [view, setView] = useState<'monthly' | 'weekly' | 'daily'>('monthly');

  return (
    <div className="calendar-container">
      {/* Toggle buttons */}
      <div className="calendar-toggle">
        <button
          className={`toggle-btn${view === 'monthly' ? ' toggle-btn--active' : ''}`}
          onClick={() => setView('monthly')}
        >
          Mes
        </button>
        <button
          className={`toggle-btn${view === 'weekly' ? ' toggle-btn--active' : ''}`}
          onClick={() => setView('weekly')}
        >
          Semana
        </button>
        <button
          className={`toggle-btn${view === 'daily' ? ' toggle-btn--active' : ''}`}
          onClick={() => setView('daily')}
        >
          Día
        </button>
      </div>

      {/* Views */}
      {view === 'monthly' && <MonthlyView events={events} />}
      {view === 'weekly' && <WeeklyView events={events} />}
      {view === 'daily' && <DailyView events={events} />}
    </div>
  );
}
"""
Modelos de datos para sistema de calendario jerárquico.

NIVEL 0 (Macro): Event - objetivo principal (ej: "Prueba Contabilidad")
NIVEL 1 (Meso): SubTask - pasos distribuidos (ej: "Estudiar Cap. 1" el 24 junio)
NIVEL 2 (Micro): TimeSlot - asignación horaria (ej: "10:00-11:00 Estudiar Cap. 3")

Archivo: backend/calendar_models.py
"""

from pydantic import BaseModel, Field, field_validator
from datetime import datetime, date, time
from typing import List, Optional
from enum import Enum
import uuid


class EventType(str, Enum):
    """Tipo de evento principal."""
    DEADLINE = "deadline"
    MILESTONE = "milestone"
    EXAM = "exam"
    APPOINTMENT = "appointment"


class TaskStatus(str, Enum):
    """Estado de una tarea."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    SKIPPED = "skipped"


class Tag(BaseModel):
    """Etiqueta para categorizar tareas."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str  # "Estudio", "Proyecto", "Admin"
    
    class Config:
        frozen = True


class Event(BaseModel):
    """Nivel 0 (Macro) - Evento principal/deadline."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    deadline_date: date
    event_type: EventType
    priority: int = Field(default=3, ge=1, le=5)
    tags: List[Tag] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    
    @field_validator('deadline_date')
    @classmethod
    def deadline_must_be_future(cls, v: date) -> date:
        if v < date.today():
            raise ValueError('deadline_date must be today or in the future')
        return v


class SubTask(BaseModel):
    """Nivel 1 (Meso) - Tarea de preparación distribuida."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    event_id: str  # ID del Event padre
    name: str
    description: Optional[str] = None
    assigned_date: date
    duration_minutes: int = Field(default=60, ge=15, le=480)
    status: TaskStatus = TaskStatus.PENDING
    priority: int = Field(default=3, ge=1, le=5)
    tags: List[Tag] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    is_ai_generated: bool = True
    user_edited: bool = False


class TimeSlot(BaseModel):
    """Nivel 2 (Micro) - Asignación horaria específica."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    subtask_id: str
    event_id: str
    date: date
    start_time: time
    end_time: time
    status: TaskStatus = TaskStatus.PENDING
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    
    @field_validator('end_time')
    @classmethod
    def end_after_start(cls, v: time, info) -> time:
        if 'start_time' in info.data and v <= info.data['start_time']:
            raise ValueError('end_time must be after start_time')
        return v


class CalendarEntry(BaseModel):
    """Contenedor: agrupa Event + SubTasks + TimeSlots."""
    event: Event
    subtasks: List[SubTask] = Field(default_factory=list)
    timeslots: List[TimeSlot] = Field(default_factory=list)


class AIProposal(BaseModel):
    """Propuesta que genera la IA cuando el usuario añade un Event."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    event: Event
    proposed_subtasks: List[SubTask]
    proposed_timeslots: List[TimeSlot] = Field(default_factory=list)
    reasoning: str
    status: str = "pending"  # "pending", "accepted", "rejected"
    created_at: datetime = Field(default_factory=datetime.now)


class CalendarState(BaseModel):
    """Estado global: todos los entries + histórico."""
    entries: List[CalendarEntry] = Field(default_factory=list)
    last_updated: datetime = Field(default_factory=datetime.now)
    
    def get_entry_by_event_id(self, event_id: str) -> Optional[CalendarEntry]:
        """Buscar una entrada por Event ID."""
        return next((e for e in self.entries if e.event.id == event_id), None)
    
    def get_timeslots_for_date(self, target_date: date) -> List[TimeSlot]:
        """Obtener todos los TimeSlots de un día."""
        result = []
        for entry in self.entries:
            result.extend([ts for ts in entry.timeslots if ts.date == target_date])
        return sorted(result, key=lambda ts: ts.start_time)
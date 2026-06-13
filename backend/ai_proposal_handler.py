"""
Funciones para generar propuestas de SubTasks y TimeSlots con IA.

Archivo: backend/ai_proposal_handler.py

Punto de entrada principal: generate_calendar_proposal()
"""

import os
import json
from datetime import date, time, datetime
from typing import List, Dict, Any, Tuple
from google import genai
from google.genai import types
from pydantic import ValidationError

from calendar_models import (
    Event, SubTask, TimeSlot, AIProposal, CalendarState,
    EventType, TaskStatus
)


def generate_calendar_proposal(
    user_input: str,
    event: Event,
    total_duration_minutes: int,
    calendar_state: CalendarState
) -> AIProposal:
    """
    FUNCIÓN PRINCIPAL: Genera una propuesta jerárquica completa.
    
    Entrada:
    - user_input: Lo que escribió el usuario
    - event: El Event creado (nombre, fecha, tipo, prioridad)
    - total_duration_minutes: Cuánto tiempo total dedicar
    - calendar_state: Estado actual del calendario (otros events)
    
    Retorna:
    - AIProposal con Event + SubTasks + TimeSlots + reasoning
    
    Ejemplo:
    User: "Tengo prueba de Contabilidad el 28 junio, quiero estudiar 5 horas"
    Result: Event + [SubTask(Cap.1), SubTask(Cap.2), ...] + TimeSlots
    """
    
    # Paso 1: Generar SubTasks (Nivel 1)
    proposed_subtasks = _generate_subtasks(
        event=event,
        total_duration_minutes=total_duration_minutes,
        calendar_state=calendar_state,
        user_input=user_input
    )
    
    # Paso 2: Generar TimeSlots (Nivel 2) a partir de SubTasks
    proposed_timeslots = _generate_timeslots(
        subtasks=proposed_subtasks,
        calendar_state=calendar_state
    )
    
    # Paso 3: Generar reasoning
    reasoning = _generate_reasoning(
        event=event,
        subtasks=proposed_subtasks,
        total_duration_minutes=total_duration_minutes
    )
    
    # Paso 4: Crear AIProposal
    proposal = AIProposal(
        event=event,
        proposed_subtasks=proposed_subtasks,
        proposed_timeslots=proposed_timeslots,
        reasoning=reasoning,
        status="pending"
    )
    
    return proposal


def _generate_subtasks(
    event: Event,
    total_duration_minutes: int,
    calendar_state: CalendarState,
    user_input: str
) -> List[SubTask]:
    """
    Usa IA para generar SubTasks distribuidas inteligentemente.
    
    La IA considera:
    - Tipo de event (EXAM, DEADLINE, etc.)
    - Duración total
    - Días disponibles antes del deadline
    - Carga actual del calendario
    - Intensidad creciente (más tiempo conforme se acerca deadline)
    """
    
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY no configurada")
    
    client = genai.Client(api_key=api_key)
    
    # Preparar contexto del calendario actual
    occupied_hours_by_day = _calculate_calendar_load(calendar_state)
    
    prompt = f"""
Eres un asistente experto en planificación inteligente de tareas.

El usuario quiere lograr lo siguiente:
- Nombre: {event.name}
- Tipo: {event.event_type.value}
- Fecha límite: {event.deadline_date}
- Prioridad: {event.priority}/5
- Duración total: {total_duration_minutes} minutos
- Mensaje del usuario: "{user_input}"

CALENDARIO ACTUAL (carga por día):
{json.dumps(occupied_hours_by_day, default=str, indent=2)}

Tu tarea:
1. Divide el objetivo en SubTasks lógicas (ej: capítulos, temas, ejercicios)
2. Distribuye cada SubTask en un día diferente antes del deadline
3. Aumenta la intensidad conforme se acerca el deadline
4. Evita sobrecargar días ya llenos
5. Asigna duraciones realistas a cada SubTask

RESPONDE SOLO CON JSON VÁLIDO (sin markdown):
{{
  "subtasks": [
    {{
      "name": "Estudiar Cap. 1-2",
      "description": "Introducción y conceptos básicos",
      "assigned_date": "2026-06-24",
      "duration_minutes": 60,
      "priority": 3
    }},
    {{
      "name": "Estudiar Cap. 3-4",
      "description": "Análisis y aplicaciones",
      "assigned_date": "2026-06-25",
      "duration_minutes": 90,
      "priority": 3
    }},
    {{
      "name": "Repaso y ejercicios",
      "description": "Refuerzo de conceptos clave",
      "assigned_date": "2026-06-27",
      "duration_minutes": 90,
      "priority": 4
    }}
  ]
}}
"""
    
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            )
        )
        
        # Parsear respuesta
        data = json.loads(response.text)
        
        # Convertir a objetos SubTask
        subtasks = []
        for st_data in data.get("subtasks", []):
            subtask = SubTask(
                event_id=event.id,
                name=st_data["name"],
                description=st_data.get("description"),
                assigned_date=date.fromisoformat(st_data["assigned_date"]),
                duration_minutes=st_data["duration_minutes"],
                priority=st_data.get("priority", 3),
                is_ai_generated=True
            )
            subtasks.append(subtask)
        
        return subtasks
    
    except Exception as e:
        # Fallback: generar SubTasks genéricas si falla la IA
        print(f"Error generando SubTasks con IA: {e}")
        return _generate_default_subtasks(event, total_duration_minutes)


def _generate_timeslots(
    subtasks: List[SubTask],
    calendar_state: CalendarState
) -> List[TimeSlot]:
    """
    Convierte cada SubTask en uno o más TimeSlots horarios.
    
    Lógica:
    - Ver qué horas del día están libres
    - Asignar la SubTask al primer bloque disponible
    - Si es muy larga (>120 min), considerar dividir en dos días
    """
    
    timeslots = []
    
    for subtask in subtasks:
        # Obtener TimeSlots del día
        existing_ts = calendar_state.get_timeslots_for_date(subtask.assigned_date)
        
        # Calcular horas ocupadas
        occupied_hours = set()
        for ts in existing_ts:
            for h in range(ts.start_time.hour, ts.end_time.hour + 1):
                occupied_hours.add(h)
        
        # Buscar primer bloque libre (asumir 08:00-22:00 como válido)
        available_hour = None
        for hour in range(8, 23):
            if hour not in occupied_hours:
                available_hour = hour
                break
        
        # Si no hay horario libre, usar 08:00 de todas formas
        if available_hour is None:
            available_hour = 8
        
        # Crear TimeSlot
        start_time = time(hour=available_hour, minute=0)
        
        # Calcular end_time
        total_minutes = (available_hour * 60) + subtask.duration_minutes
        end_hour = min(total_minutes // 60, 23)
        end_minute = total_minutes % 60
        
        end_time = time(hour=end_hour, minute=end_minute)
        
        ts = TimeSlot(
            subtask_id=subtask.id,
            event_id=subtask.event_id,
            date=subtask.assigned_date,
            start_time=start_time,
            end_time=end_time,
            status=TaskStatus.PENDING
        )
        
        timeslots.append(ts)
    
    return timeslots


def _calculate_calendar_load(calendar_state: CalendarState) -> Dict[str, float]:
    """
    Calcula las horas ocupadas por día en el calendario actual.
    
    Retorna: {"2026-06-24": 3.5, "2026-06-25": 2.0, ...}
    """
    
    load_by_day = {}
    
    for entry in calendar_state.entries:
        for ts in entry.timeslots:
            day_str = ts.date.isoformat()
            
            # Calcular duración del TimeSlot
            start_minutes = ts.start_time.hour * 60 + ts.start_time.minute
            end_minutes = ts.end_time.hour * 60 + ts.end_time.minute
            duration_minutes = max(0, end_minutes - start_minutes)
            duration_hours = duration_minutes / 60
            
            # Acumular
            if day_str not in load_by_day:
                load_by_day[day_str] = 0
            load_by_day[day_str] += duration_hours
    
    return load_by_day


def _generate_reasoning(
    event: Event,
    subtasks: List[SubTask],
    total_duration_minutes: int
) -> str:
    """Genera una explicación clara de la propuesta."""
    
    return f"""
He generado una propuesta para "{event.name}" (deadline: {event.deadline_date}):

- Total a dedicar: {total_duration_minutes} minutos ({total_duration_minutes // 60}h {total_duration_minutes % 60}m)
- Distribuidas en {len(subtasks)} SubTasks a lo largo de {len(set(st.assigned_date for st in subtasks))} días
- Intensidad creciente conforme se acerca el deadline
- Cada SubTask tiene duración y prioridad asignadas por IA

SubTasks:
{chr(10).join(f'  • {st.name} ({st.duration_minutes}m) - {st.assigned_date.strftime("%d/%m")}' for st in subtasks)}

Puedes:
- Aceptar la propuesta completa ("confirmar")
- Rechazarla y pedir cambios ("rechazar" + explicación)
- Ajustar números específicos ("ajustar" + detalles)
"""


def _generate_default_subtasks(
    event: Event,
    total_duration_minutes: int
) -> List[SubTask]:
    """
    Fallback: generar SubTasks genéricas si falla la IA.
    Distribuye uniformemente en días disponibles.
    """
    
    days_until_deadline = max(1, (event.deadline_date - date.today()).days)
    
    # Distribuir en 3-5 SubTasks
    num_subtasks = min(5, max(3, days_until_deadline // 2))
    minutes_per_subtask = total_duration_minutes // num_subtasks
    
    subtasks = []
    current_date = date.today()
    
    for i in range(num_subtasks):
        if current_date >= event.deadline_date:
            break
        
        subtask = SubTask(
            event_id=event.id,
            name=f"Paso {i+1}: {event.name}",
            description=f"Parte {i+1} de {event.name}",
            assigned_date=current_date,
            duration_minutes=minutes_per_subtask,
            priority=3,
            is_ai_generated=True
        )
        subtasks.append(subtask)
        
        # Avanzar al siguiente día
        from datetime import timedelta
        current_date += timedelta(days=1)
    
    return subtasks
"""
Productivity Assistant - Backend refactorizado
Chat-driven automation: usuario escribe → IA propone → usuario confirma → cambios se aplican
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import os, uuid, json
from dotenv import load_dotenv
from google import genai
from google.genai import types
from datetime import datetime
from typing import List, Optional, Dict, Any
from pathlib import Path
from calendar_models import (
    Event, SubTask, TimeSlot, CalendarEntry, CalendarState,
    AIProposal, EventType, TaskStatus, Tag
)
from ai_proposal_handler import generate_calendar_proposal
from datetime import date, time as datetime_time

load_dotenv()

app = FastAPI(
    title="Productivity Assistant API",
    description="Automatización inteligente de calendario y tareas",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://tudominio.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# MODELOS DE DATOS
# ============================================================================

class TaskChange(BaseModel):
    """Un cambio a una tarea"""
    action: str  # "add", "modify", "delete"
    id: Optional[str] = None  # Para modify/delete
    name: str
    deadline: Optional[str] = None
    difficulty: Optional[int] = None  # 1-5
    priority: Optional[str] = None  # "low", "medium", "high"
    estimated_hours: Optional[float] = None
    description: Optional[str] = None

class CalendarEvent(BaseModel):
    """Un evento en el calendario"""
    date: str  # "2026-06-10"
    time: str  # "14:00"
    task_id: str
    title: str
    hours: float

class ProposedChanges(BaseModel):
    """La propuesta que genera Claude"""
    understanding: str  # "Lo que entendí del usuario"
    tasks: List[TaskChange]
    calendar: List[CalendarEvent]
    conflicts: List[str]  # Conflictos detectados
    explanation: str  # Por qué propone esto

class Message(BaseModel):
    """Un mensaje en la conversación"""
    role: str  # "user" o "assistant"
    content: str
    timestamp: str

class ConversationState(BaseModel):
    """Estado completo de una conversación"""
    id: str
    messages: List[Message]
    proposed_changes: Optional[ProposedChanges] = None
    calendar_state: CalendarState = Field(default_factory=CalendarState)
    pending_calendar_proposal: Optional[AIProposal] = None
    app_state: Dict[str, Any]  # Tasks, calendar, notes actuales
    created_at: str
    last_updated: str

class ChatRequest(BaseModel):
    """Request del cliente para enviar un mensaje"""
    message: str
    conversation_id: Optional[str] = None
    create_calendar_event: Optional[bool] = False
    event_name: Optional[str] = None
    event_deadline: Optional[str] = None  # "2026-06-28"
    total_duration_minutes: Optional[int] = None  # 300 (5 horas)

class ConfirmChangesRequest(BaseModel):
    """Request para confirmar cambios"""
    conversation_id: str

class AdjustProposalRequest(BaseModel):
    """Request para ajustar la propuesta"""
    conversation_id: str
    adjustment: str

# ============================================================================
# ALMACENAMIENTO (En memoria para fase 1)
# En fase 2 cambiaremos a persistencia real
# ============================================================================

STORAGE_FILE = Path("./conversations.json")

def _load_store() -> dict:
    if STORAGE_FILE.exists():
        try:
            return json.loads(STORAGE_FILE.read_text())
        except:
            return {}
    return {}

def _save_store(store: dict):
    STORAGE_FILE.write_text(json.dumps(store, default=str, indent=2))

conversations_store: Dict[str, Any] = _load_store()

def generate_conversation_id() -> str:
    """Genera un ID único para la conversación"""
    return f"conv_{uuid.uuid4().hex[:12]}"

def generate_task_id() -> str:
    """Genera un ID único para una tarea"""
    return f"task_{uuid.uuid4().hex[:8]}"

def load_conversation(conversation_id: Optional[str]) -> ConversationState:
    """Carga o crea una conversación"""
    if not conversation_id or conversation_id not in conversations_store:
        # Nueva conversación
        conv_id = conversation_id or generate_conversation_id()
        conv = ConversationState(
            id=conv_id,
            messages=[],
            proposed_changes=None,
            calendar_state = CalendarState(),
            pending_calendar_proposal = None,
            app_state={
                "tasks": [],
                "calendar": [],
                "notes": []
            },
            created_at=datetime.now().isoformat(),
            last_updated=datetime.now().isoformat()
        )
        conversations_store[conv_id] = conv
        return conv
    
    raw = conversations_store[conversation_id]
    
    if isinstance(raw, dict):
        if "calendar_state" not in raw:
            raw["calendar_state"] = CalendarState().model_dump()
        if "pendin_calendar_proposal" not in raw:
            raw["pending_calendar_proposal"] = None

        conv = ConversationState(**raw)
        return conv
    return raw

def save_conversation(conversation: ConversationState):
    """Guarda una conversación"""
    conversation.last_updated = datetime.now().isoformat()
    conversations_store[conversation.id] = conversation

    serialized = {}
    for k, v in conversations_store.items():
        if isinstance(v, ConversationState):
            serialized[k] = json.loads(v.model_dump_json())
        else:
            serialized[k] = v
    _save_store(serialized)

def _extract_event_from_request(request: ChatRequest) -> Optional[Event]:
    """
    Helper: extrae datos de Event del ChatRequest.
    Retorna un Event si los datos son válidos, None si no.
    """
    
    if not request.create_calendar_event:
        return None
    
    if not request.event_name or not request.event_deadline:
        return None
    
    try:
        deadline = date.fromisoformat(request.event_deadline)
        
        event = Event(
            name=request.event_name,
            deadline_date=deadline,
            event_type=EventType.EXAM,  # Default
            priority=4,  # Default
        )
        
        return event
    except Exception as e:
        print(f"Error extrayendo Event: {e}")
        return None

# ============================================================================
# LÓGICA PRINCIPAL: ANÁLISIS CON CLAUDE
# ============================================================================

def call_gemini_for_proposal(
    messages: List[Message],
    app_state: Dict[str, Any]
) -> ProposedChanges:
    """
    Llama a Gemini para analizar los mensajes y generar una propuesta
    de cambios a tareas y calendario.
    """
    
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY key no configurada")
    
    client = genai.Client(api_key=api_key)
    
    # Formatear historial de mensajes para Claude
    formatted_history = "\n".join([
        f"{msg.role.upper()}: {msg.content}"
        for msg in messages
    ])
    
    # Formatear estado actual
    current_tasks = app_state.get("tasks", [])
    current_calendar = app_state.get("calendar", [])
    
    # Prompt especializado para generar cambios
    prompt = f"""
You are an intelligent task automation system. Based on the user's conversation, 
you must generate a coherent plan of changes to their tasks and calendar.

CONVERSATION HISTORY:
{formatted_history}

CURRENT STATE:
Tasks: {current_tasks}
Calendar: {current_calendar}

TASK:
1. Understand what the user is asking for
2. Generate a list of changes (add, modify, or delete tasks)
3. Create calendar events with specific times
4. Detect any conflicts or issues
5. Provide a clear explanation

IMPORTANT:
- All times must be realistic (e.g., don't schedule 8 hours of work per day)
- Consider that the user needs breaks, sleep, etc.
- If the user mentions a deadline, respect it strictly
- Distribute work logically across days
- Prefer earlier days for urgent tasks
- Leave buffers for unexpected issues
"""
    
    try:
        response = client.models.generate_content(
            model = "gemini-2.5-flash",
            contents = prompt,
            config = types.GenerateContentConfig(
                response_mime_type = "application/json",
                response_schema = ProposedChanges
            ),
        )

        result = ProposedChanges.model_validate_json(response.text)
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error procesando la propuesta con Gemini: {str(e)}")

# ============================================================================
# ENDPOINTS
# ============================================================================

@app.get("/")
async def root():
    """Health check"""
    return {
        "status": "ok",
        "message": "Productivity Assistant Backend",
        "version": "1.0.0"
    }

@app.get("/health")
async def health_check():
    """Verificar estado"""
    api_key_present = "GEMINI_API_KEY" in os.environ
    return {
        "status": "healthy",
        "api_key_configured": api_key_present,
        "conversations_active": len(conversations_store)
    }

@app.post("/api/chat")
async def chat(request: ChatRequest):
    """
    Endpoint principal: usuario envía mensaje, recibe propuesta.
    
    Flujo:
    1. Cargar o crear conversación
    2. Agregar mensaje del usuario
    3. Llamar a Claude para analizar
    4. Generar propuesta
    5. Devolver propuesta (sin aplicarla)
    """
    
    # Cargar conversación
    conversation = load_conversation(request.conversation_id)
    
    # Agregar mensaje del usuario
    user_message = Message(
        role="user",
        content=request.message,
        timestamp=datetime.now().isoformat()
    )
    conversation.messages.append(user_message)

    if request.create_calendar_event:
        event = _extract_event_from_request(request)
        
        if event and request.total_duration_minutes:
            try:
                # Generar propuesta jerárquica
                proposal = generate_calendar_proposal(
                    user_input=request.message,
                    event=event,
                    total_duration_minutes=request.total_duration_minutes,
                    calendar_state=conversation.calendar_state
                )
                
                # Guardar propuesta pendiente
                conversation.pending_calendar_proposal = proposal
                
                # Agregar respuesta de IA
                ai_message = Message(
                    role="assistant",
                    content=proposal.reasoning,
                    timestamp=datetime.now().isoformat()
                )
                conversation.messages.append(ai_message)
                
                # Guardar conversación
                save_conversation(conversation)
                
                # Devolver propuesta al frontend
                return {
                    "success": True,
                    "conversation_id": conversation.id,
                    "type": "calendar_proposal",
                    "event": event.model_dump(),
                    "subtasks_preview": [
                        {
                            "name": st.name,
                            "date": st.assigned_date.isoformat(),
                            "duration_minutes": st.duration_minutes
                        }
                        for st in proposal.proposed_subtasks
                    ],
                    "reasoning": proposal.reasoning,
                    "full_proposal": proposal.model_dump()
                }
            
            except Exception as e:
                print(f"Error generando propuesta de calendario: {e}")
                return {
                    "success": False,
                    "error": f"Error generando propuesta de calendario: {str(e)}",
                    "conversation_id": conversation.id
                }
    
    # Llamar a Claude para generar propuesta
    try:
        proposal = call_gemini_for_proposal(
            conversation.messages,
            conversation.app_state
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
    # Guardar propuesta en la conversación (sin aplicarla)
    conversation.proposed_changes = proposal
    
    # Agregar respuesta de Claude al historial
    ai_message = Message(
        role="assistant",
        content=proposal.explanation,
        timestamp=datetime.now().isoformat()
    )
    conversation.messages.append(ai_message)
    
    # Guardar conversación
    save_conversation(conversation)
    
    # Devolver propuesta al frontend
    return {
        "success": True,
        "conversation_id": conversation.id,
        "understanding": proposal.understanding,
        "preview": {
            "tasks_to_add": len([t for t in proposal.tasks if t.action == "add"]),
            "tasks_to_modify": len([t for t in proposal.tasks if t.action == "modify"]),
            "tasks_to_delete": len([t for t in proposal.tasks if t.action == "delete"]),
            "calendar_events": len(proposal.calendar)
        },
        "conflicts": proposal.conflicts,
        "explanation": proposal.explanation,
        "proposed_changes": proposal.model_dump()  # Todo el objeto para debugging
    }

@app.post("/api/confirm-changes")
async def confirm_changes(request: ConfirmChangesRequest):
    """
    Endpoint para confirmar y aplicar los cambios propuestos.
    Flujo:
    1. Cargar conversación
    2. Aplicar cambios a app_state
    3. Limpiar propuesta temporal
    4. Devolver estado actualizado al frontend
    5. Frontend actualiza Local Storage
    """
    
    # Cargar conversación
    conversation = load_conversation(request.conversation_id)
    
    if not conversation.proposed_changes:
        raise HTTPException(
            status_code=400,
            detail="No hay cambios propuestos para confirmar"
        )
    
    proposal = conversation.proposed_changes
    
    try:
        # Aplicar cambios a tareas
        for task_change in proposal.tasks:
            if task_change.action == "add":
                # Agregar nueva tarea
                task_id = generate_task_id()
                new_task = {
                    "id": task_id,
                    "name": task_change.name,
                    "deadline": task_change.deadline,
                    "difficulty": task_change.difficulty,
                    "priority": task_change.priority,
                    "estimated_hours": task_change.estimated_hours,
                    "description": task_change.description,
                    "created_at": datetime.now().isoformat(),
                    "completed": False
                }
                conversation.app_state["tasks"].append(new_task)
                
            elif task_change.action == "modify":
                # Modificar tarea existente
                for task in conversation.app_state["tasks"]:
                    if task["id"] == task_change.id:
                        task.update({
                            "name": task_change.name,
                            "deadline": task_change.deadline,
                            "difficulty": task_change.difficulty,
                            "priority": task_change.priority,
                            "estimated_hours": task_change.estimated_hours,
                            "description": task_change.description
                        })
                        break
            
            elif task_change.action == "delete":
                # Eliminar tarea
                conversation.app_state["tasks"] = [
                    t for t in conversation.app_state["tasks"]
                    if t["id"] != task_change.id
                ]
        
        # Agregar eventos al calendario
        for event in proposal.calendar:
            calendar_event = {
                "id": generate_task_id(),
                "date": event.date,
                "time": event.time,
                "title": event.title,
                "hours": event.hours,
                "task_id": event.task_id,
                "created_at": datetime.now().isoformat()
            }
            conversation.app_state["calendar"].append(calendar_event)
        
        # Limpiar propuesta temporal
        conversation.proposed_changes = None
        
        # Guardar conversación
        save_conversation(conversation)
        
        # Devolver estado actualizado
        return {
            "success": True,
            "message": f"Aplicados {len(proposal.tasks)} cambios a tareas y {len(proposal.calendar)} eventos al calendario",
            "new_state": conversation.app_state
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error aplicando cambios: {str(e)}"
        )

@app.post("/api/adjust-proposal")
async def adjust_proposal(request: AdjustProposalRequest):
    """
    Endpoint para ajustar la propuesta (usuario rechaza/quiere cambios).
    
    Flujo:
    1. Agregar ajuste del usuario al historial
    2. Llamar a Gemini nuevamente con TODO el contexto
    3. Generar nueva propuesta
    4. Devolver nueva propuesta
    """
    
    # Cargar conversación
    conversation = load_conversation(request.conversation_id)
    
    # Agregar mensaje de ajuste
    adjustment_message = Message(
        role="user",
        content=request.adjustment,
        timestamp=datetime.now().isoformat()
    )
    conversation.messages.append(adjustment_message)
    
    # Generar nueva propuesta
    try:
        new_proposal = call_gemini_for_proposal(
            conversation.messages,
            conversation.app_state
        )
    except HTTPException:
        raise
    
    # Guardar nueva propuesta
    conversation.proposed_changes = new_proposal
    
    # Agregar respuesta de Claude
    ai_message = Message(
        role="assistant",
        content=new_proposal.explanation,
        timestamp=datetime.now().isoformat()
    )
    conversation.messages.append(ai_message)
    
    # Guardar conversación
    save_conversation(conversation)
    
    # Devolver nueva propuesta
    return {
        "success": True,
        "understanding": new_proposal.understanding,
        "preview": {
            "tasks_to_add": len([t for t in new_proposal.tasks if t.action == "add"]),
            "tasks_to_modify": len([t for t in new_proposal.tasks if t.action == "modify"]),
            "tasks_to_delete": len([t for t in new_proposal.tasks if t.action == "delete"]),
            "calendar_events": len(new_proposal.calendar)
        },
        "conflicts": new_proposal.conflicts,
        "explanation": new_proposal.explanation,
        "proposed_changes": new_proposal.model_dump()
    }

@app.post("/api/confirm-calendar-proposal")
async def confirm_calendar_proposal(conversation_id: str):
    """
    Usuario acepta la propuesta de Event + SubTasks + TimeSlots.
    Persiste los cambios en calendar_state.
    """
    
    conversation = load_conversation(conversation_id)
    
    if not conversation.pending_calendar_proposal:
        raise HTTPException(
            status_code=400,
            detail="No hay propuesta de calendario pendiente"
        )
    
    proposal = conversation.pending_calendar_proposal
    
    try:
        # Crear CalendarEntry
        entry = CalendarEntry(
            event=proposal.event,
            subtasks=proposal.proposed_subtasks,
            timeslots=proposal.proposed_timeslots
        )
        
        # Agregar al calendar_state
        conversation.calendar_state.entries.append(entry)
        
        # Limpiar propuesta
        conversation.pending_calendar_proposal = None
        
        # Guardar
        save_conversation(conversation)
        
        # Respuesta
        return {
            "success": True,
            "message": f"Event '{proposal.event.name}' añadido al calendario",
            "calendar_summary": {
                "total_events": len(conversation.calendar_state.entries),
                "total_subtasks": sum(
                    len(entry.subtasks) 
                    for entry in conversation.calendar_state.entries
                ),
                "total_timeslots": sum(
                    len(entry.timeslots) 
                    for entry in conversation.calendar_state.entries
                )
            }
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error confirmando propuesta: {str(e)}"
        )

@app.get("/api/conversation/{conversation_id}")
async def get_conversation(conversation_id: str):
    """
    Obtener estado actual de una conversación (para debugging/testing)
    """
    conversation = load_conversation(conversation_id)
    
    return {
        "id": conversation.id,
        "messages": [
            {
                "role": msg.role,
                "content": msg.content,
                "timestamp": msg.timestamp
            }
            for msg in conversation.messages
        ],
        "app_state": conversation.app_state,
        "has_proposed_changes": conversation.proposed_changes is not None,
        "created_at": conversation.created_at,
        "last_updated": conversation.last_updated
    }

# ============================================================================
# EJECUCIÓN
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
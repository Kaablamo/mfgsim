from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.api.websockets.manager import manager

router = APIRouter()


@router.websocket("/ws/simulation")
async def simulation_ws(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == '{"action":"ping"}':
                await websocket.send_text('{"msg_type":"pong"}')
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket)

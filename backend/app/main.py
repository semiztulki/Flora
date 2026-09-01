import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.cleanup import run_cleanup_loop
from app.database import init_db
from app.routers import admin, attachments, auth, contacts, groups, messages, reports, ws


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    cleanup_task = asyncio.create_task(run_cleanup_loop())
    yield
    cleanup_task.cancel()


app = FastAPI(title="Flora", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(contacts.router)
app.include_router(groups.router)
app.include_router(messages.router)
app.include_router(attachments.router)
app.include_router(admin.router)
app.include_router(reports.router)
app.include_router(ws.router)


@app.get("/health")
async def health():
    return {"status": "ok"}

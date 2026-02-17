from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database.database import init_db

app = FastAPI()
from .routes.templates import router as templates_router
from .routes.auth import router as auth_router
from .routes.projects import router as projects_router
from .routes.domain_experiences import router as domain_experiences_router
from .routes.analytics import router as analytics_router
from .routes.meta_interview import router as meta_interview_router

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5500"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    init_db()

app.include_router(templates_router)
app.include_router(auth_router)
app.include_router(projects_router)
app.include_router(domain_experiences_router)
app.include_router(analytics_router)
app.include_router(meta_interview_router)

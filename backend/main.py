"""FastAPI application entry point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from routers import auth as auth_router
from routers import pdf as pdf_router

app = FastAPI(title="PDF Editor API", version="1.0.0")

cors_origins = [o.strip() for o in settings.cors_allowed_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(pdf_router.router)
app.include_router(auth_router.router)


@app.get("/health")
def health():
    return {"status": "ok"}

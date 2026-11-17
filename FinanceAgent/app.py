from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from agent import assess

FRONTEND = Path(__file__).resolve().parent.parent / "Frontend"

app = FastAPI(title="Finansagent")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_origin_regex=".*",
    allow_methods=["*"],
    allow_headers=["*"],
)


class Holding(BaseModel):
    ticker: str
    weight: float = Field(ge=0)


class AnalyzeRequest(BaseModel):
    ticker: str
    portfolio: list[Holding] = []


@app.get("/api/health")
def health():
    return {"ok": True}


@app.post("/api/analyze")
def analyze(payload: AnalyzeRequest):
    ticker = payload.ticker.strip()
    if not ticker:
        raise HTTPException(status_code=400, detail="Oppgi en ticker.")
    try:
        return assess(
            ticker,
            [holding.model_dump() for holding in payload.portfolio],
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Kunne ikke hente markedsdata: {error}") from error


@app.get("/")
def home():
    return FileResponse(FRONTEND / "finansagent.html")


app.mount("/", StaticFiles(directory=FRONTEND, html=True), name="frontend")


class Holding(BaseModel):
    ticker: str
    weight: float = Field(ge=0)


class AnalyzeRequest(BaseModel):
    ticker: str
    portfolio: list[Holding] = []


@app.get("/api/health")
def health():
    return {"ok": True}


@app.post("/api/analyze")
def analyze(payload: AnalyzeRequest):
    ticker = payload.ticker.strip()
    if not ticker:
        raise HTTPException(status_code=400, detail="Oppgi en ticker.")
    try:
        return assess(
            ticker,
            [holding.model_dump() for holding in payload.portfolio],
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Kunne ikke hente markedsdata: {error}") from error

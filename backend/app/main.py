import os
import json
from typing import Optional, Dict
from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.orm import Session

from app.models import (
    UserRegister, UserLogin, Token, ParsedCV, LearningPathResponse,
    PathRecalculateRequest
)
from app.database import init_db, get_db, DBUser, DBLearnerPath
from app.auth import (
    get_password_hash, verify_password, create_access_token,
    get_current_user
)
from app.parser import parse_cv_nlp
from app.taxonomy_engine import generate_learning_path, TAXONOMY_DATA

app = FastAPI(
    title="PWNDORA Career Mapper API",
    description="NLP CV Parsing, Skill-Taxonomy Mapping & Dynamic Learning Path Generation API",
    version="1.0.0"
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure DB tables exist on module load
try:
    init_db()
    db = next(get_db())
    demo = db.query(DBUser).filter(DBUser.username == "demo_user").first()
    if not demo:
        db.add(DBUser(username="demo_user", hashed_password=get_password_hash("pwndora123")))
        db.commit()
except Exception as e:
    print(f"DB Init Note: {e}")

if os.environ.get("VERCEL") or os.environ.get("AWS_EXECUTION_ENV"):
    UPLOADS_DIR = "/tmp/pwndora_uploads"
else:
    UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "data", "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)

IN_MEMORY_PATHS: Dict[str, LearningPathResponse] = {}

@app.post("/api/auth/register", response_model=Token)
async def register(user_data: UserRegister, db: Session = Depends(get_db)):
    existing = db.query(DBUser).filter(DBUser.username == user_data.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    new_user = DBUser(
        username=user_data.username,
        email=user_data.email,
        hashed_password=get_password_hash(user_data.password)
    )
    db.add(new_user)
    db.commit()
    
    access_token = create_access_token(data={"sub": user_data.username})
    return Token(access_token=access_token, token_type="bearer", username=user_data.username)

@app.post("/api/auth/login", response_model=Token)
async def login(user_data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(DBUser).filter(DBUser.username == user_data.username).first()
    if not user or not verify_password(user_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    access_token = create_access_token(data={"sub": user_data.username})
    return Token(access_token=access_token, token_type="bearer", username=user_data.username)

@app.post("/api/auth/token", response_model=Token)
async def login_for_access_token(
    username: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db)
):
    user = db.query(DBUser).filter(DBUser.username == username).first()
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    access_token = create_access_token(data={"sub": username})
    return Token(access_token=access_token, token_type="bearer", username=username)

@app.post("/api/parse-cv", response_model=LearningPathResponse)
async def parse_cv(
    file: UploadFile = File(...),
    target_role_id: str = Form("soc_analyst"),
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """File ingestion API accepting PDF or DOCX uploads and extracting raw text & skills."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    
    ext = file.filename.lower().split('.')[-1]
    if ext not in ['pdf', 'docx', 'doc', 'txt']:
        raise HTTPException(status_code=400, detail="Unsupported file format. Please upload PDF or DOCX.")
    
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
        
    if ext == 'pdf':
        pass # We no longer save PDFs to disk!
    
    # 1. NLP CV Parsing
    try:
        parsed_cv = parse_cv_nlp(file.filename, content)
        if parsed_cv.raw_text_length < 20:
            raise ValueError()
    except Exception:
        raise HTTPException(status_code=422, detail="The file is corrupted, unreadable, or contains no parseable text.")
    
    # 2. Generate 4-Tier Learning Path
    path_response = generate_learning_path(
        user_id=current_user,
        parsed_cv=parsed_cv,
        target_role_id=target_role_id
    )
    
    # (No database or in-memory saving occurs. Strict stateless flow.)
    
    return path_response

from app.auth import get_current_user

@app.post("/api/recalculate-path", response_model=LearningPathResponse)
async def recalculate_path(
    req: PathRecalculateRequest,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Recalculate path dynamically statelessly."""
    parsed_cv = req.parsed_cv
    if req.user_skills_override:
        parsed_cv.skills = list(set(parsed_cv.skills + req.user_skills_override))
        
    updated_path = generate_learning_path(
        user_id=current_user,
        parsed_cv=parsed_cv,
        target_role_id=req.target_role_id
    )
    
    return updated_path

@app.get("/api/taxonomy")
async def get_taxonomy():
    """Return PWNDORA 40+ Skill Taxonomy."""
    return TAXONOMY_DATA

# Mount static files directory for React frontend
FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend"))
if os.path.exists(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=os.path.join(FRONTEND_DIR, "static")), name="static")

    @app.get("/")
    async def read_root():
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

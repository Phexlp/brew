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
    
    # Save to PostgreSQL / database
    try:
        db_path = db.query(DBLearnerPath).filter(DBLearnerPath.user_id == current_user).first()
        json_str = path_response.model_dump_json()
        cv_json = parsed_cv.model_dump_json()
        
        if db_path:
            db_path.target_role_id = target_role_id
            db_path.parsed_cv_json = cv_json
            db_path.path_response_json = json_str
        else:
            db_path = DBLearnerPath(
                user_id=current_user,
                target_role_id=target_role_id,
                parsed_cv_json=cv_json,
                path_response_json=json_str
            )
            db.add(db_path)
        db.commit()
    except Exception as e:
        print(f"Database save warning: {e}")
        
    IN_MEMORY_PATHS[current_user] = path_response
    
    return path_response

@app.get("/api/learner-path/{user_id}", response_model=LearningPathResponse)
async def get_learner_path(user_id: str, db: Session = Depends(get_db)):
    """Integration endpoint returning active learning path for PWNDORA frontend consumption."""
    try:
        db_path = db.query(DBLearnerPath).filter(DBLearnerPath.user_id == user_id).first()
        if db_path and db_path.path_response_json:
            data_dict = json.loads(db_path.path_response_json)
            return LearningPathResponse(**data_dict)
    except Exception as e:
        print(f"Database read warning: {e}")

    if user_id in IN_MEMORY_PATHS:
        return IN_MEMORY_PATHS[user_id]
    else:
        # Empty default profile — NO fabricated data.
        # User must upload a real CV to get real results.
        empty_cv = ParsedCV(
            raw_text_length=0,
            filename="No CV uploaded",
            skills=[],
            certifications=[],
            job_titles=[],
            experience_years=0.0,
            detected_domains={"web_security": 0, "network_security": 0, "soc_siem": 0, "dfir": 0, "threat_hunting": 0, "malware_re": 0},
            entities=[],
            cv_hash="empty_no_cv"
        )
        path = generate_learning_path(user_id=user_id, parsed_cv=empty_cv, target_role_id="soc_analyst")
        IN_MEMORY_PATHS[user_id] = path
        return path

@app.post("/api/recalculate-path", response_model=LearningPathResponse)
async def recalculate_path(
    req: PathRecalculateRequest,
    current_user: str = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Recalculate path dynamically based on updated target role or skill overrides."""
    active_path = None
    try:
        db_path = db.query(DBLearnerPath).filter(DBLearnerPath.user_id == current_user).first()
        if db_path and db_path.path_response_json:
            active_path = LearningPathResponse(**json.loads(db_path.path_response_json))
    except Exception:
        pass
        
    if not active_path:
        active_path = IN_MEMORY_PATHS.get(current_user)
        
    if not active_path:
        raise HTTPException(status_code=404, detail="No active CV profile found. Please upload a CV first.")
        
    parsed_cv = active_path.parsed_cv
    if req.user_skills_override:
        parsed_cv.skills = list(set(parsed_cv.skills + req.user_skills_override))
        
    updated_path = generate_learning_path(
        user_id=current_user,
        parsed_cv=parsed_cv,
        target_role_id=req.target_role_id
    )
    
    try:
        json_str = updated_path.model_dump_json()
        cv_json = parsed_cv.model_dump_json()
        if db_path:
            db_path.target_role_id = req.target_role_id
            db_path.parsed_cv_json = cv_json
            db_path.path_response_json = json_str
            db.commit()
    except Exception:
        pass
        
    IN_MEMORY_PATHS[current_user] = updated_path
    return updated_path

@app.delete("/api/clear-path")
async def clear_path(current_user: str = Depends(get_current_user), db: Session = Depends(get_db)):
    """Clear the active path and CV for the current user."""
    try:
        db.query(DBLearnerPath).filter(DBLearnerPath.user_id == current_user).delete()
        db.commit()
    except Exception as e:
        print(f"Database delete warning: {e}")
        
    if current_user in IN_MEMORY_PATHS:
        del IN_MEMORY_PATHS[current_user]
        
    return {"status": "cleared"}

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

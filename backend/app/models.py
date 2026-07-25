from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any

class UserRegister(BaseModel):
    username: str
    email: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str

class ExtractedEntity(BaseModel):
    text: str
    label: str  # CERT, TOOL, SKILL, DOMAIN, EXP
    category: Optional[str] = None

class ParsedCV(BaseModel):
    raw_text_length: int
    filename: str
    skills: List[str]
    certifications: List[str]
    job_titles: List[str]
    experience_years: float
    detected_domains: Dict[str, int]
    entities: List[ExtractedEntity]
    cv_hash: str

class LabItem(BaseModel):
    lab_id: str
    lab_title: str
    skill_id: str
    skill_name: str
    domain: str
    difficulty: str
    est_hours: float
    tier: str  # Skip, Foundation, Primary Path, Stretch
    description: str
    completed: bool = False

class RoadmapPhase(BaseModel):
    phase_id: str
    title: str
    description: str
    est_hours: float
    labs: List[LabItem]

class DomainScore(BaseModel):
    domain_id: str
    domain_name: str
    user_score: float  # 0 to 100
    target_score: float  # 0 to 100
    gap: float

class LearningPathResponse(BaseModel):
    user_id: str
    target_role_id: str
    target_role_name: str
    parsed_cv: ParsedCV
    domain_scores: List[DomainScore]
    roadmap: List[RoadmapPhase]
    tier_counts: Dict[str, int]
    total_est_hours: float
    primary_est_hours: float
    processing_time_ms: float

class PathRecalculateRequest(BaseModel):
    target_role_id: str
    user_skills_override: Optional[List[str]] = None

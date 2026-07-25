import json
import os
import time
from typing import List, Dict, Tuple, Any
from app.models import ParsedCV, LabItem, DomainScore, LearningPathResponse

TAXONOMY_PATH = os.path.join(os.path.dirname(__file__), "data", "taxonomy.json")

def load_taxonomy() -> dict:
    with open(TAXONOMY_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

TAXONOMY_DATA = load_taxonomy()

# Tier Priority Mapping for Sorting
TIER_PRIORITY = {
    "Foundation": 1,
    "Primary Path": 2,
    "Stretch": 3,
    "Skip": 4
}


def calculate_domain_scores(parsed_cv: ParsedCV, target_role: dict) -> List[DomainScore]:
    """Calculate deterministic domain proficiency scores (0-100) vs target benchmarks.

    SCORING LOGIC (deterministic, no randomness):
    - Base score = keyword_count * 8 (capped at 50)
      Each keyword match in that domain adds 8 points.
      This means you need ~6 keyword matches to reach 50.
    - Certification bonus: +20 if a domain-relevant cert is found (capped at 30)
    - Experience bonus: ONLY applied if the user has at least 1 skill in the domain.
      This prevents an accountant with 10 years experience from getting inflated cyber scores.
      Formula: min(20, experience_years * 3) — but only if domain keyword count > 0.
    """
    scores = []
    benchmarks = target_role.get("benchmarks", {})

    # Count total cybersecurity keywords across all domains
    total_cyber_keywords = sum(parsed_cv.detected_domains.values())

    for dom in TAXONOMY_DATA["domains"]:
        dom_id = dom["id"]
        dom_name = dom["name"]

        # 1. Base keyword density score
        kw_count = parsed_cv.detected_domains.get(dom_id, 0)
        base_kw_score = min(50.0, kw_count * 8.0)

        # 2. Certification bonus — only for matching domain
        cert_bonus = 0.0
        if parsed_cv.certifications:
            certs_str = " ".join(parsed_cv.certifications).lower()
            if dom_id == "web_security" and any(c in certs_str for c in ["oscp", "oswe", "ejpt", "pnpt", "pentest+", "ceh"]):
                cert_bonus = 20.0
            elif dom_id == "network_security" and any(c in certs_str for c in ["oscp", "gpen", "gxpn", "ccna", "ccnp", "ccie"]):
                cert_bonus = 20.0
            elif dom_id == "dfir" and any(c in certs_str for c in ["gcfa", "gcih", "chfi", "gnfa", "encase"]):
                cert_bonus = 25.0
            elif dom_id == "soc_siem" and any(c in certs_str for c in ["splunk", "cysa+", "security+", "sc-200", "qradar"]):
                cert_bonus = 20.0
            elif dom_id == "threat_hunting" and any(c in certs_str for c in ["gcih", "gcfa", "gpen", "mitre"]):
                cert_bonus = 20.0
            elif dom_id == "malware_re" and any(c in certs_str for c in ["grem", "gxpn", "reverse"]):
                cert_bonus = 30.0

        # 3. Experience bonus — ONLY if user has at least 1 keyword in this domain
        exp_bonus = 0.0
        if kw_count > 0 and parsed_cv.experience_years > 0:
            exp_bonus = min(20.0, parsed_cv.experience_years * 3.0)

        total_user_score = min(100.0, base_kw_score + cert_bonus + exp_bonus)
        target_score = float(benchmarks.get(dom_id, 60))
        gap = round(max(0.0, target_score - total_user_score), 1)

        scores.append(DomainScore(
            domain_id=dom_id,
            domain_name=dom_name,
            user_score=round(total_user_score, 1),
            target_score=round(target_score, 1),
            gap=gap
        ))

    return scores


def generate_learning_path(
    user_id: str,
    parsed_cv: ParsedCV,
    target_role_id: str = "soc_analyst"
) -> LearningPathResponse:
    """Generate a 4-tier deterministic PWNDORA lab learning path.

    TIER ASSIGNMENT LOGIC:
    - Skip: User already has strong skills matching this lab's keywords AND high domain score.
    - Foundation: User has very low domain score and this is a beginner lab.
    - Primary Path: User has a gap in this domain relative to their target role.
    - Stretch: User meets the target but this is an advanced challenge.

    An unrelated CV (e.g., accountant) will get ALL labs assigned to Foundation/Primary Path
    because all domain scores will be 0, meaning maximum gap.
    """
    start_time = time.time()

    # Locate target role configuration
    target_role = next(
        (r for r in TAXONOMY_DATA["target_roles"] if r["id"] == target_role_id),
        TAXONOMY_DATA["target_roles"][0]
    )

    # Compute scores per domain
    domain_scores = calculate_domain_scores(parsed_cv, target_role)
    score_dict = {ds.domain_id: ds for ds in domain_scores}

    cv_skills_lower = set(s.lower() for s in parsed_cv.skills)

    labs: List[LabItem] = []
    tier_counts = {"Skip": 0, "Foundation": 0, "Primary Path": 0, "Stretch": 0}
    total_est_hours = 0.0
    primary_est_hours = 0.0

    for skill_entry in TAXONOMY_DATA["skills"]:
        dom_id = skill_entry["domain"]
        ds = score_dict.get(dom_id)
        u_score = ds.user_score if ds else 0.0
        t_score = ds.target_score if ds else 60.0
        gap = ds.gap if ds else 60.0

        # Check how many of this lab's specific keywords the user actually has
        lab_keywords = set(kw.lower() for kw in skill_entry.get("keywords", []))
        matched_keywords = lab_keywords.intersection(cv_skills_lower)
        keyword_match_ratio = len(matched_keywords) / max(1, len(lab_keywords))

        diff = skill_entry["difficulty"]
        
        # ─── TRULY PERSONALIZED FILTERING LOGIC ───
        
        # 1. If user already knows the exact keywords for this lab, skip it entirely.
        if keyword_match_ratio >= 0.4 and u_score >= 60.0:
            continue
            
        tier = None
        
        if u_score < 25.0:
            # BEGINNER in this domain
            if diff == "Beginner":
                tier = "Foundation"
            elif diff == "Intermediate":
                tier = "Primary Path"
            else:
                tier = "Stretch"
                
        elif u_score >= 25.0 and u_score < 60.0:
            # INTERMEDIATE in this domain
            if diff == "Beginner":
                continue # Filter out beginner labs; they already know this
            elif diff == "Intermediate":
                tier = "Primary Path"
            else:
                tier = "Stretch"
                
        else:
            # ADVANCED in this domain (u_score >= 60.0)
            if diff in ["Beginner", "Intermediate"]:
                continue # Filter out basics
            else:
                tier = "Stretch" # Only give them hard labs
        
        # Add to path
        if tier:
            tier_counts[tier] += 1
            est_hrs = skill_entry["est_hours"]
            total_est_hours += est_hrs
            if tier in ("Primary Path", "Foundation"):
                primary_est_hours += est_hrs

            labs.append(LabItem(
                lab_id=skill_entry["lab_id"],
                lab_title=skill_entry["lab_title"],
                skill_id=skill_entry["skill_id"],
                skill_name=skill_entry["name"],
                domain=dom_id,
                difficulty=diff,
                est_hours=est_hrs,
                tier=tier,
                description=skill_entry["description"],
                completed=False
            ))

    # ─── PATH CURATION (LIMITING THE DUMP) ───
    # Group by domain and difficulty to enforce limits
    curated_labs = []
    domain_lab_counts = {dom["id"]: {"Beginner": 0, "Intermediate": 0, "Advanced": 0} for dom in TAXONOMY_DATA["domains"]}
    
    # We first sort the raw labs to ensure we pick the "best" or "first" in sequence
    diff_order = {"Beginner": 1, "Intermediate": 2, "Advanced": 3}
    labs.sort(key=lambda l: (TIER_PRIORITY.get(l.tier, 99), l.domain, diff_order.get(l.difficulty, 99), l.lab_id))

    for lab in labs:
        # Enforce strict limits per domain to create a focused path
        # Max 1 Beginner, Max 2 Intermediate, Max 1 Advanced per domain
        counts = domain_lab_counts[lab.domain]
        if lab.difficulty == "Beginner" and counts["Beginner"] >= 1:
            continue
        if lab.difficulty == "Intermediate" and counts["Intermediate"] >= 2:
            continue
        if lab.difficulty == "Advanced" and counts["Advanced"] >= 1:
            continue
            
        curated_labs.append(lab)
        counts[lab.difficulty] += 1
        
    # Recalculate totals for the curated list
    tier_counts = {"Skip": 0, "Foundation": 0, "Primary Path": 0, "Stretch": 0}
    total_est_hours = 0.0
    primary_est_hours = 0.0
    for lab in curated_labs:
        tier_counts[lab.tier] += 1
        total_est_hours += lab.est_hours
        if lab.tier in ("Primary Path", "Foundation"):
            primary_est_hours += lab.est_hours

    # ─── BUILD ROADMAP PHASES ───
    # Group the curated labs by their Tier into distinct phases
    foundation_labs = [l for l in curated_labs if l.tier == "Foundation"]
    primary_labs = [l for l in curated_labs if l.tier == "Primary Path"]
    stretch_labs = [l for l in curated_labs if l.tier == "Stretch"]
    
    roadmap = []
    
    if foundation_labs:
        roadmap.append({
            "phase_id": "phase_1",
            "title": "Phase 1: Foundation Building",
            "description": "Establishing core concepts and bridging major knowledge gaps before tackling advanced topics.",
            "est_hours": sum(l.est_hours for l in foundation_labs),
            "labs": foundation_labs
        })
        
    if primary_labs:
        roadmap.append({
            "phase_id": "phase_2",
            "title": "Phase 2: Core Competencies",
            "description": "Developing the essential, intermediate skills required for your target role.",
            "est_hours": sum(l.est_hours for l in primary_labs),
            "labs": primary_labs
        })
        
    if stretch_labs:
        roadmap.append({
            "phase_id": "phase_3",
            "title": "Phase 3: Advanced Specialization",
            "description": "Taking your skills beyond the benchmark with advanced challenges and edge-case scenarios.",
            "est_hours": sum(l.est_hours for l in stretch_labs),
            "labs": stretch_labs
        })

    elapsed_ms = round((time.time() - start_time) * 1000, 2)

    return LearningPathResponse(
        user_id=user_id,
        target_role_id=target_role["id"],
        target_role_name=target_role["name"],
        parsed_cv=parsed_cv,
        domain_scores=domain_scores,
        roadmap=roadmap,
        tier_counts=tier_counts,
        total_est_hours=round(total_est_hours, 1),
        primary_est_hours=round(primary_est_hours, 1),
        processing_time_ms=elapsed_ms
    )

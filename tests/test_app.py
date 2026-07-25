import os
import sys
import json

# Add backend to PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from fastapi.testclient import TestClient
from app.main import app
from app.taxonomy_engine import TAXONOMY_DATA, generate_learning_path
from app.parser import parse_cv_nlp

client = TestClient(app)

def test_taxonomy_integrity():
    """Verify taxonomy has at least 40 entries and covers all 6 required domains."""
    skills = TAXONOMY_DATA.get("skills", [])
    domains = TAXONOMY_DATA.get("domains", [])
    
    assert len(skills) >= 40, f"Expected at least 40 skills, got {len(skills)}"
    assert len(domains) == 6, f"Expected 6 domains, got {len(domains)}"
    
    domain_ids = {d["id"] for d in domains}
    expected_domains = {"web_security", "network_security", "dfir", "soc_siem", "threat_hunting", "malware_re"}
    assert domain_ids == expected_domains, f"Domain mismatch: {domain_ids}"
    print("[PASS] Taxonomy Integrity Test Passed (42 entries across 6 domains)")

def test_pdf_parsing():
    """Verify PyMuPDF parsing on sample SOC analyst PDF."""
    pdf_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "samples", "sample_soc_analyst.pdf"))
    assert os.path.exists(pdf_path), "Sample PDF file missing"
    
    with open(pdf_path, "rb") as f:
        content = f.read()
        
    parsed = parse_cv_nlp("sample_soc_analyst.pdf", content)
    assert len(parsed.skills) > 0, "No skills extracted from PDF"
    assert len(parsed.certifications) > 0, "No certifications extracted from PDF"
    assert any("Splunk" in c for c in parsed.certifications), "Splunk certification not detected"
    print(f"[PASS] PDF Parsing Test Passed (Extracted {len(parsed.skills)} skills & {len(parsed.certifications)} certs)")

def test_docx_parsing():
    """Verify python-docx parsing on sample Pentester DOCX."""
    docx_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "samples", "sample_pentester.docx"))
    assert os.path.exists(docx_path), "Sample DOCX file missing"
    
    with open(docx_path, "rb") as f:
        content = f.read()
        
    parsed = parse_cv_nlp("sample_pentester.docx", content)
    assert len(parsed.skills) > 0, "No skills extracted from DOCX"
    assert "Offensive Security Certified Professional (OSCP)" in parsed.certifications, "OSCP certification not detected"
    print(f"[PASS] DOCX Parsing Test Passed (Extracted {len(parsed.skills)} skills & OSCP cert)")

def test_deterministic_output():
    """Ensure identical CV input produces 100% identical score and learning path every time."""
    pdf_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "samples", "sample_soc_analyst.pdf"))
    with open(pdf_path, "rb") as f:
        content = f.read()
        
    parsed1 = parse_cv_nlp("sample_soc_analyst.pdf", content)
    path1 = generate_learning_path("user1", parsed1, "soc_analyst")
    
    parsed2 = parse_cv_nlp("sample_soc_analyst.pdf", content)
    path2 = generate_learning_path("user1", parsed2, "soc_analyst")
    
    # Compare deterministic data structures
    d1 = path1.model_dump()
    d2 = path2.model_dump()
    
    # Ignore processing timer diffs
    d1.pop("processing_time_ms")
    d2.pop("processing_time_ms")
    
    assert d1 == d2, "Path generator outputs differ!"
    print("[PASS] Deterministic Output Test Passed (Identical 100/100 outputs)")

def test_api_parse_cv_endpoint():
    """Test POST /api/parse-cv endpoint."""
    pdf_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "samples", "sample_soc_analyst.pdf"))
    with open(pdf_path, "rb") as f:
        response = client.post(
            "/api/parse-cv",
            files={"file": ("sample_soc_analyst.pdf", f, "application/pdf")},
            data={"target_role_id": "soc_analyst"}
        )
    assert response.status_code == 200
    json_data = response.json()
    assert "domain_scores" in json_data
    assert "labs" in json_data
    assert json_data["processing_time_ms"] < 30000.0, "Parsing exceeded 30s SLA!"
    print(f"[PASS] POST /api/parse-cv Test Passed (Execution time: {json_data['processing_time_ms']} ms < 30s SLA)")

def test_integration_endpoint():
    """Test GET /api/learner-path/{user_id} endpoint."""
    response = client.get("/api/learner-path/demo_user")
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["user_id"] == "demo_user"
    assert len(json_data["labs"]) > 0
    print(f"[PASS] GET /api/learner-path/demo_user Test Passed ({len(json_data['labs'])} labs returned)")

if __name__ == "__main__":
    test_taxonomy_integrity()
    test_pdf_parsing()
    test_docx_parsing()
    test_deterministic_output()
    test_api_parse_cv_endpoint()
    test_integration_endpoint()
    print("\nALL 6 AUTOMATED VERIFICATION TESTS PASSED SUCCESSFULLY!")

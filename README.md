# PWNDORA Career Mapper

> Upload your CV, get a personalized cybersecurity learning path.

**Live demo:** [brew-ashen-chi.vercel.app](https://brew-ashen-chi.vercel.app)

PWNDORA Career Mapper parses a candidate's CV (PDF or DOCX), extracts cybersecurity skills, certifications, and experience using a custom NLP pipeline, and deterministically maps that profile against a hand-built skills taxonomy to generate a tiered learning path (Foundation → Primary Path → Stretch → Skip) for a chosen target role (e.g. SOC Analyst, Penetration Tester).

## Features

- **Drag-and-drop CV ingestion** — React UI for uploading PDF/DOCX CVs with real-time validation and feedback.
- **NLP-powered CV parsing** — custom pipeline extracts technical skills, certifications, job titles, experience duration, and domain keywords, with no paid third-party APIs.
- **Deterministic path generation** — compares parsed CV data against a taxonomy of 40+ skills across 6 domains (`taxonomy.json`) and outputs a 4-tier lab sequence.
- **Dynamic target role recalculation** — switch target roles (e.g. SOC Analyst → Penetration Tester) and the skill gaps and lab sequence update in real time.
- **6-domain skill radar chart** — custom D3.js chart comparing current proficiency against the benchmark for the target role.
- **Secure authentication** — JWT-secured endpoints for CV parsing and path retrieval.
- **Containerized deployment** — full stack (backend + database) ships via `docker-compose`.

See [FEATURES.md](./FEATURES.md) for the full architecture writeup, including rationale for each technology choice.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI (Python), Uvicorn |
| CV Parsing | PyMuPDF (`fitz`) / pdfplumber (PDF), python-docx (DOCX) |
| NLP | spaCy with a custom `EntityRuler` for cybersecurity entity recognition |
| Frontend | React, D3.js (radar chart) |
| Database | PostgreSQL |
| Auth | JSON Web Tokens (JWT) |
| Deployment | Docker / docker-compose |

## Project Structure

```
brew/
├── api/          # API layer
├── backend/      # FastAPI application (parsing, auth, path generation)
├── frontend/     # React application
├── samples/      # Sample CVs / fixtures
├── tests/        # Test suite
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
├── update_taxonomy.py
└── FEATURES.md
```

## Getting Started

### Prerequisites

- Docker and Docker Compose
- (For local, non-Docker development) Python 3.10+ and Node.js

### Run with Docker Compose

```bash
git clone https://github.com/Phexlp/brew.git
cd brew
docker-compose up --build
```

This starts:
- `db` — a PostgreSQL 15 instance on port `5432`
- `career-mapper` — the FastAPI backend on port `8080`

> **Note:** `docker-compose.yml` ships with default credentials (`DATABASE_URL`, `SECRET_KEY`) for local development. **Replace these with your own secrets before deploying to production.**

### Local development (without Docker)

```bash
# Backend
pip install -r requirements.txt
cd backend
uvicorn main:app --reload --port 8080

# Frontend
cd frontend
npm install
npm start
```

Exact entrypoint/module names may differ — check the `backend/` and `frontend/` directories for the specific run scripts.

## Database

The app uses PostgreSQL with two primary tables:

- **`users`** — authentication details (`id`, `username`, `email`, `hashed_password`).
- **`learner_paths`** — cached, deterministically generated learning paths per user, including the parsed CV JSON and the full generated path/domain-score JSON, so users don't need to re-upload or re-parse their CV on every login.

## Updating the Skills Taxonomy

The skill-matching logic is driven by a taxonomy file. Use `update_taxonomy.py` to modify or regenerate it:

```bash
python update_taxonomy.py
```

## Contributing

Issues and pull requests are welcome. Please open an issue to discuss significant changes before submitting a PR.

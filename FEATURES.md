# PWNDORA Career Mapper: Features & Architecture

## 1. Core Features

* **Drag-and-Drop File Ingestion**: A modern React-based UI that allows users to seamlessly upload their CVs (PDF or DOCX). It provides real-time validation and visual feedback.
* **NLP-Powered CV Parsing**: A custom-built Natural Language Processing pipeline that extracts technical skills, cybersecurity certifications, job titles, experience duration, and domain keywords without relying on any paid third-party APIs.
* **Deterministic Path Generation**: An algorithmic engine that compares the extracted CV data against a hand-crafted taxonomy (`taxonomy.json` containing 40+ skills across 6 domains). It deterministically outputs a 4-tier personalized learning lab sequence (Foundation, Primary Path, Stretch, Skip).
* **Dynamic Target Role Recalculation**: Users can change their desired career path (e.g., SOC Analyst to Penetration Tester), and the system dynamically recalculates the skill gaps and updates the lab sequence in real-time.
* **6-Domain Skill Radar Chart**: A bespoke D3.js radar chart that visualizes the candidate's current proficiency across 6 cybersecurity domains versus the benchmark score for their target role.
* **Secure Authentication**: All endpoints are secured using JSON Web Tokens (JWT) to ensure that only authenticated users can parse CVs or view paths.
* **Containerized Deployment**: The entire stack (Backend + Database) is shipped via `docker-compose`, making it instantly reproducible and production-ready.

---

## 2. Technology & APIs (Why we use what we use)

* **FastAPI (Python)**: Chosen for the backend because it is extremely fast, supports asynchronous requests, and provides automatic data validation using Pydantic. It's perfectly suited for handling file uploads and fast JSON responses (sub-30 second SLA).
* **Uvicorn**: The lightning-fast ASGI server used to run the FastAPI application locally and within Docker containers.
* **PyMuPDF (`fitz`) / pdfplumber**: Used for PDF parsing. These libraries provide robust, highly accurate text extraction from complex CV layouts.
* **python-docx**: The standard library for reliably extracting text from `.docx` files.
* **spaCy (Custom `EntityRuler`)**: Used for Named Entity Recognition (NER). Instead of paying for a third-party resume API, we built an offline, custom cybersecurity entity ruler. This ensures maximum privacy, low latency, and zero recurring API costs.
* **D3.js**: Used on the frontend to build the custom 6-domain radar chart. D3 allows for pure, granular control over SVG elements to create a premium, non-flashy enterprise visualization that accurately reflects the extracted proficiency.
* **React**: Used for the frontend to create a modular, state-driven dashboard (tabs, dynamic updates, drag-and-drop).

---

## 3. Database Architecture (PostgreSQL)

We transitioned from SQLite to PostgreSQL to ensure the application is production-ready. 
Here is exactly what we are storing in the database:

### Table: `users`
Stores user authentication details.
* **`id`** (Integer, Primary Key)
* **`username`** (String, Unique): Used for login.
* **`email`** (String, Unique)
* **`hashed_password`** (String): Securely hashed passwords to prevent unauthorized access.

### Table: `learner_paths`
Stores the exact, deterministically generated learning path and the parsed CV context so the user doesn't have to re-upload their CV every time they log in.
* **`id`** (Integer, Primary Key)
* **`user_id`** (String, Indexed): Links the path to a specific user.
* **`target_role_id`** (String): The current target role the user is aiming for (e.g., `soc_analyst`, `pentester`).
* **`parsed_cv_json`** (Text/JSON): The raw structured output from our NLP pipeline (skills, certs, experience). We store this so we can easily recalculate paths if the user changes their target role.
* **`path_response_json`** (Text/JSON): The complete generated lab sequence and domain scores. We cache this in the database to instantly serve the dashboard UI upon login without running the heavy NLP parsing again.

FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for PyMuPDF and python-docx
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Copy backend requirements and install
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend app & frontend static files
COPY backend /app/backend
COPY frontend /app/frontend
COPY samples /app/samples

ENV PYTHONPATH=/app/backend

EXPOSE 8080

CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8080"]

# Internal Planner Mini App

Simple internal tool to:
- Download latest planner input JSON (CPLEX).
- Upload a schedule JSON to visualize it in the Gantt timeline.

## Backend (FastAPI)

```bash
cd internal_app/backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Remote DB URL for planner input queries
export REMOTE_NAVI_DB_URL="postgresql+psycopg://navi_user:navi_password@172.16.199.4:5440/navi_db"

uvicorn main:app --reload --port 8081
```

### Backend endpoints
- `GET /planner-input` → runs local copy of CPLEX planner-input queries on remote DB
- `POST /schedule-upload` → upload schedule JSON file
- `POST /schedule` → send schedule JSON in request body
- `GET /schedule` → returns latest uploaded schedule

Schedule JSON must be in the same shape as the current timeline expects:
```json
{ "machines": [...], "items": [...] }
```
You can obtain a valid shape by calling the main backend `GET /app/schedule` and saving the response.

## Frontend (Next.js)

```bash
cd internal_app/frontend
npm install

# Backend base URL (FastAPI from above)
export NEXT_PUBLIC_INTERNAL_API_BASE="http://localhost:8081"

npm run dev
```

Open: http://localhost:3000

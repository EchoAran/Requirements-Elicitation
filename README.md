# Semi-Structured Interview

A semi-structured interview system for requirement elicitation/clarification. It supports project creation, interview framework generation, topic-driven dialog progression, slot extraction and structure maintenance, domain knowledge (experience base) retrieval & fusion, and exporting interview reports.

## Table of Contents

- [Features](#features)
- [Tech Stack & Ports](#tech-stack--ports)
- [Project Structure](#project-structure)
- [Quick Start (Local Development)](#quick-start-local-development)
  - [Run Backend](#run-backend)
  - [Run Frontend](#run-frontend)
- [Typical Workflow](#typical-workflow)
- [Configuration](#configuration)
  - [LLM & Embedding Settings](#llm--embedding-settings)
  - [Algorithm/Strategy Thresholds (Optional Env Vars)](#algorithmstrategy-thresholds-optional-env-vars)
- [API Cheatsheet (Partial)](#api-cheatsheet-partial)
- [Data & Persistence](#data--persistence)
- [FAQ](#faq)

## Features

- Interview framework generation: generates a section/topic/slot framework from initial requirements.
- Topic-driven interview flow: advances with the current topic, can automatically switch/create/end topics, and produces the next interviewer prompt.
- Slot filling: fills impacted topics' slots during the conversation and records evidence message ids.
- Structure management: add/update/delete sections/topics/slots in the UI.
- Domain experiences (knowledge base): create/update/delete domain experiences; supports embedding computation.
- Domain retrieval & fusion: retrieves similar domain experiences by embedding and fuses them into supplemental domain text.
- Export: export interview report (Markdown), chat history (JSON), and slot structure (JSON).

## Tech Stack & Ports

- Backend: FastAPI (`backend/main.py`) + SQLAlchemy + SQLite
- Frontend: React + TypeScript + Vite (`frontend/`)

Default ports:

- Frontend: `http://localhost:5500` (Vite dev server, `frontend/vite.config.ts`)
- Backend: `http://localhost:8800` (recommended; frontend proxy target)

The frontend proxies all requests starting with `/api` to `http://localhost:8800` (see `frontend/vite.config.ts`). Backend CORS also allows `http://localhost:5500` by default (see `backend/main.py:13-19`).

## Project Structure

```text
.
├─ backend/                 # FastAPI service and core logic
│  ├─ core/                 # framework generation / slot filling / strategy selection / report generation, etc.
│  ├─ prompts/              # prompt templates
│  ├─ routes/               # API routes
│  ├─ config.py             # thresholds and strategy config (supports env var overrides)
│  ├─ llm_handler.py        # unified LLM/Embedding invocation wrapper
│  └─ main.py               # FastAPI app entry
├─ database/                # SQLite database and ORM models
│  ├─ database.py           # engine / session / initialization
│  ├─ models.py             # ORM schemas
│  └─ database.db           # default local database file
└─ frontend/                # React frontend
   ├─ src/
   ├─ dist/                 # build output (if built)
   └─ vite.config.ts
```

## Quick Start (Local Development)

### Run Backend

1) Create and activate a virtual environment

```bash
python -m venv .venv
```

2) Install dependencies

```bash
pip install -r requirements.txt
```

3) Start the service (recommended port: `8800`)

```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8800
```

On startup, database tables are initialized automatically (see `backend/main.py:21-23` and `database/database.py:init_db`).

### Run Frontend

1) Install dependencies

```bash
cd frontend
npm install
```

2) Start the dev server

```bash
npm run client:dev
```

Open: `http://localhost:5500`

Note: `npm run dev` starts both `client:dev` and `server:dev`, but this repository does not include `frontend/api/server.ts`, so `npm run client:dev` is recommended.

## Typical Workflow

- Sign in / sign up: `/api/login`, `/api/register` (UI: `frontend/src/pages/Login.tsx`, `Register.tsx`).
- Configure models: fill `API URL / API Key / Model Name` and Embedding config in the “System Settings” page (stored in `localStorage` on the frontend).
- Create project: input project name and initial requirements; optionally run “domain retrieval & fusion” before “create and initialize”.
- Start interview: click start on the interview page to get the first interviewer question; each reply generates the next interviewer question, fills slots, and may switch topics.
- Generate/export report: after interview completion (or manual regenerate), export report / chat / slots JSON.

## Configuration

### LLM & Embedding Settings

Most backend capabilities take model configuration via request payload (instead of reading secrets from env vars). Common fields:

- `api_url`: OpenAI-compatible base URL for chat completion (e.g. `https://api.openai.com/v1`)
- `api_key`: API key for the model service
- `model_name`: model name (e.g. `gpt-4o-mini` or your service-specific model id)

Embedding computation also uses `api_url/api_key/model_name` (see `backend/routes/domain_experiences.py:129-165`).

### Algorithm/Strategy Thresholds (Optional Env Vars)

`backend/config.py` supports overriding some thresholds via environment variables (defaults in parentheses):

- `LENGTH_COEFFICIENT` (500)
- `ENTROPY_LENGTH_WEIGHT` (0.3)
- `ENTROPY_SEMANTIC_WEIGHT` (0.7)
- `ENTROPY_THRESHOLD` (0.6)
- `KC_TOPIC_WEIGHT` (0.5)
- `KC_SLOT_WEIGHT` (0.5)
- `KC_THRESHOLD` (0.2)
- `RETRIEVAL_COSINE_THRESHOLD` (0.7)
- `RETRIEVAL_TOP_K` (5)
- `OPERATION_SELECTION_THETA` (0.6)
- `STRATEGY_COMPLETION_LOW` (0.5)

## API Cheatsheet (Partial)

Note: this is a quick list of frequently used endpoints; refer to `backend/routes/` for the full set.

### Auth

- `POST /api/register` (see `backend/routes/auth.py:34-54`)
- `POST /api/login` (see `backend/routes/auth.py:20-33`)

### Projects & Exports

- `GET /api/projects` (see `backend/routes/projects.py:53-72`)
- `POST /api/projects` (create project only; see `backend/routes/projects.py:74-106`)
- `POST /api/projects/create-and-initialize` (create and initialize framework; see `backend/routes/projects.py:108-150`)
- `GET /api/projects/{project_id}/report/download` (download report markdown; see `backend/routes/projects.py:218-228`)
- `GET /api/projects/{project_id}/chat/download` (download chat JSON; see `backend/routes/projects.py:230-256`)
- `GET /api/projects/{project_id}/slots/download` (download slots JSON; see `backend/routes/projects.py:258-292`)

### Interview Flow

- `POST /api/projects/{project_id}/initialize` (generate framework; see `backend/routes/interview_flow.py:40-52`)
- `POST /api/projects/{project_id}/interview/start` (start interview; see `backend/routes/interview_flow.py:54-153`)
- `POST /api/projects/{project_id}/interview/reply` (reply and get next interviewer message; see `backend/routes/interview_flow.py:155-319`)
- `GET /api/projects/{project_id}/chat` (get chat and current topic; see `backend/routes/interview_flow.py:321-365`)

### Domain Experiences (Knowledge Base)

- `GET /api/domain-experiences` (list, supports `user_id`; see `backend/routes/domain_experiences.py:51-72`)
- `POST /api/domain-experiences` (create; see `backend/routes/domain_experiences.py:74-97`)
- `PATCH /api/domain-experiences/{domain_id}` (update; see `backend/routes/domain_experiences.py:98-118`)
- `DELETE /api/domain-experiences/{domain_id}` (delete; see `backend/routes/domain_experiences.py:120-127`)
- `POST /api/domain-experiences/{domain_id}/embedding/recompute` (recompute embedding; see `backend/routes/domain_experiences.py:129-145`)
- `POST /api/domain-experiences/ingest-create` (upload files, generate domain experience + embedding; see `backend/routes/domain_experiences.py:167-293`)

## Data & Persistence

- SQLite file database: `database/database.db` (see `database/database.py:8-12`).
- On backend startup: tables are created and a lightweight “add-column migration” runs (see `database/database.py:17-43`).

## FAQ

### Frontend loads but API requests fail (CORS/proxy)

- Ensure backend is running on port `8800`: `uvicorn backend.main:app --port 8800`.
- Ensure frontend is on `5500` (`frontend/vite.config.ts`) and backend CORS allows `http://localhost:5500` (`backend/main.py:13-19`).

### File upload errors mentioning `multipart`

- Install `python-multipart`: `pip install python-multipart`.

### PDF upload does not extract text

- Install `PyPDF2`: `pip install PyPDF2`.

### Report generation fails or hangs

- Report generation calls an external service `http://101.35.52.200:8033/generate-prd` (see `backend/core/info_summarizer.py:92-111`).
- If that address is not reachable from your network, replace it with an available report-generation service or implement a local generator.


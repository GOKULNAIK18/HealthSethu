# Healthcare AI System (Split Stack)

This project is now split into:

- `frontend/` - Next.js app running on port `3000`
- `backend/` - FastAPI + SQLite API running on port `8000`

## Quick Start

1. Start backend:

```bash
./start-backend.sh
```

2. In another terminal, start frontend:

```bash
./start-frontend.sh
```

Both startup scripts enforce the requested behavior:

- they do **not** use port `5000`
- they check required ports first
- if occupied, they close the port before starting

## Environment

- Copy `frontend/.env.example` to `frontend/.env.local`
- Copy `backend/.env.example` to `backend/.env`

## API Notes

- Frontend calls backend using `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:8000`)
- Auth is cookie-based JWT (`hs_token`) and requests use `credentials: include`
- Uploads are served from backend at `/uploads/*`

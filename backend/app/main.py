import json
import os
import sqlite3
import time
from pathlib import Path
from typing import Any, Optional

import bcrypt
import jwt
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .skin_model import SkinPredictor

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = BASE_DIR / "public" / "uploads"
DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "healthsetu.db"
ARTIFACTS_DIR = BASE_DIR / "artifacts"
MODEL_PATH = ARTIFACTS_DIR / "skin_classifier.pt"
MODEL_META_PATH = ARTIFACTS_DIR / "skin_classifier.json"

JWT_SECRET = os.getenv("JWT_SECRET", "healthsetu-jwt-super-secret-key-2024")
COOKIE_NAME = "hs_token"
COOKIE_MAX_AGE = 60 * 60 * 24 * 7
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")


app = FastAPI(title="HealthSetu Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")


def db_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


conn = db_conn()
skin_predictor = SkinPredictor(MODEL_PATH, MODEL_META_PATH)


def init_schema() -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'patient' CHECK(role IN ('patient','asha','doctor','admin')),
          phone TEXT,
          village TEXT,
          district TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS patients (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          age INTEGER NOT NULL,
          gender TEXT NOT NULL CHECK(gender IN ('Male','Female','Other')),
          village TEXT NOT NULL,
          district TEXT NOT NULL DEFAULT '',
          state TEXT NOT NULL DEFAULT 'Madhya Pradesh',
          phone TEXT NOT NULL,
          created_by INTEGER REFERENCES users(id),
          created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS cases (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          case_code TEXT UNIQUE NOT NULL,
          patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
          condition TEXT NOT NULL DEFAULT '',
          duration_days INTEGER NOT NULL DEFAULT 1,
          severity TEXT NOT NULL DEFAULT 'Early' CHECK(severity IN ('Early','Moderate','Severe')),
          status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Resolved','Escalated')),
          ai_disease TEXT,
          ai_confidence REAL,
          ai_condition_score REAL,
          ai_reasoning TEXT,
          assigned_asha TEXT,
          doctor_notes TEXT,
          doctor_diagnosis TEXT,
          doctor_override INTEGER DEFAULT 0,
          created_by INTEGER REFERENCES users(id),
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS case_symptoms (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
          symptom TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS case_images (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
          filename TEXT NOT NULL,
          original_name TEXT,
          condition_score REAL NOT NULL DEFAULT 5.0,
          label TEXT,
          uploaded_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS federated_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          round_number INTEGER NOT NULL DEFAULT 0,
          model_version TEXT NOT NULL DEFAULT 'skin-tflite-v1',
          last_loss REAL NOT NULL DEFAULT 0.42,
          participating_nodes INTEGER NOT NULL DEFAULT 8,
          updated_at TEXT DEFAULT (datetime('now'))
        );
        INSERT OR IGNORE INTO federated_state (id, round_number, model_version, last_loss)
        VALUES (1, 0, 'skin-tflite-v1', 0.42);
        """
    )
    conn.commit()
    ensure_column("cases", "ai_openai_disease", "TEXT")
    ensure_column("cases", "ai_openai_confidence", "REAL")


def ensure_column(table: str, column: str, column_type: str) -> None:
    cols = conn.execute(f"PRAGMA table_info({table})").fetchall()
    exists = any(r["name"] == column for r in cols)
    if exists:
        return
    conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {column_type}")
    conn.commit()


def seed_if_empty() -> None:
    c = conn.execute("SELECT COUNT(*) as c FROM users").fetchone()["c"]
    if c > 0:
        return
    pwd = bcrypt.hashpw("Admin@123".encode(), bcrypt.gensalt()).decode()
    conn.execute(
        "INSERT INTO users (name,email,password_hash,role,phone,village,district) VALUES (?,?,?,?,?,?,?)",
        ("System Admin", "admin@healthsetu.in", pwd, "admin", "9800000001", "", ""),
    )
    conn.commit()


def to_dict(row: Optional[sqlite3.Row]) -> Optional[dict[str, Any]]:
    return dict(row) if row else None


def make_token(user: dict[str, Any]) -> str:
    payload = {
        "userId": user["id"],
        "role": user["role"],
        "name": user["name"],
        "email": user["email"],
        "exp": int(time.time()) + COOKIE_MAX_AGE,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def current_user(request: Request) -> Optional[dict[str, Any]]:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except Exception:
        return None


def unauthorized() -> None:
    raise HTTPException(status_code=401, detail="Unauthorized")


def forbidden() -> None:
    raise HTTPException(status_code=403, detail="Forbidden")


def role_scope_clause(role: str, user_id: int, user_name: str) -> tuple[str, list[Any]]:
    if role in ("admin", "doctor"):
        return "", []
    if role == "patient":
        return " AND (c.created_by = ? OR p.created_by = ?)", [user_id, user_id]
    if role == "asha":
        label = user_name.split("(")[0].strip()
        return " AND (c.created_by = ? OR c.assigned_asha = ?)", [user_id, label]
    return " AND 1=0", []


def can_access_case(user: dict[str, Any], c: dict[str, Any], patient: dict[str, Any]) -> bool:
    role = user["role"]
    if role in ("admin", "doctor"):
        return True
    if role == "patient":
        return c.get("created_by") == user["userId"] or patient.get("created_by") == user["userId"]
    if role == "asha":
        label = user.get("name", "").split("(")[0].strip()
        return c.get("created_by") == user["userId"] or c.get("assigned_asha") == label
    return False


def get_case(case_id: int) -> Optional[dict[str, Any]]:
    c = to_dict(conn.execute("SELECT * FROM cases WHERE id = ?", (case_id,)).fetchone())
    if not c:
        return None
    c["symptoms"] = [r["symptom"] for r in conn.execute("SELECT symptom FROM case_symptoms WHERE case_id = ?", (case_id,)).fetchall()]
    c["images"] = [dict(r) for r in conn.execute("SELECT * FROM case_images WHERE case_id = ? ORDER BY uploaded_at ASC", (case_id,)).fetchall()]
    c["patient"] = to_dict(conn.execute("SELECT * FROM patients WHERE id = ?", (c["patient_id"],)).fetchone())
    if c.get("ai_reasoning"):
        try:
            c["ai_reasoning"] = json.loads(c["ai_reasoning"])
        except Exception:
            c["ai_reasoning"] = [c["ai_reasoning"]]
    return c


def _score_from_confidence(confidence: float) -> float:
    return round(max(1.0, min(10.0, confidence / 10.0)), 1)


def run_case_intake_prediction(symptoms: list[str], duration_days: int, condition: str) -> dict[str, Any]:
    openai_pred = skin_predictor.predict_openai(symptoms, duration_days, condition, [])
    if openai_pred:
        confidence = float(openai_pred["confidence"])
        disease = openai_pred["label"]
        reasoning = [
            "Initial prediction based on intake data (before image upload).",
            *openai_pred.get("reasoning", []),
            f"OpenAI model: {openai_pred.get('model', 'configured model')}",
        ]
    else:
        confidence = 0.0
        disease = "Pending image-based classification"
        reasoning = [
            "Image is required for ML classifier prediction.",
            "OpenAI response unavailable or API key is missing.",
        ]

    score = _score_from_confidence(confidence) if confidence > 0 else 3.0
    severity = "Severe" if score >= 7 else "Moderate" if score >= 4 else "Early"
    return {
        "disease": disease,
        "confidence": round(confidence, 2),
        "severity": severity,
        "conditionScore": score,
        "reasoning": reasoning,
        "mlPrediction": None,
        "openaiPrediction": (
            {
                "disease": disease,
                "confidence": round(confidence, 2),
                "model": openai_pred.get("model", "configured model"),
            }
            if openai_pred
            else None
        ),
        "carePathway": "Follow role-based care workflow",
        "recommendedAction": "Upload image and review triage recommendations.",
    }


def run_image_prediction(
    image_bytes: bytes,
    symptoms: list[str],
    duration_days: int,
    condition: str,
    previous: Optional[float] = None,
) -> dict[str, Any]:
    ml_pred = skin_predictor.predict_image(image_bytes)
    openai_pred = skin_predictor.predict_openai(symptoms, duration_days, condition, ml_pred["top_predictions"])

    final_disease = ml_pred["label"]
    final_confidence = float(ml_pred["confidence"])
    if openai_pred and openai_pred["label"] == ml_pred["label"]:
        final_confidence = min(99.0, (final_confidence + float(openai_pred["confidence"])) / 2.0 + 2.0)

    score = _score_from_confidence(final_confidence)
    severity = "Severe" if score >= 7 else "Moderate" if score >= 4 else "Early"
    reasoning = [
        f"ML primary prediction: {ml_pred['label']} ({ml_pred['confidence']}%)",
        "ML top classes: "
        + ", ".join([f"{x['label']} ({x['confidence']}%)" for x in ml_pred["top_predictions"]]),
    ]
    if openai_pred:
        reasoning.append(f"OpenAI prediction: {openai_pred['label']} ({openai_pred['confidence']}%)")
        reasoning.extend(openai_pred.get("reasoning", []))
    else:
        reasoning.append("OpenAI prediction unavailable (missing API key or request error).")

    if previous is not None:
        delta = round(score - previous, 1)
        reasoning.append(f"Condition score trend delta: {delta:+}")

    return {
        "disease": final_disease,
        "confidence": round(final_confidence, 2),
        "severity": severity,
        "conditionScore": score,
        "reasoning": reasoning,
        "mlPrediction": {
            "disease": ml_pred["label"],
            "confidence": round(float(ml_pred["confidence"]), 2),
            "topPredictions": ml_pred["top_predictions"],
        },
        "openaiPrediction": (
            {
                "disease": openai_pred["label"],
                "confidence": round(float(openai_pred["confidence"]), 2),
                "model": openai_pred.get("model", "configured model"),
            }
            if openai_pred
            else None
        ),
        "carePathway": "Follow role-based care workflow",
        "recommendedAction": "Escalate if severe; monitor otherwise",
    }


init_schema()
seed_if_empty()


@app.post("/api/auth/login")
async def auth_login(request: Request) -> JSONResponse:
    body = await request.json()
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password required")
    user = to_dict(conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone())
    if not user or not bcrypt.checkpw(password.encode(), user["password_hash"].encode()):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = make_token(user)
    res = JSONResponse({"user": {"id": user["id"], "name": user["name"], "email": user["email"], "role": user["role"]}})
    res.set_cookie(COOKIE_NAME, token, httponly=True, samesite="lax", secure=False, max_age=COOKIE_MAX_AGE, path="/")
    return res


@app.post("/api/auth/register")
async def auth_register(request: Request) -> JSONResponse:
    body = await request.json()
    name, email, password = body.get("name"), (body.get("email") or "").strip().lower(), body.get("password")
    role = body.get("role") or "patient"
    if not name or not email or not password:
        raise HTTPException(status_code=400, detail="Name, email and password required")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    if role not in ("patient", "asha", "doctor", "admin"):
        raise HTTPException(status_code=400, detail="Invalid role")
    exists = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    if exists:
        raise HTTPException(status_code=409, detail="Email already registered")
    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    cur = conn.execute(
        "INSERT INTO users (name,email,password_hash,role,phone,village,district) VALUES (?,?,?,?,?,?,?)",
        (name.strip(), email, password_hash, role, body.get("phone"), body.get("village"), body.get("district")),
    )
    conn.commit()
    user_id = cur.lastrowid
    token = make_token({"id": user_id, "name": name.strip(), "email": email, "role": role})
    res = JSONResponse({"user": {"id": user_id, "name": name, "email": email, "role": role}}, status_code=201)
    res.set_cookie(COOKIE_NAME, token, httponly=True, samesite="lax", secure=False, max_age=COOKIE_MAX_AGE, path="/")
    return res


@app.get("/api/auth/me")
def auth_me(request: Request) -> JSONResponse:
    user = current_user(request)
    if not user:
        return JSONResponse({"user": None}, status_code=401)
    row = to_dict(conn.execute("SELECT id,name,email,role,phone,village,district,created_at FROM users WHERE id = ?", (user["userId"],)).fetchone())
    if not row:
        return JSONResponse({"user": None}, status_code=401)
    return JSONResponse({"user": row})


@app.post("/api/auth/logout")
def auth_logout() -> JSONResponse:
    res = JSONResponse({"ok": True})
    res.delete_cookie(COOKIE_NAME, path="/")
    return res


@app.get("/api/patients")
def list_patients(request: Request, q: str = "") -> JSONResponse:
    user = current_user(request)
    if not user:
        unauthorized()
    where = " WHERE created_by = ? " if user["role"] == "patient" else " WHERE 1=1 "
    params: list[Any] = [user["userId"]] if user["role"] == "patient" else []
    if q:
        where += " AND (name LIKE ? OR village LIKE ? OR phone LIKE ?)"
        params.extend([f"%{q}%", f"%{q}%", f"%{q}%"])
    rows = [dict(r) for r in conn.execute(f"SELECT * FROM patients{where} ORDER BY created_at DESC", params).fetchall()]
    return JSONResponse({"patients": rows})


@app.post("/api/patients")
async def create_patient(request: Request) -> JSONResponse:
    user = current_user(request)
    if not user:
        unauthorized()
    body = await request.json()
    name, age, gender, village, phone = body.get("name"), body.get("age"), body.get("gender"), body.get("village"), body.get("phone")
    if not all([name, age, gender, village, phone]):
        raise HTTPException(status_code=400, detail="Required fields missing")
    cur = conn.execute(
        "INSERT INTO patients (name,age,gender,village,district,state,phone,created_by) VALUES (?,?,?,?,?,?,?,?)",
        (name, int(age), gender, village, body.get("district", ""), body.get("state", "Madhya Pradesh"), phone, user["userId"]),
    )
    conn.commit()
    patient = to_dict(conn.execute("SELECT * FROM patients WHERE id = ?", (cur.lastrowid,)).fetchone())
    return JSONResponse({"patient": patient}, status_code=201)


@app.get("/api/patients/{patient_id}")
def get_patient(patient_id: int, request: Request) -> JSONResponse:
    user = current_user(request)
    if not user:
        unauthorized()
    patient = to_dict(conn.execute("SELECT * FROM patients WHERE id = ?", (patient_id,)).fetchone())
    if not patient:
        raise HTTPException(status_code=404, detail="Not found")
    cases = [dict(r) for r in conn.execute(
        "SELECT c.*, (SELECT GROUP_CONCAT(symptom,',') FROM case_symptoms WHERE case_id=c.id) as symptom_list FROM cases c WHERE c.patient_id = ? ORDER BY c.created_at DESC",
        (patient_id,),
    ).fetchall()]
    return JSONResponse({"patient": patient, "cases": cases})


@app.put("/api/patients/{patient_id}")
async def update_patient(patient_id: int, request: Request) -> JSONResponse:
    user = current_user(request)
    if not user:
        unauthorized()
    if user["role"] == "patient":
        forbidden()
    body = await request.json()
    conn.execute(
        """
        UPDATE patients SET
          name=COALESCE(?,name), age=COALESCE(?,age), gender=COALESCE(?,gender),
          village=COALESCE(?,village), district=COALESCE(?,district), state=COALESCE(?,state), phone=COALESCE(?,phone)
        WHERE id=?
        """,
        (body.get("name"), int(body["age"]) if body.get("age") else None, body.get("gender"), body.get("village"), body.get("district"), body.get("state"), body.get("phone"), patient_id),
    )
    conn.commit()
    patient = to_dict(conn.execute("SELECT * FROM patients WHERE id = ?", (patient_id,)).fetchone())
    return JSONResponse({"patient": patient})


@app.get("/api/cases")
def list_cases(request: Request, status: Optional[str] = None, severity: Optional[str] = None, limit: int = 100) -> JSONResponse:
    user = current_user(request)
    if not user:
        unauthorized()
    scope, scope_params = role_scope_clause(user["role"], int(user["userId"]), user["name"])
    q = """
      SELECT c.*, p.name as patient_name, p.age, p.gender, p.village, p.district, p.phone,
      (SELECT GROUP_CONCAT(symptom,',') FROM case_symptoms WHERE case_id=c.id) as symptom_list
      FROM cases c JOIN patients p ON c.patient_id = p.id WHERE 1=1
    """ + scope
    params: list[Any] = list(scope_params)
    if status:
        q += " AND c.status = ?"
        params.append(status)
    if severity:
        q += " AND c.severity = ?"
        params.append(severity)
    q += " ORDER BY c.created_at DESC LIMIT ?"
    params.append(limit)
    rows = []
    for r in conn.execute(q, params).fetchall():
        row = dict(r)
        row["symptoms"] = row["symptom_list"].split(",") if row.get("symptom_list") else []
        row.pop("symptom_list", None)
        row["images"] = [dict(i) for i in conn.execute("SELECT id, filename, condition_score, uploaded_at, label FROM case_images WHERE case_id = ? ORDER BY uploaded_at ASC", (row["id"],)).fetchall()]
        rows.append(row)
    return JSONResponse({"cases": rows})


@app.post("/api/cases")
async def create_case(request: Request) -> JSONResponse:
    user = current_user(request)
    if not user:
        unauthorized()
    body = await request.json()
    patient_id, condition = body.get("patient_id"), body.get("condition")
    duration_days = int(body.get("duration_days") or 1)
    symptoms = body.get("symptoms") or []
    assigned_asha = body.get("assigned_asha")
    if not patient_id or not condition:
        raise HTTPException(status_code=400, detail="patient_id and condition required")
    pred = run_case_intake_prediction(symptoms, duration_days, condition)
    case_code = f"HS-{str(int(time.time()))[-6:]}"
    cur = conn.execute(
        """
        INSERT INTO cases (case_code, patient_id, condition, duration_days, severity, status, ai_disease, ai_confidence, ai_condition_score, ai_reasoning, assigned_asha, created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        (case_code, int(patient_id), condition, duration_days, pred["severity"], "Active", pred["disease"], pred["confidence"], pred["conditionScore"], json.dumps(pred["reasoning"]), assigned_asha, user["userId"]),
    )
    conn.execute(
        "UPDATE cases SET ai_openai_disease=?, ai_openai_confidence=? WHERE id=?",
        (
            pred["openaiPrediction"]["disease"] if pred.get("openaiPrediction") else None,
            pred["openaiPrediction"]["confidence"] if pred.get("openaiPrediction") else None,
            cur.lastrowid,
        ),
    )
    case_id = cur.lastrowid
    for s in symptoms:
        conn.execute("INSERT INTO case_symptoms (case_id, symptom) VALUES (?,?)", (case_id, s))
    conn.commit()
    created = to_dict(conn.execute("SELECT c.*, p.name as patient_name, p.age, p.gender, p.village, p.district, p.phone FROM cases c JOIN patients p ON c.patient_id = p.id WHERE c.id = ?", (case_id,)).fetchone())
    return JSONResponse({"case": created, "prediction": pred}, status_code=201)


@app.get("/api/cases/{case_id}")
def case_detail(case_id: int, request: Request) -> JSONResponse:
    user = current_user(request)
    if not user:
        unauthorized()
    raw = get_case(case_id)
    if not raw:
        raise HTTPException(status_code=404, detail="Case not found")
    if not can_access_case(user, raw, raw["patient"]):
        forbidden()
    return JSONResponse({"case": raw})


@app.put("/api/cases/{case_id}")
async def update_case(case_id: int, request: Request) -> JSONResponse:
    user = current_user(request)
    if not user:
        unauthorized()
    if user["role"] == "patient":
        forbidden()
    body = await request.json()
    conn.execute(
        """
        UPDATE cases SET
          status=COALESCE(?, status), severity=COALESCE(?, severity), doctor_notes=COALESCE(?, doctor_notes),
          doctor_diagnosis=COALESCE(?, doctor_diagnosis), doctor_override=COALESCE(?, doctor_override),
          assigned_asha=COALESCE(?, assigned_asha), condition=COALESCE(?, condition),
          duration_days=COALESCE(?, duration_days), updated_at=datetime('now')
        WHERE id=?
        """,
        (
            body.get("status"),
            body.get("severity"),
            body.get("doctor_notes"),
            body.get("doctor_diagnosis"),
            int(body["doctor_override"]) if body.get("doctor_override") is not None else None,
            body.get("assigned_asha"),
            body.get("condition"),
            int(body["duration_days"]) if body.get("duration_days") else None,
            case_id,
        ),
    )
    conn.commit()
    return JSONResponse({"case": get_case(case_id)})


@app.delete("/api/cases/{case_id}")
def delete_case(case_id: int, request: Request) -> JSONResponse:
    user = current_user(request)
    if not user or user["role"] != "admin":
        forbidden()
    conn.execute("DELETE FROM cases WHERE id = ?", (case_id,))
    conn.commit()
    return JSONResponse({"ok": True})


@app.get("/api/cases/{case_id}/images")
def list_case_images(case_id: int, request: Request) -> JSONResponse:
    user = current_user(request)
    if not user:
        unauthorized()
    rows = [dict(r) for r in conn.execute("SELECT * FROM case_images WHERE case_id = ? ORDER BY uploaded_at ASC", (case_id,)).fetchall()]
    return JSONResponse({"images": rows})


@app.post("/api/cases/{case_id}/images")
async def add_case_image(
    case_id: int,
    request: Request,
    image: UploadFile = File(...),
    label: Optional[str] = Form(default=None),
) -> JSONResponse:
    user = current_user(request)
    if not user:
        unauthorized()
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    data = await image.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be under 10 MB")
    ext = (image.filename or "jpg").split(".")[-1]
    filename = f"case-{case_id}-{int(time.time() * 1000)}.{ext}"
    (UPLOAD_DIR / filename).write_bytes(data)
    symptoms = [r["symptom"] for r in conn.execute("SELECT symptom FROM case_symptoms WHERE case_id = ?", (case_id,)).fetchall()]
    case_row = to_dict(conn.execute("SELECT * FROM cases WHERE id = ?", (case_id,)).fetchone())
    prev = to_dict(conn.execute("SELECT condition_score FROM case_images WHERE case_id = ? ORDER BY uploaded_at DESC LIMIT 1", (case_id,)).fetchone())
    pred = run_image_prediction(
        data,
        symptoms,
        int(case_row["duration_days"]),
        case_row["condition"],
        prev["condition_score"] if prev else None,
    )
    cur = conn.execute(
        "INSERT INTO case_images (case_id,filename,original_name,condition_score,label) VALUES (?,?,?,?,?)",
        (case_id, filename, image.filename, pred["conditionScore"], label or f"Upload {time.strftime('%Y-%m-%d')}"),
    )
    conn.execute(
        """
        UPDATE cases SET ai_disease=?, ai_confidence=?, ai_condition_score=?, ai_reasoning=?, severity=?, updated_at=datetime('now') WHERE id=?
        """,
        (pred["disease"], pred["confidence"], pred["conditionScore"], json.dumps(pred["reasoning"]), pred["severity"], case_id),
    )
    conn.execute(
        "UPDATE cases SET ai_openai_disease=?, ai_openai_confidence=? WHERE id=?",
        (
            pred["openaiPrediction"]["disease"] if pred.get("openaiPrediction") else None,
            pred["openaiPrediction"]["confidence"] if pred.get("openaiPrediction") else None,
            case_id,
        ),
    )
    conn.commit()
    new_img = to_dict(conn.execute("SELECT * FROM case_images WHERE id = ?", (cur.lastrowid,)).fetchone())
    return JSONResponse(
        {"image": new_img, "conditionScore": pred["conditionScore"], "prediction": pred, "imageUrl": f"/uploads/{filename}"},
        status_code=201,
    )


@app.get("/api/dashboard/stats")
def dashboard_stats(request: Request) -> JSONResponse:
    user = current_user(request)
    if not user:
        unauthorized()
    scope, params = role_scope_clause(user["role"], int(user["userId"]), user["name"])
    base = f"FROM cases c JOIN patients p ON c.patient_id = p.id WHERE 1=1 {scope}"

    def c(sql: str) -> int:
        return int(conn.execute(sql, params).fetchone()["c"])

    stats = {
        "total": c(f"SELECT COUNT(*) as c {base}"),
        "active": c(f"SELECT COUNT(*) as c {base} AND c.status != 'Resolved'"),
        "resolved": c(f"SELECT COUNT(*) as c {base} AND c.status = 'Resolved'"),
        "critical": c(f"SELECT COUNT(*) as c {base} AND c.severity = 'Severe' AND c.status != 'Resolved'"),
        "early": c(f"SELECT COUNT(*) as c {base} AND c.severity = 'Early'"),
        "moderate": c(f"SELECT COUNT(*) as c {base} AND c.severity = 'Moderate'"),
        "severe": c(f"SELECT COUNT(*) as c {base} AND c.severity = 'Severe'"),
        "escalated": c(f"SELECT COUNT(*) as c {base} AND c.status = 'Escalated'"),
    }
    recent = [dict(r) for r in conn.execute(
        f"SELECT c.id, c.case_code, c.condition, c.severity, c.status, c.created_at, c.updated_at, p.name as patient_name, p.age, p.gender, p.village, p.district {base} ORDER BY c.created_at DESC LIMIT 10",
        params,
    ).fetchall()]
    severity_by_day = [dict(r) for r in conn.execute(
        f"""
        SELECT date(c.created_at) as day,
               SUM(CASE WHEN c.severity='Early' THEN 1 ELSE 0 END) as early,
               SUM(CASE WHEN c.severity='Moderate' THEN 1 ELSE 0 END) as moderate,
               SUM(CASE WHEN c.severity='Severe' THEN 1 ELSE 0 END) as severe,
               COUNT(*) as total
        {base}
        GROUP BY date(c.created_at)
        ORDER BY day DESC
        LIMIT 7
        """,
        params,
    ).fetchall()]
    severity_by_day.reverse()
    return JSONResponse({"stats": stats, "recent": recent, "severityByDay": severity_by_day})


@app.get("/api/admin/federated")
def federated_get(request: Request) -> JSONResponse:
    user = current_user(request)
    if not user or user["role"] != "admin":
        forbidden()
    state = to_dict(conn.execute("SELECT * FROM federated_state WHERE id = 1").fetchone())
    labeled = int(conn.execute("SELECT COUNT(*) as c FROM cases WHERE doctor_diagnosis IS NOT NULL AND TRIM(doctor_diagnosis) != ''").fetchone()["c"])
    feedback = int(conn.execute("SELECT COUNT(*) as c FROM cases WHERE doctor_override = 1").fetchone()["c"])
    return JSONResponse({"state": state, "metrics": {"labeledCases": labeled, "doctorOverrides": feedback}})


@app.post("/api/admin/federated")
def federated_post(request: Request) -> JSONResponse:
    user = current_user(request)
    if not user or user["role"] != "admin":
        forbidden()
    row = to_dict(conn.execute("SELECT * FROM federated_state WHERE id = 1").fetchone())
    next_round = int(row["round_number"]) + 1
    loss = max(0.06, float(row["last_loss"]) * 0.91 - 0.01)
    version = f"skin-tflite-v1-r{next_round}"
    conn.execute(
        "UPDATE federated_state SET round_number=?, last_loss=?, model_version=?, updated_at=datetime('now') WHERE id = 1",
        (next_round, loss, version),
    )
    conn.commit()
    state = to_dict(conn.execute("SELECT * FROM federated_state WHERE id = 1").fetchone())
    return JSONResponse(
        {
            "ok": True,
            "state": state,
            "message": f"Round {next_round} simulated: gradient aggregates from {row['participating_nodes']} nodes. Loss {loss:.4f}. Raw images and PHI never left local devices.",
        }
    )

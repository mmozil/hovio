#!/usr/bin/env python3
"""
SQLite database para tracking de evolução do violino.
Armazena sessões, notas tocadas e calcula tendências.
"""

import hashlib
import json
import sqlite3
from datetime import date, datetime, timedelta
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "practice.db"


def get_conn() -> sqlite3.Connection:
    """Conecta ao banco e cria tabelas se necessário."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    _create_tables(conn)
    return conn


def _create_tables(conn: sqlite3.Connection):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            level INTEGER DEFAULT 1,
            day INTEGER DEFAULT 1,
            bpm INTEGER DEFAULT 60,
            experience TEXT DEFAULT 'beginner',
            goals TEXT DEFAULT '[]',
            style TEXT DEFAULT 'classical',
            knows TEXT DEFAULT '[]',
            streak INTEGER DEFAULT 0,
            total_sessions INTEGER DEFAULT 0,
            onboarding_complete INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            last_login TEXT
        );

        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            date TEXT NOT NULL,
            level INTEGER NOT NULL,
            day INTEGER NOT NULL,
            duration_seconds INTEGER DEFAULT 0,
            total_notes INTEGER DEFAULT 0,
            correct_notes INTEGER DEFAULT 0,
            accuracy REAL DEFAULT 0.0,
            avg_cents_deviation REAL DEFAULT 0.0,
            sharp_tendency REAL DEFAULT 0.0,
            flat_tendency REAL DEFAULT 0.0,
            score TEXT DEFAULT 'C',
            warmup_accuracy REAL DEFAULT 0.0,
            technique_accuracy REAL DEFAULT 0.0,
            repertoire_accuracy REAL DEFAULT 0.0,
            hardest_notes TEXT DEFAULT '[]',
            best_notes TEXT DEFAULT '[]',
            recommendations TEXT DEFAULT '[]',
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS notes_played (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            timestamp_ms INTEGER NOT NULL,
            block TEXT NOT NULL,
            expected_note TEXT NOT NULL,
            detected_note TEXT,
            detected_hz REAL,
            cents_deviation REAL DEFAULT 0.0,
            is_correct INTEGER DEFAULT 0,
            quality TEXT DEFAULT 'miss',
            FOREIGN KEY (session_id) REFERENCES sessions(id)
        );

        CREATE TABLE IF NOT EXISTS weekly_trends (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            week_start TEXT NOT NULL,
            week_end TEXT NOT NULL,
            sessions_count INTEGER DEFAULT 0,
            avg_accuracy REAL DEFAULT 0.0,
            avg_cents REAL DEFAULT 0.0,
            total_notes INTEGER DEFAULT 0,
            level INTEGER DEFAULT 1,
            streak INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS chat_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date);
        CREATE INDEX IF NOT EXISTS idx_notes_session ON notes_played(session_id);
        CREATE INDEX IF NOT EXISTS idx_trends_week ON weekly_trends(week_start);
        CREATE INDEX IF NOT EXISTS idx_chat_created ON chat_history(created_at);
    """)

    # Adicionar user_id nas tabelas existentes (migração segura)
    for table, col in [("sessions", "user_id"), ("chat_history", "user_id")]:
        try:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} INTEGER")
        except sqlite3.OperationalError:
            pass  # Coluna já existe

    conn.commit()


# ─────────────── SESSION CRUD ───────────────

def save_session(session_data: dict) -> int:
    """Salva uma sessão completa. Retorna session_id."""
    conn = get_conn()

    notes = session_data.get("notes", [])
    total = len(notes)
    correct = sum(1 for n in notes if n.get("is_correct"))
    accuracy = (correct / total * 100) if total > 0 else 0

    # Calcular tendências sharp/flat
    deviations = [n.get("cents_deviation", 0) for n in notes if n.get("detected_note")]
    avg_cents = sum(deviations) / len(deviations) if deviations else 0
    sharp_count = sum(1 for d in deviations if d > 5)
    flat_count = sum(1 for d in deviations if d < -5)
    sharp_pct = (sharp_count / len(deviations) * 100) if deviations else 0
    flat_pct = (flat_count / len(deviations) * 100) if deviations else 0

    # Acurácia por bloco
    blocks = {"warmup": [], "technique": [], "repertoire": []}
    for n in notes:
        block = n.get("block", "warmup")
        if block in blocks:
            blocks[block].append(1 if n.get("is_correct") else 0)
    warmup_acc = (sum(blocks["warmup"]) / len(blocks["warmup"]) * 100) if blocks["warmup"] else 0
    tech_acc = (sum(blocks["technique"]) / len(blocks["technique"]) * 100) if blocks["technique"] else 0
    rep_acc = (sum(blocks["repertoire"]) / len(blocks["repertoire"]) * 100) if blocks["repertoire"] else 0

    # Notas mais difíceis e melhores
    note_stats = {}
    for n in notes:
        exp = n.get("expected_note", "?")
        if exp not in note_stats:
            note_stats[exp] = {"total": 0, "correct": 0, "cents": []}
        note_stats[exp]["total"] += 1
        if n.get("is_correct"):
            note_stats[exp]["correct"] += 1
        if n.get("cents_deviation") is not None:
            note_stats[exp]["cents"].append(n["cents_deviation"])

    hardest = sorted(
        [(k, v["correct"] / v["total"] * 100 if v["total"] > 0 else 0) for k, v in note_stats.items()],
        key=lambda x: x[1]
    )[:3]
    best = sorted(
        [(k, v["correct"] / v["total"] * 100 if v["total"] > 0 else 0) for k, v in note_stats.items()],
        key=lambda x: x[1], reverse=True
    )[:3]

    # Score
    if accuracy >= 90:
        score = "A"
    elif accuracy >= 75:
        score = "B"
    elif accuracy >= 60:
        score = "C"
    elif accuracy >= 40:
        score = "D"
    else:
        score = "F"

    # Recomendações
    recommendations = _generate_recommendations(note_stats, avg_cents, sharp_pct, flat_pct, accuracy)

    # Inserir sessão
    cur = conn.execute("""
        INSERT INTO sessions (date, level, day, duration_seconds, total_notes, correct_notes,
            accuracy, avg_cents_deviation, sharp_tendency, flat_tendency, score,
            warmup_accuracy, technique_accuracy, repertoire_accuracy,
            hardest_notes, best_notes, recommendations)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        date.today().isoformat(),
        session_data.get("level", 1),
        session_data.get("day", 1),
        session_data.get("duration_seconds", 0),
        total, correct, round(accuracy, 1),
        round(avg_cents, 1), round(sharp_pct, 1), round(flat_pct, 1),
        score, round(warmup_acc, 1), round(tech_acc, 1), round(rep_acc, 1),
        json.dumps(hardest), json.dumps(best), json.dumps(recommendations, ensure_ascii=False),
    ))
    session_id = cur.lastrowid

    # Inserir notas individuais
    for n in notes:
        conn.execute("""
            INSERT INTO notes_played (session_id, timestamp_ms, block, expected_note,
                detected_note, detected_hz, cents_deviation, is_correct, quality)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            session_id, n.get("timestamp_ms", 0), n.get("block", "warmup"),
            n.get("expected_note", "?"), n.get("detected_note"),
            n.get("detected_hz"), n.get("cents_deviation", 0),
            1 if n.get("is_correct") else 0, n.get("quality", "miss"),
        ))

    conn.commit()

    # Atualizar tendência semanal
    _update_weekly_trend(conn, session_data.get("level", 1))
    conn.close()

    return session_id


def _generate_recommendations(note_stats: dict, avg_cents: float, sharp_pct: float, flat_pct: float, accuracy: float) -> list:
    """Gera recomendações baseadas nos dados da sessão."""
    recs = []

    # Tendência sharp/flat
    if avg_cents > 10:
        recs.append("Sua afinação tende a sustenido (+{:.0f} cents). Tente posicionar os dedos um pouco mais para trás.".format(avg_cents))
    elif avg_cents < -10:
        recs.append("Sua afinação tende a bemol ({:.0f} cents). Tente pressionar a corda um pouco mais à frente.".format(avg_cents))

    # Notas problemáticas
    for note_name, stats in note_stats.items():
        if stats["total"] >= 3:
            acc = stats["correct"] / stats["total"] * 100
            if acc < 50:
                avg_c = sum(stats["cents"]) / len(stats["cents"]) if stats["cents"] else 0
                direction = "sustenido" if avg_c > 0 else "bemol"
                recs.append(f"A nota {note_name} precisa de atenção ({acc:.0f}% acerto, tendência {direction}). Pratique isoladamente.")

    # Acurácia geral
    if accuracy >= 90:
        recs.append("Excelente sessão! Considere aumentar o BPM ou avançar para o próximo exercício.")
    elif accuracy >= 70:
        recs.append("Boa sessão! Repita o exercício mais uma vez antes de avançar.")
    elif accuracy < 50:
        recs.append("Reduza o BPM e pratique nota por nota. Velocidade vem depois da precisão.")

    # Sharp/flat
    if sharp_pct > 60:
        recs.append("Mais de 60% das notas estão sustenidas. Verifique se o violino está afinado e relaxe a mão esquerda.")
    elif flat_pct > 60:
        recs.append("Mais de 60% das notas estão bemóis. Verifique se os dedos estão pressionando a corda com firmeza.")

    return recs[:5]  # Max 5 recomendações


# ─────────────── TRENDS ───────────────

def _update_weekly_trend(conn: sqlite3.Connection, level: int):
    """Atualiza tendência semanal."""
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)

    rows = conn.execute("""
        SELECT COUNT(*) as cnt, AVG(accuracy) as avg_acc, AVG(avg_cents_deviation) as avg_c,
               SUM(total_notes) as total_n
        FROM sessions
        WHERE date >= ? AND date <= ?
    """, (week_start.isoformat(), week_end.isoformat())).fetchone()

    # Calcular streak
    streak = _calculate_streak(conn)

    # Upsert
    existing = conn.execute(
        "SELECT id FROM weekly_trends WHERE week_start = ?", (week_start.isoformat(),)
    ).fetchone()

    if existing:
        conn.execute("""
            UPDATE weekly_trends SET sessions_count=?, avg_accuracy=?, avg_cents=?,
                total_notes=?, level=?, streak=?
            WHERE id=?
        """, (rows["cnt"], round(rows["avg_acc"] or 0, 1), round(rows["avg_c"] or 0, 1),
              rows["total_n"] or 0, level, streak, existing["id"]))
    else:
        conn.execute("""
            INSERT INTO weekly_trends (week_start, week_end, sessions_count, avg_accuracy,
                avg_cents, total_notes, level, streak)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (week_start.isoformat(), week_end.isoformat(), rows["cnt"],
              round(rows["avg_acc"] or 0, 1), round(rows["avg_c"] or 0, 1),
              rows["total_n"] or 0, level, streak))
    conn.commit()


def _calculate_streak(conn: sqlite3.Connection) -> int:
    """Calcula streak de dias consecutivos."""
    rows = conn.execute(
        "SELECT DISTINCT date FROM sessions ORDER BY date DESC"
    ).fetchall()
    if not rows:
        return 0

    streak = 1
    prev = date.fromisoformat(rows[0]["date"])
    for row in rows[1:]:
        curr = date.fromisoformat(row["date"])
        if (prev - curr).days == 1:
            streak += 1
            prev = curr
        else:
            break
    return streak


# ─────────────── QUERIES ───────────────

def get_session_feedback(session_id: int) -> dict:
    """Retorna feedback completo de uma sessão."""
    conn = get_conn()
    session = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
    if not session:
        return {}

    notes = conn.execute(
        "SELECT * FROM notes_played WHERE session_id = ? ORDER BY timestamp_ms", (session_id,)
    ).fetchall()

    # Últimas 5 sessões para comparação
    recent = conn.execute(
        "SELECT date, accuracy, score FROM sessions ORDER BY id DESC LIMIT 5"
    ).fetchall()

    conn.close()
    return {
        "session": dict(session),
        "notes": [dict(n) for n in notes],
        "recent_sessions": [dict(r) for r in recent],
        "hardest_notes": json.loads(session["hardest_notes"]),
        "best_notes": json.loads(session["best_notes"]),
        "recommendations": json.loads(session["recommendations"]),
    }


def get_evolution(weeks: int = 12) -> list:
    """Retorna dados de evolução para gráfico."""
    conn = get_conn()
    rows = conn.execute("""
        SELECT * FROM weekly_trends
        ORDER BY week_start DESC LIMIT ?
    """, (weeks,)).fetchall()
    conn.close()
    return [dict(r) for r in reversed(rows)]


def get_note_analysis(note_name: str = None, last_n_sessions: int = 10) -> dict:
    """Análise detalhada de uma nota específica ou todas."""
    conn = get_conn()

    session_ids = conn.execute(
        "SELECT id FROM sessions ORDER BY id DESC LIMIT ?", (last_n_sessions,)
    ).fetchall()
    ids = [r["id"] for r in session_ids]
    if not ids:
        conn.close()
        return {}

    placeholders = ",".join("?" * len(ids))

    if note_name:
        rows = conn.execute(f"""
            SELECT expected_note, detected_note, cents_deviation, is_correct, quality
            FROM notes_played
            WHERE session_id IN ({placeholders}) AND expected_note = ?
        """, ids + [note_name]).fetchall()
    else:
        rows = conn.execute(f"""
            SELECT expected_note, cents_deviation, is_correct
            FROM notes_played
            WHERE session_id IN ({placeholders})
        """, ids).fetchall()

    conn.close()

    # Agrupar por nota
    stats = {}
    for r in rows:
        note = r["expected_note"]
        if note not in stats:
            stats[note] = {"total": 0, "correct": 0, "cents": [], "name": note}
        stats[note]["total"] += 1
        if r["is_correct"]:
            stats[note]["correct"] += 1
        if r["cents_deviation"] is not None:
            stats[note]["cents"].append(r["cents_deviation"])

    # Calcular métricas
    for note, s in stats.items():
        s["accuracy"] = round(s["correct"] / s["total"] * 100, 1) if s["total"] > 0 else 0
        s["avg_cents"] = round(sum(s["cents"]) / len(s["cents"]), 1) if s["cents"] else 0
        s["tendency"] = "sharp" if s["avg_cents"] > 5 else ("flat" if s["avg_cents"] < -5 else "ok")
        del s["cents"]  # Remover dados brutos

    return stats


def get_stats_summary() -> dict:
    """Resumo geral para exibição."""
    conn = get_conn()
    total = conn.execute("SELECT COUNT(*) as c FROM sessions").fetchone()["c"]
    if total == 0:
        conn.close()
        return {"total_sessions": 0, "streak": 0, "avg_accuracy": 0, "best_score": "—"}

    stats = conn.execute("""
        SELECT AVG(accuracy) as avg_acc, MAX(accuracy) as best_acc,
               MIN(accuracy) as worst_acc, SUM(total_notes) as total_notes,
               SUM(correct_notes) as total_correct
        FROM sessions
    """).fetchone()

    best_score = conn.execute(
        "SELECT score FROM sessions ORDER BY accuracy DESC LIMIT 1"
    ).fetchone()

    streak = _calculate_streak(conn)
    conn.close()

    return {
        "total_sessions": total,
        "streak": streak,
        "avg_accuracy": round(stats["avg_acc"], 1),
        "best_accuracy": round(stats["best_acc"], 1),
        "total_notes_played": stats["total_notes"],
        "total_correct": stats["total_correct"],
        "best_score": best_score["score"] if best_score else "—",
    }


# ─────────────── CHAT HISTORY ───────────────

def save_chat_message(role: str, content: str):
    """Salva uma mensagem do chat."""
    conn = get_conn()
    conn.execute("INSERT INTO chat_history (role, content) VALUES (?, ?)", (role, content))
    conn.commit()
    conn.close()


def get_chat_history(limit: int = 50) -> list:
    """Retorna últimas N mensagens do chat."""
    conn = get_conn()
    rows = conn.execute(
        "SELECT role, content, created_at FROM chat_history ORDER BY id DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return [{"role": r["role"], "content": r["content"], "created_at": r["created_at"]} for r in reversed(rows)]


def clear_chat_history():
    """Limpa histórico do chat."""
    conn = get_conn()
    conn.execute("DELETE FROM chat_history")
    conn.commit()
    conn.close()


# ─────────────── USER AUTH ───────────────

def _hash_password(password: str) -> str:
    """Hash password com SHA-256 + salt fixo."""
    salted = f"tier_violino_{password}_salt_2026"
    return hashlib.sha256(salted.encode()).hexdigest()


def create_user(name: str, email: str, password: str) -> int:
    """Cria novo usuário. Retorna user_id ou levanta exceção se email duplicado."""
    conn = get_conn()
    password_hash = _hash_password(password)
    try:
        cur = conn.execute(
            "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
            (name, email.lower().strip(), password_hash)
        )
        conn.commit()
        user_id = cur.lastrowid
        conn.close()
        return user_id
    except sqlite3.IntegrityError:
        conn.close()
        raise ValueError("Email já cadastrado")


def login_user(email: str, password: str) -> dict | None:
    """Verifica credenciais. Retorna dict do user ou None."""
    conn = get_conn()
    password_hash = _hash_password(password)
    row = conn.execute(
        "SELECT * FROM users WHERE email = ? AND password_hash = ?",
        (email.lower().strip(), password_hash)
    ).fetchone()
    if not row:
        conn.close()
        return None
    # Atualizar last_login
    conn.execute(
        "UPDATE users SET last_login = datetime('now') WHERE id = ?", (row["id"],)
    )
    conn.commit()
    user = dict(row)
    conn.close()
    # Parsear campos JSON
    for field in ("goals", "knows"):
        if isinstance(user.get(field), str):
            try:
                user[field] = json.loads(user[field])
            except (json.JSONDecodeError, TypeError):
                user[field] = []
    return user


def get_user(user_id: int) -> dict | None:
    """Retorna dict do usuário ou None."""
    conn = get_conn()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    if not row:
        return None
    user = dict(row)
    for field in ("goals", "knows"):
        if isinstance(user.get(field), str):
            try:
                user[field] = json.loads(user[field])
            except (json.JSONDecodeError, TypeError):
                user[field] = []
    return user


def update_user_profile(user_id: int, data: dict) -> bool:
    """Atualiza perfil do usuário com dados do onboarding."""
    conn = get_conn()
    allowed = {"level", "day", "bpm", "experience", "goals", "style", "knows", "name"}
    updates = []
    values = []
    for key, val in data.items():
        if key in allowed:
            if key in ("goals", "knows") and isinstance(val, list):
                val = json.dumps(val, ensure_ascii=False)
            updates.append(f"{key} = ?")
            values.append(val)
    if not updates:
        conn.close()
        return False
    values.append(user_id)
    conn.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", values)
    conn.commit()
    conn.close()
    return True


def complete_onboarding(user_id: int) -> bool:
    """Marca onboarding como completo."""
    conn = get_conn()
    conn.execute("UPDATE users SET onboarding_complete = 1 WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()
    return True


if __name__ == "__main__":
    # Teste rápido
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "stats":
        print(json.dumps(get_stats_summary(), indent=2, ensure_ascii=False))
    elif len(sys.argv) > 1 and sys.argv[1] == "evolution":
        print(json.dumps(get_evolution(), indent=2, ensure_ascii=False))
    elif len(sys.argv) > 1 and sys.argv[1] == "notes":
        print(json.dumps(get_note_analysis(), indent=2, ensure_ascii=False))
    else:
        print("Uso: python db.py [stats|evolution|notes]")
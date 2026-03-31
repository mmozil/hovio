#!/usr/bin/env python3
"""
Sistema de memória do professor de violino.
Reconstrói um perfil completo do aluno a partir do SQLite.
Injeta como contexto no system prompt do Gemini.
"""

import json
from datetime import date, timedelta
from pathlib import Path

from db import get_conn, get_stats_summary, get_note_analysis, get_evolution, get_chat_history

MEMORY_PATH = Path(__file__).parent.parent / "data" / "student_memory.json"
PROGRESS_PATH = Path(__file__).parent.parent / "data" / "progress.json"


def build_student_memory() -> dict:
    """Constrói perfil completo do aluno a partir de todos os dados disponíveis."""
    memory = {
        "profile": _build_profile(),
        "skill_assessment": _build_skill_assessment(),
        "note_mastery": _build_note_mastery(),
        "tendencies": _build_tendencies(),
        "practice_patterns": _build_practice_patterns(),
        "frequent_questions": _build_frequent_questions(),
        "evolution": _build_evolution_summary(),
        "last_sessions": _build_last_sessions(5),
        "recommendations_history": _build_recommendations_history(),
    }

    # Salvar para referência
    MEMORY_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(MEMORY_PATH, "w", encoding="utf-8") as f:
        json.dump(memory, f, indent=2, ensure_ascii=False)

    return memory


def _build_profile() -> dict:
    """Dados básicos do aluno."""
    progress = {}
    if PROGRESS_PATH.exists():
        with open(PROGRESS_PATH, "r", encoding="utf-8") as f:
            progress = json.load(f)

    student = progress.get("student", {})
    stats = get_stats_summary()

    return {
        "name": student.get("name", "Aluno"),
        "started": student.get("started", date.today().isoformat()),
        "level": student.get("level", 1),
        "day": student.get("day", 1),
        "bpm": student.get("bpm", 60),
        "total_sessions": stats.get("total_sessions", 0),
        "streak": stats.get("streak", 0),
        "avg_accuracy": stats.get("avg_accuracy", 0),
        "best_accuracy": stats.get("best_accuracy", 0),
        "total_notes_played": stats.get("total_notes_played", 0),
        "achievements": progress.get("achievements", []),
        "days_since_start": (date.today() - date.fromisoformat(student.get("started", date.today().isoformat()))).days,
    }


def _build_skill_assessment() -> dict:
    """Avaliação das 4 dimensões ao longo do tempo."""
    conn = get_conn()
    rows = conn.execute("""
        SELECT AVG(accuracy) as avg_som,
               AVG(avg_cents_deviation) as avg_cents,
               AVG(warmup_accuracy) as avg_warmup,
               AVG(technique_accuracy) as avg_technique,
               AVG(repertoire_accuracy) as avg_repertoire
        FROM sessions
        ORDER BY id DESC LIMIT 10
    """).fetchone()
    conn.close()

    if not rows or rows["avg_som"] is None:
        return {"postura": "sem dados", "som": 0, "afinacao": 0, "musicalidade": "sem dados"}

    avg_cents = abs(rows["avg_cents"] or 0)
    if avg_cents < 10:
        afinacao_score = 95
    elif avg_cents < 20:
        afinacao_score = 75
    elif avg_cents < 30:
        afinacao_score = 55
    else:
        afinacao_score = 35

    return {
        "som": round(rows["avg_som"] or 0, 1),
        "afinacao": afinacao_score,
        "aquecimento_medio": round(rows["avg_warmup"] or 0, 1),
        "tecnica_media": round(rows["avg_technique"] or 0, 1),
        "repertorio_medio": round(rows["avg_repertoire"] or 0, 1),
    }


def _build_note_mastery() -> dict:
    """Quais notas domina e quais precisa melhorar."""
    analysis = get_note_analysis(last_n_sessions=10)
    if not analysis:
        return {"strong": [], "weak": [], "improving": []}

    sorted_notes = sorted(analysis.items(), key=lambda x: x[1]["accuracy"])

    weak = [{"note": k, "accuracy": v["accuracy"], "tendency": v["tendency"], "avg_cents": v["avg_cents"]}
            for k, v in sorted_notes if v["accuracy"] < 60 and v["total"] >= 5][:5]

    strong = [{"note": k, "accuracy": v["accuracy"]}
              for k, v in reversed(sorted_notes) if v["accuracy"] >= 80 and v["total"] >= 5][:5]

    # Detectar notas melhorando (comparar últimas 5 vs anteriores 5)
    improving = []
    conn = get_conn()
    recent_ids = [r["id"] for r in conn.execute("SELECT id FROM sessions ORDER BY id DESC LIMIT 5").fetchall()]
    older_ids = [r["id"] for r in conn.execute("SELECT id FROM sessions ORDER BY id DESC LIMIT 5 OFFSET 5").fetchall()]

    if recent_ids and older_ids:
        for note_name in analysis:
            r_ph = ",".join("?" * len(recent_ids))
            o_ph = ",".join("?" * len(older_ids))

            recent_acc = conn.execute(f"""
                SELECT AVG(is_correct) * 100 as acc FROM notes_played
                WHERE session_id IN ({r_ph}) AND expected_note = ?
            """, recent_ids + [note_name]).fetchone()

            older_acc = conn.execute(f"""
                SELECT AVG(is_correct) * 100 as acc FROM notes_played
                WHERE session_id IN ({o_ph}) AND expected_note = ?
            """, older_ids + [note_name]).fetchone()

            if recent_acc["acc"] is not None and older_acc["acc"] is not None:
                delta = (recent_acc["acc"] or 0) - (older_acc["acc"] or 0)
                if delta > 15:
                    improving.append({"note": note_name, "improvement": round(delta, 1)})

    conn.close()

    return {"strong": strong, "weak": weak, "improving": improving}


def _build_tendencies() -> dict:
    """Tendências de afinação e padrões."""
    conn = get_conn()
    rows = conn.execute("""
        SELECT AVG(sharp_tendency) as sharp, AVG(flat_tendency) as flat,
               AVG(avg_cents_deviation) as avg_cents
        FROM sessions ORDER BY id DESC LIMIT 10
    """).fetchone()
    conn.close()

    if not rows or rows["sharp"] is None:
        return {}

    tendency = "neutro"
    if (rows["avg_cents"] or 0) > 8:
        tendency = "consistentemente sustenido"
    elif (rows["avg_cents"] or 0) < -8:
        tendency = "consistentemente bemol"

    return {
        "overall_tendency": tendency,
        "avg_cents_deviation": round(rows["avg_cents"] or 0, 1),
        "sharp_percentage": round(rows["sharp"] or 0, 1),
        "flat_percentage": round(rows["flat"] or 0, 1),
    }


def _build_practice_patterns() -> dict:
    """Padrões de prática: horários, frequência, consistência."""
    conn = get_conn()
    rows = conn.execute("SELECT date, duration_seconds FROM sessions ORDER BY id DESC LIMIT 30").fetchall()
    conn.close()

    if not rows:
        return {}

    dates = [r["date"] for r in rows]
    total_days = len(set(dates))
    avg_duration = sum(r["duration_seconds"] or 0 for r in rows) / len(rows) if rows else 0

    # Dias da semana mais praticados
    from datetime import datetime
    weekdays = {}
    for d in dates:
        wd = datetime.fromisoformat(d).strftime("%A")
        weekdays[wd] = weekdays.get(wd, 0) + 1

    return {
        "sessions_last_30_days": total_days,
        "avg_duration_minutes": round(avg_duration / 60, 1),
        "most_active_days": sorted(weekdays.items(), key=lambda x: x[1], reverse=True)[:3],
        "consistency": "alta" if total_days >= 20 else ("media" if total_days >= 10 else "baixa"),
    }


def _build_frequent_questions() -> dict:
    """Temas mais perguntados no chat."""
    history = get_chat_history(100)
    if not history:
        return {"topics": [], "count": 0}

    user_messages = [m["content"] for m in history if m["role"] == "user"]
    if not user_messages:
        return {"topics": [], "count": 0}

    # Categorizar por tema
    categories = {
        "afinacao": 0, "arco": 0, "mao_esquerda": 0, "postura": 0,
        "metronomo": 0, "escala": 0, "motivacao": 0, "teoria": 0, "outro": 0,
    }

    import unicodedata
    for msg in user_messages:
        t = unicodedata.normalize("NFD", msg.lower())
        t = "".join(c for c in t if not unicodedata.combining(c))
        if any(w in t for w in ["afinac", "afinado", "desafinado"]):
            categories["afinacao"] += 1
        elif any(w in t for w in ["arco", "braco", "mao direita"]):
            categories["arco"] += 1
        elif any(w in t for w in ["dedo", "mao esquerda", "posic"]):
            categories["mao_esquerda"] += 1
        elif any(w in t for w in ["postura", "segurar"]):
            categories["postura"] += 1
        elif any(w in t for w in ["metronom", "bpm", "ritmo"]):
            categories["metronomo"] += 1
        elif any(w in t for w in ["escala", "scale"]):
            categories["escala"] += 1
        elif any(w in t for w in ["dificil", "nao consigo", "frustrad"]):
            categories["motivacao"] += 1
        else:
            categories["outro"] += 1

    top_topics = sorted(
        [(k, v) for k, v in categories.items() if v > 0],
        key=lambda x: x[1], reverse=True
    )[:5]

    return {"topics": top_topics, "total_messages": len(user_messages)}


def _build_evolution_summary() -> dict:
    """Resumo da evolução nas últimas semanas."""
    evolution = get_evolution(8)
    if not evolution:
        return {}

    return {
        "weeks": [
            {
                "week": e["week_start"],
                "accuracy": e["avg_accuracy"],
                "sessions": e["sessions_count"],
                "notes": e["total_notes"],
            }
            for e in evolution
        ],
        "trend": _calculate_trend(evolution),
    }


def _calculate_trend(evolution: list) -> str:
    if len(evolution) < 2:
        return "sem dados suficientes"
    recent = evolution[-2:]
    older = evolution[:2]
    recent_avg = sum(e["avg_accuracy"] for e in recent) / len(recent)
    older_avg = sum(e["avg_accuracy"] for e in older) / len(older)
    delta = recent_avg - older_avg
    if delta > 5:
        return "melhorando consistentemente"
    elif delta < -5:
        return "precisa de atenção — acurácia caindo"
    else:
        return "estável — manter ritmo"


def _build_last_sessions(n: int = 5) -> list:
    """Últimas N sessões com detalhes."""
    conn = get_conn()
    rows = conn.execute("""
        SELECT date, level, day, accuracy, score, avg_cents_deviation,
               warmup_accuracy, technique_accuracy, repertoire_accuracy,
               hardest_notes, recommendations
        FROM sessions ORDER BY id DESC LIMIT ?
    """, (n,)).fetchall()
    conn.close()

    return [
        {
            "date": r["date"],
            "level": r["level"],
            "day": r["day"],
            "accuracy": r["accuracy"],
            "score": r["score"],
            "avg_cents": r["avg_cents_deviation"],
            "hardest": json.loads(r["hardest_notes"]) if r["hardest_notes"] else [],
            "recommendations": json.loads(r["recommendations"]) if r["recommendations"] else [],
        }
        for r in rows
    ]


def _build_recommendations_history() -> list:
    """Recomendações recentes (para não repetir)."""
    conn = get_conn()
    rows = conn.execute(
        "SELECT recommendations FROM sessions WHERE recommendations != '[]' ORDER BY id DESC LIMIT 5"
    ).fetchall()
    conn.close()

    all_recs = []
    for r in rows:
        recs = json.loads(r["recommendations"]) if r["recommendations"] else []
        all_recs.extend(recs)

    # Deduplica mantendo ordem
    seen = set()
    unique = []
    for rec in all_recs:
        if rec not in seen:
            seen.add(rec)
            unique.append(rec)

    return unique[:10]


def memory_to_prompt(memory: dict) -> str:
    """Converte memória em texto para o system prompt do Gemini."""
    p = memory.get("profile", {})
    s = memory.get("skill_assessment", {})
    n = memory.get("note_mastery", {})
    t = memory.get("tendencies", {})
    pp = memory.get("practice_patterns", {})
    q = memory.get("frequent_questions", {})
    e = memory.get("evolution", {})
    ls = memory.get("last_sessions", [])

    lines = [
        "=== MEMORIA DO PROFESSOR SOBRE O ALUNO ===",
        "",
        f"PERFIL: {p.get('name', 'Aluno')}, praticando ha {p.get('days_since_start', 0)} dias.",
        f"Nivel {p.get('level', 1)}, dia {p.get('day', 1)}. BPM atual: {p.get('bpm', 60)}.",
        f"Total: {p.get('total_sessions', 0)} sessoes, streak: {p.get('streak', 0)} dias.",
        f"Acuracia media: {p.get('avg_accuracy', 0)}%, melhor: {p.get('best_accuracy', 0)}%.",
        f"Notas tocadas ao longo de toda a jornada: {p.get('total_notes_played', 0)}.",
    ]

    if p.get("achievements"):
        lines.append(f"Conquistas: {', '.join(p['achievements'])}")

    if s:
        lines.append("")
        lines.append("AVALIACAO ATUAL:")
        lines.append(f"  Som (notas certas): {s.get('som', 0)}%")
        lines.append(f"  Afinacao: {s.get('afinacao', 0)}%")
        lines.append(f"  Aquecimento: {s.get('aquecimento_medio', 0)}% | Tecnica: {s.get('tecnica_media', 0)}% | Repertorio: {s.get('repertorio_medio', 0)}%")

    if n.get("strong"):
        lines.append("")
        lines.append("NOTAS QUE DOMINA: " + ", ".join(f"{x['note']} ({x['accuracy']}%)" for x in n["strong"]))

    if n.get("weak"):
        lines.append("NOTAS COM DIFICULDADE: " + ", ".join(
            f"{x['note']} ({x['accuracy']}%, tendencia {x['tendency']}, {x['avg_cents']:+.0f}c)"
            for x in n["weak"]
        ))

    if n.get("improving"):
        lines.append("NOTAS MELHORANDO: " + ", ".join(f"{x['note']} (+{x['improvement']}%)" for x in n["improving"]))

    if t:
        lines.append("")
        lines.append(f"TENDENCIA DE AFINACAO: {t.get('overall_tendency', 'neutro')} (media {t.get('avg_cents_deviation', 0):+.1f} cents)")
        lines.append(f"  {t.get('sharp_percentage', 0):.0f}% sustenido | {t.get('flat_percentage', 0):.0f}% bemol")

    if pp:
        lines.append("")
        lines.append(f"PADRAO DE PRATICA: {pp.get('sessions_last_30_days', 0)} sessoes nos ultimos 30 dias, consistencia {pp.get('consistency', '?')}")
        lines.append(f"  Duracao media: {pp.get('avg_duration_minutes', 0)} min")

    if q.get("topics"):
        lines.append("")
        lines.append("TEMAS MAIS PERGUNTADOS: " + ", ".join(f"{k} ({v}x)" for k, v in q["topics"]))

    if e.get("trend"):
        lines.append("")
        lines.append(f"TENDENCIA DE EVOLUCAO: {e['trend']}")

    if ls:
        lines.append("")
        lines.append("ULTIMAS SESSOES:")
        for session in ls[:3]:
            lines.append(f"  {session['date']}: Score {session['score']}, {session['accuracy']}%, cents {session.get('avg_cents', 0):+.1f}")
            if session.get("hardest"):
                hardest_str = ", ".join(f"{h[0]}({h[1]:.0f}%)" for h in session["hardest"][:3]) if session["hardest"] else ""
                if hardest_str:
                    lines.append(f"    Mais dificeis: {hardest_str}")

    recs = memory.get("recommendations_history", [])
    if recs:
        lines.append("")
        lines.append("RECOMENDACOES JA DADAS (nao repetir, variar abordagem):")
        for r in recs[:5]:
            lines.append(f"  - {r[:80]}")

    lines.append("")
    lines.append("=== FIM DA MEMORIA ===")

    return "\n".join(lines)


if __name__ == "__main__":
    memory = build_student_memory()
    print(memory_to_prompt(memory))
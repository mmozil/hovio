#!/usr/bin/env python3
"""
Gera o dashboard de prática de violino e abre no browser.
Lê o progresso do aluno e o currículo, injeta no template HTML.

Uso:
  python dashboard.py                    # Exercício do dia (auto)
  python dashboard.py --level 1 --day 3  # Exercício específico
  python dashboard.py --bpm 80           # BPM customizado
"""

import argparse
import json
import os
import sys
import tempfile
import webbrowser
from datetime import date, datetime
from pathlib import Path

SKILL_DIR = Path(__file__).parent.parent
DATA_DIR = SKILL_DIR / "data"
REFS_DIR = SKILL_DIR / "references"
TEMPLATE_PATH = Path(__file__).parent / "template.html"
PROGRESS_PATH = DATA_DIR / "progress.json"
CURRICULUM_PATH = REFS_DIR / "curriculum.json"


def load_progress() -> dict:
    """Carrega ou cria progresso do aluno."""
    if PROGRESS_PATH.exists():
        with open(PROGRESS_PATH, "r", encoding="utf-8") as f:
            return json.load(f)

    # Primeiro uso — criar progresso inicial
    progress = {
        "student": {
            "name": "Aluno",
            "started": date.today().isoformat(),
            "level": 1,
            "day": 1,
            "bpm": 60,
            "minutes_per_day": 20,
        },
        "history": [],
        "streak": 0,
        "total_days": 0,
        "achievements": [],
    }
    save_progress(progress)
    return progress


def save_progress(progress: dict):
    """Salva progresso."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(PROGRESS_PATH, "w", encoding="utf-8") as f:
        json.dump(progress, f, indent=2, ensure_ascii=False)


def load_curriculum() -> dict:
    """Carrega currículo."""
    with open(CURRICULUM_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def get_exercise(curriculum: dict, level: int, day: int) -> tuple[dict, dict]:
    """Busca exercício por nível e dia. Retorna (level_info, day_info)."""
    for lvl in curriculum["levels"]:
        if lvl["id"] == level:
            days = lvl["days"]
            # Ciclar se dia > total de dias do nível
            day_idx = (day - 1) % len(days)
            return lvl, days[day_idx]

    # Fallback para nível 1 dia 1
    lvl = curriculum["levels"][0]
    return lvl, lvl["days"][0]


def generate_dashboard(progress: dict, curriculum: dict, level: int = None, day: int = None, bpm: int = None) -> str:
    """Gera HTML do dashboard."""
    lvl_num = level or progress["student"]["level"]
    day_num = day or progress["student"]["day"]
    bpm_val = bpm or progress["student"].get("bpm", 60)

    level_info, exercise = get_exercise(curriculum, lvl_num, day_num)

    # Ler template
    with open(TEMPLATE_PATH, "r", encoding="utf-8") as f:
        html = f.read()

    # Calcular progresso do nível
    total_days_in_level = len(level_info["days"])
    level_progress = min(100, int(((day_num - 1) / max(total_days_in_level, 1)) * 100))

    # Substituir placeholders
    replacements = {
        "{{TITLE}}": exercise["title"],
        "{{LEVEL_NAME}}": f"Nível {level_info['id']} — {level_info['name']}",
        "{{DAY}}": str(day_num),
        "{{BPM}}": str(bpm_val),
        "{{WARMUP_ABC}}": exercise["warmup"]["abc"],
        "{{WARMUP_DESC}}": exercise["warmup"]["desc"],
        "{{WARMUP_NOTES}}": json.dumps(exercise["warmup"]["notes"]),
        "{{TECHNIQUE_ABC}}": exercise["technique"]["abc"],
        "{{TECHNIQUE_DESC}}": exercise["technique"]["desc"],
        "{{TECHNIQUE_NOTES}}": json.dumps(exercise["technique"]["notes"]),
        "{{REPERTOIRE_ABC}}": exercise["repertoire"]["abc"],
        "{{REPERTOIRE_DESC}}": exercise["repertoire"]["desc"],
        "{{REPERTOIRE_NOTES}}": json.dumps(exercise["repertoire"]["notes"]),
        "{{TIPS}}": json.dumps(exercise.get("tips", []), ensure_ascii=False),
        "{{STREAK}}": str(progress.get("streak", 0)),
        "{{TOTAL_DAYS}}": str(progress.get("total_days", 0)),
        "{{LEVEL_PROGRESS}}": str(level_progress),
        "{{LEVEL}}": str(lvl_num),
        "{{RECENT_SESSIONS}}": json.dumps(_get_recent_sessions(), ensure_ascii=False),
        "{{USER_INITIAL}}": progress.get("student", {}).get("name", "A")[0].upper(),
    }

    for key, value in replacements.items():
        html = html.replace(key, value)

    return html


def _get_recent_sessions() -> list:
    """Busca últimas sessões do SQLite para o gráfico de evolução."""
    try:
        from db import get_conn
        conn = get_conn()
        rows = conn.execute(
            "SELECT date, accuracy, score FROM sessions ORDER BY id DESC LIMIT 10"
        ).fetchall()
        conn.close()
        return [{"date": r["date"], "accuracy": r["accuracy"], "score": r["score"]} for r in reversed(rows)]
    except Exception:
        return []


def import_session(json_path: str, progress: dict):
    """Importa JSON exportado pelo dashboard para o SQLite e atualiza progresso."""
    from db import save_session, get_session_feedback

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    session_id = save_session(data)
    feedback = get_session_feedback(session_id)

    # Atualizar progress.json
    lvl = data.get("level", progress["student"]["level"])
    day = data.get("day", progress["student"]["day"])
    progress = mark_completed(progress, lvl, day)

    # Mostrar feedback resumido
    s = feedback["session"]
    print(f"\n{'='*50}")
    print(f"  FEEDBACK DA SESSÃO — {s['date']}")
    print(f"{'='*50}")
    print(f"  Score: {s['score']}  |  Acurácia: {s['accuracy']}%")
    print(f"  Notas: {s['correct_notes']}/{s['total_notes']} corretas")
    print(f"  Afinação média: {s['avg_cents_deviation']:+.1f} cents")
    print(f"  Tendência: {s['sharp_tendency']:.0f}% sharp | {s['flat_tendency']:.0f}% flat")
    print(f"\n  Aquecimento: {s['warmup_accuracy']:.0f}%")
    print(f"  Técnica:     {s['technique_accuracy']:.0f}%")
    print(f"  Repertório:  {s['repertoire_accuracy']:.0f}%")

    recs = feedback["recommendations"]
    if recs:
        print(f"\n  Recomendações:")
        for r in recs:
            print(f"  • {r}")

    print(f"\n  Streak: {progress['streak']} dias | Total: {progress['total_days']}")
    print(f"  Próximo: Nível {progress['student']['level']} Dia {progress['student']['day']}")
    print(f"{'='*50}\n")

    return progress


def mark_completed(progress: dict, level: int, day: int) -> dict:
    """Marca dia como concluído e avança."""
    today = date.today().isoformat()

    # Adicionar ao histórico
    progress["history"].append({
        "date": today,
        "level": level,
        "day": day,
        "completed": True,
        "notes": "",
    })

    # Atualizar streak
    progress["total_days"] = progress.get("total_days", 0) + 1

    # Verificar streak (dia consecutivo)
    if len(progress["history"]) >= 2:
        prev = progress["history"][-2].get("date", "")
        if prev:
            from datetime import timedelta
            prev_date = date.fromisoformat(prev)
            if (date.today() - prev_date).days <= 1:
                progress["streak"] = progress.get("streak", 0) + 1
            else:
                progress["streak"] = 1
    else:
        progress["streak"] = 1

    # Avançar dia
    progress["student"]["day"] = day + 1

    # Achievements
    achievements = progress.get("achievements", [])
    if progress["total_days"] == 1 and "first_note" not in achievements:
        achievements.append("first_note")
    if progress["streak"] >= 7 and "7_day_streak" not in achievements:
        achievements.append("7_day_streak")
    if progress["streak"] >= 30 and "30_day_streak" not in achievements:
        achievements.append("30_day_streak")
    progress["achievements"] = achievements

    save_progress(progress)
    return progress


def main():
    parser = argparse.ArgumentParser(description="Dashboard de Prática de Violino")
    parser.add_argument("--level", type=int, help="Nível (1-6)")
    parser.add_argument("--day", type=int, help="Dia do exercício")
    parser.add_argument("--bpm", type=int, help="BPM do metrônomo")
    parser.add_argument("--complete", action="store_true", help="Marcar dia atual como concluído")
    parser.add_argument("--status", action="store_true", help="Mostrar status do aluno")
    parser.add_argument("--set-level", type=int, help="Alterar nível do aluno")
    parser.add_argument("--reset", action="store_true", help="Resetar progresso")
    parser.add_argument("--import-session", dest="import_file", help="Importar JSON da sessão para SQLite")

    args = parser.parse_args()

    # Import session
    if args.import_file:
        progress = load_progress()
        import_session(args.import_file, progress)
        return

    # Reset
    if args.reset:
        if PROGRESS_PATH.exists():
            PROGRESS_PATH.unlink()
        print("Progresso resetado.")
        return

    progress = load_progress()
    curriculum = load_curriculum()

    # Set level
    if args.set_level:
        progress["student"]["level"] = args.set_level
        progress["student"]["day"] = 1
        save_progress(progress)
        print(f"Nível alterado para {args.set_level}.")
        return

    # Status
    if args.status:
        s = progress["student"]
        print(f"Aluno: {s['name']}")
        print(f"Nível: {s['level']} | Dia: {s['day']}")
        print(f"Streak: {progress.get('streak', 0)} dias")
        print(f"Total: {progress.get('total_days', 0)} dias praticados")
        print(f"BPM: {s.get('bpm', 60)}")
        print(f"Conquistas: {', '.join(progress.get('achievements', [])) or 'nenhuma'}")
        return

    # Complete
    if args.complete:
        lvl = args.level or progress["student"]["level"]
        day = args.day or progress["student"]["day"]
        progress = mark_completed(progress, lvl, day)
        print(f"Dia {day} concluído! Streak: {progress['streak']} | Próximo: dia {progress['student']['day']}")
        return

    # Gerar dashboard
    html = generate_dashboard(progress, curriculum, args.level, args.day, args.bpm)

    # Salvar em temp e abrir
    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False, encoding="utf-8") as f:
        f.write(html)
        tmp_path = f.name

    print(f"Dashboard gerado: {tmp_path}")
    webbrowser.open(f"file:///{tmp_path}")


if __name__ == "__main__":
    main()
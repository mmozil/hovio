#!/usr/bin/env python3
"""
Servidor local para o dashboard de violino.
Serve o HTML + endpoint /api/chat com Gemini Flash para dicas e avaliação.

Uso:
  python server.py                     # Inicia servidor + abre browser
  python server.py --port 8090         # Porta customizada
  python server.py --level 2 --day 3   # Exercício específico
"""

import argparse
import hashlib
import json
import os
import sys
import threading
import webbrowser
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse

# Importar módulos locais
sys.path.insert(0, str(Path(__file__).parent))
from dashboard import load_progress, load_curriculum, generate_dashboard, mark_completed, _get_recent_sessions
from db import (
    save_session, get_session_feedback, get_stats_summary, get_note_analysis, get_evolution,
    save_chat_message, get_chat_history,
    create_user, login_user, get_user, update_user_profile, complete_onboarding,
)
from memory import build_student_memory, memory_to_prompt

try:
    import requests as http_requests
except ImportError:
    http_requests = None

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "AIzaSyCWdraUIIuf2yXJ-7vb_AOUqH4WdQsGcZg")
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
AUTH_SECRET = "tier_violino_secret_2026"
LOGIN_HTML_PATH = Path(__file__).parent / "login.html"

# Estado global do servidor
server_state = {
    "progress": None,
    "curriculum": None,
    "level": None,
    "day": None,
    "bpm": None,
    "session_notes": [],
    "chat_history": [],
    "tokens": {},  # token -> user_id
}


def _generate_token(user_id: int) -> str:
    """Gera token simples para autenticação."""
    raw = f"{user_id}_{AUTH_SECRET}_{os.urandom(8).hex()}"
    token = hashlib.sha256(raw.encode()).hexdigest()[:32]
    server_state["tokens"][token] = user_id
    return token


def _get_user_from_token(token: str) -> dict | None:
    """Valida token e retorna user dict."""
    if not token:
        return None
    user_id = server_state["tokens"].get(token)
    if not user_id:
        return None
    return get_user(user_id)


def _determine_level(experience: str, knows: list) -> int:
    """Determina nível do aluno baseado no onboarding."""
    exp_map = {
        "never": 1,
        "beginner": 1,
        "basic": 2,
        "intermediate": 3,
        "advanced": 4,
    }
    level = exp_map.get(experience, 1)

    # Ajustar baseado no que sabe
    advanced_skills = {"vibrato", "position_changes", "2_octave_scales"}
    intermediate_skills = {"staccato", "detache", "major_scales"}
    basic_skills = {"first_position", "read_sheet"}

    knows_set = set(knows)
    if knows_set & advanced_skills:
        level = max(level, 4)
    elif knows_set & intermediate_skills:
        level = max(level, 3)
    elif knows_set & basic_skills:
        level = max(level, 2)

    # Cap no 5 para avançado com expressão
    if experience == "advanced":
        level = 5

    return level


def build_system_prompt() -> str:
    """Constroi o system prompt com memoria completa do aluno."""
    # Reconstruir memoria a cada chamada (dados sempre frescos)
    memory = build_student_memory()
    memory_text = memory_to_prompt(memory)

    # Sessao atual (notas em tempo real)
    notes = server_state.get("session_notes", [])
    session_ctx = ""
    if notes:
        total = len(notes)
        correct = sum(1 for n in notes if n.get("is_correct"))
        accuracy = (correct / total * 100) if total > 0 else 0
        session_ctx = f"\nSESSAO EM ANDAMENTO: {total} notas tocadas, {correct} corretas ({accuracy:.0f}%)"

    return f"""Voce e um professor de violino pessoal, paciente, encorajador e experiente. Responda sempre em portugues (pt-BR).

Voce CONHECE este aluno profundamente. Abaixo esta tudo que sabe sobre ele — seu historico, evolucao, pontos fortes, dificuldades, tendencias e conversas anteriores. Use TODA essa informacao para personalizar suas respostas.

{memory_text}
{session_ctx}

REGRAS DO PROFESSOR:
1. Voce lembra de TUDO — conversas anteriores, dificuldades, evolucao. Referencie o historico quando relevante.
2. Seja encorajador mas honesto. Violino e dificil, cada progresso merece reconhecimento.
3. De dicas praticas e especificas para ESTE aluno, nao genericas. Use os dados das notas que ele erra.
4. Se ele perguntar sobre tecnica, explique com linguagem visual (imagine posicoes do corpo).
5. Se perguntar sobre afinacao, referencie as notas especificas que estao dando problema nos dados.
6. Se perguntar o que praticar, personalize com base nas sessoes anteriores e notas fracas.
7. Respostas curtas e diretas (2-4 paragrafos max).
8. Nao repita recomendacoes ja dadas (veja a lista no final da memoria). Varie a abordagem.
9. Se o aluno esta melhorando em algo, reconheca explicitamente ("Vi que seu Si4 melhorou 15%!").
10. Se notar padroes negativos (streak caindo, acuracia baixando), aborde com cuidado e motivacao.
"""


class ViolinHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Silenciar logs

    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)

        if parsed.path == "/" or parsed.path == "/index.html":
            token = params.get("token", [None])[0]
            user = _get_user_from_token(token) if token else None
            if not user:
                self._serve_login()
            elif not user.get("onboarding_complete"):
                self._serve_login(onboarding_user=user, token=token)
            else:
                self._serve_dashboard()
        elif parsed.path == "/api/stats":
            self._json_response(get_stats_summary())
        elif parsed.path == "/api/evolution":
            self._json_response(get_evolution())
        elif parsed.path == "/api/notes":
            self._json_response(get_note_analysis())
        elif parsed.path == "/api/chat-history":
            self._json_response({"messages": get_chat_history(50)})
        elif parsed.path == "/api/user":
            token = params.get("token", [None])[0]
            user = _get_user_from_token(token)
            if user:
                safe = {k: v for k, v in user.items() if k != "password_hash"}
                self._json_response(safe)
            else:
                self._json_response({"error": "Nao autenticado"}, status=401)
        else:
            self.send_error(404)

    def do_POST(self):
        parsed = urlparse(self.path)
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length) if content_length > 0 else b""

        if parsed.path == "/api/register":
            self._handle_register(body)
        elif parsed.path == "/api/login":
            self._handle_login(body)
        elif parsed.path == "/api/onboarding":
            self._handle_onboarding(body)
        elif parsed.path == "/api/chat":
            self._handle_chat(body)
        elif parsed.path == "/api/save-session":
            self._handle_save_session(body)
        elif parsed.path == "/api/update-notes":
            self._handle_update_notes(body)
        else:
            self.send_error(404)

    def _serve_login(self, onboarding_user=None, token=None):
        """Serve a página de login/registro/onboarding."""
        if not LOGIN_HTML_PATH.exists():
            self.send_response(500)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"login.html nao encontrado")
            return

        with open(LOGIN_HTML_PATH, "r", encoding="utf-8") as f:
            html = f.read()

        # Injetar dados de onboarding se usuário já registrou mas não completou
        if onboarding_user and token:
            inject = f"""<script>
            window.__ONBOARDING_USER__ = {json.dumps({
                "id": onboarding_user["id"],
                "name": onboarding_user["name"],
                "token": token,
            }, ensure_ascii=False)};
            </script>"""
            html = html.replace("</head>", f"{inject}</head>")

        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(html.encode("utf-8"))

    def _serve_dashboard(self):
        progress = server_state["progress"]
        curriculum = server_state["curriculum"]
        html = generate_dashboard(
            progress, curriculum,
            server_state["level"], server_state["day"], server_state["bpm"]
        )
        # Injetar chat panel e websocket URL
        chat_injection = _get_chat_panel_html()
        html = html.replace("</body>", f"{chat_injection}</body>")

        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(html.encode("utf-8"))

    def _handle_register(self, body: bytes):
        """POST /api/register — cria usuário."""
        try:
            data = json.loads(body)
            name = data.get("name", "").strip()
            email = data.get("email", "").strip()
            password = data.get("password", "")

            if not name or not email or not password:
                self._json_response({"error": "Preencha todos os campos"}, status=400)
                return
            if len(password) < 4:
                self._json_response({"error": "Senha deve ter pelo menos 4 caracteres"}, status=400)
                return

            user_id = create_user(name, email, password)
            token = _generate_token(user_id)
            self._json_response({"user_id": user_id, "token": token, "name": name})
        except ValueError as e:
            self._json_response({"error": str(e)}, status=409)
        except Exception as e:
            self._json_response({"error": f"Erro ao criar conta: {str(e)}"}, status=500)

    def _handle_login(self, body: bytes):
        """POST /api/login — autentica usuário."""
        try:
            data = json.loads(body)
            email = data.get("email", "").strip()
            password = data.get("password", "")

            if not email or not password:
                self._json_response({"error": "Preencha email e senha"}, status=400)
                return

            user = login_user(email, password)
            if not user:
                self._json_response({"error": "Email ou senha incorretos"}, status=401)
                return

            token = _generate_token(user["id"])
            safe_user = {k: v for k, v in user.items() if k != "password_hash"}
            self._json_response({
                "user_id": user["id"],
                "token": token,
                "user": safe_user,
                "onboarding_complete": bool(user.get("onboarding_complete")),
            })
        except Exception as e:
            self._json_response({"error": f"Erro no login: {str(e)}"}, status=500)

    def _handle_onboarding(self, body: bytes):
        """POST /api/onboarding — salva dados do onboarding."""
        try:
            data = json.loads(body)
            token = data.get("token", "")
            answers = data.get("answers", {})

            user = _get_user_from_token(token)
            if not user:
                self._json_response({"error": "Nao autenticado"}, status=401)
                return

            user_id = user["id"]
            experience = answers.get("experience", "beginner")
            knows = answers.get("knows", [])
            goals = answers.get("goals", [])
            style = answers.get("style", "classical")

            # Determinar nível
            level = _determine_level(experience, knows)

            # Salvar perfil
            update_user_profile(user_id, {
                "level": level,
                "experience": experience,
                "knows": knows,
                "goals": goals,
                "style": style,
            })
            complete_onboarding(user_id)

            # Atualizar progress.json com dados do usuário
            progress = server_state["progress"]
            progress["student"]["level"] = level
            progress["student"]["day"] = 1
            progress["student"]["name"] = user["name"]
            from dashboard import save_progress
            save_progress(progress)

            self._json_response({
                "level": level,
                "message": f"Nivel {level} atribuido com base no seu perfil",
            })
        except Exception as e:
            self._json_response({"error": f"Erro no onboarding: {str(e)}"}, status=500)

    def _handle_chat(self, body: bytes):
        try:
            data = json.loads(body)
            message = data.get("message", "")
            session_notes = data.get("session_notes", [])

            # Atualizar notas da sessão no estado
            if session_notes:
                server_state["session_notes"] = session_notes

            # Persistir mensagem do usuário
            save_chat_message("user", message)
            server_state["chat_history"].append({"role": "user", "content": message})

            # Chamar LLM
            reply = _call_llm(message)

            # Persistir resposta
            save_chat_message("assistant", reply)
            server_state["chat_history"].append({"role": "assistant", "content": reply})

            self._json_response({"reply": reply})
        except Exception as e:
            self._json_response({"reply": f"Erro ao processar: {str(e)}"}, status=500)

    def _handle_save_session(self, body: bytes):
        try:
            data = json.loads(body)
            session_id = save_session(data)
            feedback = get_session_feedback(session_id)

            # Atualizar progresso
            progress = server_state["progress"]
            lvl = data.get("level", progress["student"]["level"])
            day = data.get("day", progress["student"]["day"])
            server_state["progress"] = mark_completed(progress, lvl, day)

            self._json_response({"session_id": session_id, "feedback": feedback})
        except Exception as e:
            self._json_response({"error": str(e)}, status=500)

    def _handle_update_notes(self, body: bytes):
        """Recebe notas em tempo real do dashboard."""
        try:
            data = json.loads(body)
            server_state["session_notes"] = data.get("notes", [])
            self._json_response({"ok": True})
        except Exception:
            self._json_response({"ok": False})

    def _json_response(self, data: dict, status: int = 200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()


def _call_llm(user_message: str) -> str:
    """Chama Gemini Flash com contexto da sessão."""
    if not GEMINI_API_KEY:
        return _fallback_response(user_message)

    if not http_requests:
        return _fallback_response(user_message)

    system_prompt = build_system_prompt()

    # Montar conversa
    contents = [{"role": "user", "parts": [{"text": system_prompt + "\n\nAluno: " + user_message}]}]

    # Adicionar histórico recente (últimas 4 mensagens)
    recent = server_state["chat_history"][-4:]
    if len(recent) > 1:
        history_text = "\n".join(
            f"{'Aluno' if m['role'] == 'user' else 'Professor'}: {m['content']}"
            for m in recent[:-1]
        )
        contents = [{"role": "user", "parts": [{"text": system_prompt + "\n\nHistórico recente:\n" + history_text + "\n\nAluno: " + user_message}]}]

    try:
        resp = http_requests.post(
            f"{GEMINI_URL}?key={GEMINI_API_KEY}",
            json={
                "contents": contents,
                "generationConfig": {
                    "temperature": 0.7,
                    "maxOutputTokens": 500,
                    "topP": 0.9,
                }
            },
            timeout=15,
        )
        if resp.status_code == 200:
            data = resp.json()
            candidates = data.get("candidates", [])
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                if parts:
                    return parts[0].get("text", "Não consegui gerar uma resposta.")
        return _fallback_response(user_message)
    except Exception:
        return _fallback_response(user_message)


def _fallback_response(message: str) -> str:
    """Respostas offline quando LLM não está disponível."""
    msg = message.lower()

    if any(w in msg for w in ["afinação", "afinado", "desafinado", "afinar"]):
        return ("Para melhorar a afinação:\n"
                "1. Toque a nota esperada e cante junto antes de tocar\n"
                "2. Use cordas soltas como referência (Lá=440Hz)\n"
                "3. Pratique lento — velocidade não importa se está desafinado\n"
                "4. O afinador do dashboard mostra cents: verde é bom, amarelo é aceitável")

    if any(w in msg for w in ["arco", "braço", "mão direita"]):
        return ("Dicas de arco:\n"
                "1. Cotovelo relaxado, peso natural do braço\n"
                "2. Arco paralelo ao cavalete (não em diagonal)\n"
                "3. Ponto de contato: entre o cavalete e o espelho\n"
                "4. No talão: mais peso. Na ponta: mais velocidade")

    if any(w in msg for w in ["dedo", "mão esquerda", "posição"]):
        return ("Dicas de mão esquerda:\n"
                "1. Dedos curvados como se segurasse uma bola de tênis\n"
                "2. Polegar relaxado, oposto ao 2° dedo\n"
                "3. Pressione com a ponta do dedo, não a polpa\n"
                "4. Dedos sempre perto das cordas, mesmo quando não tocam")

    if any(w in msg for w in ["difícil", "não consigo", "frustr"]):
        return ("Violino é um dos instrumentos mais difíceis. O que você está sentindo é normal!\n"
                "Dicas: reduza o BPM, pratique nota por nota (não o trecho inteiro), "
                "e lembre que 20 minutos por dia já é excelente. "
                "Compare seu progresso com a semana passada, não com um profissional.")

    if any(w in msg for w in ["praticar", "exercício", "próximo"]):
        notes = server_state.get("session_notes", [])
        if notes:
            total = len(notes)
            correct = sum(1 for n in notes if n.get("is_correct"))
            acc = correct / total * 100 if total > 0 else 0
            if acc >= 80:
                return "✅ Sua acurácia está boa! Tente aumentar o BPM em 5-10 ou avance para o próximo exercício."
            else:
                return "Repita o exercício atual com BPM mais lento. Foque nas notas que estão vermelhas no afinador."
        return "Comece com o exercício do dia e vamos avaliar juntos!"

    return ("Estou aqui para ajudar! Pode perguntar sobre:\n"
            "• Técnica de arco ou mão esquerda\n"
            "• Problemas de afinação\n"
            "• O que praticar hoje\n"
            "• Dicas para o seu nível atual\n"
            "• Como ler a partitura")


def _get_chat_panel_html() -> str:
    """Retorna o HTML/CSS/JS do chat panel para injetar no dashboard."""
    return """
<style>
#chat-toggle {
  position: fixed; bottom: 24px; right: 24px; z-index: 1000;
  width: 56px; height: 56px; border-radius: 50%;
  background: var(--accent); border: none; cursor: pointer;
  box-shadow: 0 4px 16px rgba(212,165,116,0.4);
  display: flex; align-items: center; justify-content: center;
  font-size: 28px; transition: transform 0.2s;
}
#chat-toggle:hover { transform: scale(1.1); }

#chat-panel {
  position: fixed; bottom: 90px; right: 24px; z-index: 999;
  width: 380px; max-height: 500px; border-radius: var(--radius);
  background: var(--bg-card); border: 1px solid var(--border);
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  display: none; flex-direction: column; overflow: hidden;
}
#chat-panel.open { display: flex; }

#chat-header {
  padding: 14px 16px; border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between;
}
#chat-header h3 { font-size: 14px; color: var(--accent); margin: 0; }
#chat-header button { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 18px; }

#chat-messages {
  flex: 1; overflow-y: auto; padding: 12px 16px;
  max-height: 340px; min-height: 200px;
}
.chat-msg { margin-bottom: 12px; max-width: 85%; }
.chat-msg.user { margin-left: auto; }
.chat-msg .bubble {
  padding: 10px 14px; border-radius: 12px; font-size: 13px;
  line-height: 1.5; white-space: pre-wrap;
}
.chat-msg.user .bubble { background: var(--accent-dim); color: var(--text); border-bottom-right-radius: 4px; }
.chat-msg.assistant .bubble { background: var(--bg-elevated); color: var(--text); border-bottom-left-radius: 4px; }
.chat-msg .label { font-size: 11px; color: var(--text-muted); margin-bottom: 4px; }
.chat-msg.user .label { text-align: right; }

#chat-input-area {
  padding: 12px; border-top: 1px solid var(--border);
  display: flex; gap: 8px;
}
#chat-input {
  flex: 1; padding: 10px 14px; border-radius: var(--radius-sm);
  background: var(--bg-input); border: 1px solid var(--border);
  color: var(--text); font-size: 13px; outline: none; resize: none;
  font-family: inherit; min-height: 40px; max-height: 80px;
}
#chat-input:focus { border-color: var(--accent); }
#chat-send {
  padding: 10px 16px; border-radius: var(--radius-sm);
  background: var(--accent); border: none; color: #1a1a1e;
  cursor: pointer; font-weight: 600; font-size: 13px;
  white-space: nowrap;
}
#chat-send:hover { background: var(--accent-hover); }
#chat-send:disabled { opacity: 0.5; cursor: not-allowed; }

.typing-indicator { display: inline-flex; gap: 4px; padding: 8px 14px; }
.typing-indicator span {
  width: 6px; height: 6px; border-radius: 50%; background: var(--text-muted);
  animation: typing 1.4s infinite;
}
.typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
.typing-indicator span:nth-child(3) { animation-delay: 0.4s; }
@keyframes typing { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-6px); } }
</style>

<button id="chat-toggle" onclick="toggleChat()">🎻</button>

<div id="chat-panel">
  <div id="chat-header">
    <h3>Professor de Violino</h3>
    <button onclick="toggleChat()">✕</button>
  </div>
  <div id="chat-messages">
    <div class="chat-msg assistant">
      <div class="label">Professor</div>
      <div class="bubble">Olá! Sou seu professor de violino. Pode me perguntar sobre técnica, afinação, o que praticar, ou pedir uma avaliação da sua sessão. 🎵</div>
    </div>
  </div>
  <div id="chat-input-area">
    <textarea id="chat-input" placeholder="Pergunte algo..." rows="1"
      onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendChat()}"></textarea>
    <button id="chat-send" onclick="sendChat()">Enviar</button>
  </div>
</div>

<script>
function toggleChat() {
  document.getElementById('chat-panel').classList.toggle('open');
  if (document.getElementById('chat-panel').classList.contains('open')) {
    document.getElementById('chat-input').focus();
  }
}

async function sendChat() {
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg) return;

  input.value = '';
  const sendBtn = document.getElementById('chat-send');
  sendBtn.disabled = true;

  // Adicionar mensagem do usuário
  appendMessage('user', msg);

  // Mostrar typing indicator
  const typingId = showTyping();

  try {
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: msg,
        session_notes: typeof sessionNotes !== 'undefined' ? sessionNotes : []
      })
    });
    const data = await resp.json();
    removeTyping(typingId);
    appendMessage('assistant', data.reply || 'Sem resposta.');
  } catch (e) {
    removeTyping(typingId);
    appendMessage('assistant', 'Erro de conexão com o servidor. Verifique se o server.py está rodando.');
  }

  sendBtn.disabled = false;
  input.focus();
}

function appendMessage(role, text) {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg ' + role;
  div.innerHTML = '<div class="label">' + (role === 'user' ? 'Você' : 'Professor') + '</div>'
    + '<div class="bubble">' + escapeHtml(text) + '</div>';
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function showTyping() {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg assistant';
  div.id = 'typing-' + Date.now();
  div.innerHTML = '<div class="label">Professor</div><div class="bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div>';
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div.id;
}

function removeTyping(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML.replace(/\\n/g, '<br>');
}

// Enviar notas para o server periodicamente (a cada 30s)
setInterval(() => {
  if (typeof sessionNotes !== 'undefined' && sessionNotes.length > 0) {
    fetch('/api/update-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: sessionNotes })
    }).catch(() => {});
  }
}, 30000);
</script>
"""


def main():
    parser = argparse.ArgumentParser(description="Servidor do Dashboard de Violino")
    parser.add_argument("--port", type=int, default=8090, help="Porta do servidor")
    parser.add_argument("--host", default=None, help="Host (default: 127.0.0.1 local, 0.0.0.0 Docker)")
    parser.add_argument("--level", type=int, help="Nível (1-6)")
    parser.add_argument("--day", type=int, help="Dia do exercício")
    parser.add_argument("--bpm", type=int, help="BPM do metrônomo")
    args = parser.parse_args()

    # Carregar estado
    server_state["progress"] = load_progress()
    server_state["curriculum"] = load_curriculum()
    server_state["chat_history"] = get_chat_history(20)
    server_state["level"] = args.level
    server_state["day"] = args.day
    server_state["bpm"] = args.bpm

    # Iniciar servidor (0.0.0.0 para Docker, 127.0.0.1 para dev local)
    host = args.host or ("0.0.0.0" if os.environ.get("DOCKER") else "127.0.0.1")
    server = HTTPServer((host, args.port), ViolinHandler)
    url = f"http://{host}:{args.port}"

    print(f"Servidor de violino rodando em {url}")
    if GEMINI_API_KEY:
        print(f"Chat com Gemini Flash ativo")
    else:
        print(f"Chat em modo offline (configure GEMINI_API_KEY para respostas AI)")
    print(f"Ctrl+C para parar\n")

    # Abrir browser apenas em modo local
    if host == "127.0.0.1":
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor encerrado.")
        server.server_close()


if __name__ == "__main__":
    main()
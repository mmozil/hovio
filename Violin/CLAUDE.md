# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Summary

Tier Violino é um dashboard interativo de prática de violino com professor AI integrado. Sessões de 20 min/dia com partitura visual (ABCjs), detecção de afinação em tempo real via microfone (Web Audio API), metrônomo, timer e chat com Gemini Flash. Tracking de evolução via SQLite.

**Domínio:** `https://violin.hovio.com.br/` (produção)
**GitHub:** github.com/mmozil/hovio (público)

## Development Commands

```bash
# Servidor local (dev)
python scripts/server.py                     # http://127.0.0.1:8090
python scripts/server.py --port 8090         # Porta customizada
python scripts/server.py --level 2 --day 3   # Exercício específico

# Dashboard estático (sem servidor)
python scripts/dashboard.py                  # Gera HTML temp + abre browser

# Importar sessão do dashboard para SQLite
python scripts/dashboard.py --import-session ~/Downloads/session_*.json

# Consultar dados
python scripts/db.py stats                   # Resumo geral
python scripts/db.py evolution               # Tendências semanais
python scripts/db.py notes                   # Análise por nota

# Status do aluno
python scripts/dashboard.py --status         # Nível, dia, streak
python scripts/dashboard.py --set-level 3    # Mudar nível
python scripts/dashboard.py --reset          # Recomeçar

# Docker
docker build -t tier-violino .
docker run -p 8090:8090 -e GEMINI_API_KEY=... -v violino-data:/app/data tier-violino
```

## Architecture

```
Violin/
├── scripts/
│   ├── server.py          # Servidor HTTP (dashboard + login + /api/* com Gemini)
│   ├── dashboard.py       # Gerador de HTML standalone + import JSON → SQLite
│   ├── template.html      # Dashboard (ABCjs + pitch detection + metrônomo + feedback + chat)
│   ├── login.html         # Login + onboarding 5 steps
│   ├── db.py              # SQLite (users, sessions, notes_played, chat_history, weekly_trends)
│   └── memory.py          # Memória do professor (9 dimensões do aluno)
├── references/
│   └── curriculum.json    # Exercícios por nível em notação ABC (2 níveis, 9 dias)
├── data/
│   ├── progress.json      # Nível/dia/streak (criado automaticamente)
│   └── practice.db        # SQLite com histórico (criado no 1° import)
├── Dockerfile             # Deploy container
├── .dockerignore
└── CLAUDE.md
```

### Stack

- **Backend:** Python 3.13 (stdlib HTTPServer, zero framework)
- **Frontend:** HTML standalone, ABCjs CDN, Web Audio API
- **LLM:** Gemini 2.0 Flash (chat do professor, ~R$0/mês no free tier)
- **Database:** SQLite (local, sem servidor)
- **Deploy:** Docker + Coolify (Hetzner VPS)

### Dashboard Features

| Feature | Tecnologia |
|---------|-----------|
| Partitura visual | ABCjs (notação ABC → pentagrama SVG) |
| Detecção de afinação | Web Audio API + autocorrelação (A4=440Hz) |
| Metrônomo | Web Audio oscillator, BPM ajustável |
| Timer | 20 min em 4 blocos (5+8+5+2) |
| Login/Onboarding | Login por nome + onboarding 5 steps (experiência, objetivos, disponibilidade) |
| Chat professor | Gemini Flash via /api/chat (memória 9 dimensões, fallback offline) |
| Reference play | Reprodução de referência (synth) para cada exercício |
| Feedback pós-sessão | Score A-F, 4 barras, notas difíceis, recomendações, evolução |
| Tracking | SQLite (users, sessions, notes_played, chat_history, weekly_trends) |

### Currículo (6 Níveis)

| Nível | Foco | BPM | Semanas |
|-------|------|-----|---------|
| 1 | Fundamentos, cordas soltas, Ré Maior | 60 | 1-4 |
| 2 | 1ª posição, détaché, ligaduras | 72 | 5-10 |
| 3 | Ritmo, staccato, dinâmica | 84 | 11-18 |
| 4 | Mudança de posição, vibrato | 96 | 19-28 |
| 5 | Expressão, fraseado, Vivaldi | 108 | 29-40 |
| 6 | Intermediário, Bach, cordas duplas | 120 | 41+ |

### Pitch Detection

- Microfone → AnalyserNode (FFT) → autocorrelação → Hz → nota mais próxima
- Tolerâncias: ±15 cents (verde/correto), ±30 cents (amarelo/próximo), >30 (vermelho/errado)
- Requer HTTPS em produção (ou localhost)
- Chrome/Edge recomendados

### Feedback System

1. Durante sessão: grava cada nota (timestamp, esperada, detectada, Hz, cents, qualidade)
2. Ao concluir: painel com Score, acurácia por bloco, notas difíceis, recomendações
3. Export JSON → import no SQLite via `--import-session`
4. SQLite armazena: sessions, notes_played (granular), weekly_trends

### Chat LLM (Professor)

- Endpoint: `POST /api/chat` no server.py
- Modelo: Gemini 2.0 Flash (env `GEMINI_API_KEY`)
- System prompt inclui: nível, streak, acurácia, notas problemáticas, sessão atual
- Fallback offline: respostas pré-definidas por categoria (afinação, arco, dedos, motivação)

## Environment Variables

```bash
GEMINI_API_KEY=...        # Gemini Flash (opcional, chat funciona offline sem)
GOOGLE_API_KEY=...        # Alternativa ao GEMINI_API_KEY
```

## Key Patterns

- **Notação ABC** para partituras — texto simples que ABCjs renderiza em SVG
- **Autocorrelação** para pitch detection — mais preciso que FFT puro para instrumentos acústicos
- **SQLite** para tracking — zero infra, portátil, consultas SQL nativas
- **Template HTML com placeholders** — Python faz string replace, browser renderiza
- **Fallback offline** — chat funciona sem API key com respostas pré-definidas

## Deploy (Coolify)

- **URL:** https://violin.hovio.com.br
- **Coolify Project UUID:** `s88c48s0kg884ck8s0gow440`
- **Coolify App UUID:** `skkgco40www8gg08wo4soscc`
- **Dockerfile** na raiz, **Base Directory:** `/Violin`
- **Volume:** `/app/data` (persistir SQLite + progress.json)
- **Porta:** 8090
- **Env:** `GEMINI_API_KEY`
- **Servidor:** Hetzner 46.224.220.223
- **SSL:** Cloudflare (Full, Always HTTPS, TLS 1.2, Brotli)
- **Cloudflare Zone ID:** `67deb0bbcb2c9e4d9121eb3b71b39dec`
- **DNS:** @, www, violino, * → 46.224.220.223 (proxied)
- **Nota:** Microfone requer HTTPS (Cloudflare fornece)

```bash
# Deploy manual
curl -s "https://apps.cloudesneper.com.br/api/v1/deploy?uuid=skkgco40www8gg08wo4soscc&force=false" \
  -H "Authorization: Bearer 5|claude-deploy-token-2026"
```

# CLAUDE.md

## Hovio — House Of Ventures, Innovation & Operations

Venture Builder que cria, incuba e escala produtos digitais proprios. Cada produto e uma venture independente com stack, dominio e infraestrutura proprios.

**Dominio:** hovio.com.br
**Repo:** github.com/mmozil/hovio
**Servidor:** Hetzner VPS 46.224.220.223 (Coolify)

## Ventures

| Venture | Diretorio | Dominio | Stack | Status |
|---------|-----------|---------|-------|--------|
| Violin | `Violin/` | violin.hovio.com.br | Python, ABCjs, Web Audio, Gemini, SQLite | Production |

## Estrutura do Repo

```
hovio/
├── CLAUDE.md
├── Violin/                    # Professor AI de violino
│   ├── Dockerfile
│   ├── scripts/
│   │   ├── server.py          # HTTP server + /api/chat (Gemini)
│   │   ├── dashboard.py       # Gerador HTML + import sessoes
│   │   ├── template.html      # Dashboard (partitura, afinador, metronomo)
│   │   ├── login.html         # Login + onboarding 5 steps
│   │   ├── db.py              # SQLite (users, sessions, notes, chat, trends)
│   │   └── memory.py          # Memoria do professor (9 dimensoes)
│   ├── references/
│   │   └── curriculum.json    # Exercicios por nivel (notacao ABC)
│   └── data/                  # Criado automaticamente (SQLite, progress)
└── (proximas ventures aqui)
```

## Deploy (Coolify)

Cada venture tem seu proprio container Docker no Coolify:

```bash
# Violin
docker build -t hovio-violin ./Violin
docker run -p 8090:8090 -e GEMINI_API_KEY=... -v violin-data:/app/data hovio-violin
```

### Coolify Config por Venture
- **Base Directory:** `/{Venture}` (ex: `/Violin`)
- **Dockerfile:** `Dockerfile` (dentro da venture)
- **Volume:** `/app/data` (persistir SQLite)
- **Env vars:** `GEMINI_API_KEY` por venture
- **Dominio:** `{venture}.hovio.com.br`

### Violin (Producao)
- **URL:** https://violin.hovio.com.br
- **Coolify Project UUID:** `s88c48s0kg884ck8s0gow440`
- **Coolify App UUID:** `skkgco40www8gg08wo4soscc`
- **Cloudflare Zone ID:** `67deb0bbcb2c9e4d9121eb3b71b39dec`
- **Deploy:** `curl -s "https://apps.cloudesneper.com.br/api/v1/deploy?uuid=skkgco40www8gg08wo4soscc&force=false" -H "Authorization: Bearer 5|claude-deploy-token-2026"`

## Convencoes

- **Linguagem:** Portugues (pt-BR) em docs e UI
- **Commits:** Conventional commits em portugues
- **Deploy:** Push to main → Coolify webhook → auto-build
- **Design:** Dark theme (#262624 bg, #9C7A5A accent)

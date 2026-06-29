# CLAUDE.md

## Hovio — House Of Ventures, Innovation & Operations

Venture Builder que cria, incuba e escala produtos digitais proprios. Cada produto e uma venture independente com stack, dominio e infraestrutura proprios.

**Dominio:** hovio.com.br (vitrine apex — nginx alpine + index.html estatico)
**Repo:** github.com/mmozil/hovio (vitrine hub na raiz; cada venture tem seu proprio repo)
**Servidor:** Hetzner VPS 46.224.220.223 (Coolify)
**Coolify App UUID (hub):** `zkowokc8ow40s0oc00ocgcc8`

**Cloudflare (mai/2026):** zona `hovio.com.br` migrada da conta Esneper para conta **Tier** (`tierfinance@gmail.com`). Zone ID: `cfb5bdd17e99fa38aa877aac99f8be29`. Nameservers: `marek.ns.cloudflare.com` + `simone.ns.cloudflare.com`. Settings: SSL strict, Always Use HTTPS, Automatic HTTPS Rewrites. Universal SSL re-emitido na zona nova (cert wildcard `*.hovio.com.br` + apex). 7 records DNS (echo, hovio.com.br apex, murdock, violin, violino, www proxied + `*` wildcard dns-only). Credenciais CF em `D:\Project\App Finance\tier-finance\memory\reference_cloudflare.md`.

## Ventures

| Venture | Diretorio | Dominio | Stack | Status |
|---------|-----------|---------|-------|--------|
| Hub | `hub/` (mesmo repo: github.com/mmozil/hovio raiz) | hovio.com.br | nginx alpine + HTML estatico | Production |
| Violin | `Violin/` (repo standalone: github.com/mmozil/violin) | violin.hovio.com.br | Python, ABCjs, Web Audio, MiniMax M2.5, SQLite | Production |
| Echo | `Echo/` (repo standalone: github.com/mmozil/echo) | echo.hovio.com.br | Python, FastAPI, Edge TTS, PyMuPDF, SQLite | Production |
| Murdock | (repo standalone: github.com/mmozil/murdock) | murdock.hovio.com.br | Python, Pydantic AI, Gemini Flash, pgvector | Production |
| Pizzaria | `Pizzaria/` (repo standalone a criar: github.com/mmozil/pizzaria) | pizzaria.hovio.com.br + `*.pizzaria.hovio.com.br` (wildcard) | Next.js 15 + Prisma + Postgres + Auth.js v5 + Tailwind + R2 | Em dev (mai/2026, Fase 1 Foundation) |
| La Belle Scens | `labellescens/` (deploy) + `La Belle Scens/design-system/` (fonte) — mesmo repo mmozil/hovio | labellescens.hovio.com.br (`/`=DS · `/design-system/` · `/painel/` · `/fluxo/a.html` · `/fluxo/investimento.html` · `/hero.html`) | HTML estático (nginx) — protótipos DS/painel/jornada/proposta (linguagem Dior) | Descoberta + protótipos; **escopo MVP fechado** (jun/2026). Sistema não construído |

## Estrutura do Repo

```
hovio/
├── CLAUDE.md
├── hub/                       # Vitrine apex hovio.com.br (repo mmozil/hovio raiz)
│   ├── Dockerfile             # nginx:alpine
│   ├── nginx.conf
│   └── index.html             # Lista as ventures (Violin/Echo/Murdock)
├── Violin/                    # Professor AI de violino (repo standalone mmozil/violin)
│   ├── Dockerfile
│   ├── scripts/
│   │   ├── server.py          # HTTP server + /api/chat (MiniMax M2.5)
│   │   ├── dashboard.py       # Gerador HTML + import sessoes
│   │   ├── template.html      # Dashboard (partitura, afinador, metronomo)
│   │   ├── login.html         # Login + onboarding 5 steps
│   │   ├── falling-notes.html # Synthesia + violino vertical (responsivo)
│   │   ├── transcribe.py      # Wrapper subprocess
│   │   ├── transcribe_worker.py # yt-dlp + basic-pitch (cookies + fallback clients)
│   │   ├── db.py              # SQLite (users, sessions, notes, chat, trends)
│   │   └── memory.py          # Memoria do professor (9 dimensoes)
│   ├── references/
│   │   └── curriculum.json    # Exercicios por nivel (notacao ABC)
│   └── data/                  # Volume Coolify (SQLite + progress + cookies.txt)
├── Echo/                      # Leitor de documentos com voz AI
│   ├── Dockerfile
│   ├── main.py                # FastAPI (upload, player, TTS)
│   ├── src/
│   │   ├── database.py        # SQLite (documents, chunks, progress)
│   │   ├── pdf_parser.py      # PyMuPDF — extração + chunking
│   │   └── tts_service.py     # Edge TTS (AntonioNeural)
│   ├── static/
│   │   └── index.html         # Frontend (biblioteca + player)
│   └── data/                  # SQLite, uploads, audio cache
└── (proximas ventures aqui)
```

## Deploy (Coolify)

Cada venture tem seu proprio container Docker no Coolify:

```bash
# Violin
docker build -t hovio-violin ./Violin
docker run -p 8090:8090 -e MINIMAX_API_KEY=... -v violin-data:/app/data hovio-violin
```

### Coolify Config por Venture
- **Base Directory:** `/` (cada venture e um repo standalone no GitHub)
- **Source:** GitHub App (source_id=12, app_id=3230910, installation_id=120280513)
- **Dockerfile:** `Dockerfile` (raiz do repo)
- **Volume:** `/app/data` (persistir SQLite)
- **Env vars:** `MINIMAX_API_KEY` por venture
- **Dominio:** `{venture}.hovio.com.br`
- **Deploy:** Push to main → GitHub App webhook → Coolify auto-build

### Hub apex (Producao — desde 2026-05-03)
- **URL:** https://hovio.com.br (+ www.hovio.com.br)
- **Coolify App UUID:** `zkowokc8ow40s0oc00ocgcc8`
- **Repo:** github.com/mmozil/hovio (raiz)
- **Build pack:** dockerfile (nginx:alpine)
- **Porta:** 80
- **Deploy:** `curl -s "https://apps.cloudesneper.com.br/api/v1/deploy?uuid=zkowokc8ow40s0oc00ocgcc8&force=false" -H "Authorization: Bearer 5|claude-deploy-token-2026"`
- **Antes existia 502** porque nenhum container respondia por `Host(\`hovio.com.br\`)` no Traefik — só os subdomínios. Resolvido criando o app `hovio-hub` no projeto Hovio do Coolify.

### Violin (Producao)
- **URL:** https://violin.hovio.com.br
- **Coolify Project UUID:** `s88c48s0kg884ck8s0gow440`
- **Coolify App UUID:** `skkgco40www8gg08wo4soscc`
- **Cloudflare Zone ID:** `67deb0bbcb2c9e4d9121eb3b71b39dec`
- **Deploy:** `curl -s "https://apps.cloudesneper.com.br/api/v1/deploy?uuid=skkgco40www8gg08wo4soscc&force=false" -H "Authorization: Bearer 5|claude-deploy-token-2026"`
- **Env var crítica:** `VIOLIN_ADMIN_TOKEN` (token para upload cookies.txt YouTube)

### Echo (Producao)
- **URL:** https://echo.hovio.com.br
- **Coolify App UUID:** `iws04g0kow8w44o40ocsw4s0`
- **Build pack:** `dockercompose` (docker-compose.yml)
- **Container:** `echo-iws04g0kow8w44o40ocsw4s0-{timestamp}`
- **Porta:** 8095
- **Volume:** Docker named volume `iws04g0kow8w44o40ocsw4s0_echo-data` → `/app/data`
- **Rede:** `coolify` (Traefik labels no docker-compose.yml)
- **Auth:** Bearer token (localStorage) + cookie fallback
- **Deploy:** `curl -s "https://apps.cloudesneper.com.br/api/v1/deploy?uuid=iws04g0kow8w44o40ocsw4s0&force=true" -H "Authorization: Bearer 5|claude-deploy-token-2026"`
- **Verificar containers duplicados:** `ssh root@46.224.220.223 "docker ps | grep iws04"`

## Convencoes

- **Linguagem:** Portugues (pt-BR) em docs e UI
- **Commits:** Conventional commits em portugues
- **Deploy:** Push to main → Coolify webhook → auto-build
- **Design:** Light theme (#FDFCFC bg, #2B7FFF accent, subtle shadows, ElevenLabs-inspired)

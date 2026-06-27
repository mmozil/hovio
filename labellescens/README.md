# La Belle Scens — Design System

Catálogo de design system da venture **La Belle Scens** (marketing olfativo, Hovio).
HTML único auto-contido (`index.html`) — tokens + componentes com todos os estados,
na linguagem visual da Maison Dior (off-white / grafite / serifa elegante / grotesca neutra).

Estrutura: catálogo navegável por categorias (Fundamentos · Componentes · Efeitos),
estilo `animate-ui.com`. Tema claro/escuro, scroll-spy, copy de tokens.

## Stack

Estático puro — sem build, sem dependências. Fontes via Google Fonts (fallback livre).

## Tipografia

- **Serif (títulos/marca):** Atacama (Newglyph) — fallback `Cormorant Garamond`
- **Sans (UI/corpo):** Hellix (Displaay) — fallback `Manrope`

> ⚠️ **Atacama e Hellix são PROPRIETÁRIAS** (fontes reais da Dior). Estão `gitignore`das
> (`fonts/*.woff2`) — não são versionadas nem distribuídas. O deploy público usa o
> fallback livre. Para a demo pixel-exata, copie os `.woff2` em `fonts/` localmente.
> **Licenciar (Newglyph / Displaay) antes de qualquer uso de produção.**

## Deploy (Hovio · Coolify)

Padrão Hovio (nginx:alpine + Dockerfile), igual ao hub `hovio.com.br`.

1. Commit no monorepo `github.com/mmozil/hovio`.
2. Nova app Coolify no projeto Hovio (`s88c48s0kg884ck8s0gow440`):
   - Build pack: **Dockerfile**
   - Base directory: `/La Belle Scens/design-system`
   - FQDN: `https://labellescens.hovio.com.br`
3. DNS (zona CF Tier `cfb5bdd17e99fa38aa877aac99f8be29`): A `labellescens` → `46.224.220.223` (proxied).

## Preview local

```bash
python -m http.server 8901   # http://127.0.0.1:8901
```

Espelhado também em `tier-finance` (preview): `/lab/labellescens-ds`.

Fonte canônica deste arquivo: `D:\Project\Hovio\La Belle Scens\design-system\`.

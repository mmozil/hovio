# La Belle Scens — protótipos (site estático, nginx)

Venture **La Belle Scens** (marketing olfativo, hub Hovio). Esta é a **pasta única** do
projeto: deploy LIVE em `https://labellescens.hovio.com.br` + o material de trabalho.

> ℹ️ **Consolidação (jul/2026):** antes existiam duas pastas (`La Belle Scens/` +
> `labellescens/`) com o site **duplicado**. Foram unificadas numa só. Agora o site vive
> **uma vez** (aqui, versionado no git) e o material-fonte não servido foi pra `_source/`
> (gitignorado). Não há mais espelho/cópia do projeto.

## Estrutura

```
labellescens/                 ← pasta única (repo mmozil/hovio · base dir /labellescens)
├── index.html                ← redirect para /painel/ (31/08)    → servido em /
├── hero.html                 ← hero morph                        → /hero.html
├── design-system/            ← DS em rota dedicada               → /design-system/
├── painel/                   ← hub de PLANEJAMENTO (carrossel + materiais) → /painel/
├── planning/                 ← planejamento técnico              → /planning/
├── fluxo/                    ← jornada + proposta                → /fluxo/*
├── img/                      ← imagens servidas (carrossel recortado, cards, etc.)
├── fonts/                    ← .woff2 Dior (gitignorados — proprietários)
├── tema.css · tema.js        ← tema claro/escuro de todo o site (botão = SVG fornecido pelo dono, icon_shadelight.svg, em currentColor; localStorage «lbs-tema»)
├── fonts/fontes.css          ← @font-face único (Atacama/Hellix block+preload; reservas em fonts/livres/)
├── Dockerfile · nginx.conf   ← deploy (nginx:alpine) — ⚠️ arquivo novo na raiz precisa de COPY
└── _source/                  ← 🔒 material de trabalho NÃO servido (gitignorado)
    ├── dior/                 ← scrapes de referência da Maison Dior (base do DS)
    ├── produtos-raw/         ← fotos de produto originais (raw1–5.png) → recortadas pro carrossel
    ├── design-assets/        ← SVGs de card (design; não referenciados no site)
    ├── wireframe/            ← wireframes
    ├── squad-app/            ← protótipo squad
    └── *.pdf                 ← doc de design
```

## Stack

Estático puro — sem build, sem dependências. Fontes Dior (**Atacama**/Newglyph +
**Hellix**/Displaay) são **proprietárias** e gitignoradas (`fonts/*.woff2`); o deploy
público usa o fallback livre (**Cormorant Garamond** + **Hanken Grotesk**).
Licenciar antes de qualquer uso de produção.

## Deploy (Hovio · Coolify)

- Repo `github.com/mmozil/hovio` · **base directory `/labellescens`** · build pack **Dockerfile**.
- Coolify app **`qk08cc8s4kss08cso0kgkgco`** (projeto Hovio `s88c48s0kg884ck8s0gow440`), nginx.
- FQDN `https://labellescens.hovio.com.br` · DNS via wildcard `*.hovio.com.br` (zona CF Tier).
- Deploy: `git push` (webhook) ou
  `curl -H "Authorization: Bearer 5|claude-deploy-token-2026" "https://coolify.tier.finance/api/v1/deploy?uuid=qk08cc8s4kss08cso0kgkgco&force=true"`.
- ⚠️ O Dockerfile copia **pasta por pasta** (`index.html hero.html painel/ fluxo/ fonts/ img/ design-system/`);
  rota/pasta nova precisa de `COPY` próprio, senão cai no fallback `try_files → /index.html`.
  `_source/` é **dockerignorado** — não entra na imagem.

## Preview local

```bash
python -m http.server 8901   # http://127.0.0.1:8901
```

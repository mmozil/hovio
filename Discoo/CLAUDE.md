# CLAUDE.md — Discoo

Grava reunião → transcreve → resume. Venture **Hovio**.
Site: https://discoo.hovio.com.br · Obsidian: `projetos/Hovio/Discoo/`

## O que é

Três formas de capturar áudio, **um motor só**. A captura é a única peça nova — tudo
depois dela já existia do QA de Ligações do Tier.

| Superfície | Onde vive | Para quem |
|---|---|---|
| **Site** | `site/` → `/opt/discoo/site` (nginx estático) | público, sem conta |
| **App Windows** | `main.js` + `renderer/` (Electron 31) | quem grava todo dia |
| **CRM** | `frontend/src/components/tier-empresas/crm/CrmGravarReuniaoModal.tsx` (repo tier-finance) | cliente do ERP |

```
captura → POST → R2 (chave não-enumerável) → faster-whisper (self-hosted) → LLM → resumo
```

🔑 **A assimetria que sustenta o produto:** o STT roda no nosso servidor, então transcrever
custa CPU e mais nada (25 min → 104s). É exatamente o item que Fathom/tl;dv pagam por minuto
ao fornecedor. Dá pra oferecer **transcrição ilimitada** e colocar o medidor **só no resumo**,
que é o único passo que gasta token. Não é preço melhor — é estrutura de custo diferente.

## Rodar

```bash
npm install
npm start              # ou: abrir.vbs (limpa ELECTRON_RUN_AS_NODE antes)
npm run dist           # instalador NSIS em dist/
```

🚨 **`ELECTRON_RUN_AS_NODE=1`** — o VS Code seta essa variável no terminal integrado. Com ela,
`require('electron')` devolve o caminho do .exe em vez do módulo e `app` vem `undefined`.
`abrir.vbs` remove antes de iniciar; num terminal do VS Code, `$env:ELECTRON_RUN_AS_NODE=$null`.

## Estrutura

```
Discoo/
├── main.js              # processo principal: janela, tray, IPC, gravação em disco
├── preload.js           # ponte contextIsolated
├── renderer/
│   ├── index.html       # pílula flutuante + painel + o planeta
│   └── ds.css           # design system (tokens ElevenLabs)
├── site/
│   ├── index.html       # landing + gravador web + transcrição
│   ├── nginx.conf       # ★ charset utf-8
│   └── fonts/           # Hellix + Geist (self-hosted)
├── gravacoes/           # padrão de saída (gitignorado)
└── abrir.vbs            # atalho sem console
```

Backend fica no repo **tier-finance**: `backend/routes/discoo_publico.py`.

## Onde as gravações são salvas

O usuário escolhe (painel → "Pasta das gravações" → `dialog.showOpenDialog`), e a escolha
persiste em `config.json` no `userData`. Padrão: `D:\Project\Hovio\Discoo\gravacoes`; se a
pasta do projeto não existir (outra máquina), cai em `Documents\Discoo`.

## Gotchas

- 🚨 **Gravação incremental não é otimização, é requisito.** Cada pedaço de 5s vai direto pro
  disco (`fs.createWriteStream`), e `before-quit` fecha o fluxo. Em 11/08 **50 minutos foram
  perdidos** porque o app acumulava num array e só escrevia no `stop` — o Electron foi
  reiniciado e o `onstop` nunca disparou. **Nunca reiniciar o app sem confirmar que não está
  gravando.**
- 🚨 **Nada de janela transparente.** O Windows pinta um halo claro atrás dos cantos
  arredondados. A janela **é** a peça: superfície sólida `#fdfcfc`, e o Win11 arredonda sozinho.
- 🚨 **Altura do painel é medida pelo renderer** (`getBoundingClientRect`) e enviada por IPC —
  nunca fixa no main, senão corta quando entra item novo.
- **`setDisplayMediaRequestHandler` com `audio:'loopback'`** entrega o áudio do sistema **sem** o
  diálogo "escolha o que compartilhar". 🚨 **No navegador não existe API pra marcar o botão de
  áudio** — `systemAudio:'include'` só faz o Chrome OFERECER. Por isso o site (a) ensina antes
  com a figura do próprio diálogo, (b) usa `displaySurface:'browser'` pra abrir na aba "Guia do
  Chrome", (c) **não inicia** a gravação quando `getAudioTracks().length === 0` (com "tentar de
  novo" e a saída explícita de gravar só o microfone). Antes ele gravava assim mesmo com um
  aviso vermelho — e a reunião saía só com a própria voz.
- **File System Access** (site): escolhida a pasta, cada pedaço de 5s vai pro disco. O writable
  é aberto **e fechado a cada escrita** — só o `close()` materializa o arquivo; mantendo um
  writable aberto a reunião inteira, fechar a aba perderia tudo igual.
- **O app transcreve sozinho** (`ipcMain.handle('transcrever')`, rota pública). O `enviar` é
  outra coisa: vai pro CRM/Ligações QA e roda o prompt de **avaliação de atendimento**.
- **Instalador não assinado** → SmartScreen mostra "app não reconhecido". Cert OV ~US$200-400/ano,
  só quando distribuir de verdade.

## Backend (repo tier-finance)

**É assíncrono** (`backend/routes/discoo_publico.py`):

| | |
|---|---|
| `POST /api/discoo/transcrever` | multipart `file` + `nivel` (`simples\|padrao\|detalhado`) + `resumir` + `marcas` (CSV de segundos da tecla M) → **202** `{job_id}` em ~4s. Rate limit **6/h por IP**, teto 60 MB |
| `GET /api/discoo/job/{id}` | acompanhamento — `transcrevendo` → `resumindo` → `pronto` (ou `sem_fala`/`erro`). **Sem rate limit**: o cliente consulta de 3 em 3s |
| `POST /api/discoo/job/{id}/resumir` | troca o nível reusando a transcrição — **não re-transcreve** |

Estado no Redis (TTL 24h), memória do processo como reserva. Nada em banco.

### 🚨 O 524 tinha DOIS saltos, não um

O Cloudflare corta qualquer resposta em ~100s. O whisper roda a ~15x tempo real, então
25 min de áudio já levam ~104s — o limite estourava com o tamanho normal de uma reunião.

1. **navegador → backend**: resolvido pelo job assíncrono acima.
2. **backend → Tier Agent**: `api-agent.tier.finance` também é proxied, então o 524 só andou
   um salto. Resolvido falando com o Agent **pelo Traefik local** (`https://coolify-proxy`
   com header `Host: api-agent.tier.finance`, `verify=False`) — o Agent mora na mesma máquina.
   `coolify-proxy` é nome fixo e o Traefik mantém a rota atualizada sozinho quando o Agent
   redeploya; usar o nome do container do Agent não serviria, ele muda a cada deploy.
   Em `services/tier_agent_client.py`, com queda pro caminho público e quarentena de 5 min.
   Desligar: `TIER_AGENT_LOCAL_PROXY_OFF=1`.

Medido em produção: 30 min de áudio → 22 mil caracteres em ~150s, sem 524.

### A ata (18/08) — o contrato de saída é o produto

Os três níveis mudam a prosa; o bloco `## Tarefas` nunca sai:
`- [ ] o que fazer — Responsável · prazo · [mm:ss]`, com **"não atribuído" escrito por
extenso** — chutar um dono é o erro que faz desconfiar da ata inteira. Prompts em `NIVEIS`.
O job devolve `texto_tempo` (transcrição com `[mm:ss]`) e `titulo` (a 1ª linha `# …` da ata).

🔑 **O minuto exigiu mexer no Tier Agent**: `/transcribe` passou a devolver `segments`
(`{inicio,fim,texto}`) — o faster-whisper sempre produziu `start`/`end` e o `_transcribe_file`
jogava fora ao juntar o texto. Campo **opcional**: sem ele a ata sai sem `[mm:ss]` em vez de
falhar. `_texto_com_tempo()` marca a cada ~45s; marca por frase viraria mais carimbo que
conversa. Deploy do Agent é **manual** (Coolify API).

⭐ `marcas` (tecla M) viram ★ no bloco correspondente, e o prompt trata ★ como prioritário.
Cada marca é consumida por **um bloco só** — sem isso ela carimbava todos os seguintes.

### ⬜ O resumo precisa de uma decisão: quem paga

A rota é anônima, então não existe tenant do cliente pra debitar. A ordem é explícita em
`_gerar_resumo`: `DISCOO_LLM_TENANT_ID` (tenant que a Tier banca, via `llm_complete`) →
`OPTIMUS_URL` → **sem resumo**. Hoje **nenhum dos dois está setado** — a transcrição sai
normal e o job volta com `aviso=resumo_falhou`.
⚠️ Ligar `OPTIMUS_URL` tem efeito colateral: adiciona o router `/optimus/*` e vira o
`analysis_provider` do CRM de ligações.

### Outros gotchas

- 🚨 **NUNCA `from __future__ import annotations`** em rota FastAPI com `UploadFile`/`File`/`Form`.
  Ele vira as anotações em ForwardRef, o FastAPI levanta `FastAPIError` no `include_router` e
  **derruba o boot da app inteira** — não só a rota. Produção ficou em 502 por isso em 12/08.
- 🚨 `discoo.hovio.com.br` precisa estar em `BACKEND_CORS_ORIGINS` (`backend/core/config/config.py`),
  senão quebra em silêncio.
- O upload pro R2 vai em `asyncio.to_thread` — o boto3 é síncrono e 60 MB congelariam o event
  loop do backend **inteiro**, não só a requisição.
- Job sem heartbeat há 20 min vira `erro` em vez de girar pra sempre (é o que acontece quando o
  container reinicia no meio).

## Deploy do site

**Fora do Coolify** — mesmo padrão do `pdv.tier.finance` e do `pricing.hovio.com.br`:

```bash
scp -r site/* root@46.224.220.223:/opt/discoo/site/
ssh root@46.224.220.223 "docker restart discoo"   # só se mexer no nginx.conf
```

Mexeu no `nginx.conf`? `scp` para `/opt/discoo/nginx.conf` e
`docker exec discoo nginx -t && docker exec discoo nginx -s reload` (testa antes de recarregar).

Container `discoo` (nginx:alpine, `--memory=64m`, rede `coolify`), Traefik em
`/data/coolify/proxy/dynamic/discoo.yml`, DNS Cloudflare **proxied** (zona `hovio.com.br`).
- 🚨 `charset utf-8;` no nginx.conf — sem ele o browser cai em latin-1 e todo acento vira mojibake.
- 🚨 **Arquivo com extensão tem `try_files $uri =404`.** Só com o fallback de SPA, qualquer
  asset que não subiu volta **200 com o HTML da página dentro** — deploy pela metade que ninguém
  percebe. Foi assim que um `icon-180.png` já apagado continuava "existindo".

## Design

📐 **A página do design system está em `https://discoo.hovio.com.br/ds`**
(fonte: `site/ds/index.html`, `noindex` por header do nginx). Lateral de 256px com grupos
colapsáveis e item ativo seguindo a rolagem — organização copiada do `/lab/animate-ui` do Tier.
Cobre cor · tipografia · raio · espaço · movimento · marca · 9 componentes · o orbe.

🚨 **A última seção é "Onde site e app discordam" — 18 divergências levantadas contra o código.**
Não é enfeite: o site e o app afirmam coisas diferentes sobre a mesma peça (fonte do corpo,
peso do display, altura do botão, namespace dos tokens, sombra do planeta…). **Nenhuma está
resolvida** — resolver exige escolher um lado. A página existe para essa decisão ser tomada
olhando os dois valores lado a lado, não de memória.
- Os tokens da página são **copiados sem alteração** dos dois arquivos. Mudou o produto, mudar
  aqui — não há import, é duplicação consciente (a página é estática e sem build).
- 🚨 `<span>` dentro de `<button>` é **inline**: `height` e `margin-top` são ignorados e a peça
  colapsa numa linha. As amostras de cor precisam de `display:block` explícito.

Referência é **o site do ElevenLabs** (claro), não o tema escuro do produto.

- Papel quente `#fdfcfc` (branco puro fica clínico) · superfície `#f5f3f1` · cinza **quente**
  `#777169` · borda capilar de 1px no lugar de sombra · botão pílula 9999px · card 20px
- Acento (violeta `#0447ff`, laranja `#ff4704`) **só em elemento de produto**, nunca em cromo
- **O planeta:** base `radial-gradient at 32% 26%` (luz vinda de um ponto) + duas nébulas
  borradas em `mix-blend-mode:screen` derivando em **13s e 17s** — tempos que não batem, então
  o desenho nunca repete — + sombra interna na borda (curvatura). Gravando, a nébula esquenta
  pro laranja e acelera pra 6s.
  Descartados: conic-gradient chapado (não lê como esfera, falta ponto de luz) e sulcos de
  vinil desenhados (redundantes — disco preto já lê como vinil).
- Tipografia: Hellix no corpo, display em SF Pro nos aparelhos Apple via `-apple-system` e
  Geist no Windows. 🚨 **SF Pro não pode ser embarcada** — a licença da Apple restringe a
  plataformas Apple.

### Ícone

O planeta é a marca, e o favicon é ele — não um logo encolhido. Gerado por
`scripts/gerar_favicon.py` (numpy + Pillow), que **recalcula o CSS da pílula pixel a pixel**:
mesma base `radial-gradient at 32% 26%`, mesmas duas nébulas com `screen` e borrão, mesma sombra
de borda. Rodar de novo só se o planeta mudar:

```bash
python scripts/gerar_favicon.py site
```

- `site/favicon.svg` — vetor, para navegador moderno · `site/favicon.ico` — 6 tamanhos
  (16→256), reserva e atalhos do Windows · `site/apple-touch-icon.png` — 180px **opaco** sobre
  papel `#fdfcfc` (o iOS ignora transparência) · `icone.ico` na raiz — janela do app e instalador.
- **A marca do topo do site É o `favicon.svg`** (`<img class="p" src="/favicon.svg">`), não um
  círculo redesenhado em CSS — arquivo único, ícone e logo não divergem. O brilho usa
  `filter:drop-shadow`, não `box-shadow`: o primeiro segue o círculo do SVG, o segundo
  acompanharia a caixa quadrada do elemento. O app não tem marca no topo — lá a pílula é o orbe.
- 🚨 **Nos tamanhos pequenos a nébula é reforçada** (16px = 1,9× · 32px = 1,5×). Sem isso o
  borrão some na redução e sobra um ponto quase preto, que **desaparece na aba de tema escuro**.
- 🚨 **Não trocar o ícone da bandeja pelo planeta.** O tray vive sobre a barra escura do Windows
  e usa peça clara desenhada em memória (`iconeTier` no `main.js`), com miolo laranja ao gravar.
  Planeta preto ali some.
- Trocou o ícone do app? O instalador precisa de `npm run dist` — o `.exe` publicado não muda
  sozinho.

## Decisões

- **Não é feature do Echo.** Echo é documento→voz (TTS); Discoo é voz→documento (STT). Fluxo
  inverso, usuário diferente — juntar seria agrupar por tecnologia em vez de por problema.
- **Zenvia/NVoip não são alternativa** — são telefonia. Ligação e reunião são capturas
  diferentes que terminam no mesmo motor.
- **Como gravador avulso o Discoo perde** pra Fathom e tl;dv. O diferencial é o CRM embaixo:
  *"seu CRM ouve suas reuniões"*, não *"gravamos sua reunião"*.
- **Bot que entra na chamada** (tipo tl;dv) fica pra quando alguém pagar: exige Recall.ai a
  US$ 0,50/h ou Chrome headless no servidor — que já congelou a máquina por RAM.

## Pendente

⬜ **Decidir quem paga o resumo** (`DISCOO_LLM_TENANT_ID` ou `OPTIMUS_URL`) — sem isso o site
entrega só a transcrição · assinatura de código · atualização automática · diarização (o
whisper devolve texto corrido, sem quem falou) · cobrança/medidor no resumo.

## Histórico

- **12/08** — job assíncrono + atalho pelo Traefik: o 524 acabou nos dois saltos. Descoberto no
  caminho que **o JS do site estava quebrado desde a publicação**: uma string com aspas simples
  tinha quebra de linha de verdade dentro (no `.md` de download), e o erro de sintaxe matava o
  bloco inteiro — a página nunca gravou nada para ninguém. Hoje o deploy do site passa por
  `new Function()` antes do `scp`.

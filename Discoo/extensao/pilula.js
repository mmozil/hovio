/**
 * A pílula — dentro da página da reunião.
 *
 * A diferença de desenho em relação ao app do Windows: ela não flutua POR CIMA
 * da reunião, ela nasce DENTRO dela. Some a janela solta, some o problema de
 * "em que monitor ficou", e o que reage ao áudio está no mesmo lugar onde a
 * conversa acontece.
 *
 * 🚨 Tudo vive num shadow root fechado ao CSS da página. O Meet reescreve
 * layout o tempo todo e tem folha de estilo agressiva: sem shadow DOM, a peça
 * herda fonte, tamanho e box-sizing de onde ninguém controla.
 *
 * 🚨 A pílula NÃO consegue iniciar a captura sozinha. `getMediaStreamId` exige
 * invocação do usuário na aba, e clique em elemento injetado por content script
 * não conta — só clique no ícone da extensão ou atalho de comando. Então o
 * primeiro começo é pedido explicitamente, uma vez por aba; depois disso a
 * permissão vale e a pílula manda em tudo (parar, marcar, regravar).
 */

if (!document.getElementById('discoo-pilula')) criar();

function criar() {
  const hospede = document.createElement('div');
  hospede.id = 'discoo-pilula';
  hospede.style.cssText = 'all:initial;position:fixed;z-index:2147483647';
  const raiz = hospede.attachShadow({ mode: 'open' });
  raiz.innerHTML = `<style>${estilo()}</style>${marcacao()}`;
  (document.body || document.documentElement).appendChild(hospede);
  ligar(raiz);
  // deixa o id legível de fora: é como o teste automatizado encontra a extensão
  document.documentElement.dataset.discoo = chrome.runtime.id;
}

function estilo() {
  return `
:host{ all:initial }
*{ box-sizing:border-box; margin:0; padding:0; font-family:-apple-system,'Segoe UI',Roboto,sans-serif }
:host, .raiz{
  --papel:#fdfcfc; --sup-1:#f5f3f1; --sup-2:#efece9; --sup-3:#e7e3df;
  --linha:rgba(0,0,0,.08); --linha-forte:rgba(0,0,0,.16);
  --tinta-1:#0a0a0a; --tinta-2:#777169; --tinta-3:#a8a29b;
  --violeta:#0447ff; --laranja:#ff4704;
  --mono:ui-monospace,'SF Mono',Consolas,monospace;
}
.raiz{ position:fixed; right:16px; bottom:96px; display:flex; flex-direction:column;
  align-items:flex-end; gap:8px; color:var(--tinta-1); font-size:13.5px; line-height:1.5 }
button{ border:0; background:none; cursor:pointer; font:inherit; color:inherit }

.pilula{ display:flex; align-items:center; gap:11px; background:var(--papel);
  border:1px solid var(--linha); border-radius:9999px; padding:8px 8px 8px 15px;
  box-shadow:0 6px 24px rgba(0,0,0,.10) }
.rotulo{ font-size:13px; white-space:nowrap }
.rotulo b{ font-weight:500 }
.cron{ font:500 14px/1 var(--mono); font-variant-numeric:tabular-nums; letter-spacing:-.01em }
.fontes{ display:flex; gap:11px; font-size:11px; color:var(--tinta-2); margin-top:3px }
.fontes span{ display:flex; align-items:center; gap:5px }
.pt{ width:6px; height:6px; border-radius:50%; background:var(--sup-3) }
.pt.viva{ background:#22a06b }
.meio{ display:flex; flex-direction:column }

.disco{ width:34px; height:34px; border-radius:50%; flex:none; position:relative; cursor:pointer;
  background:radial-gradient(circle at 32% 26%,#34343f 0%,#17171e 42%,#0a0a0d 100%);
  box-shadow:inset -3px -5px 12px rgba(0,0,0,.7), 0 0 0 0 rgba(255,71,4,0);
  transition:box-shadow .25s cubic-bezier(.4,0,.2,1), transform .09s ease-out }
.disco::after{ content:''; position:absolute; inset:41%; border-radius:50%; background:var(--papel);
  transition:inset .25s, border-radius .25s }
.disco.gravando{ box-shadow:inset -3px -5px 12px rgba(0,0,0,.7), 0 0 0 4px rgba(255,71,4,.14) }
.disco.gravando::after{ inset:36%; border-radius:3px }

.acao{ height:28px; padding:0 13px; border-radius:9999px; font-size:12.5px; font-weight:500;
  background:var(--tinta-1); color:var(--papel); white-space:nowrap }
.acao.fant{ background:transparent; color:var(--tinta-1); box-shadow:inset 0 0 0 1px var(--linha-forte) }
.acao.fant:hover{ background:var(--sup-1) }
.icone{ width:28px; height:28px; border-radius:9999px; display:grid; place-items:center;
  color:var(--tinta-2); font-size:13px }
.icone:hover{ background:var(--sup-1); color:var(--tinta-1) }

.cartao{ width:340px; background:var(--papel); border:1px solid var(--linha); border-radius:16px;
  padding:16px 18px; box-shadow:0 10px 40px rgba(0,0,0,.14) }
.rot{ font-size:9.5px; letter-spacing:.09em; text-transform:uppercase; color:var(--tinta-3) }
.item{ display:flex; align-items:center; justify-content:space-between; gap:10px;
  background:var(--sup-1); border-radius:9px; padding:9px 11px; margin-top:6px; font-size:13px }
.item.clic{ cursor:pointer }
.item.clic:hover{ background:var(--sup-2) }
.sw{ width:30px; height:18px; border-radius:9999px; background:var(--sup-3); position:relative; flex:none }
.sw::after{ content:''; position:absolute; top:2px; left:2px; width:14px; height:14px; border-radius:50%;
  background:var(--papel); box-shadow:0 1px 2px rgba(0,0,0,.18); transition:.2s }
.sw.on{ background:var(--tinta-1) } .sw.on::after{ transform:translateX(12px) }
.chips{ display:flex; gap:5px; margin-top:8px }
.chip{ height:24px; padding:0 10px; border-radius:9999px; font-size:11.5px; color:var(--tinta-2);
  box-shadow:inset 0 0 0 1px var(--linha) }
.chip.on{ background:var(--tinta-1); color:var(--papel); box-shadow:none }
.linha{ display:flex; gap:7px; align-items:center; flex-wrap:wrap; margin-top:14px }
.nota{ font-size:11.5px; color:var(--tinta-3); margin-top:10px }
.passo{ display:flex; gap:9px; align-items:flex-start; font-size:12.5px; color:var(--tinta-2); margin-top:9px }
.n{ flex:none; width:17px; height:17px; border-radius:9999px; background:var(--sup-1); color:var(--tinta-2);
  font-size:9.5px; display:grid; place-items:center; margin-top:2px }

/* a ata */
.ata{ max-height:min(52vh,420px); overflow-y:auto; margin-top:12px; font-size:13px; line-height:1.6 }
.ata h1{ font-size:16px; font-weight:600; letter-spacing:-.015em; margin-bottom:2px }
.ata h2{ font-size:9.5px; letter-spacing:.09em; text-transform:uppercase; color:var(--tinta-3);
  font-weight:400; margin:16px 0 7px }
.ata h3{ font-size:13px; font-weight:600; margin:12px 0 4px }
.ata p{ margin-bottom:8px }
.ata ul{ list-style:none }
.ata li{ padding:6px 0 6px 14px; position:relative; border-bottom:1px solid var(--linha) }
.ata li:last-child{ border-bottom:0 }
.ata li::before{ content:''; position:absolute; left:2px; top:13px; width:4px; height:4px;
  border-radius:50%; background:var(--tinta-3) }
.ata li.tarefa{ display:grid; grid-template-columns:auto 1fr; gap:9px; padding-left:0; align-items:start }
.ata li.tarefa::before{ display:none }
.cx{ width:15px; height:15px; border-radius:4px; box-shadow:inset 0 0 0 1px var(--linha-forte);
  flex:none; margin-top:3px }
.meta{ display:flex; gap:6px; flex-wrap:wrap; align-items:center; font-size:11.5px;
  color:var(--tinta-2); margin-top:2px }
.meta .min, .ata .min{ font:10.5px var(--mono); color:var(--violeta) }
.meta .sem{ color:var(--tinta-3); font-style:italic }
.meta .est{ color:var(--laranja) }
.ata em{ font-style:normal; color:var(--tinta-3) }
.oculto{ display:none !important }
`;
}

function marcacao() {
  return `
<div class="raiz">
  <div class="cartao oculto" id="cartao"></div>
  <div class="pilula">
    <div class="meio">
      <span class="rotulo" id="rotulo"><b>Gravar</b> esta reunião</span>
      <span class="fontes oculto" id="fontes">
        <span><i class="pt" id="ptAba"></i>reunião</span>
        <span><i class="pt" id="ptMic"></i>microfone</span>
      </span>
    </div>
    <button class="acao fant oculto" id="btnMarcar" title="marcar este momento">★</button>
    <button class="acao oculto" id="btnParar">Parar</button>
    <button class="icone" id="btnOpcoes" title="opções">•••</button>
    <div class="disco" id="disco" title="gravar"></div>
  </div>
</div>`;
}

function ligar(raiz) {
  const $ = (id) => raiz.getElementById(id);
  const mostrar = (el, v) => el.classList.toggle('oculto', !v);
  const dois = (n) => String(n).padStart(2, '0');
  const mmss = (s) => `${dois(Math.floor(s / 60))}:${dois(Math.floor(s % 60))}`;
  const aoSw = (tipo, extra) => chrome.runtime.sendMessage({ para: 'sw', tipo, ...(extra || {}) });

  let tela = 'repouso';      // repouso | gesto | gravando | trabalhando | ata
  let cartao = null;         // o que o cartao mostra: opcoes | gesto | ata | null
  let opcoes = { mic: true, nivel: 'padrao', transcrever: true };
  let ultima = null;
  let base = '';

  // ── as telas ─────────────────────────────────────────────────────────────
  function pintar(estado) {
    const gravando = tela === 'gravando';
    $('disco').classList.toggle('gravando', gravando);
    mostrar($('fontes'), gravando);
    mostrar($('btnMarcar'), gravando);
    mostrar($('btnParar'), gravando);
    mostrar($('btnOpcoes'), tela === 'repouso');
    if (gravando && estado) {
      $('rotulo').innerHTML = `<span class="cron">${mmss(estado.segundos || 0)}</span>`;
      $('ptAba').classList.toggle('viva', (estado.picoAba || 0) > 4);
      $('ptMic').classList.toggle('viva', (estado.picoMic || 0) > 4);
    }
    if (tela === 'repouso') $('rotulo').innerHTML = '<b>Gravar</b> esta reunião';
    if (tela === 'trabalhando') $('rotulo').textContent = 'montando a ata…';
  }

  function abrirOpcoes() {
    $('cartao').innerHTML = `
      <div class="rot">Antes de gravar</div>
      <div class="item clic" data-a="mic"><span>Meu microfone</span><div class="sw ${opcoes.mic ? 'on' : ''}"></div></div>
      <div class="item clic" data-a="transcrever"><span>Gerar a ata ao parar</span><div class="sw ${opcoes.transcrever ? 'on' : ''}"></div></div>
      <div class="chips">
        ${['simples', 'padrao', 'detalhado'].map((n) => `<button class="chip ${opcoes.nivel === n ? 'on' : ''}" data-nivel="${n}">${n === 'padrao' ? 'ata' : n}</button>`).join('')}
      </div>
      <div class="nota">A sua voz vem do microfone — ela não passa pela saída de som da reunião.
      Se ele ficar mudo, <a href="#" data-a="permissao">libere o microfone</a>.</div>
      <div class="linha"><button class="acao fant" data-a="fechar">Fechar</button></div>`;
    cartao = 'opcoes';
    mostrar($('cartao'), true);
  }

  /** 🚨 A tela que a plataforma obriga: sem clique no ícone (ou atalho) o Chrome
   *  não deixa capturar a aba. Uma vez por aba — depois a pílula manda sozinha. */
  function pedirGesto(motivo) {
    tela = 'gesto';
    $('cartao').innerHTML = `
      <div class="rot">Falta um clique</div>
      <div class="passo"><span class="n">1</span><span>Clique no ícone do <b>Discoo</b> na barra do
      navegador, ao lado da barra de endereço.</span></div>
      <div class="passo"><span class="n">2</span><span>Ou use o atalho <b>Ctrl+Shift+Y</b>.</span></div>
      <div class="nota">O Chrome só deixa gravar a aba depois que você chama a extensão nela — é uma
      vez por reunião. Daqui pra frente, parar, marcar e regravar acontecem por aqui.</div>
      ${motivo ? `<div class="nota">${escapar(motivo)}</div>` : ''}
      <div class="linha"><button class="acao fant" data-a="fechar">Entendi</button></div>`;
    cartao = 'gesto';
    mostrar($('cartao'), true);
    pintar();
  }

  function mostrarAta(r) {
    tela = 'ata';
    ultima = r;
    const marcadas = (r.marcas || []).length;
    $('cartao').innerHTML = `
      <div class="rot">A ata${marcadas ? ` · ${marcadas} momento${marcadas > 1 ? 's' : ''} marcado${marcadas > 1 ? 's' : ''}` : ''}</div>
      <div class="ata">${r.resumo ? renderAta(r.resumo) : '<p>A ata não ficou pronta desta vez — a transcrição está no arquivo.</p>'}</div>
      <div class="linha">
        <button class="acao" data-a="copiar">Copiar markdown</button>
        <button class="acao fant" data-a="baixar">Baixar .md</button>
        <button class="acao fant" data-a="fechar">Fechar</button>
      </div>`;
    cartao = 'ata';
    mostrar($('cartao'), true);
    pintar();
  }

  // ── ações ────────────────────────────────────────────────────────────────
  async function comecar() {
    const r = await aoSw('iniciar').catch((e) => ({ ok: false, erro: String(e) }));
    if (r && r.ok) {
      tela = 'gravando'; base = (r.arquivo || '').replace(/\.webm$/, '');
      mostrar($('cartao'), false); cartao = null;
      if (r.semMic && opcoes.mic) avisarMic();
      pintar(r);
      return;
    }
    const erro = (r && r.erro) || '';
    // "has not been invoked" é a regra do activeTab, não um defeito: vira instrução
    if (/invoked|activeTab/i.test(erro)) pedirGesto();
    else pedirGesto(erro);
  }

  function avisarMic() {
    $('cartao').innerHTML = `
      <div class="rot">Sem o seu microfone</div>
      <div class="nota">Estou gravando a reunião, mas a sua voz não está entrando: o microfone não foi
      liberado para a extensão. <a href="#" data-a="permissao">Liberar agora</a> — a próxima gravação já vem completa.</div>
      <div class="linha"><button class="acao fant" data-a="fechar">Ok</button></div>`;
    mostrar($('cartao'), true);
  }

  async function parar() {
    tela = 'trabalhando';
    pintar();
    const r = await aoSw('parar').catch(() => null);
    if (!r || !r.ok) { tela = 'repouso'; pintar(); return; }
    if (!opcoes.transcrever) {
      tela = 'repouso'; $('rotulo').innerHTML = `<b>Salvo</b> · ${mmss(r.duracao || 0)}`;
      pintar(); return;
    }
    $('rotulo').textContent = 'transcrevendo…';
    const t = await aoSw('transcrever').catch(() => null);
    if (t && t.ok) mostrarAta({ ...t, marcas: t.marcas || [] });
    else {
      tela = 'repouso';
      $('rotulo').textContent = (t && t.erro) || 'não consegui transcrever';
      setTimeout(() => { if (tela === 'repouso') pintar(); }, 6000);
    }
  }

  function montarMd() {
    if (!ultima) return '';
    const d = new Date();
    const marcadas = (ultima.marcas || []).map((s) => `- ★ ${mmss(s)}`).join('\n');
    const bloco = marcadas ? `\n## Momentos marcados\n\n${marcadas}\n` : '';
    return `---
titulo: ${ultima.titulo || 'Reunião'}
data: ${d.toISOString().slice(0, 10)}
duracao: ${Math.max(1, Math.round((ultima.duracao || 0) / 60))} min
audio: ${ultima.arquivo || ''}
gerado_por: Discoo
---

${ultima.resumo || '(sem ata)'}
${bloco}
---

## Transcrição

${ultima.texto || ''}
`;
  }

  // ── eventos ──────────────────────────────────────────────────────────────
  $('disco').onclick = () => {
    if (tela === 'gravando') parar();
    else if (tela !== 'trabalhando') comecar();
  };
  $('btnParar').onclick = () => parar();
  $('btnOpcoes').onclick = () => {
    // 🚨 alterna SÓ as opções: com a ata aberta, o clique aqui antes apenas
    // escondia o cartão, e parecia que o botão não fazia nada
    if (cartao === 'opcoes') { mostrar($('cartao'), false); cartao = null; }
    else abrirOpcoes();
  };
  $('btnMarcar').onclick = async () => {
    const r = await aoSw('marcar').catch(() => null);
    if (!r || !r.ok) return;
    $('btnMarcar').textContent = '★ ' + r.em;
    setTimeout(() => { $('btnMarcar').textContent = '★'; }, 2000);
  };

  $('cartao').addEventListener('click', async (e) => {
    const alvo = e.target.closest('[data-a],[data-nivel]');
    if (!alvo) return;
    e.preventDefault();
    const nivel = alvo.dataset.nivel;
    if (nivel) { opcoes.nivel = nivel; await aoSw('opcoes', { novas: { nivel } }); abrirOpcoes(); return; }
    const acao = alvo.dataset.a;
    if (acao === 'fechar') {
      mostrar($('cartao'), false); cartao = null;
      if (tela === 'gesto' || tela === 'ata') { tela = 'repouso'; pintar(); }
      return;
    }
    if (acao === 'mic' || acao === 'transcrever') {
      opcoes[acao] = !opcoes[acao];
      await aoSw('opcoes', { novas: { [acao]: opcoes[acao] } });
      abrirOpcoes();
      return;
    }
    if (acao === 'permissao') { await aoSw('permissao'); return; }
    if (acao === 'copiar') {
      try { await navigator.clipboard.writeText(montarMd()); alvo.textContent = 'Copiado'; }
      catch (err) { alvo.textContent = 'não deu — baixe o .md'; }
      setTimeout(() => { alvo.textContent = 'Copiar markdown'; }, 1800);
      return;
    }
    if (acao === 'baixar') {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([montarMd()], { type: 'text/markdown' }));
      a.download = (base || 'reuniao') + '.md';
      a.click();
    }
  });

  // o offscreen avisa em que pé está a transcrição (ela leva minutos)
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.para !== 'pilula') return;
    if (msg.tipo === 'andamento' && tela === 'trabalhando') {
      $('rotulo').textContent = msg.estado === 'resumindo' ? 'montando a ata…' : 'transcrevendo…';
    }
  });

  // ── batida ───────────────────────────────────────────────────────────────
  // Pergunta o estado de verdade em vez de contar o tempo aqui: a gravação pode
  // ter começado pelo ícone antes desta pílula existir, ou noutra aba.
  async function bater() {
    if (document.hidden) return;
    const e = await aoSw('estado').catch(() => null);
    if (!e) return;
    if (e.gravando && tela !== 'gravando') { tela = 'gravando'; mostrar($('cartao'), false); cartao = null; }
    if (!e.gravando && tela === 'gravando') { tela = 'repouso'; }
    if (tela === 'gravando' || tela === 'repouso') pintar(e);
  }
  setInterval(bater, 1000);

  aoSw('opcoes').then((r) => { if (r && r.opcoes) opcoes = { ...opcoes, ...r.opcoes }; }).catch(() => {});
  bater();
  pintar();
}

// ── markdown mínimo, tarefas em destaque (o mesmo do site) ─────────────────
const escapar = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const enfeitar = (t) => escapar(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/_(.+?)_/g, '<em>$1</em>');
const comMinuto = (t) => enfeitar(t).replace(/\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g, '<span class="min">[$1]</span>');

function renderAta(md) {
  const linhas = String(md || '').split(/\r?\n/);
  let html = '', lista = false;
  const fecha = () => { if (lista) { html += '</ul>'; lista = false; } };
  for (const bruta of linhas) {
    const l = bruta.trim();
    if (!l) { fecha(); continue; }
    if (l.startsWith('### ')) { fecha(); html += `<h3>${enfeitar(l.slice(4))}</h3>`; continue; }
    if (l.startsWith('## ')) { fecha(); html += `<h2>${enfeitar(l.slice(3))}</h2>`; continue; }
    if (l.startsWith('# ')) { fecha(); html += `<h1>${enfeitar(l.slice(2))}</h1>`; continue; }
    const tarefa = l.match(/^-\s*\[( |x|X)\]\s*(.+)$/);
    if (tarefa) {
      if (!lista) { html += '<ul>'; lista = true; }
      html += `<li class="tarefa"><div class="cx"></div><div>${linhaTarefa(tarefa[2])}</div></li>`;
      continue;
    }
    if (l.startsWith('- ') || l.startsWith('* ')) {
      if (!lista) { html += '<ul>'; lista = true; }
      html += `<li>${comMinuto(l.slice(2))}</li>`;
      continue;
    }
    fecha();
    html += `<p>${comMinuto(l)}</p>`;
  }
  fecha();
  return html;
}

function linhaTarefa(t) {
  const partes = String(t).split(/\s+—\s+|\s+--\s+/);
  const oque = partes.shift();
  const resto = partes.join(' — ');
  if (!resto) return `<div>${comMinuto(oque)}</div>`;
  const metas = resto.split(/\s*·\s*/).filter(Boolean).map((m) => {
    const min = m.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?)\]$/);
    if (min) return `<span class="min">[${min[1]}]</span>`;
    if (m.indexOf('★') >= 0) return `<span class="est">${escapar(m)}</span>`;
    if (/^n[ãa]o atribu/i.test(m)) return `<span class="sem">${escapar(m)}</span>`;
    return `<span>${escapar(m)}</span>`;
  });
  return `<div>${enfeitar(oque)}</div><div class="meta">${metas.join('<span>·</span>')}</div>`;
}

/**
 * Discoo — gravador de reuniões (Hovio). Processo principal.
 *
 * Pílula flutuante sempre por cima + ícone na bandeja. Grava o áudio do sistema
 * (a voz dos outros na reunião) e, opcionalmente, o microfone. Ao parar, envia
 * pro ERP, que transcreve e analisa.
 *
 * 🔑 Dois pontos que fazem este app existir em vez de uma aba no navegador:
 *
 * 1. `setDisplayMediaRequestHandler` com `audio:'loopback'` entrega o áudio do
 *    sistema SEM abrir a janela "escolha o que compartilhar" — o passo em que o
 *    usuário esquece de marcar "compartilhar áudio" e grava silêncio. No
 *    navegador não tem contorno.
 * 2. A janela flutua sobre tela cheia, então a gravação fica visível durante a
 *    apresentação.
 *
 * 🚨 SEM janela transparente. Tentado com `transparent:true` e o Windows insistia
 * em pintar fundo claro atrás dos cantos arredondados (halo em volta da pílula).
 * A janela agora É a peça: superfície sólida e o Win11 arredonda a moldura.
 */
const { app, BrowserWindow, Tray, Menu, ipcMain, desktopCapturer, shell, screen, nativeImage, session, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const LARGURA = 236;
const ALTURA_FECHADA = 58;
const API = process.env.TIER_API_URL || 'https://api.tier.finance/api';

let janela = null;
let bandeja = null;
let gravando = false;

/**
 * Onde as gravações são salvas. O usuário escolhe — a pasta fica em config.json
 * e o painel mostra qual é. Enfiar arquivo em Documentos sem perguntar é o tipo
 * de decisão que o dono do computador deveria tomar, não o app.
 *
 * Default: a pasta do projeto Hovio, quando existir na máquina (é o caso da
 * estação de desenvolvimento). Em máquina de usuário final cai em Documentos.
 */
const PADRAO_HOVIO = path.join('D:', 'Project', 'Hovio', 'Discoo', 'gravacoes');
function pastaPadrao() {
  try {
    if (fs.existsSync(path.dirname(PADRAO_HOVIO))) return PADRAO_HOVIO;
  } catch { /* disco D: pode não existir */ }
  return path.join(os.homedir(), 'Documents', 'Discoo');
}
function pastaAtual() {
  return (lerConfig().pasta) || pastaPadrao();
}
function garantirPasta() {
  const dir = pastaAtual();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ── configuração persistida (token, pasta, preferências) ────────────────────
const arquivoConfig = () => path.join(app.getPath('userData'), 'config.json');
function lerConfig() {
  try { return JSON.parse(fs.readFileSync(arquivoConfig(), 'utf8')); } catch { return {}; }
}
function gravarConfig(patch) {
  const atual = lerConfig();
  const novo = { ...atual, ...patch };
  fs.writeFileSync(arquivoConfig(), JSON.stringify(novo, null, 2));
  return novo;
}

/** Ícone desenhado em memória — evita depender de .ico versionado. */
function iconeTier(ativo) {
  // bandeja vive sobre a barra do Windows (escura): peça clara com miolo que
  // vira laranja ao gravar — mesmo vocabulário do botão da pílula
  const cor = ativo ? '%23ff4704' : '%230a0a0a';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">` +
    `<circle cx="16" cy="16" r="12" fill="${cor}"/>` +
    `<circle cx="16" cy="16" r="7" fill="none" stroke="%23ffffff" stroke-opacity=".18" stroke-width="1"/></svg>`;
  return nativeImage.createFromDataURL('data:image/svg+xml;utf8,' + svg);
}

function criarJanela() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  janela = new BrowserWindow({
    width: LARGURA,
    height: ALTURA_FECHADA,
    x: width - LARGURA - 24,
    y: height - ALTURA_FECHADA - 24,
    frame: false,
    transparent: false,
    backgroundColor: '#fdfcfc',     // papel quente — a janela é a superfície
    icon: path.join(__dirname, 'icone.ico'),  // o planeta (alt-tab e instalador)
    hasShadow: true,
    roundedCorners: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  janela.setAlwaysOnTop(true, 'screen-saver');
  janela.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // 🚨 show() EXPLÍCITO, mesmo com `show: true` (o padrão). Quem inicia o app
  // decide o estado da PRIMEIRA janela via STARTUPINFO, e o Windows vence o
  // Electron nessa: lançado por um atalho/script que pede SW_HIDE, o app sobe,
  // o `isVisible()` responde `true` e a janela NUNCA aparece na tela. Foi o que
  // aconteceu em 17/08 com o `abrir.vbs` (corrigido lá também) — e o sintoma é
  // cruel, porque nada falha: processo de pé, bandeja viva, tela vazia.
  janela.once('ready-to-show', () => janela.show());
  janela.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  janela.on('closed', () => (janela = null));
}

function criarBandeja() {
  bandeja = new Tray(iconeTier(false));
  atualizarBandeja();
  bandeja.on('click', () => (janela ? (janela.isVisible() ? janela.hide() : janela.show()) : criarJanela()));
}

function atualizarBandeja() {
  if (!bandeja) return;
  bandeja.setImage(iconeTier(gravando));
  bandeja.setToolTip(gravando ? 'Discoo — gravando' : 'Discoo');
  bandeja.setContextMenu(Menu.buildFromTemplate([
    { label: gravando ? 'Parar gravação' : 'Iniciar gravação',
      click: () => janela?.webContents.send('alternar-gravacao') },
    { type: 'separator' },
    { label: 'Mostrar/ocultar', click: () => (janela?.isVisible() ? janela.hide() : janela?.show()) },
    { label: 'Abrir pasta das gravações', click: () => shell.openPath(garantirPasta()) },
    { type: 'separator' },
    { label: 'Sair', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
}

app.whenReady().then(() => {
  garantirPasta();

  // Áudio do sistema direto, sem picker.
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] })
      .then((fontes) => callback({ video: fontes[0], audio: 'loopback' }))
      .catch(() => callback({}));
  }, { useSystemPicker: false });

  criarJanela();
  criarBandeja();
});

app.on('window-all-closed', (e) => e.preventDefault());   // vive na bandeja

// ── IPC ─────────────────────────────────────────────────────────────────────

ipcMain.on('estado', (_e, emGravacao) => { gravando = emGravacao; atualizarBandeja(); });

/** A interface mede o próprio conteúdo — altura fixa no main corta o painel. */
ipcMain.on('altura', (_e, px) => {
  if (!janela) return;
  const nova = Math.max(ALTURA_FECHADA, Math.min(560, Math.ceil(px)));
  const b = janela.getBounds();
  // cresce pra cima: a peça mora no canto de baixo
  janela.setBounds({ x: b.x, y: b.y - (nova - b.height), width: LARGURA, height: nova });
});

/**
 * 🚨 Gravação incremental. Cada pedaço de 5s vai DIRETO pro disco.
 *
 * Antes os pedaços ficavam num array em memória e só viravam arquivo no stop —
 * então qualquer queda (app fechado, Windows atualizando, falta de energia)
 * levava a gravação inteira junto. Aconteceu: 50 minutos perdidos em 11/08.
 * Agora uma queda custa, no máximo, os últimos 5 segundos.
 *
 * Concatenar os pedaços de um MESMO MediaRecorder gera webm válido: o primeiro
 * traz o cabeçalho e os seguintes são clusters em sequência.
 */
let fluxo = null;
let caminhoAtual = null;

ipcMain.handle('abrir-arquivo', () => {
  const dir = garantirPasta();
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  caminhoAtual = path.join(dir,
    `reuniao_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}h${p(d.getMinutes())}.webm`);
  fluxo = fs.createWriteStream(caminhoAtual, { flags: 'a' });
  return caminhoAtual;
});

ipcMain.on('pedaco', (_e, buffer) => {
  if (!fluxo) return;
  fluxo.write(Buffer.from(buffer));   // grava e já libera a memória do renderer
});

ipcMain.handle('fechar-arquivo', async () => {
  if (!fluxo) return caminhoAtual;
  await new Promise((ok) => fluxo.end(ok));
  fluxo = null;
  const c = caminhoAtual;
  caminhoAtual = null;
  return c;
});

/** Encerra o arquivo se o app for fechado no meio — salva o que já entrou. */
app.on('before-quit', () => { if (fluxo) { fluxo.end(); fluxo = null; } });

ipcMain.handle('salvar', async (_e, buffer, extensao) => {
  const dir = garantirPasta();
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const nome = `reuniao_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}h${p(d.getMinutes())}.${extensao}`;
  const destino = path.join(dir, nome);
  fs.writeFileSync(destino, Buffer.from(buffer));
  return destino;
});

ipcMain.on('abrir-pasta', (_e, arquivo) => shell.showItemInFolder(arquivo || garantirPasta()));

/** Deixa o usuário escolher onde guardar. Devolve a pasta em vigor. */
ipcMain.handle('escolher-pasta', async () => {
  const r = await dialog.showOpenDialog(janela, {
    title: 'Onde salvar as gravações',
    defaultPath: pastaAtual(),
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Salvar aqui',
  });
  if (r.canceled || !r.filePaths?.length) return pastaAtual();
  gravarConfig({ pasta: r.filePaths[0] });
  garantirPasta();
  return pastaAtual();
});
ipcMain.on('fechar', () => { app.isQuitting = true; app.quit(); });

// ── config + início com o Windows ───────────────────────────────────────────

ipcMain.handle('config', () => {
  const c = lerConfig();
  return {
    logado: !!c.token, email: c.email || '',
    comWindows: app.getLoginItemSettings().openAtLogin,
    pasta: pastaAtual(),
  };
});

ipcMain.handle('inicio-windows', (_e, ligar) => {
  app.setLoginItemSettings({ openAtLogin: !!ligar, args: [] });
  return app.getLoginItemSettings().openAtLogin;
});

ipcMain.handle('sair-conta', () => { gravarConfig({ token: null, email: null }); return true; });

/** Login no ERP — o backend usa OAuth2PasswordRequestForm (form-urlencoded). */
ipcMain.handle('login', async (_e, email, senha) => {
  try {
    const corpo = new URLSearchParams({ username: email, password: senha });
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: corpo,
    });
    if (!r.ok) return { ok: false, erro: r.status === 401 ? 'e-mail ou senha inválidos' : `erro ${r.status}` };
    const d = await r.json();
    if (!d.access_token) return { ok: false, erro: 'resposta sem token' };
    gravarConfig({ token: d.access_token, email });
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: 'sem conexão' };
  }
});

/**
 * Manda a gravação pro ERP. Lá ela vai pro R2, é transcrita pelo faster-whisper
 * self-hosted e analisada — aparece em CRM → Ligações QA.
 * O envio roda aqui no main pra não esbarrar em CORS no renderer.
 */
ipcMain.handle('enviar', async (_e, caminho) => {
  const { token } = lerConfig();
  if (!token) return { ok: false, erro: 'sem login' };
  try {
    const bytes = fs.readFileSync(caminho);
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: 'audio/webm' }), path.basename(caminho));
    form.append('direcao', 'out');
    form.append('atendente_nome', lerConfig().email || 'Gravador');

    const r = await fetch(`${API}/tier-empresas/crm/ligacoes/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (r.status === 401) { gravarConfig({ token: null }); return { ok: false, erro: 'sessão expirada' }; }
    if (!r.ok) return { ok: false, erro: `erro ${r.status}` };
    const d = await r.json();
    return { ok: true, id: d.id };
  } catch (e) {
    return { ok: false, erro: 'falha no envio' };
  }
});

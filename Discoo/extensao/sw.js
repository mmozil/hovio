/**
 * Service worker — só orquestra, nunca grava.
 *
 * 🚨 No MV3 o service worker MORRE sozinho depois de ~30s parado, e não tem
 * `MediaRecorder` nem `navigator.mediaDevices`. Quem grava é o offscreen
 * document: uma página invisível que vive enquanto a gravação durar.
 *
 * 🚨 E a regra que define a UX inteira: `getMediaStreamId` RECUSA a captura sem
 * invocação do usuário na aba — "Extension has not been invoked for the current
 * page (see activeTab permission)". `host_permissions` não substitui. As duas
 * formas de conceder são **clique no ícone** e **atalho de comando**, e é por
 * isso que a extensão não tem popup: clicar no ícone já começa a gravar.
 * A permissão, uma vez concedida, vale até a aba navegar — daí a pílula poder
 * parar, marcar e regravar sem pedir nada de novo.
 */

const PAGINA_OFF = 'offscreen.html';

async function garantirOffscreen() {
  const abertos = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (abertos.length) return;
  await chrome.offscreen.createDocument({
    url: PAGINA_OFF,
    reasons: ['USER_MEDIA'],
    justification: 'gravar o áudio da reunião na aba',
  });
}

const aoOffscreen = (msg) => chrome.runtime.sendMessage({ para: 'offscreen', ...msg });

/** Qual aba gravar: a ativa; se a ativa for página da extensão, a que tem som. */
async function abaAlvo(tabId) {
  if (tabId) return tabId;
  const [ativa] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (ativa && !String(ativa.url || '').startsWith('chrome-extension://')) return ativa.id;
  const [comSom] = await chrome.tabs.query({ audible: true });
  if (comSom) return comSom.id;
  throw new Error('não achei a aba da reunião');
}

/** As opções vivem no storage porque quem as edita (a pílula) não é quem grava. */
async function opcoes() {
  const { opcoes: o } = await chrome.storage.local.get('opcoes');
  return { mic: true, nivel: 'padrao', ...(o || {}) };
}

async function iniciar(tabId) {
  const alvo = await abaAlvo(tabId);
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: alvo });
  await garantirOffscreen();
  const o = await opcoes();
  const r = await aoOffscreen({ tipo: 'iniciar', streamId, comMic: o.mic !== false });
  await chrome.storage.local.set({ gravandoEm: r && r.ok ? alvo : null });
  return { ...r, tabId: alvo };
}

async function tratar(msg) {
  switch (msg.tipo) {
    case 'iniciar':
      return iniciar(msg.tabId);
    case 'parar': {
      const r = await aoOffscreen({ tipo: 'parar' });
      await chrome.storage.local.set({ gravandoEm: null });
      return r;
    }
    case 'estado':
      return (await aoOffscreen({ tipo: 'estado' }).catch(() => null)) || { ok: true, gravando: false };
    case 'marcar':
      return aoOffscreen({ tipo: 'marcar' });
    case 'transcrever':
      return aoOffscreen({ tipo: 'transcrever', nivel: (await opcoes()).nivel });
    case 'opcoes':
      if (msg.novas) await chrome.storage.local.set({ opcoes: { ...(await opcoes()), ...msg.novas } });
      return { ok: true, opcoes: await opcoes() };
    case 'permissao':
      // o microfone precisa ser liberado numa página VISÍVEL da extensão: o
      // offscreen não tem gesto do usuário pra disparar o pedido do navegador
      await chrome.tabs.create({ url: chrome.runtime.getURL('permissao.html') });
      return { ok: true };
    default:
      throw new Error('mensagem desconhecida: ' + msg.tipo);
  }
}

/** Clique no ícone: começa (ou para). É ele que concede o acesso à aba. */
chrome.action.onClicked.addListener(async (aba) => {
  const atual = await tratar({ tipo: 'estado' });
  await tratar(atual.gravando ? { tipo: 'parar' } : { tipo: 'iniciar', tabId: aba.id });
});

chrome.commands.onCommand.addListener(async (comando) => {
  if (comando !== 'gravar') return;
  const atual = await tratar({ tipo: 'estado' });
  await tratar(atual.gravando ? { tipo: 'parar' } : { tipo: 'iniciar' });
});

chrome.runtime.onMessage.addListener((msg, _remetente, responder) => {
  if (!msg || msg.para !== 'sw') return false;
  // `return true` tem de ser síncrono, senão o canal fecha antes da resposta
  tratar(msg).then(responder).catch((e) => responder({ ok: false, erro: String((e && e.message) || e) }));
  return true;
});

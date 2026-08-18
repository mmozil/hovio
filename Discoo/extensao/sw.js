/**
 * Service worker — só orquestra, nunca grava.
 *
 * 🚨 No MV3 o service worker MORRE sozinho depois de ~30s parado, e não tem
 * `MediaRecorder` nem `navigator.mediaDevices`. Quem grava é o offscreen
 * document: uma página invisível que vive enquanto a gravação durar. Este
 * arquivo faz duas coisas — pega o `streamId` da aba e acorda o offscreen.
 */

const PAGINA_OFF = 'offscreen.html';

/** O offscreen é único por extensão: criar dois dá erro. */
async function garantirOffscreen() {
  const abertos = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (abertos.length) return;
  await chrome.offscreen.createDocument({
    url: PAGINA_OFF,
    reasons: ['USER_MEDIA'],
    justification: 'gravar o áudio da reunião na aba',
  });
}

/**
 * Qual aba gravar. Em uso normal é a aba ativa — o popup abre por cima da
 * reunião. Quando a "aba ativa" é uma página da própria extensão (acontece no
 * teste, e também se a pessoa abriu o popup numa aba solta), cai pra primeira
 * aba que está tocando som, que é onde a reunião está.
 */
async function abaAlvo(tabId) {
  if (tabId) return tabId;
  const [ativa] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (ativa && !String(ativa.url || '').startsWith('chrome-extension://')) return ativa.id;
  const [comSom] = await chrome.tabs.query({ audible: true });
  if (comSom) return comSom.id;
  throw new Error('não achei a aba da reunião');
}

async function tratar(msg) {
  if (msg.tipo === 'iniciar') {
    const alvo = await abaAlvo(msg.tabId);
    // 🚨 Este é o ponto do produto: getMediaStreamId entrega o áudio da aba SEM
    // o diálogo "escolha o que compartilhar". Exige que a extensão tenha acesso
    // à aba — daí o host_permissions, que é o mesmo de que a pílula precisa.
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: alvo });
    await garantirOffscreen();
    const r = await chrome.runtime.sendMessage({
      para: 'offscreen', tipo: 'iniciar', streamId, comMic: msg.comMic !== false,
    });
    return { ...r, tabId: alvo };
  }
  if (msg.tipo === 'parar' || msg.tipo === 'estado') {
    return chrome.runtime.sendMessage({ para: 'offscreen', tipo: msg.tipo });
  }
  throw new Error('mensagem desconhecida: ' + msg.tipo);
}

/**
 * Atalho de teclado — o outro jeito de começar, sem abrir o popup.
 *
 * 🚨 E não é conveniencia: o `getMediaStreamId` RECUSA a captura sem invocação
 * do usuário na aba ("Extension has not been invoked for the current page"), e
 * `host_permissions` NÃO substitui isso. Clique no ícone e atalho de comando
 * são as duas formas de conceder esse acesso — logo, gravar sempre começa por
 * um gesto. Um clique, sem diálogo nenhum: é o que o site não consegue oferecer.
 */
chrome.commands.onCommand.addListener(async (comando) => {
  if (comando !== 'gravar') return;
  try {
    const atual = await chrome.runtime.sendMessage({ para: 'offscreen', tipo: 'estado' }).catch(() => null);
    const r = await tratar({ tipo: atual && atual.gravando ? 'parar' : 'iniciar', comMic: true });
    await chrome.storage.local.set({ ultimo: { ...r, quando: Date.now() } });
  } catch (e) {
    await chrome.storage.local.set({ ultimo: { ok: false, erro: String((e && e.message) || e), quando: Date.now() } });
  }
});

chrome.runtime.onMessage.addListener((msg, _remetente, responder) => {
  if (!msg || msg.para !== 'sw') return false;
  // `return true` tem de ser síncrono, senão o canal fecha antes da resposta
  tratar(msg).then(responder).catch((e) => responder({ ok: false, erro: String((e && e.message) || e) }));
  return true;
});

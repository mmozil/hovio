/**
 * Onde a reunião é gravada de verdade.
 *
 * Três armadilhas conhecidas do caminho da extensão, e o que cada uma exige:
 *
 * 1. 🚨 CAPTURAR A ABA TIRA O SOM DE QUEM GRAVA. O `tabCapture` sequestra a
 *    saída de áudio da aba: sem reconectar a fonte ao `ctx.destination`, a
 *    pessoa deixa de ouvir a reunião no meio da chamada. Só aparece no
 *    primeiro teste com gente do outro lado — por isso está aqui, no começo.
 * 2. O `tabCapture` NÃO traz o microfone (é o som da aba, por definição). A voz
 *    de quem grava vem de um `getUserMedia` separado e os dois são misturados.
 *    A permissão do mic precisa ter sido concedida antes numa página VISÍVEL da
 *    extensão: aqui não existe gesto do usuário pra disparar o pedido.
 * 3. Onde escrever os pedaços: `showDirectoryPicker` precisa de gesto e não
 *    roda aqui. O OPFS (armazenamento privado da origem) aceita escrita sem
 *    diálogo nenhum, e é o que mantém a promessa de que uma queda custa 5s.
 */

let ctx = null;
let rec = null;
let fontes = [];
let anTab = null;
let anMic = null;
let arquivo = null;
let nomeArquivo = '';
let escritos = 0;
let fila = Promise.resolve();
let medidor = 0;
let inicio = 0;
// pico ao longo da gravação, não no fim: no instante do "parar" pode haver
// silêncio, e aí um teste correto acusaria falha
const pico = { tab: 0, mic: 0 };

const media = (an, buf) => {
  if (!an) return 0;
  an.getByteFrequencyData(buf);
  return buf.reduce((a, v) => a + v, 0) / buf.length;
};

function carimbo() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}${p(d.getMinutes())}`;
}

async function iniciar(streamId, comMic) {
  if (rec && rec.state === 'recording') return { ok: false, erro: 'já está gravando' };
  escritos = 0; pico.tab = 0; pico.mic = 0; fila = Promise.resolve(); fontes = [];

  // áudio da aba — sem diálogo, é o motivo da extensão existir
  const daAba = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
  });
  fontes.push(daAba);

  ctx = new AudioContext();
  const destino = ctx.createMediaStreamDestination();
  const fonteAba = ctx.createMediaStreamSource(daAba);
  fonteAba.connect(destino);
  fonteAba.connect(ctx.destination);   // 🚨 devolve o som pra quem está na reunião
  anTab = ctx.createAnalyser(); anTab.fftSize = 128; fonteAba.connect(anTab);

  anMic = null;
  if (comMic) {
    try {
      // echoCancellation desligado de propósito: com ele o Chrome come a voz do
      // outro lado, que é justamente o que a ata precisa
      const doMic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false } });
      fontes.push(doMic);
      const fonteMic = ctx.createMediaStreamSource(doMic);
      fonteMic.connect(destino);
      anMic = ctx.createAnalyser(); anMic.fftSize = 128; fonteMic.connect(anMic);
    } catch (e) {
      // sem permissão de microfone a reunião ainda é gravada (só sem a sua voz)
    }
  }

  const raiz = await navigator.storage.getDirectory();
  nomeArquivo = carimbo() + '.webm';
  arquivo = await raiz.getFileHandle(nomeArquivo, { create: true });
  const limpar = await arquivo.createWritable();   // trunca sobra de gravação anterior
  await limpar.close();

  rec = new MediaRecorder(destino.stream, { mimeType: 'audio/webm', audioBitsPerSecond: 64000 });
  rec.ondataavailable = (e) => { if (e.data && e.data.size) guardar(e.data); };
  rec.start(5000);
  inicio = Date.now();

  const bufA = new Uint8Array(64), bufM = new Uint8Array(64);
  medidor = setInterval(() => {
    pico.tab = Math.max(pico.tab, media(anTab, bufA));
    pico.mic = Math.max(pico.mic, media(anMic, bufM));
  }, 200);

  return { ok: true, arquivo: nomeArquivo, comMic: !!anMic };
}

/** Cada pedaço vai pro disco na hora — uma queda custa 5 segundos, não a reunião. */
function guardar(blob) {
  fila = fila.then(async () => {
    const w = await arquivo.createWritable({ keepExistingData: true });
    await w.write({ type: 'write', position: escritos, data: blob });
    await w.close();
    escritos += blob.size;
  }).catch(() => {});
}

async function parar() {
  if (!rec) return { ok: false, erro: 'não estava gravando' };
  const duracao = Math.round((Date.now() - inicio) / 1000);
  await new Promise((ok) => { rec.onstop = ok; rec.stop(); });
  clearInterval(medidor);
  fontes.forEach((s) => s.getTracks().forEach((t) => t.stop()));
  if (ctx) { try { await ctx.close(); } catch (e) {} }
  await fila;
  rec = null;
  return {
    ok: true, arquivo: nomeArquivo, bytes: escritos, duracao,
    picoAba: Math.round(pico.tab), picoMic: Math.round(pico.mic),
  };
}

chrome.runtime.onMessage.addListener((msg, _remetente, responder) => {
  if (!msg || msg.para !== 'offscreen') return false;
  const acao = msg.tipo === 'iniciar'
    ? iniciar(msg.streamId, msg.comMic)
    : msg.tipo === 'parar'
      ? parar()
      : Promise.resolve({
        ok: true,
        gravando: !!rec && rec.state === 'recording',
        bytes: escritos,
        picoAba: Math.round(pico.tab),
        picoMic: Math.round(pico.mic),
      });
  acao.then(responder).catch((e) => responder({ ok: false, erro: String((e && e.message) || e) }));
  return true;
});

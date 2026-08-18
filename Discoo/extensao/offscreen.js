/**
 * Onde a reunião é gravada e de onde ela é enviada.
 *
 * Três armadilhas do caminho da extensão, e o que cada uma exige:
 *
 * 1. 🚨 CAPTURAR A ABA TIRA O SOM DE QUEM GRAVA. O `tabCapture` sequestra a
 *    saída de áudio da aba: sem reconectar a fonte ao `ctx.destination`, a
 *    pessoa deixa de ouvir a reunião no meio da chamada.
 * 2. O `tabCapture` NÃO traz o microfone (é o som da aba, por definição). A voz
 *    de quem grava vem de um `getUserMedia` separado, e os dois são misturados.
 *    A permissão do mic precisa ter sido concedida antes em `permissao.html`:
 *    aqui não existe gesto do usuário pra disparar o pedido.
 * 3. Onde escrever os pedaços: `showDirectoryPicker` precisa de gesto e não roda
 *    aqui. O OPFS aceita escrita sem diálogo nenhum, e é o que mantém a promessa
 *    de que uma queda custa 5 segundos.
 */

const API = 'https://api.tier.finance/api';

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
let marcas = [];
// pico ao longo da gravação, não no instante do "parar": no fim pode haver
// silêncio, e aí um teste correto acusaria falha
const pico = { tab: 0, mic: 0 };

const media = (an, buf) => {
  if (!an) return 0;
  an.getByteFrequencyData(buf);
  return buf.reduce((a, v) => a + v, 0) / buf.length;
};
const dois = (n) => String(n).padStart(2, '0');
const mmss = (s) => `${dois(Math.floor(s / 60))}:${dois(Math.floor(s % 60))}`;

function carimbo() {
  const d = new Date();
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())} ${dois(d.getHours())}${dois(d.getMinutes())}`;
}

async function iniciar(streamId, comMic) {
  if (rec && rec.state === 'recording') return { ok: false, erro: 'já está gravando' };
  escritos = 0; pico.tab = 0; pico.mic = 0; fila = Promise.resolve(); fontes = []; marcas = [];

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
  let semMic = false;
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
      semMic = true;   // a reunião ainda é gravada, só sem a sua voz
    }
  }

  const raiz = await navigator.storage.getDirectory();
  nomeArquivo = carimbo() + '.webm';
  arquivo = await raiz.getFileHandle(nomeArquivo, { create: true });
  const zerar = await arquivo.createWritable(); await zerar.close();

  rec = new MediaRecorder(destino.stream, { mimeType: 'audio/webm', audioBitsPerSecond: 64000 });
  rec.ondataavailable = (e) => { if (e.data && e.data.size) guardar(e.data); };
  rec.start(5000);
  inicio = Date.now();

  const bufA = new Uint8Array(64), bufM = new Uint8Array(64);
  medidor = setInterval(() => {
    pico.tab = Math.max(pico.tab, media(anTab, bufA));
    pico.mic = Math.max(pico.mic, media(anMic, bufM));
  }, 200);

  return { ok: true, arquivo: nomeArquivo, comMic: !!anMic, semMic };
}

/** Cada pedaço vai pro disco na hora — uma queda custa 5 segundos, não a reunião.
 *  O writable é aberto e FECHADO a cada escrita: só o `close()` materializa. */
function guardar(blob) {
  fila = fila.then(async () => {
    const w = await arquivo.createWritable({ keepExistingData: true });
    await w.write({ type: 'write', position: escritos, data: blob });
    await w.close();
    escritos += blob.size;
  }).catch(() => {});
}

function marcar() {
  if (!rec || rec.state !== 'recording') return { ok: false };
  const s = Math.floor((Date.now() - inicio) / 1000);
  marcas.push(s);
  return { ok: true, em: mmss(s), total: marcas.length };
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
    picoAba: Math.round(pico.tab), picoMic: Math.round(pico.mic), marcas: marcas.length,
  };
}

/** Manda pro mesmo motor do site: R2 → faster-whisper → LLM → ata. */
async function transcrever(nivel) {
  if (!arquivo) return { ok: false, erro: 'não há gravação' };
  const f = await arquivo.getFile();
  if (!f.size) return { ok: false, erro: 'gravação vazia' };
  if (f.size > 60 * 1024 * 1024) return { ok: false, erro: 'áudio maior que 60 MB' };

  const form = new FormData();
  form.append('file', f, nomeArquivo);
  form.append('nivel', nivel || 'padrao');
  form.append('resumir', 'true');
  if (marcas.length) form.append('marcas', marcas.join(','));

  const r = await fetch(`${API}/discoo/transcrever`, { method: 'POST', body: form });
  if (r.status === 429) return { ok: false, erro: 'muitas gravações seguidas' };
  if (!r.ok) return { ok: false, erro: `erro ${r.status}` };
  const { job_id: job } = await r.json();
  if (!job) return { ok: false, erro: 'sem job' };

  // 🚨 assíncrono do outro lado de propósito: o Cloudflare corta resposta em
  // ~100s e meia hora de reunião leva mais que isso pra transcrever
  const limite = Date.now() + 30 * 60000;
  while (Date.now() < limite) {
    await new Promise((ok) => setTimeout(ok, 3000));
    let d;
    try {
      const g = await fetch(`${API}/discoo/job/${job}`);
      if (!g.ok) continue;
      d = await g.json();
    } catch (e) { continue; }
    if (d.estado === 'transcrevendo' || d.estado === 'resumindo') {
      chrome.runtime.sendMessage({ para: 'pilula', tipo: 'andamento', estado: d.estado }).catch(() => {});
      continue;
    }
    if (d.estado === 'sem_fala') return { ok: false, erro: 'não identifiquei fala no áudio' };
    if (d.estado === 'erro') return { ok: false, erro: d.erro || 'falhou' };
    return {
      ok: true, titulo: d.titulo || '', resumo: d.resumo || '',
      texto: d.texto_tempo || d.texto || '', duracao: d.duracao_segundos || 0,
      aviso: d.aviso || null, arquivo: nomeArquivo, marcas: marcas.slice(),
    };
  }
  return { ok: false, erro: 'demorou demais' };
}

const estado = () => ({
  ok: true,
  gravando: !!rec && rec.state === 'recording',
  segundos: rec ? Math.floor((Date.now() - inicio) / 1000) : 0,
  bytes: escritos,
  picoAba: Math.round(pico.tab),
  picoMic: Math.round(pico.mic),
  marcas: marcas.length,
  temGravacao: !!arquivo,
});

chrome.runtime.onMessage.addListener((msg, _remetente, responder) => {
  if (!msg || msg.para !== 'offscreen') return false;
  const acao =
    msg.tipo === 'iniciar' ? iniciar(msg.streamId, msg.comMic)
      : msg.tipo === 'parar' ? parar()
        : msg.tipo === 'marcar' ? Promise.resolve(marcar())
          : msg.tipo === 'transcrever' ? transcrever(msg.nivel)
            : Promise.resolve(estado());
  acao.then(responder).catch((e) => responder({ ok: false, erro: String((e && e.message) || e) }));
  return true;
});

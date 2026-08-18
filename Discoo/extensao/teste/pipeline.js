/**
 * Spike v4 — separa o que é limite da EXTENSÃO do que é limite da AUTOMAÇÃO.
 *
 * Duas medições independentes:
 *
 * A) O teclado do SO chega na janela do Chromium? (SendKeys num input da página)
 *    Se não chegar, o "atalho não funcionou" das v2/v3 é problema do teste, não
 *    do produto — e o gesto de invocar a extensão fica sem prova automatizada.
 *
 * B) O pipeline de gravação inteiro, rodando numa página da extensão (mesma
 *    origem e mesmas APIs do offscreen): mistura duas fontes, grava com
 *    MediaRecorder, escreve cada pedaço no OPFS e mede o nível de cada uma.
 *    É tudo o que vem DEPOIS do `getMediaStreamId` — ou seja, as armadilhas 2 e 3.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { execSync } = require('child_process');

const EXT = path.resolve(__dirname, '..');
const AQUI = __dirname;
const PERFIL = path.join(AQUI, 'perfil-spike4');
const PORTA = 8099;
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** Microfone falso com som. Sem isto o device do Chromium é MUDO e o nível do
 *  mic mede zero — o que parece bug do mixador e não é. */
function gerarMicWav(destino) {
  if (fs.existsSync(destino)) return destino;
  const taxa = 48000, segundos = 6, n = taxa * segundos;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(taxa, 24); buf.writeUInt32LE(taxa * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / taxa) * 12000), 44 + i * 2);
  fs.writeFileSync(destino, buf);
  return destino;
}

function servidor() {
  return new Promise((ok) => {
    const s = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><meta charset="utf-8"><title>Reuniao de teste</title>
<body><input id="campo" autofocus style="font-size:20px;width:300px" /></body>`);
    });
    s.listen(PORTA, () => ok(s));
  });
}

function mandarTeclas(titulo, teclas) {
  const ps = `
Add-Type -AssemblyName Microsoft.VisualBasic
Add-Type -AssemblyName System.Windows.Forms
$p = Get-Process | Where-Object { $_.MainWindowTitle -like '*${titulo}*' } | Select-Object -First 1
if (-not $p) { Write-Output 'JANELA_NAO_ACHADA'; exit }
[Microsoft.VisualBasic.Interaction]::AppActivate($p.Id)
Start-Sleep -Milliseconds 900
[System.Windows.Forms.SendKeys]::SendWait('${teclas}')
Write-Output 'ENVIADO'
`;
  return execSync('powershell -NoProfile -NonInteractive -Command -', { input: ps, encoding: 'utf8' }).trim();
}

(async () => {
  const srv = await servidor();
  fs.rmSync(PERFIL, { recursive: true, force: true });

  const ctx = await chromium.launchPersistentContext(PERFIL, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      // 🔑 o device falso do Chromium é MUDO por padrão: sem apontar um wav, o
      // microfone "funciona" e o nível medido é zero — o que parece bug do mixador
      `--use-file-for-fake-audio-capture=${gerarMicWav(path.join(AQUI, 'mic.wav'))}`,
      '--autoplay-policy=no-user-gesture-required',
      '--window-size=600,400',
    ],
  });

  const aba = await ctx.newPage();
  await aba.goto(`http://localhost:${PORTA}/`);
  await dormir(1200);
  let id = null;
  for (let i = 0; !id && i < 25; i++) {
    id = await aba.evaluate(() => document.documentElement.dataset.discoo || null);
    if (!id) await dormir(400);
  }
  console.log('extensão:', id || 'NÃO CARREGOU');

  // ── A) o teclado do SO alcança a janela? ─────────────────────────────────
  await aba.bringToFront();
  await aba.click('#campo');
  console.log('SendKeys:', mandarTeclas('Reuniao de teste', 'abc'));
  await dormir(800);
  const digitado = await aba.inputValue('#campo');
  console.log(digitado === 'abc'
    ? 'A) teclado do SO CHEGA na janela — então o atalho da extensão é que não está registrado'
    : `A) teclado do SO NÃO chega (campo="${digitado}") — o atalho é limite do TESTE, não do produto`);

  // ── B) o pipeline de gravação, na página da extensão ─────────────────────
  const painel = await ctx.newPage();
  await painel.goto(`chrome-extension://${id}/popup.html`);
  const r = await painel.evaluate(async () => {
    const media = (an, buf) => { an.getByteFrequencyData(buf); return buf.reduce((a, v) => a + v, 0) / buf.length; };
    const ctx = new AudioContext();
    const destino = ctx.createMediaStreamDestination();

    // faz o papel do áudio da aba (o que o tabCapture entregaria)
    const osc = ctx.createOscillator(); osc.frequency.value = 320;
    const g = ctx.createGain(); g.gain.value = 0.3;
    osc.connect(g); g.connect(destino);
    const anAba = ctx.createAnalyser(); anAba.fftSize = 128; g.connect(anAba);
    osc.start();

    // microfone de verdade pela API (aqui é o device falso do Chromium)
    let anMic = null; let micOk = false;
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false } });
      const fonte = ctx.createMediaStreamSource(mic);
      fonte.connect(destino);
      anMic = ctx.createAnalyser(); anMic.fftSize = 128; fonte.connect(anMic);
      micOk = true;
    } catch (e) { return { ok: false, erro: 'mic: ' + e.message }; }

    // OPFS: escreve cada pedaço na hora, abrindo e fechando o writable
    const raiz = await navigator.storage.getDirectory();
    const arq = await raiz.getFileHandle('teste-pipeline.webm', { create: true });
    const zerar = await arq.createWritable(); await zerar.close();
    let escritos = 0; let fila = Promise.resolve(); let pedacos = 0;

    const rec = new MediaRecorder(destino.stream, { mimeType: 'audio/webm', audioBitsPerSecond: 64000 });
    rec.ondataavailable = (e) => {
      if (!e.data || !e.data.size) return;
      pedacos++;
      fila = fila.then(async () => {
        const w = await arq.createWritable({ keepExistingData: true });
        await w.write({ type: 'write', position: escritos, data: e.data });
        await w.close();
        escritos += e.data.size;
      });
    };
    rec.start(1000);

    const bufA = new Uint8Array(64), bufM = new Uint8Array(64);
    const pico = { aba: 0, mic: 0 };
    const medidor = setInterval(() => {
      pico.aba = Math.max(pico.aba, media(anAba, bufA));
      if (anMic) pico.mic = Math.max(pico.mic, media(anMic, bufM));
    }, 150);

    await new Promise((ok) => setTimeout(ok, 6000));
    clearInterval(medidor);
    await new Promise((ok) => { rec.onstop = ok; rec.stop(); });
    await fila;
    const tamanhoFinal = (await arq.getFile()).size;
    await ctx.close();
    return {
      ok: true, micOk, pedacos, escritos, tamanhoFinal,
      picoAba: Math.round(pico.aba), picoMic: Math.round(pico.mic),
    };
  });
  console.log('B) pipeline:', JSON.stringify(r));

  // prova final: decodifica o que foi gravado e mede — em vez de confiar no tamanho
  if (r.ok && r.tamanhoFinal) {
    const som = await painel.evaluate(async () => {
      const raiz = await navigator.storage.getDirectory();
      const f = await (await raiz.getFileHandle('teste-pipeline.webm')).getFile();
      const ctx = new AudioContext();
      const audio = await ctx.decodeAudioData(await f.arrayBuffer());
      const d = audio.getChannelData(0);
      let soma = 0, maximo = 0;
      for (let i = 0; i < d.length; i++) { soma += d[i] * d[i]; maximo = Math.max(maximo, Math.abs(d[i])); }
      await ctx.close();
      return { segundos: +audio.duration.toFixed(2), rms: +Math.sqrt(soma / d.length).toFixed(4), pico: +maximo.toFixed(4) };
    });
    console.log('C) o arquivo gravado, decodificado:', JSON.stringify(som));
  }

  if (r.ok && r.tamanhoFinal) {
    const b64 = await painel.evaluate(async () => {
      const raiz = await navigator.storage.getDirectory();
      const f = await (await raiz.getFileHandle('teste-pipeline.webm')).getFile();
      const b = new Uint8Array(await f.arrayBuffer());
      let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
      return btoa(s);
    });
    fs.writeFileSync(path.join(AQUI, 'spike-pipeline.webm'), Buffer.from(b64, 'base64'));
    console.log('áudio salvo em spike-pipeline.webm');
  }

  await ctx.close();
  srv.close();
})();

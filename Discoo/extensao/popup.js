/**
 * Popup do spike: liga e desliga a gravação e mostra se está entrando som de
 * cada fonte. A UX de verdade (a pílula dentro da página da reunião) vem depois
 * — aqui o objetivo é provar a captura.
 */
const $ = (id) => document.getElementById(id);
const dois = (n) => String(n).padStart(2, '0');
let comMic = true;
let gravando = false;
let t0 = 0;
let tid = 0;

const aoSw = (msg) => chrome.runtime.sendMessage({ para: 'sw', ...msg });

$('swMic').onclick = () => { comMic = !comMic; $('swMic').classList.toggle('on', comMic); };

$('btn').onclick = async () => {
  $('btn').disabled = true;
  try {
    if (!gravando) {
      const r = await aoSw({ tipo: 'iniciar', comMic });
      if (!r || !r.ok) { $('estado').textContent = (r && r.erro) || 'não consegui capturar'; return; }
      gravando = true; t0 = Date.now();
      $('btn').textContent = 'Parar'; $('btn').classList.add('rec');
      $('estado').textContent = r.comMic ? 'reunião + microfone' : 'sem microfone (permissão)';
      tid = setInterval(bater, 500);
    } else {
      clearInterval(tid);
      const r = await aoSw({ tipo: 'parar' });
      gravando = false;
      $('btn').textContent = 'Gravar esta reunião'; $('btn').classList.remove('rec');
      // o resultado fica legível na tela: é daqui que o teste automatizado lê
      $('estado').textContent = r && r.ok
        ? `pronto · ${r.duracao}s · ${(r.bytes / 1024).toFixed(0)} KB · aba ${r.picoAba} · mic ${r.picoMic}`
        : (r && r.erro) || 'falhou ao parar';
    }
  } finally { $('btn').disabled = false; }
};

async function bater() {
  const s = Math.floor((Date.now() - t0) / 1000);
  $('cron').textContent = `${dois(Math.floor(s / 60))}:${dois(s % 60)}`;
  const r = await aoSw({ tipo: 'estado' });
  if (!r || !r.ok) return;
  $('ptAba').classList.toggle('ok', r.picoAba > 4);
  $('ptMic').classList.toggle('ok', r.picoMic > 4);
}

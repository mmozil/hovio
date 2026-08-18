/**
 * Fotografa os estados da pílula dentro de uma página que faz o papel do Meet.
 * "Estado que eu não abri, eu não validei" — então cada um é aberto e fotografado.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');

const EXT = path.resolve(__dirname, '..');
const AQUI = __dirname;
const SAIDA = path.join(AQUI, 'fotos');   // gitignorado
const PORTA = 8099;
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

const PAGINA = `<!doctype html><meta charset="utf-8"><title>Reuniao de teste</title>
<body style="margin:0;background:#202124;height:100vh;display:grid;place-items:center;
             font:16px/1.5 system-ui;color:#9aa0a6">
  <div style="text-align:center">
    <div style="width:220px;height:130px;border-radius:12px;background:#3c4043;margin:0 auto 14px"></div>
    faz o papel da chamada
  </div>
  <div style="position:fixed;bottom:0;left:0;right:0;height:72px;background:#202124;
              border-top:1px solid #3c4043"></div>
</body>`;

const ATA = `# Alinhamento comercial — Central Fleet

## Tarefas
- [ ] Enviar a proposta revisada à Ayvens — Glauber · até 22/08 · [12:04]
- [ ] Cotar o leilão em volume — Marcelo · sem prazo · [26:41] · ★
- [ ] Confirmar o acesso à API do parceiro — não atribuído · [38:12]

## Decisões
- Fica o Infosimples para o dado oficial. [19:22]

## Em aberto
- Débito de SP sem fonte automática — ninguém assumiu. [31:05]

## Resumo
A conversa fechou o caminho comercial pela GETEK e deixou o preço de leilão como o item que
precisa de negociação por volume antes de qualquer anúncio de tabela.`;

function servidor() {
  return new Promise((ok) => {
    const s = http.createServer((_r, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(PAGINA);
    });
    s.listen(PORTA, () => ok(s));
  });
}

(async () => {
 try {
  fs.mkdirSync(SAIDA, { recursive: true });
  const srv = await servidor();
  const perfil = path.join(AQUI, 'perfil-visual');
  fs.rmSync(perfil, { recursive: true, force: true });

  const ctx = await chromium.launchPersistentContext(perfil, {
    headless: false,
    viewport: { width: 1000, height: 700 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--window-size=1000,760'],
  });

  const pg = await ctx.newPage();
  const erros = [];
  pg.on('pageerror', (e) => erros.push(String(e)));
  pg.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  await pg.goto(`http://localhost:${PORTA}/`);

  const pilula = pg.locator('#discoo-pilula');
  await pilula.waitFor({ timeout: 15000 }).catch(() => {});
  if (!(await pilula.count())) { console.log('RESULTADO: a pílula não apareceu'); console.log(erros.join(' | ')); await ctx.close(); srv.close(); process.exit(1); }
  await dormir(1200);
  console.log('pílula na página:', await pg.locator('#discoo-pilula #rotulo').innerText());

  const foto = async (nome) => {
    await dormir(500);
    await pg.screenshot({ path: path.join(SAIDA, nome + '.png'), clip: { x: 470, y: 150, width: 530, height: 550 } });
    console.log('  foto', nome);
  };

  await foto('1-repouso');

  // opcoes -> fecha -> gesto (o disco sem activeTab) -> fecha -> ata
  await pg.locator('#discoo-pilula #btnOpcoes').click();
  await foto('2-opcoes');
  await pg.locator('#discoo-pilula [data-a="fechar"]').click();
  await dormir(300);

  await pg.locator('#discoo-pilula #disco').click();
  await dormir(1800);
  await foto('3-falta-um-clique');
  const cabecalho = (await pg.locator('#discoo-pilula #cartao').innerText()).split(String.fromCharCode(10))[0];
  console.log('  cartao do gesto:', cabecalho);
  await pg.locator('#discoo-pilula [data-a="fechar"]').click();
  await dormir(300);

  // o botao de opcoes precisa ABRIR mesmo com outro cartao aberto (era o bug)
  await pg.locator('#discoo-pilula #btnOpcoes').click();
  await dormir(400);
  console.log('  opcoes reabriram:', (await pg.locator('#discoo-pilula #cartao').innerText()).includes('ANTES DE GRAVAR'));
  await pg.locator('#discoo-pilula [data-a="fechar"]').click();
  await dormir(300);

  const fonte = fs.readFileSync(path.join(EXT, 'pilula.js'), 'utf8');
  const puras = fonte.slice(fonte.indexOf('const escapar ='));
  const html = await pg.evaluate(({ puras, md }) => {
    const f = new Function(`${puras}; return renderAta(${JSON.stringify(md)});`);
    const dentro = f();
    const raiz = document.getElementById('discoo-pilula').shadowRoot;
    const cartao = raiz.getElementById('cartao');
    cartao.classList.remove('oculto');
    cartao.innerHTML = `<div class="rot">A ata · 1 momento marcado</div>
      <div class="ata">${dentro}</div>
      <div class="linha">
        <button class="acao">Copiar markdown</button>
        <button class="acao fant">Baixar .md</button>
        <button class="acao fant">Fechar</button>
      </div>`;
    return dentro.length;
  }, { puras, md: ATA });
  console.log('  ata renderizada:', html, 'chars');
  await dormir(400);
  await pg.screenshot({ path: path.join(SAIDA, '4-ata.png'), clip: { x: 470, y: 100, width: 530, height: 600 } });
  console.log('  foto 4-ata');

  if (erros.length) console.log('ERROS:', erros.join(' | '));
  else console.log('sem erros de console');
  await ctx.close();
  srv.close();
 } catch (e) { console.log('EXCECAO:', e.message); process.exit(1); }
})();

/* La Belle Scens — tema claro/escuro. Carregado no <head> (bloqueante e minúsculo) para aplicar
   o tema ANTES da primeira pintura; o botão entra quando o DOM existe. Escolha em localStorage
   («lbs-tema»); sem escolha, segue o sistema e acompanha se ele mudar. Ícones = Lucide Moon/Sun,
   os mesmos do alternador do Tier Empresas (Sidebar). */
(function () {
  var KEY = 'lbs-tema', h = document.documentElement;
  var mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function sistema() { return mq && mq.matches ? 'dark' : 'light'; }
  function ler() { try { var v = localStorage.getItem(KEY); return v === 'dark' || v === 'light' ? v : null; } catch (e) { return null; } }
  function aplicar(t) {
    h.setAttribute('data-theme', t);
    var bts = document.querySelectorAll('[data-tema-toggle]');
    for (var i = 0; i < bts.length; i++) {
      var b = bts[i], rot = t === 'dark' ? 'Tema claro' : 'Tema escuro';
      b.setAttribute('aria-label', rot); b.setAttribute('title', rot);
      var l = b.querySelector('[data-tema-rotulo]'); if (l) l.textContent = t === 'dark' ? 'Escuro' : 'Claro';
    }
  }
  aplicar(ler() || sistema());
  if (mq && mq.addEventListener) mq.addEventListener('change', function (e) { if (!ler()) aplicar(e.matches ? 'dark' : 'light'); });

  var LUA = '<svg class="lua" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';
  var SOL = '<svg class="sol" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>';

  function montar() {
    var bts = document.querySelectorAll('[data-tema-toggle]');
    if (!bts.length) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'lbs-tema lbs-tema--flutuante'; b.setAttribute('data-tema-toggle', '');
      document.body.appendChild(b); bts = [b];
    }
    for (var i = 0; i < bts.length; i++) (function (b) {
      if (!b.querySelector('.lbs-tema-ico')) b.insertAdjacentHTML('afterbegin', '<span class="lbs-tema-ico">' + LUA + SOL + '</span>');
      b.addEventListener('click', function () {
        var t = h.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem(KEY, t); } catch (e) {}
        aplicar(t);
      });
    })(bts[i]);
    aplicar(h.getAttribute('data-theme') || sistema());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
})();

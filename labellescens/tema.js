/* La Belle Scens — tema claro/escuro. Carregado no <head> (bloqueante e minúsculo) para aplicar
   o tema ANTES da primeira pintura; o botão entra quando o DOM existe. Escolha em localStorage
   («lbs-tema»); sem escolha, segue o sistema e acompanha se ele mudar. Ícone = «Half 2» dos Radix Icons, o do alternador do Tier Empresas. */
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

  /* Ícone: «Half 2» dos Radix Icons (MIT) — o do alternador do Tier Empresas. Um só desenho; no escuro ele espelha. */
  var MEIA = '<svg class="meia" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M7.49915 0.876892C11.1566 0.876892 14.1218 3.84163 14.1222 7.49896C14.1222 11.1566 11.1568 14.122 7.49915 14.122C3.84181 14.1216 0.877075 11.1564 0.877075 7.49896C0.877487 3.84188 3.84206 0.877303 7.49915 0.876892ZM7.49915 1.82611C4.36673 1.82652 1.82671 4.36655 1.82629 7.49896C1.82629 10.6317 4.36648 13.1714 7.49915 13.1718L7.50012 13.1708V1.82611H7.49915Z" fill="currentColor"/></svg>';

  function montar() {
    var bts = document.querySelectorAll('[data-tema-toggle]');
    if (!bts.length) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'lbs-tema lbs-tema--flutuante'; b.setAttribute('data-tema-toggle', '');
      document.body.appendChild(b); bts = [b];
    }
    for (var i = 0; i < bts.length; i++) (function (b) {
      if (!b.querySelector('.lbs-tema-ico')) b.insertAdjacentHTML('afterbegin', '<span class="lbs-tema-ico">' + MEIA + '</span>');
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

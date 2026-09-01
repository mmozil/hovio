/* La Belle Scens — tema claro/escuro. Carregado no <head> (bloqueante e minúsculo) para aplicar
   o tema ANTES da primeira pintura; o botão entra quando o DOM existe. Escolha em localStorage
   («lbs-tema»); sem escolha, segue o sistema e acompanha se ele mudar. Ícone = icon_shadelight.svg (do dono). */
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

  /* Dentro da casca (/painel/): a página esconde o próprio botão de tema e o «Voltar», e os links para
     outras páginas passam a rotear pela casca. O tema chega pelo evento storage (mesma origem). */
  var embutido = false; try { embutido = window.self !== window.top; } catch (e) { embutido = true; }
  if (embutido) h.classList.add('lbs-embutido');
  window.addEventListener('storage', function (e) { if (e.key === KEY) aplicar(e.newValue === 'dark' || e.newValue === 'light' ? e.newValue : sistema()); });
  function rotearNaCasca() {
    if (!embutido) return;
    var mapa = { '/planning/': 'planning', '/pesquisa/': 'pesquisa', '/fluxo/comparativo.html': 'comparativo', '/fluxo/investimento.html': 'investimento', '/design-system/': 'design', '/fluxo/a.html': 'planning' };
    var links = document.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      var l = links[i], href = l.getAttribute('href') || '';
      if (href.indexOf('/painel/') === 0) { l.setAttribute('href', '/painel/' + (href.indexOf('#') > -1 ? href.slice(href.indexOf('#')) : '')); l.setAttribute('target', '_top'); continue; }
      var caminho = href.split('#')[0], frag = href.indexOf('#') > -1 ? href.slice(href.indexOf('#') + 1) : '';
      if (mapa[caminho]) { l.setAttribute('href', '/painel/#' + mapa[caminho] + (frag ? '/' + frag : '')); l.setAttribute('target', '_top'); }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', rotearNaCasca); else rotearNaCasca();
  if (mq && mq.addEventListener) mq.addEventListener('change', function (e) { if (!ler()) aplicar(e.matches ? 'dark' : 'light'); });

  /* Ícone: o SVG fornecido pelo dono (icon_shadelight.svg — anel + hachura diagonal na metade inferior direita),
     com o traço em currentColor para seguir a cor do botão e o tema. */
  var MEIA = '<svg class="meia" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" viewBox="0 0 80 80"><defs><clipPath id="lbs-tema-inner"><circle cx="111" cy="99" r="27"/></clipPath><clipPath id="lbs-tema-half"><path d="M -1000 -1012 L 1000 988 L 1000 2000 L -1000 2000 Z"/></clipPath></defs><g transform="translate(-71 -59)"><g clip-path="url(#lbs-tema-inner)"><g clip-path="url(#lbs-tema-half)"><line x1="0" y1="184.5" x2="238" y2="-53.5" stroke="currentColor" stroke-width="5.75" stroke-linecap="butt"/><line x1="0" y1="201" x2="238" y2="-37" stroke="currentColor" stroke-width="5.75" stroke-linecap="butt"/><line x1="0" y1="218" x2="238" y2="-20" stroke="currentColor" stroke-width="5.75" stroke-linecap="butt"/><line x1="0" y1="235" x2="238" y2="-3" stroke="currentColor" stroke-width="5.75" stroke-linecap="butt"/></g></g><circle cx="111" cy="99" r="31.5" fill="none" stroke="currentColor" stroke-width="9"/></g></svg>';

  function montar() {
    var bts = document.querySelectorAll('[data-tema-toggle]');
    if (!bts.length && !embutido) {
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

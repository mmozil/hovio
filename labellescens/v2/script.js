(() => {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (n, min, max) => Math.max(min, Math.min(n, max));

  // Preloader
  const preloader = document.querySelector('.preloader');
  const preloaderLine = document.querySelector('.preloader__line i');
  const preloaderCount = document.querySelector('.preloader__count');
  if (preloader && !reducedMotion) {
    let value = 0;
    const tick = () => {
      value += Math.ceil((100 - value) * 0.12);
      value = Math.min(value, 100);
      preloaderLine.style.width = `${value}%`;
      preloaderCount.textContent = String(value).padStart(2, '0');
      if (value < 100) requestAnimationFrame(tick);
      else setTimeout(() => preloader.classList.add('is-done'), 350);
    };
    requestAnimationFrame(tick);
  } else if (preloader) {
    preloader.classList.add('is-done');
  }

  // Announcement carousel
  const announcements = [...document.querySelectorAll('.announcement__item')];
  let announcementIndex = 0;
  const showAnnouncement = (next) => {
    announcements[announcementIndex]?.classList.remove('is-active');
    announcementIndex = (next + announcements.length) % announcements.length;
    announcements[announcementIndex]?.classList.add('is-active');
  };
  document.querySelector('.announcement__nav--next')?.addEventListener('click', () => showAnnouncement(announcementIndex + 1));
  document.querySelector('.announcement__nav--prev')?.addEventListener('click', () => showAnnouncement(announcementIndex - 1));
  if (!reducedMotion) setInterval(() => showAnnouncement(announcementIndex + 1), 6000);

  // Mega menu
  const menu = document.querySelector('.mega-menu');
  const menuToggle = document.querySelector('.menu-toggle');
  const menuClose = document.querySelector('.mega-menu__close');
  const backdrop = document.querySelector('.menu-backdrop');
  let lastFocused = null;

  const setMenu = (open) => {
    if (!menu) return;
    if (open) lastFocused = document.activeElement;
    menu.classList.toggle('is-open', open);
    backdrop?.classList.toggle('is-open', open);
    document.body.classList.toggle('menu-open', open);
    menu.setAttribute('aria-hidden', String(!open));
    menuToggle?.setAttribute('aria-expanded', String(open));
    if (open) setTimeout(() => menuClose?.focus(), 80);
    else lastFocused?.focus?.();
  };

  menuToggle?.addEventListener('click', () => setMenu(true));
  menuClose?.addEventListener('click', () => setMenu(false));
  backdrop?.addEventListener('click', () => setMenu(false));
  menu?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && menu?.classList.contains('is-open')) setMenu(false);
    if (e.key === 'Tab' && menu?.classList.contains('is-open')) {
      const focusable = [...menu.querySelectorAll('a, button')].filter(el => !el.disabled);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // Reveal animations
  const revealElements = document.querySelectorAll('.reveal-up, .reveal-title');
  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.16, rootMargin: '0px 0px -6% 0px' });
    revealElements.forEach(el => revealObserver.observe(el));
  } else {
    revealElements.forEach(el => el.classList.add('is-visible'));
  }

  // Header theme, solid state and hide/reveal
  const header = document.querySelector('.site-header');
  const themedSections = [...document.querySelectorAll('[data-header]')];
  let lastScroll = window.scrollY;
  let ticking = false;

  const updateHeader = () => {
    const y = window.scrollY;
    const directionDown = y > lastScroll;
    header?.classList.toggle('is-solid', y > 60);
    header?.classList.toggle('is-hidden', directionDown && y > 220 && Math.abs(y - lastScroll) > 3);
    if (!directionDown) header?.classList.remove('is-hidden');

    const probe = 85;
    let current = themedSections[0];
    for (const section of themedSections) {
      const rect = section.getBoundingClientRect();
      if (rect.top <= probe && rect.bottom > probe) current = section;
    }
    const theme = current?.dataset.header || 'dark';
    header?.setAttribute('data-header-theme', theme);
    lastScroll = y;
    ticking = false;
  };

  window.addEventListener('scroll', () => {
    if (!ticking) { requestAnimationFrame(updateHeader); ticking = true; }
  }, { passive: true });
  updateHeader();

  // Parallax
  const parallaxItems = [...document.querySelectorAll('.media-parallax')];
  const updateParallax = () => {
    if (reducedMotion) return;
    const vh = window.innerHeight;
    parallaxItems.forEach(item => {
      const rect = item.getBoundingClientRect();
      if (rect.bottom < -100 || rect.top > vh + 100) return;
      const speed = parseFloat(item.dataset.speed || '0.08');
      const centerDelta = (rect.top + rect.height / 2) - vh / 2;
      const y = clamp(-centerDelta * speed, -80, 80);
      item.style.setProperty('--parallax-y', `${y}px`);
    });
  };
  if (!reducedMotion) {
    let parallaxTick = false;
    window.addEventListener('scroll', () => {
      if (!parallaxTick) {
        requestAnimationFrame(() => { updateParallax(); parallaxTick = false; });
        parallaxTick = true;
      }
    }, { passive: true });
    window.addEventListener('resize', updateParallax);
    updateParallax();
  }

  // Sticky story scenes
  const storySteps = [...document.querySelectorAll('.story-step')];
  const storyScenes = [...document.querySelectorAll('.story-scene')];
  const storyCounter = document.querySelector('.story__counter span');
  const storyProgress = document.querySelector('.story__counter');
  if (storySteps.length && 'IntersectionObserver' in window) {
    const storyObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const scene = Number(entry.target.dataset.scene);
        storySteps.forEach(step => step.classList.toggle('is-active', step === entry.target));
        storyScenes.forEach((item, i) => item.classList.toggle('is-active', i === scene - 1));
        if (storyCounter) storyCounter.textContent = String(scene).padStart(2, '0');
        storyProgress?.style.setProperty('--story-progress', `${scene * 33.333}%`);
      });
    }, { threshold: 0.56 });
    storySteps.forEach(step => storyObserver.observe(step));
  }

  // Services carousel
  const track = document.querySelector('.services__track');
  const prev = document.querySelector('.carousel-btn--prev');
  const next = document.querySelector('.carousel-btn--next');
  const currentLabel = document.querySelector('.carousel-current');
  const scrollCards = (dir) => {
    if (!track) return;
    const card = track.querySelector('.service-card');
    const amount = (card?.getBoundingClientRect().width || 320) + 16;
    track.scrollBy({ left: amount * dir, behavior: reducedMotion ? 'auto' : 'smooth' });
  };
  prev?.addEventListener('click', () => scrollCards(-1));
  next?.addEventListener('click', () => scrollCards(1));
  track?.addEventListener('scroll', () => {
    const card = track.querySelector('.service-card');
    if (!card) return;
    const amount = card.getBoundingClientRect().width + 16;
    const index = Math.round(track.scrollLeft / amount) + 1;
    if (currentLabel) currentLabel.textContent = String(clamp(index, 1, 3));
  }, { passive: true });

  // Newsletter validation
  const form = document.querySelector('.newsletter__form');
  form?.addEventListener('submit', e => {
    e.preventDefault();
    const email = form.querySelector('input[type="email"]');
    const consent = form.querySelector('input[type="checkbox"]');
    const status = form.querySelector('.newsletter__status');
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim());
    status.classList.remove('is-error');
    if (!validEmail || !consent.checked) {
      status.textContent = !validEmail ? 'Digite um e-mail válido.' : 'Confirme a política de privacidade.';
      status.classList.add('is-error');
      return;
    }
    status.textContent = 'Inscrição confirmada. Bem-vindo à Maison Élan.';
    form.reset();
  });

  // Custom cursor for rich media
  const cursor = document.querySelector('.cursor');
  const hoverTargets = document.querySelectorAll('.media-hover');
  if (cursor && window.matchMedia('(pointer:fine)').matches) {
    window.addEventListener('mousemove', e => {
      cursor.style.left = `${e.clientX}px`;
      cursor.style.top = `${e.clientY}px`;
    });
    hoverTargets.forEach(target => {
      target.addEventListener('mouseenter', () => cursor.classList.add('is-active'));
      target.addEventListener('mouseleave', () => cursor.classList.remove('is-active'));
    });
  }

  // Prevent placeholder links from jumping to top.
  document.querySelectorAll('a[href="#"]').forEach(link => link.addEventListener('click', e => e.preventDefault()));
})();

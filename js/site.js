/* Bouquets ASCII: the site (search, cards, viewer). Needs engine.js. */
(() => {
  'use strict';
  const E = window.BouquetEngine;
  const $ = s => document.querySelector(s);
  const { frame, micro, measure, INK, ACCENT } = window.AsciiUI;
  const rgbCss = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

  // ---------- search: words -> species x colours ----------
  const fold = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const SPECIES_WORDS = {
    lys: ['lys', 'lis', 'lily', 'lilies', 'lilium', 'lilys'],
    lycoris: ['lycoris', 'lychoris', 'licoris', 'lycori', 'higanbana', 'spider', 'araignee', 'araignees', 'manjushage', 'radiata'],
    tournesol: ['tournesol', 'tournesols', 'tournsol', 'sunflower', 'sunflowers', 'helianthus', 'soleil', 'soleils', 'girasol', 'girasole'],
  };
  const COLOR_WORDS = {
    rouge: ['rouge', 'rouges', 'red', 'ecarlate', 'vermillon'], blanc: ['blanc', 'blanche', 'blancs', 'blanches', 'white'],
    bleu: ['bleu', 'bleue', 'bleus', 'bleues', 'blue', 'azur'], rose: ['rose', 'roses', 'pink'],
    jaune: ['jaune', 'jaunes', 'yellow'], dore: ['dore', 'doree', 'dores', 'gold', 'golden'],
    orange: ['orange', 'oranges'], violet: ['violet', 'violette', 'violets', 'purple', 'pourpre', 'mauve'],
    peche: ['peche', 'peach'], carmin: ['carmin', 'crimson'], corail: ['corail', 'coral'],
    lavande: ['lavande', 'lavender', 'lilas'], turquoise: ['turquoise', 'cyan'], vert: ['vert', 'verte', 'green'],
    noir: ['noir', 'noire', 'black'], creme: ['creme', 'cream', 'ivoire'], fuchsia: ['fuchsia', 'magenta'],
    bordeaux: ['bordeaux', 'burgundy'], saumon: ['saumon', 'salmon'], citron: ['citron', 'lemon'],
    melange: ['melange', 'mix', 'mixte', 'multicolore', 'arcenciel', 'couleurs', 'rainbow', 'tout'],
  };
  const PHRASES = [['spider lily', 'lycoris'], ['lis araignee', 'lycoris'], ['lys araignee', 'lycoris'], ['fleur araignee', 'lycoris'], ['arc en ciel', 'arcenciel'], ['bleu ciel', 'bleu']];
  const STOP = new Set('je j cherche chercher recherche du de des d un une le la les l bouquet bouquets fleur fleurs en et avec pour moi voudrais veux aimerais il vous plait svp please a au aux couleur color of the some i want me un peu tres'.split(' '));
  const LEX = [];
  for (const k in SPECIES_WORDS) for (const w of SPECIES_WORDS[k]) LEX.push({ w, type: 'species', key: k });
  for (const k in COLOR_WORDS) for (const w of COLOR_WORDS[k]) LEX.push({ w, type: 'color', key: k });

  function lev(a, b) {
    const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i]);
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  function parse(q) {
    let s = ' ' + fold(q).replace(/[^a-z0-9#\s]/g, ' ') + ' ';
    for (const [p, r] of PHRASES) s = s.split(' ' + p + ' ').join(' ' + r + ' ');
    const species = [], colors = [], unknown = [];
    const push = (arr, v) => { if (!arr.includes(v)) arr.push(v); };
    for (const t of s.split(/\s+/).filter(Boolean)) {
      if (STOP.has(t)) continue;
      const hx = t.match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/);
      if (hx && (t[0] === '#' || /[0-9]/.test(t))) {
        let h = hx[1]; if (h.length === 3) h = h.split('').map(c => c + c).join('');
        push(colors, '#' + h); continue;
      }
      let hit = LEX.find(e => e.w === t);
      if (!hit && t.length >= 4) {
        const tol = t.length >= 7 ? 2 : 1;
        let best = null, bd = 9;
        for (const e of LEX) { if (Math.abs(e.w.length - t.length) > tol) continue; const d = lev(t, e.w); if (d < bd) { bd = d; best = e; } }
        if (best && bd <= tol) hit = best;
      }
      if (!hit) { unknown.push(t); continue; }
      push(hit.type === 'species' ? species : colors, hit.key);
    }
    return { species, colors, unknown };
  }
  const DEFAULT_COLORS = {
    lys: ['melange', 'rouge', 'rose', 'blanc', 'jaune', 'orange'],
    lycoris: ['rouge', 'blanc', 'bleu', 'dore', 'rose', 'melange'],
    tournesol: ['jaune', 'orange', 'rouge', 'creme', 'citron', 'melange'],
  };
  const ALL_SPECIES = Object.keys(E.SPECIES);
  const FEATURED = [['lycoris', 'rouge'], ['tournesol', 'jaune'], ['lys', 'melange'], ['lycoris', 'blanc'],
    ['tournesol', 'rouge'], ['lys', 'rose'], ['lycoris', 'bleu'], ['tournesol', 'melange']];
  function results(q) {
    const p = parse(q);
    if (!q.trim()) return { p, list: FEATURED };
    if (!p.species.length && !p.colors.length) return { p, list: [] };
    const sp = p.species.length ? p.species : ALL_SPECIES;
    const list = [];
    for (const s of sp) for (const c of (p.colors.length ? p.colors : DEFAULT_COLORS[s])) list.push([s, c]);
    // very precise search: also suggest a few other colours of the same flower
    const related = [];
    if (list.length <= 2) for (const s of sp) for (const c of DEFAULT_COLORS[s])
      if (!list.some(([a, b]) => a === s && b === c) && related.length < 4) related.push([s, c]);
    return { p, list: list.slice(0, 12), related };
  }

  const colorLabel = c => c[0] === '#' ? c : (E.COLORS[c] ? E.COLORS[c].label : c);
  const titleOf = (s, c) => `${s[0].toUpperCase() + s.slice(1)} ${colorLabel(c)}`;
  const seedOf = str => { let h = 2166136261; for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
  function swatchHTML(s, c, n = 6) {
    const pals = E.paletteFor(s, c);
    let out = '';
    for (let i = 0; i < n; i++) out += `<span style="color:${rgbCss(pals[i % pals.length].base)}">#</span>`;
    return out;
  }
  const fullHref = (s, c) => `plein-ecran.html?espece=${s}&couleur=${encodeURIComponent(c[0] === '#' ? c.slice(1) : c)}`;

  // ---------- cards (rendered one at a time so typing stays smooth) ----------
  const grid = $('#grid'), status = $('#status');
  let cards = [], queue = [], pumping = false, gen = 0;
  function pump() {
    const job = queue.shift();
    if (!job) { pumping = false; return; }
    pumping = true;
    setTimeout(() => { try { job(); } catch (e) { console.error(e); } pump(); }, 20);
  }
  function showResults(q) {
    gen++;
    const myGen = gen;
    queue = [];
    for (const c of cards) c.engine && c.engine.destroy();
    cards = [];
    grid.innerHTML = '';
    const { p, list, related = [] } = results(q);
    const shown = q.trim() ? `"${q.trim()}"` : 'la vitrine';
    let line = list.length ? ` ${list.length} bouquet${list.length > 1 ? 's' : ''} pour ` : ' rien ne pousse pour ';
    const bar = '='.repeat(6);
    status.innerHTML = `${bar}${line}<span class="q">${escapeHTML(shown)}</span> ${bar}`;
    if (p.unknown.length && list.length) status.innerHTML += `\n<span class="muted">(mots ignor&eacute;s : ${escapeHTML(p.unknown.join(', '))})</span>`;
    if (!list.length) {
      grid.innerHTML = `<div class="empty"><pre>    __
   (  )   hmm... aucune graine
    ||    ne correspond.
  \\_||_/
</pre><p>pour l'instant le fleuriste a du <button class="abtn" data-q="lys">[ lys ]</button>, du <button class="abtn" data-q="lycoris">[ lycoris ]</button> et des <button class="abtn" data-q="tournesol">[ tournesols ]</button>,
dans toutes les couleurs (essaie aussi un code comme <button class="abtn" data-q="lycoris #33aaff">[ #33aaff ]</button>).</p></div>`;
      return;
    }
    const all = list.concat(related);
    all.forEach(([s, c], i) => {
      if (i === list.length) {
        const sep = document.createElement('p');
        sep.className = 'status sep muted';
        sep.textContent = "------ d'autres couleurs qui pourraient te plaire ------";
        grid.appendChild(sep);
      }
      const el = document.createElement('article');
      el.className = 'card'; el.dataset.frame = 'box';
      el.innerHTML = `<canvas class="win" aria-label="${escapeHTML(titleOf(s, c))} en ASCII"></canvas>
        <div class="loading" aria-hidden="true">[ . . pousse . . ]</div>
        <h3>${escapeHTML(titleOf(s, c))}</h3>
        <p class="latin">${E.SPECIES[s].latin}</p>
        <div class="meta"><span class="swatch" aria-hidden="true">${swatchHTML(s, c)}</span>
          <span><button class="abtn" data-open>[ voir ]</button> <a class="abtn" href="${fullHref(s, c)}" target="_blank" rel="noopener">[ plein &eacute;cran ]</a></span></div>`;
      grid.appendChild(el);
      frame(el);
      const card = { el, s, c, engine: null };
      cards.push(card);
      const cv = el.querySelector('canvas');
      queue.push(() => {
        if (myGen !== gen) return;
        card.engine = E.create(cv, { species: s, color: c, seed: seedOf(s + c), time: 14, yaw: (seedOf(c) % 628) / 100, pitch: .12, fontPx: 5, spinSpeed: .5, fit: .96 });
        card.engine.render();
        el.querySelector('.loading').remove();
      });
      el.addEventListener('mouseenter', () => card.engine && card.engine.play());
      el.addEventListener('mouseleave', () => card.engine && card.engine.stop());
      cv.addEventListener('click', () => openViewer(s, c));
      el.querySelector('[data-open]').addEventListener('click', () => openViewer(s, c));
    });
    if (!pumping) pump();
  }
  const escapeHTML = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  // ---------- search box ----------
  const input = $('#q'), qcanvas = $('#qcanvas'), caret = $('#caret'), field = $('.field');
  const PLACEHOLDER = 'lys, lycoris bleu...';
  const Q = { size: 64, cell: [5, 6], charPx: 7, x: 4 };
  let lastDraw = { x: 0 };
  function drawQuery() {
    const v = input.value;
    const narrow = field.clientHeight < 80;
    Q.size = narrow ? 46 : 64;
    Q.cell = narrow ? [3, 4] : [5, 6];
    Q.charPx = narrow ? 5 : 7;
    input.style.fontSize = Q.size + 'px';
    if (v) lastDraw = micro(qcanvas, v, { ...Q, keepEnd: true, color: (x, y, h) => (h % 9 === 0 ? ACCENT : INK) });
    else { lastDraw = micro(qcanvas, PLACEHOLDER, { ...Q, alpha: .28 }); lastDraw.w = 0; }
    placeCaret();
  }
  function placeCaret() {
    const v = input.value, pos = input.selectionStart ?? v.length;
    const x = (v ? lastDraw.x : Q.x) + measure(v.slice(0, pos), Q.size);
    caret.style.left = Math.round(x + 2) + 'px';
    caret.textContent = '|\n|\n|\n|\n|\n|\n|\n|';
  }
  let timer = 0;
  function runSearch(now) {
    clearTimeout(timer);
    const go = () => { showResults(input.value); const h = input.value.trim() ? '#q=' + encodeURIComponent(input.value.trim()) : ' '; history.replaceState(null, '', h === ' ' ? location.pathname : h); };
    if (now) go(); else timer = setTimeout(go, 320);
  }
  input.addEventListener('input', () => { drawQuery(); runSearch(false); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); runSearch(true); } });
  ['keyup', 'click', 'select'].forEach(ev => input.addEventListener(ev, placeCaret));
  input.addEventListener('focus', () => { field.classList.add('focus'); placeCaret(); });
  input.addEventListener('blur', () => field.classList.remove('focus'));
  $('#go').addEventListener('click', () => { runSearch(true); input.focus(); });
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-q]');
    if (!b) return;
    input.value = b.dataset.q; drawQuery(); runSearch(true);
    window.scrollTo({ top: $('#searchBox').offsetTop - 20, behavior: 'smooth' });
  });

  // ---------- title ----------
  const titleCv = $('#title');
  function drawTitle() {
    const W = titleCv.clientWidth, H = titleCv.clientHeight;
    const text = 'Bouquets ASCII';
    const size = Math.min(H * .95, W * .92 / (measure(text, 100) / 100));
    const split = (W - measure(text, size)) / 2 + measure('Bouquets ', size);
    const cell = W < 600 ? [3, 3] : [5, 6];
    micro(titleCv, text, { size, align: 'center', cell, charPx: cell[1] + (W < 600 ? 2 : 1), color: (x, y, h) => x >= split ? (h % 7 === 0 ? INK : ACCENT) : (h % 11 === 0 ? ACCENT : INK) });
  }

  // ---------- viewer ----------
  const viewer = $('#viewer'), vcanvas = $('#vcanvas');
  const VIEW_COLORS = {
    lys: ['melange', 'rouge', 'rose', 'blanc', 'creme', 'jaune', 'orange', 'peche', 'carmin', 'violet', 'bleu'],
    lycoris: ['rouge', 'blanc', 'bleu', 'dore', 'rose', 'orange', 'violet', 'melange'],
    tournesol: ['jaune', 'orange', 'rouge', 'creme', 'citron', 'dore', 'bordeaux', 'rose', 'melange'],
  };
  let vEngine = null, vSpecies = 'lys', vColor = 'melange', lastFocus = null;
  function radio(label, checked, onPick, colorHTML = '') {
    const b = document.createElement('button');
    b.className = 'abtn'; b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(checked));
    b.innerHTML = `${checked ? '(*)' : '( )'} ${colorHTML}${escapeHTML(label)}`;
    b.addEventListener('click', onPick);
    return b;
  }
  function vRefresh() {
    const sp = $('#vspecies'); sp.innerHTML = '';
    for (const s of ALL_SPECIES) sp.appendChild(radio(s, s === vSpecies, () => {
      vSpecies = s;
      if (!VIEW_COLORS[s].includes(vColor) && vColor[0] !== '#') vColor = VIEW_COLORS[s][0];
      vEngine.setSpecies(s); vEngine.setColor(vColor); vRefresh();
    }));
    const cl = $('#vcolors'); cl.innerHTML = '';
    const list = VIEW_COLORS[vSpecies].slice();
    if (vColor[0] === '#' && !list.includes(vColor)) list.push(vColor);
    for (const c of list) cl.appendChild(radio(colorLabel(c), c === vColor, () => { vColor = c; vEngine.setColor(c); vRefresh(); },
      `<span class="swatch">${swatchHTML(vSpecies, c, 3)}</span> `));
    const t = titleOf(vSpecies, vColor);
    $('#vTitleText').textContent = t;
    $('#vlatin').textContent = E.SPECIES[vSpecies].latin;
    $('#vfull').href = fullHref(vSpecies, vColor);
    const vt = $('#vtitle'), fitSize = Math.min(72, (vt.clientWidth - 8) / (measure(t, 100) / 100));
    micro(vt, t, { size: fitSize, x: 2, cell: [4, 5], charPx: 6, color: (x, y, h) => h % 8 === 0 ? ACCENT : INK });
  }
  function openViewer(s, c) {
    lastFocus = document.activeElement;
    vSpecies = s; vColor = c;
    viewer.hidden = false;
    document.body.style.overflow = 'hidden';
    for (const card of cards) card.engine && card.engine.stop();
    requestAnimationFrame(() => {
      vEngine = E.create(vcanvas, { species: s, color: c, interactive: true, time: 0 });
      vEngine.play();
      window.bouquetSite.viewer = vEngine;
      $('#vmode').textContent = '[ mode : ascii ]';
      $('#vspin').textContent = '[ rotation : oui ]';
      vRefresh();
      viewer.querySelector('[data-v="close"]').focus();
    });
  }
  function closeViewer() {
    if (viewer.hidden) return;
    vEngine && vEngine.destroy(); vEngine = null;
    viewer.hidden = true;
    document.body.style.overflow = '';
    lastFocus && lastFocus.focus && lastFocus.focus();
  }
  viewer.addEventListener('click', e => {
    if (e.target === viewer) return closeViewer();
    const b = e.target.closest('[data-v]');
    if (!b || !vEngine) return;
    const act = b.dataset.v;
    if (act === 'close') closeViewer();
    else if (act === 'replant') vEngine.replant();
    else if (act === 'custom') {
      const start = [{ species: vSpecies, color: vColor, count: { lys: 8, lycoris: 6, tournesol: 5 }[vSpecies] || 6 }];
      closeViewer();
      window.Composer.openEdit(start);
    }
    else if (act === 'mode') { vEngine.setMode(vEngine.mode === 'ascii' ? 'code' : 'ascii'); b.textContent = `[ mode : ${vEngine.mode} ]`; }
    else if (act === 'spin') { vEngine.setAutoSpin(!vEngine.autoSpin); b.textContent = `[ rotation : ${vEngine.autoSpin ? 'oui' : 'non'} ]`; }
  });
  const picker = $('#vpicker');
  $('#vcustom').addEventListener('click', () => { picker.value = vColor[0] === '#' ? vColor : '#3a6ee8'; picker.click(); });
  picker.addEventListener('input', () => { vColor = picker.value; vEngine && vEngine.setColor(vColor); vRefresh(); });
  document.addEventListener('keydown', e => {
    if (viewer.hidden) return; // (the composer handles its own keys)
    if (e.key === 'Escape') closeViewer();
    if (e.key === 'Tab') { // keep focus inside the dialog
      const f = [...viewer.querySelectorAll('button, a[href]')].filter(x => x.offsetParent);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });

  // ---------- start ----------
  document.querySelectorAll('[data-frame]').forEach(frame);
  function redrawText() { drawTitle(); drawQuery(); }
  let rz = 0;
  addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(redrawText, 120); });
  const start = () => {
    const m = location.hash.match(/^#q=(.*)$/);
    if (m) input.value = decodeURIComponent(m[1]);
    redrawText();
    showResults(input.value);
    // a bouquet sent by a friend: #b=<code>
    const b = location.hash.match(/^#b=(.+)$/);
    if (b && window.Composer) window.Composer.receive(b[1]);
  };
  // wait for the handwritten font (falls back to a system one when offline)
  const fontReady = document.fonts ? Promise.race([document.fonts.load('58px "Caveat Brush"'), new Promise(r => setTimeout(r, 2500))]) : Promise.resolve();
  fontReady.then(start, start);

  window.bouquetSite = {
    parse, results: q => results(q).list, related: q => results(q).related, open: openViewer, close: closeViewer, viewer: null,
    get cards() { return cards; },
    // shared with composer.js
    colorLabel, swatchHTML, titleOf, VIEW_COLORS, ALL_SPECIES,
    stopCards() { for (const c of cards) c.engine && c.engine.stop(); },
  };
})();

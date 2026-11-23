/* Bouquets ASCII: compose your own bouquet and send it.
   No account and no server: the link carries a short recipe (species, colour and count IDs + a layout seed),
   and the friend's browser rebuilds exactly the same bouquet from it. Needs engine.js, ui.js, site.js. */
(() => {
  'use strict';
  const E = window.BouquetEngine, S = window.bouquetSite, UI = window.AsciiUI;
  const $ = s => document.querySelector(s);
  const box = $('#composer'), cv = $('#ccanvas');
  const MAX = E.code.MAX_STEMS, PER_ROW = 12;
  const START = [{ species: 'lys', color: 'rouge', count: 3 }, { species: 'tournesol', color: 'jaune', count: 2 }, { species: 'lycoris', color: 'blanc', count: 3 }];

  let eng = null, recipe = [], seed = 0, mode = 'edit', received = null, lastFocus = null, link = '';
  let addSpecies = 'lys', addColor = 'rouge';
  const total = () => recipe.reduce((a, e) => a + e.count, 0);
  const copyRecipe = () => recipe.map(e => ({ ...e }));
  const rowText = e => `${String(e.count).padStart(2)} x ${E.SPECIES[e.species].label} ${S.colorLabel(e.color, e.species)}`;
  const newSeed = () => (Math.random() * 1e9) | 0;

  // ---------- engine ----------
  function startEngine(t) {
    if (eng) eng.destroy();
    eng = E.create(cv, { species: 'lys', recipe: copyRecipe(), seed, interactive: true, time: t, spinSpeed: .1 });
    eng.play();
  }
  function sync() {
    eng && eng.setRecipe(copyRecipe());
    renderRows(); renderAdd(); hideShare();
  }

  // ---------- panel ----------
  function radio(label, checked, onPick, pre = '') {
    const b = document.createElement('button');
    b.className = 'abtn'; b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(checked));
    b.innerHTML = `${checked ? '(*)' : '( )'} ${pre}`;
    b.append(label);
    b.addEventListener('click', onPick);
    return b;
  }
  function renderRows() {
    const rows = $('#cRows');
    rows.innerHTML = '';
    $('#cCount').textContent = `-- dans ton bouquet (${total()}/${MAX} tiges) --`;
    if (!recipe.length) { rows.innerHTML = '<p class="cempty">  (vide : ajoute des fleurs juste en dessous)</p>'; return; }
    recipe.forEach((e, i) => {
      const d = document.createElement('div');
      d.className = 'crow';
      d.innerHTML = `<span class="swatch" aria-hidden="true">${S.swatchHTML(e.species, e.color, 3)}</span><span class="what"></span>
        <button class="abtn" data-r="-" type="button">[-]</button><button class="abtn" data-r="+" type="button">[+]</button><button class="abtn" data-r="x" type="button">[x]</button>`;
      d.querySelector('.what').textContent = rowText(e);
      const name = `${E.SPECIES[e.species].label} ${S.colorLabel(e.color, e.species)}`;
      d.querySelector('[data-r="-"]').setAttribute('aria-label', `Une tige de moins : ${name}`);
      d.querySelector('[data-r="+"]').setAttribute('aria-label', `Une tige de plus : ${name}`);
      d.querySelector('[data-r="x"]').setAttribute('aria-label', `Retirer : ${name}`);
      d.addEventListener('click', ev => {
        const b = ev.target.closest('[data-r]');
        if (!b) return;
        const a = b.dataset.r;
        if (a === '+') { if (total() < MAX && e.count < PER_ROW) e.count++; else return; }
        else if (a === '-') { e.count--; if (e.count <= 0) recipe.splice(i, 1); }
        else recipe.splice(i, 1);
        sync();
        // keep keyboard focus on the same control after the list is redrawn
        const again = $('#cRows').children[Math.min(i, recipe.length - 1)];
        again && again.querySelector(`[data-r="${a === 'x' ? '+' : a}"]`)?.focus();
      });
      rows.appendChild(d);
    });
  }
  function renderAdd() {
    const sp = $('#cSpecies');
    sp.innerHTML = '';
    for (const s of S.ALL_SPECIES) sp.appendChild(radio(s, s === addSpecies, () => { addSpecies = s; renderAdd(); }));
    const list = S.VIEW_COLORS[addSpecies].slice();
    if (addColor[0] === '#') list.push(addColor);
    else if (!list.includes(addColor)) addColor = list[0];
    const cl = $('#cColors');
    cl.innerHTML = '';
    for (const c of list) cl.appendChild(radio(S.colorLabel(c), c === addColor, () => { addColor = c; renderAdd(); },
      `<span class="swatch">${S.swatchHTML(addSpecies, c, 2)}</span> `));
    const room = Math.min(3, MAX - total());
    const btn = $('#cAdd');
    btn.textContent = room > 0 ? `[ + ajouter ${room} tige${room > 1 ? 's' : ''} ]` : `[ bouquet plein : ${MAX} tiges ]`;
    btn.disabled = room <= 0;
  }
  function add() {
    const room = Math.min(3, MAX - total());
    if (room <= 0) return;
    const ex = recipe.find(e => e.species === addSpecies && e.color === addColor);
    if (ex) ex.count = Math.min(PER_ROW, ex.count + room);
    else recipe.push({ species: addSpecies, color: addColor, count: room });
    sync();
  }
  function updateTitle() {
    const msg = $('#cMsg').value.trim();
    const t = mode === 'received' ? (received.message || 'un bouquet pour toi') : (msg || 'mon bouquet');
    $('#cTitleText').textContent = t;
    const vt = $('#ctitle');
    const size = Math.min(66, (vt.clientWidth - 8) / (UI.measure(t, 100) / 100));
    const cell = size < 34 ? [2, 3] : [3, 4];
    UI.micro(vt, t, { size, x: 2, cell, charPx: cell[1] + 1, color: (x, y, h) => h % 8 === 0 ? UI.ACCENT : UI.INK });
  }

  // ---------- open / close ----------
  function show() {
    if (box.hidden) lastFocus = document.activeElement;
    S.close();
    S.stopCards();
    box.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function openEdit(initial, keepSeed) {
    mode = 'edit';
    if (initial) recipe = initial.map(e => ({ ...e }));
    seed = keepSeed ?? newSeed();
    if (initial) $('#cMsg').value = '';
    $('#cReceived').hidden = true; $('#cEdit').hidden = false;
    show();
    requestAnimationFrame(() => {
      if (!eng || initial) startEngine(14);
      renderRows(); renderAdd(); updateTitle(); hideShare();
      $('#cAdd').focus();
    });
  }
  function receive(code) {
    const d = E.code.decode(code);
    if (!d) return false;
    received = d; mode = 'received';
    recipe = d.recipe.map(e => ({ ...e })); seed = d.seed;
    $('#cMsg').value = d.message;
    $('#cReceived').hidden = false; $('#cEdit').hidden = true;
    $('#cRecvList').textContent = recipe.map(rowText).join('\n');
    show();
    requestAnimationFrame(() => { startEngine(0); updateTitle(); box.querySelector('[data-c="grow"]').focus(); });
    return true;
  }
  function close() {
    if (box.hidden) return;
    eng && eng.destroy(); eng = null;
    box.hidden = true;
    document.body.style.overflow = '';
    if (/^#b=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
    lastFocus && lastFocus.focus && lastFocus.focus();
  }

  // ---------- sharing ----------
  function hideShare() { $('#cShare').hidden = true; $('#cCopied').textContent = ''; }
  function share() {
    if (!recipe.length) { $('#cShare').hidden = false; $('#cLink').value = ''; $('#cCopied').textContent = 'ajoute au moins une fleur avant de l\'envoyer !'; return; }
    const code = E.code.encode(seed, recipe, $('#cMsg').value);
    link = location.href.split('#')[0] + '#b=' + code;
    $('#cShare').hidden = false;
    $('#cLink').value = link;
    $('#cNative').hidden = !navigator.share;
    copy();
  }
  function copy() {
    const done = () => { $('#cCopied').textContent = 'lien copié ! colle-le à qui tu veux.'; };
    const fallback = () => {
      const i = $('#cLink'); i.focus(); i.select();
      try { document.execCommand('copy') ? done() : ($('#cCopied').textContent = 'sélectionne le lien et copie-le (Ctrl+C).'); }
      catch (e) { $('#cCopied').textContent = 'sélectionne le lien et copie-le (Ctrl+C).'; }
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(link).then(done, fallback);
    else fallback();
  }

  // ---------- events ----------
  box.addEventListener('click', e => {
    if (e.target === box) return close();
    const b = e.target.closest('[data-c]');
    if (!b) return;
    const act = b.dataset.c;
    if (act === 'close') close();
    else if (act === 'grow') eng && eng.setTime(0);
    else if (act === 'edit') openEdit(null, seed);
    else if (act === 'fresh') openEdit(START);
    else if (act === 'shuffle') { seed = newSeed(); eng && eng.replant(seed).setTime(14); hideShare(); }
    else if (act === 'clear') { recipe = []; sync(); }
    else if (act === 'share') share();
    else if (act === 'copy') copy();
    else if (act === 'native' && navigator.share) navigator.share({ title: 'Un bouquet pour toi', text: $('#cMsg').value.trim() || 'Je t\'ai composé un bouquet', url: link }).catch(() => {});
  });
  $('#cAdd').addEventListener('click', add);
  const picker = $('#cPicker');
  $('#cCustom').addEventListener('click', () => { picker.value = addColor[0] === '#' ? addColor : '#3a6ee8'; picker.click(); });
  picker.addEventListener('input', () => { addColor = picker.value; renderAdd(); });
  let mt = 0;
  $('#cMsg').addEventListener('input', () => { hideShare(); clearTimeout(mt); mt = setTimeout(updateTitle, 150); });
  $('#openComposer').addEventListener('click', () => openEdit(START));
  addEventListener('hashchange', () => { const m = location.hash.match(/^#b=(.+)$/); if (m) receive(m[1]); });
  document.addEventListener('keydown', e => {
    if (box.hidden) return;
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') { // keep focus inside the dialog
      const f = [...box.querySelectorAll('button:not([disabled]), input:not(.sr), a[href]')].filter(x => x.offsetParent);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });
  let rz = 0;
  addEventListener('resize', () => { if (!box.hidden) { clearTimeout(rz); rz = setTimeout(updateTitle, 120); } });

  window.Composer = {
    openEdit, receive, close,
    get engine() { return eng; }, get recipe() { return copyRecipe(); }, get seed() { return seed; }, get link() { return link; },
  };
})();

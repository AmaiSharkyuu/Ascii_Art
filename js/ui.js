/* Bouquets ASCII: shared page helpers. ASCII frames around boxes, and text drawn as tiny symbols.
   window.AsciiUI = { frame, micro, measure, INK, ACCENT } */
(() => {
  'use strict';
  const css = getComputedStyle(document.documentElement);
  const INK = css.getPropertyValue('--ink').trim() || '#2b2520';
  const ACCENT = css.getPropertyValue('--accent').trim() || '#b3262e';
  const HAND = '"Caveat Brush", "Ink Free", "Segoe Print", cursive';

  // ---------- ascii frames: <div data-frame="box|search|viewer"> gets a border made of characters ----------
  const STYLES = {
    box: { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|' },
    search: { tl: '.', tr: '.', bl: "'", br: "'", h: '=', v: '|' },
    viewer: { tl: '#', tr: '#', bl: '#', br: '#', h: '=', v: '#' },
  };
  const charBox = (() => {
    const c = document.createElement('canvas').getContext('2d');
    c.font = `${css.getPropertyValue('--fs').trim() || '14px'} "Cascadia Mono", Consolas, "Courier New", monospace`;
    return { w: c.measureText('M').width, h: parseFloat(css.getPropertyValue('--lh')) || 16 };
  })();
  function frame(el) {
    const S = STYLES[el.dataset.frame] || STYLES.box;
    const pre = document.createElement('pre');
    pre.className = 'frame'; pre.setAttribute('aria-hidden', 'true');
    el.prepend(pre);
    const draw = () => {
      const cols = Math.max(4, Math.floor(el.clientWidth / charBox.w));
      const rows = Math.max(3, Math.floor(el.clientHeight / charBox.h));
      const mid = S.v + ' '.repeat(cols - 2) + S.v + '\n';
      pre.textContent = S.tl + S.h.repeat(cols - 2) + S.tr + '\n' + mid.repeat(rows - 2) + S.bl + S.h.repeat(cols - 2) + S.br;
      // centre the character grid inside the box
      pre.style.left = ((el.clientWidth - cols * charBox.w) / 2) + 'px';
      pre.style.top = ((el.clientHeight - rows * charBox.h) / 2) + 'px';
    };
    new ResizeObserver(draw).observe(el);
    draw();
  }

  // ---------- text made of tiny symbols ----------
  const DENSE = '#%@&8$*xo+=';
  const LIGHT = '.:-+*';
  const cellHash = (x, y) => ((x * 73856093) ^ (y * 19349663)) >>> 0;
  const measureCtx = document.createElement('canvas').getContext('2d');
  function measure(text, size) { measureCtx.font = `${size}px ${HAND}`; return measureCtx.measureText(text).width; }

  // draws `text` as a texture of small characters; returns where the text starts
  function micro(canvas, text, o) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H) return { x: 0, w: 0 };
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const off = document.createElement('canvas'); off.width = W; off.height = H;
    const oc = off.getContext('2d', { willReadFrequently: true });
    oc.font = `${o.size}px ${HAND}`; oc.textBaseline = 'middle';
    const tw = oc.measureText(text).width;
    let x = o.align === 'center' ? (W - tw) / 2 : (o.x || 0);
    if (o.keepEnd && x + tw > W - 24) x = W - 24 - tw; // long query: keep the end visible
    oc.fillStyle = '#000';
    oc.fillText(text, x, H * (o.baseline || .56));
    const data = oc.getImageData(0, 0, W, H).data;
    const [cw, ch] = o.cell;
    ctx.font = `700 ${o.charPx}px "Cascadia Mono", Consolas, monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let y = 0, cy = 0; y < H - 1; y += ch, cy++) for (let xx = 0, cx = 0; xx < W - 1; xx += cw, cx++) {
      let a = 0;
      for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
        const px = Math.min(W - 1, (xx + (sx + .5) * cw / 3) | 0), py = Math.min(H - 1, (y + (sy + .5) * ch / 3) | 0);
        a += data[(py * W + px) * 4 + 3];
      }
      a /= 9 * 255;
      if (a < .14) continue;
      const h = cellHash(cx, cy);
      const chr = a > .55 ? DENSE[h % DENSE.length] : LIGHT[h % LIGHT.length];
      ctx.globalAlpha = (o.alpha ?? 1) * (a > .55 ? 1 : .75);
      ctx.fillStyle = o.color ? o.color(xx, y, h) : INK;
      ctx.fillText(chr, xx + cw / 2, y + ch / 2);
    }
    ctx.globalAlpha = 1;
    return { x, w: tw };
  }

  // resolves once the handwritten font is ready (or after 2.5 s, when offline it falls back to a system font)
  const fontReady = () => document.fonts
    ? Promise.race([document.fonts.load('58px "Caveat Brush"'), new Promise(r => setTimeout(r, 2500))]).catch(() => {})
    : Promise.resolve();

  window.AsciiUI = { frame, micro, measure, fontReady, INK, ACCENT };
})();

/* Bouquet ASCII engine: 3D bouquets (lys, lycoris) rendered as coloured characters.
   A tiny software rasterizer draws the scene at one pixel per character cell (z-buffer + lighting),
   then every cell becomes a glyph tinted with that colour.
   window.BouquetEngine = { create, COLORS, SPECIES, paletteFor, hexToRgb } */
(() => {
  'use strict';
  const EDGE = ".:;-~+=";
  const RAMP = "=+*czvunxsoeaZXYUJCLQ0Omwqpdbkh#%&8BWM@";

  // ---------- helpers ----------
  function mulberry32(a) {
    return () => {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const smooth = t => t * t * (3 - 2 * t);
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const scalec = (a, k) => [Math.min(255, a[0] * k), Math.min(255, a[1] * k), Math.min(255, a[2] * k)];
  const lumOf = c => (c[0] * .3 + c[1] * .59 + c[2] * .11) / 255;
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const madd = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len3 = a => Math.hypot(a[0], a[1], a[2]);
  const norm = a => { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const UP = [0, 1, 0];
  const WHITE = [255, 255, 255], BLACK = [0, 0, 0];
  const basis = axis => {
    const e1 = norm(cross(axis, Math.abs(axis[1]) < .9 ? UP : [1, 0, 0]));
    return [e1, cross(axis, e1)];
  };
  const cubic = (a, b, c, e, t) => {
    const s = 1 - t;
    return [
      s * s * s * a[0] + 3 * s * s * t * b[0] + 3 * s * t * t * c[0] + t * t * t * e[0],
      s * s * s * a[1] + 3 * s * s * t * b[1] + 3 * s * t * t * c[1] + t * t * t * e[1],
      s * s * s * a[2] + 3 * s * s * t * b[2] + 3 * s * t * t * c[2] + t * t * t * e[2],
    ];
  };
  const sway = (T, ph) => Math.sin(T * .7 + ph) * .6 + Math.sin(T * 1.13 + ph * 1.7) * .4;
  // one smooth wind field: neighbouring heads sway together instead of bumping into each other
  const wind = (T, p, ch) => sway(T * (1 - ch * .1), p[0] * .9 + p[2] * .6 + ch * 2.1);

  // ---------- colours ----------
  // keys are normalised (lowercase, no accents)
  const COLORS = {
    melange: { label: 'mélange', mix: true, swatch: '#e05a6a' },
    rouge: { label: 'rouge', hex: '#d01c28' },
    blanc: { label: 'blanc', hex: '#f2eee6' },
    bleu: { label: 'bleu', hex: '#3a6ee8' },
    rose: { label: 'rose', hex: '#e0559f' },
    jaune: { label: 'jaune', hex: '#ebbf22' },
    dore: { label: 'doré', hex: '#f0b01c' },
    orange: { label: 'orange', hex: '#ee6a1c' },
    violet: { label: 'violet', hex: '#8a3cc8' },
    peche: { label: 'pêche', hex: '#ea9268' },
    carmin: { label: 'carmin', hex: '#a5123a' },
    corail: { label: 'corail', hex: '#f2694e' },
    lavande: { label: 'lavande', hex: '#a48ee0' },
    turquoise: { label: 'turquoise', hex: '#21b8b0' },
    vert: { label: 'vert', hex: '#8cc84e' },
    noir: { label: 'noir', hex: '#3a1830' },
    creme: { label: 'crème', hex: '#efe4c8' },
    fuchsia: { label: 'fuchsia', hex: '#e0218a' },
    bordeaux: { label: 'bordeaux', hex: '#7a0f2a' },
    saumon: { label: 'saumon', hex: '#f4907a' },
    citron: { label: 'citron', hex: '#f4e44a' },
  };

  const P = o => { const r = {}; for (const k in o) r[k] = typeof o[k] === 'string' ? hex(o[k]) : o[k]; return r; };
  // hand-tuned palettes; anything else is derived from a single colour
  const PRESETS = {
    lys: {
      rouge: P({ base: '#d8202a', light: '#ff5a44', dark: '#7d0c16', throat: '#f0b43a', speck: '#3a0608', specks: 1 }),
      rose: P({ base: '#d23f98', light: '#f6a6d6', dark: '#7c1559', throat: '#fbe6f2', speck: '#4c0838', specks: 1 }),
      creme: P({ base: '#ece2d2', light: '#fffaf2', dark: '#b29d84', throat: '#d4e49c', speck: '#9a5a26', specks: .35 }),
      jaune: P({ base: '#ebbf22', light: '#ffe86c', dark: '#a0700f', throat: '#f39a24', speck: '#5a2808', specks: 1 }),
      peche: P({ base: '#ea9268', light: '#ffcfaa', dark: '#a14e34', throat: '#f7d47a', speck: '#4e1e12', specks: 1 }),
      carmin: P({ base: '#a5123a', light: '#de4a64', dark: '#4e0619', throat: '#e09a30', speck: '#26030c', specks: .6 }),
      orange: P({ base: '#ee6a1c', light: '#ffa64c', dark: '#9c360c', throat: '#f8d244', speck: '#341004', specks: 1 }),
      blanc: P({ base: '#f4f1ea', light: '#ffffff', dark: '#c4baa8', throat: '#d6e6a0', speck: '#8a6a4a', specks: .3 }),
    },
    lycoris: {
      rouge: P({ base: '#c8142c', light: '#f2404c', dark: '#6a0610', throat: '#a00c20', stamen: '#d81c30', anther: '#e8b040' }),
      blanc: P({ base: '#f4f0e6', light: '#ffffff', dark: '#cbbfa8', throat: '#efe2b8', stamen: '#f6f0e2', anther: '#e0b448' }),
      dore: P({ base: '#f0b41c', light: '#ffe27a', dark: '#9a6608', throat: '#f8d860', stamen: '#f2c030', anther: '#b0620e' }),
      rose: P({ base: '#ec7aa8', light: '#ffc2dc', dark: '#9a2c5c', throat: '#f8d6e4', stamen: '#f294bc', anther: '#f0c050' }),
      bleu: P({ base: '#3a70ea', light: '#9cc0ff', dark: '#1a3478', throat: '#e483b4', stamen: '#6a92f2', anther: '#f0d060' }),
      orange: P({ base: '#ee6418', light: '#ff9c50', dark: '#94300a', throat: '#d84a10', stamen: '#f07028', anther: '#f0c040' }),
    },
  };
  PRESETS.lycoris.jaune = PRESETS.lycoris.dore;
  PRESETS.tournesol = {
    jaune: P({ base: '#ffd21c', light: '#fff07a', dark: '#c08a0a', throat: '#e09412' }),
    orange: P({ base: '#f08a14', light: '#ffb84a', dark: '#a04a08', throat: '#c85a0c' }),
    rouge: P({ base: '#9a1e18', light: '#cc4426', dark: '#4e0a08', throat: '#e0a020' }),
    creme: P({ base: '#f4ecc8', light: '#fffbe8', dark: '#c8b888', throat: '#e8d870' }),
    citron: P({ base: '#f4e44a', light: '#fff69a', dark: '#b0a010', throat: '#e8c828' }),
  };
  PRESETS.tournesol.blanc = PRESETS.tournesol.creme;
  const MIXES = {
    tournesol: ['jaune', 'orange', 'jaune', 'rouge', 'citron', 'jaune', 'creme'],
    lys: ['rouge', 'rose', 'creme', 'jaune', 'peche', 'carmin', 'orange', 'blanc'],
    lycoris: ['rouge', 'blanc', 'dore', 'rose', 'rouge', 'blanc'],
  };

  function derive(species, rgb) {
    const lum = lumOf(rgb);
    const p = { base: rgb, light: mixc(rgb, WHITE, .42), dark: mixc(rgb, BLACK, .5) };
    if (species === 'lys') {
      p.throat = lum > .8 ? hex('#d6e6a0') : mixc(rgb, hex('#f5be3c'), .5);
      p.speck = mixc(p.dark, BLACK, .5); p.specks = lum > .8 ? .35 : 1;
    } else {
      p.throat = mixc(rgb, p.dark, .35);
      p.stamen = mixc(rgb, p.light, .3); p.anther = lum > .75 ? hex('#d8a030') : hex('#ecc050');
    }
    return p;
  }
  function fill(species, p) {
    // make sure every field the renderer reads exists
    return {
      base: p.base, light: p.light, dark: p.dark, throat: p.throat,
      speck: p.speck || mixc(p.dark, BLACK, .5), specks: species === 'lys' ? (p.specks ?? 1) : 0,
      stamen: p.stamen || hex('#b8d67c'), anther: p.anther || hex('#b0481a'),
    };
  }
  // colour spec: a COLORS key ('rouge', 'melange'...) or a '#rrggbb' string -> array of palettes
  function paletteFor(species, spec) {
    const pre = PRESETS[species];
    if (!spec || spec === 'melange') return MIXES[species].map(k => fill(species, pre[k]));
    if (pre[spec]) return [fill(species, pre[spec])];
    const h = spec[0] === '#' ? spec : (COLORS[spec] && COLORS[spec].hex) || '#d01c28';
    return [fill(species, derive(species, hex(h)))];
  }

  const STEM_GREENS = ['#4f9a3a', '#5aa843', '#43893a', '#62b049'].map(hex);
  const GRASS = [['#2f6e27', '#7acb58'], ['#3a8030', '#8bd462'], ['#2a5f22', '#62b048'], ['#357a2c', '#9ad86c']]
    .map(([a, b]) => [hex(a), hex(b)]);
  const GREEN_BUD = hex('#7aa84e');

  // ---------- species ----------
  // shape: petal look; st: stamens; per species bouquet layout in build*
  const SPECIES = {
    lys: { label: 'lys', latin: 'Lilium' },
    lycoris: { label: 'lycoris', latin: 'Lycoris radiata' },
    tournesol: { label: 'tournesol', latin: 'Helianthus annuus' },
  };

  // ---------- geometry shared by drawing and collision tests ----------
  const PNU = 11, PNV = 5;
  function petalGrid(f, k, T, head, eb, bud) {
    const A = f.axis, outer = k % 2 === 0, s = f.shape;
    const L = f.L * (s.budLen + (1 - s.budLen) * eb) * bud;
    const n = f.nPetals || 6;
    const phi = f.rot + k * 2 * Math.PI / n + (f.phiJit ? f.phiJit[k] : 0) + wind(T, f.stem.top, 1) * .05 * eb;
    const er = add(mul(f.e1, Math.cos(phi)), mul(f.e2, Math.sin(phi)));
    const et = add(mul(f.e1, -Math.sin(phi)), mul(f.e2, Math.cos(phi)));
    const alpha = lerp(outer ? s.closedOut : s.closedIn, f.open - (outer ? 0 : .12), eb);
    const rec = f.recurve * eb * (outer ? 1.1 : .9);
    const wMax = L * (outer ? s.wOut : s.wIn) * lerp(.55, 1, eb);
    const G = [];
    // petals start from a small ring (lys, lycoris) or from the rim of the disc (sunflower)
    let r = f.r0 != null ? f.r0 * (.6 + .4 * eb) * bud : .012 * (f.L / .35), h = 0;
    const ds = L / (PNU - 1);
    for (let i = 0; i < PNU; i++) {
      const u = i / (PNU - 1);
      const a = alpha + rec * u * u;
      if (i > 0) { r += Math.sin(a) * ds; h += Math.cos(a) * ds; }
      const w = wMax * Math.pow(Math.sin(Math.PI * Math.min(.985, Math.pow(u, .78))), .9) + wMax * .08 * (1 - u);
      const nin = [-Math.cos(a), Math.sin(a)]; // in (r,h): the inner face direction
      for (let j = 0; j < PNV; j++) {
        const v = j / (PNV - 1) * 2 - 1;
        // edges curl up (a channel), plus ruffles once open
        const lift = (s.curl * f.cupBias * v * v + s.ruffle * eb * Math.sin(u * s.ruffleFreq + k * 2) * v * v * v * v) * w;
        const rr = r + nin[0] * lift, hh = h + nin[1] * lift;
        G.push([
          head[0] + A[0] * hh + er[0] * rr + et[0] * v * w,
          head[1] + A[1] * hh + er[1] * rr + et[1] * v * w,
          head[2] + A[2] * hh + er[2] * rr + et[2] * v * w,
        ]);
      }
    }
    return G;
  }

  // stamen polylines (and the pistil as the last one); k = growth 0..1
  function stamenLines(f, head, k) {
    const st = f.st, A = f.axis, lines = [];
    for (let i = 0; i <= st.count; i++) {
      const pistil = i === st.count;
      const phi = f.rot + i * Math.PI / 3 + Math.PI / 6 + Math.sin(i * 7.1 + f.phase) * .2;
      const er = add(mul(f.e1, Math.cos(phi)), mul(f.e2, Math.sin(phi)));
      const dir = pistil ? norm(add(mul(A, 1), mul(er, st.pistilLean))) : norm(add(mul(A, st.dirA), mul(er, st.dirR)));
      const len = f.L * (pistil ? st.pistilLen : st.len) * k * (pistil ? 1 : .9 + .1 * Math.sin(i * 3.3));
      const bend = add(mul(A, st.bendA), mul(UP, st.bendUp));
      const n = Math.max(4, Math.ceil(len / .011)), pts = [];
      for (let s = 1; s <= n; s++) {
        const q = s / n;
        pts.push(add(add(head, mul(dir, len * q)), mul(bend, len * q * q)));
      }
      lines.push({ pts, pistil, er });
    }
    return lines;
  }

  // ---------- scene builders ----------
  function domeSlots(rnd, items, C, rad0) {
    // spread items over a dome (fibonacci), then push apart by their reach
    const R = (a, b) => a + rnd() * (b - a);
    const n = items.length;
    items.forEach((s, i) => {
      const t = s.isBud ? R(.05, .95) : (i + .5) / n;
      const th = Math.acos(lerp(Math.cos(.25), Math.cos(1.7), t)) + R(-.08, .08);
      const az = i * 2.39996 + R(-.3, .3) + (s.isBud ? R(0, 6.28) : 0);
      s.dir = [Math.sin(th) * Math.cos(az), Math.cos(th), Math.sin(th) * Math.sin(az)];
    });
    let rad = rad0;
    const pos = s => [C[0] + s.dir[0] * rad, C[1] + s.dir[1] * rad * 1.15, C[2] + s.dir[2] * rad];
    for (let pass = 0; pass < 30; pass++) {
      let worst = 0;
      for (let it = 0; it < 120; it++) {
        worst = 0;
        for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
          const A = items[a], B = items[b];
          const pa = pos(A), pb = pos(B), dv = sub(pa, pb), d = len3(dv) || 1e-4;
          const need = A.reach + B.reach;
          if (d >= need) continue;
          worst = Math.max(worst, need - d);
          const push = mul(dv, (need - d) * .5 / d / rad);
          A.dir = add(A.dir, push); B.dir = sub(B.dir, push);
        }
        for (const s of items) {
          s.dir = norm(s.dir);
          const th = Math.acos(Math.max(-1, Math.min(1, s.dir[1])));
          if (th > 1.75 || th < .05) {
            const tc = Math.max(.05, Math.min(1.75, th)), h = Math.hypot(s.dir[0], s.dir[2]) || 1;
            s.dir = [s.dir[0] / h * Math.sin(tc), Math.cos(tc), s.dir[2] / h * Math.sin(tc)];
          }
        }
        if (worst < 1e-3) break;
      }
      if (worst < 1e-3) break;
      rad *= 1.04;
    }
    items.forEach(s => { s.pos = pos(s); });
  }

  function makeGrass(rnd, n, thin) {
    const R = (a, b) => a + rnd() * (b - a);
    const grass = [];
    for (let i = 0; i < n; i++) {
      grass.push({
        az: R(0, 6.28), r0: R(.01, .08), h: thin ? R(.45, .85) : R(.55, 1.15), lean: R(.12, .55),
        w: thin ? R(.018, .03) : R(.035, .06), twist: R(-1.2, 1.2),
        droop: R(.05, .2), col: GRASS[(rnd() * GRASS.length) | 0], start: R(0, .7), dur: R(1.5, 2.4), phase: R(0, 6.28),
      });
    }
    return grass;
  }

  const LYS_SHAPE = { wOut: .27, wIn: .34, curl: .32, ruffle: .05, ruffleFreq: 13, closedOut: .09, closedIn: .04, budLen: .62 };
  const LYS_ST = { count: 6, len: .62, dirA: .8, dirR: .5, bendA: -.16, bendUp: 0, rad: .0045, antherR: .011, pistilLen: .7, pistilLean: 0, pistilR: .006, colorFixed: [184, 214, 124] };
  const LYC_SHAPE = { wOut: .17, wIn: .17, curl: .16, ruffle: .3, ruffleFreq: 26, closedOut: .07, closedIn: .03, budLen: .7 };
  const LYC_ST = { count: 6, len: 2.1, dirA: .62, dirR: .78, bendA: .05, bendUp: .6, rad: .0034, antherR: .0055, pistilLen: 2.3, pistilLean: .35, pistilR: .0034 };

  // sunflower: rays start at the rim of a brown seed disc, green bracts behind, big heart-shaped leaves
  const SUN_SHAPE = { wOut: .17, wIn: .17, curl: .1, ruffle: .04, ruffleFreq: 9, closedOut: .12, closedIn: .06, budLen: .5 };
  const BRACT_SHAPE = { wOut: .3, wIn: .3, curl: .2, ruffle: 0, ruffleFreq: 1, closedOut: .5, closedIn: .4, budLen: .8 };
  const DISC_C = hex('#6b5a20'), DISC_B = hex('#3e2612'), DISC_R = hex('#7a4812'), POLLEN = hex('#e6b422');
  const BRACT_PAL = P({ base: '#4f8a2e', light: '#7cb84a', dark: '#2a5418', throat: '#3a6a22', speck: '#000000', stamen: '#000000', anther: '#000000' });
  BRACT_PAL.specks = 0;

  // ---------- one stem of each species ----------
  // item(): size of the head (used to place it on the dome); make(): the stem and its flower(s)
  const KINDS = {
    lys: {
      item(R, isBud) { const L = isBud ? R(.2, .25) : R(.32, .38); return { L, reach: isBud ? .09 : L * .84 }; },
      make(s, R, rnd, p, bloomAt) {
        const axis = s.isBud ? norm(add(s.dir, [0, .9, 0])) : norm(add(s.dir, [0, .12, 0]));
        const stemStart = R(.15, .9), stemDur = R(2, 2.7);
        const leaves = [];
        for (let k = 0, n = 1 + (rnd() < .6 ? 1 : 0); k < n; k++)
          leaves.push({ u: R(.2, .5), az: R(0, 6.28), len: R(.16, .26), w: R(.025, .035), col: GRASS[(rnd() * GRASS.length) | 0] });
        const stem = { base: [R(-.06, .06), 0, R(-.06, .06)], top: s.pos, axis, stemStart, stemDur, stemEnd: stemStart + stemDur, col: STEM_GREENS[(rnd() * 4) | 0], rad: .016, leaves };
        const [e1, e2] = basis(axis);
        const specks = [];
        for (let k = 0; k < 6; k++) {
          const list = [];
          for (let q = 0, n = Math.round(R(5, 10) * p.specks); q < n; q++) list.push([R(.1, .48), R(-.45, .45), R(.03, .055)]);
          specks.push(list);
        }
        return { stem, flowers: [{
          species: 'lys', stem, off: [0, 0, 0], isBud: s.isBud, axis, e1, e2, L: s.L, p, specks,
          shape: LYS_SHAPE, st: LYS_ST, budMixMax: .8,
          bloomStart: s.isBud ? 1e9 : Math.max(stem.stemEnd + .8, bloomAt),
          bloomDur: R(1.8, 2.4), rot: R(0, 6.28), open: R(1.05, 1.3), recurve: R(.55, .85), phase: R(0, 6.28), cupBias: R(.8, 1.2),
        }] };
      },
    },
    lycoris: {
      item() { return { reach: .25 }; },
      make(s, R, rnd, p, bloomAt) {
        const axis = norm(add(s.dir, [0, .5, 0]));
        const stemStart = R(.15, .9), stemDur = R(2, 2.7);
        const stem = { base: [R(-.05, .05), 0, R(-.05, .05)], top: s.pos, axis, stemStart, stemDur, stemEnd: stemStart + stemDur, col: STEM_GREENS[(rnd() * 4) | 0], rad: .012, leaves: [] };
        stem.bloomStart = Math.max(stem.stemEnd + .9, bloomAt);
        // an umbel: florets fanned around the stem tip, each on a short pedicel
        const flowers = [], nF = 5 + ((rnd() * 3) | 0);
        const [u1, u2] = basis(axis);
        const az0 = R(0, 6.28);
        for (let j = 0; j < nF; j++) {
          const az = az0 + j * 2 * Math.PI / nF + R(-.15, .15);
          const tilt = R(.95, 1.2);
          const side = add(mul(u1, Math.cos(az)), mul(u2, Math.sin(az)));
          const dir = norm(add(mul(axis, Math.cos(tilt)), mul(side, Math.sin(tilt))));
          const fa = norm(add(dir, mul(axis, .25)));
          const [e1, e2] = basis(fa);
          flowers.push({
            species: 'lycoris', stem, off: mul(dir, R(.07, .085)), pedicel: true, isBud: false, axis: fa, e1, e2,
            L: R(.12, .145), p, specks: [[], [], [], [], [], []],
            shape: LYC_SHAPE, st: LYC_ST, budMixMax: .55,
            bloomStart: stem.bloomStart + j * .12, bloomDur: R(1.7, 2.2),
            rot: R(0, 6.28), open: R(1.15, 1.35), recurve: R(2.0, 2.5), phase: R(0, 6.28), cupBias: R(.8, 1.2),
          });
        }
        return { stem, flowers };
      },
    },
    tournesol: {
      item(R) { const L = R(.17, .21), Rd = R(.1, .125); return { L, Rd, reach: (L + Rd) * .9 }; },
      make(s, R, rnd, p, bloomAt) {
        const axis = norm(add(s.dir, [0, .15, 0]));
        const stemStart = R(.15, .9), stemDur = R(2, 2.7);
        const leaves = [];
        if (rnd() < .75)
          leaves.push({ u: R(.15, .45), az: R(0, 6.28), len: R(.24, .32), w: R(.08, .1), col: GRASS[(rnd() * GRASS.length) | 0], heart: true });
        const stem = { base: [R(-.06, .06), 0, R(-.06, .06)], top: s.pos, axis, stemStart, stemDur, stemEnd: stemStart + stemDur, col: STEM_GREENS[(rnd() * 4) | 0], rad: .021, leaves };
        const [e1, e2] = basis(axis);
        const n = 2 * (10 + ((rnd() * 4) | 0)); // 20..26 rays, two interleaved rings
        const phiJit = [...Array(n)].map(() => R(-.05, .05));
        const rot = R(0, 6.28);
        const f = {
          species: 'tournesol', stem, off: [0, 0, 0], isBud: false, axis, e1, e2, L: s.L, p, specks: [],
          nPetals: n, phiJit, r0: s.Rd * .92, Rd: s.Rd, disc: true, shape: SUN_SHAPE, st: null, budMixMax: .85,
          bloomStart: Math.max(stem.stemEnd + .8, bloomAt), bloomDur: R(1.9, 2.5), rot, open: R(1.42, 1.55), recurve: R(.15, .4),
          phase: R(0, 6.28), cupBias: R(.8, 1.2), seedTwist: R(0, 6.28),
        };
        // the bracts are drawn with the petal code, as a second green "flower" behind the rays
        f.bracts = {
          stem, off: f.off, axis, e1, e2, L: s.L * .42, p: BRACT_PAL, specks: [], nPetals: 14, r0: s.Rd * .8,
          shape: BRACT_SHAPE, open: 1.85, recurve: .35, rot: rot + .1, cupBias: 1, phase: f.phase, budMix: 0, bloom: 0,
        };
        return { stem, flowers: [f] };
      },
    },
  };

  // what a plain "lys rouge" or "lycoris" bouquet contains
  const DEFAULT_RECIPE = {
    lys: c => [{ species: 'lys', color: c, count: 14, buds: 4 }],
    lycoris: c => [{ species: 'lycoris', color: c, count: 13 }],
    tournesol: c => [{ species: 'tournesol', color: c, count: 8 }],
  };
  const MAX_STEMS = 30;

  // recipe: [{ species, color, count, buds? }] -> one bouquet, species mixed around the dome
  function buildRecipe(seed, recipe) {
    const rnd = mulberry32(seed), prnd = mulberry32(seed ^ 0x9e3779b9);
    const R = (a, b) => a + rnd() * (b - a);
    const items = [];
    let total = 0;
    for (const e of recipe) {
      if (!KINDS[e.species]) continue;
      const pals = paletteFor(e.species, e.color);
      const off = (prnd() * pals.length) | 0;
      const n = Math.max(0, Math.min(e.count | 0, MAX_STEMS - total));
      for (let k = 0; k < n; k++) items.push({ species: e.species, isBud: false, pal: pals[(k + off) % pals.length], single: pals.length === 1, ...KINDS[e.species].item(R, false) });
      total += n;
      for (let k = 0; k < (e.buds | 0); k++) items.push({ species: e.species, isBud: true, pal: pals[(k + off) % pals.length], single: true, ...KINDS[e.species].item(R, true) });
    }
    if (!items.length) return { stems: [], flowers: [], grass: makeGrass(rnd, 10, false), bounds: { maxY: 1.6, maxR: .6 } };
    // mix species around the dome (buds stay last so they slip between flowers)
    const open = items.filter(s => !s.isBud).sort(() => rnd() - .5), buds = items.filter(s => s.isBud);
    const placed = open.concat(buds);
    domeSlots(rnd, placed, [0, 1.45, 0], .5);
    const nOpen = open.length, step = Math.min(.35, 3.6 / Math.max(1, nOpen));
    const order = [...Array(nOpen).keys()].sort(() => rnd() - .5);
    const stems = [], flowers = [];
    placed.forEach((s, i) => {
      const p = jitterPal(s.pal, prnd, s.single);
      const got = KINDS[s.species].make(s, R, rnd, p, s.isBud ? 1e9 : 3.3 + order[i] * step);
      stems.push(got.stem);
      flowers.push(...got.flowers);
    });
    const thin = placed.every(s => s.species === 'lycoris');
    const scene = { stems, flowers, grass: makeGrass(rnd, Math.min(36, 12 + stems.length * 1.5) | 0, thin) };
    separate(scene);
    return scene;
  }

  // the 404 flower: one lily that grows, blooms, then wilts; its stem bends over and petals drop
  function buildWilted(seed, palettes) {
    const rnd = mulberry32(seed);
    const R = (a, b) => a + rnd() * (b - a);
    const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
    const ZREF = [0, 0, 1];
    const setAxis = (F, ax) => { F.axis = ax; F.e1 = norm(cross(ax, ZREF)); F.e2 = cross(ax, F.e1); };
    const topUp = [.04, 1.6, 0], topDown = [.52, 1.2, .06];
    const axUp = norm([.08, 1, .04]), axDown = norm([.55, -.85, .12]);
    const stem = {
      base: [0, 0, 0], top: topUp, axis: axUp, stemStart: .2, stemDur: 2.4, stemEnd: 2.6, col: STEM_GREENS[0], rad: .019,
      leaves: [{ u: .28, az: .5, len: .32, w: .05, col: GRASS[0], heart: true }, { u: .48, az: 3.5, len: .27, w: .045, col: GRASS[2], heart: true }],
    };
    const p0 = palettes[0];
    const BROWN = hex('#6e4a34');
    const specks = [];
    for (let k = 0; k < 6; k++) {
      const list = [];
      for (let s = 0, n = Math.round(R(5, 9) * p0.specks); s < n; s++) list.push([R(.1, .48), R(-.45, .45), R(.03, .055)]);
      specks.push(list);
    }
    const f = {
      species: 'lys', stem, off: [0, 0, 0], isBud: false, L: .44, p: p0, specks, shape: LYS_SHAPE, st: LYS_ST, budMixMax: .8,
      bloomStart: 3.1, bloomDur: 2.2, rot: R(0, 6.28), open: 1.2, recurve: .7, phase: 0, cupBias: 1, gone: [],
    };
    setAxis(f, axUp);
    // three petals let go one after another, tumble down and stay on the ground
    const FALL = [1, 4, 2].map((k, i) => ({
      k, t0: 10.6 + i * 3.1, dur: R(2.8, 3.4), drift: [R(-.35, .1), R(-.25, .25)], ph: R(0, 6.28), spin: R(5, 8),
      tilt: [R(-.25, .25), R(-.25, .25)], rot: R(0, 6.28),
    }));
    const wiltPal = w => {
      const o = {};
      for (const key in p0) o[key] = Array.isArray(p0[key]) ? mixc(p0[key], BROWN, w * .5) : p0[key];
      return o;
    };
    const scene = { stems: [stem], flowers: [f], grass: makeGrass(rnd, 12, true), bounds: { maxY: 2.1, maxR: .85 } };
    scene.update = T => {
      const w = smooth(clamp01((T - 6.8) / 3.4));
      stem.top = lerp3(topUp, topDown, w);
      setAxis(f, norm(lerp3(axUp, axDown, w)));
      stem.axis = f.axis;
      f.recurve = lerp(.7, 1.75, w); f.open = lerp(1.2, 1.45, w);
      f.p = wiltPal(w);
      f.gone = FALL.filter(F => T >= F.t0).map(F => F.k);
    };
    scene.extra = T => {
      const out = [];
      for (const F of FALL) {
        if (T < F.t0) continue;
        const q = clamp01((T - F.t0) / F.dur), fall = q * q;
        const start = add(topDown, [.05, -.12, 0]);
        const pos = [
          start[0] + F.drift[0] * q + Math.sin(q * 9 + F.ph) * .09 * (1 - q),
          lerp(start[1], .015, fall),
          start[2] + F.drift[1] * q + Math.cos(q * 7 + F.ph) * .06 * (1 - q),
        ];
        const a = q * F.spin;
        const axis = q < 1 ? norm([Math.sin(a), Math.cos(a * .7), Math.sin(a * 1.3) * .5]) : norm([F.tilt[0], 1, F.tilt[1]]);
        const pf = { ...f, stem: { top: pos }, specks: [f.specks[F.k]], rot: F.rot, nPetals: 6, phiJit: null, bloom: 1, budMix: 0,
          open: q < 1 ? 1 : 1.52, recurve: q < 1 ? 1.1 : .3, p: f.p };
        setAxis(pf, axis);
        out.push({ f: pf, head: pos });
      }
      return out;
    };
    return scene;
  }

  // sunflower disc geometry: a shallow dome of radius Rd facing along the axis
  function discGrid(f, head, sc) {
    const G = [], NR = 7, NT = 29, Rd = f.Rd * sc;
    for (let i = 0; i < NR; i++) {
      const r = i / (NR - 1);
      for (let j = 0; j < NT; j++) {
        const th = j / (NT - 1) * 2 * Math.PI;
        const h = Rd * .22 * (1 - r * r);
        const c = Math.cos(th) * r * Rd, s = Math.sin(th) * r * Rd;
        G.push([head[0] + f.axis[0] * h + f.e1[0] * c + f.e2[0] * s, head[1] + f.axis[1] * h + f.e1[1] * c + f.e2[1] * s, head[2] + f.axis[2] * h + f.e1[2] * c + f.e2[2] * s]);
      }
    }
    return { G, NR, NT };
  }

  function jitterPal(p, rnd, strong) {
    // a single-colour bouquet still varies a little from flower to flower
    const k = strong ? .86 + rnd() * .22 : .95 + rnd() * .1;
    const o = {};
    for (const key in p) o[key] = Array.isArray(p[key]) ? scalec(p[key], k) : p[key];
    return o;
  }

  const headOf = f => add(f.stem.top, f.off);

  // collision points of a fully open flower (coarse petal grid + stamen tips)
  function hullPoints(f) {
    const head = headOf(f), o = [];
    const eb = f.isBud ? 0 : 1;
    for (let k = 0; k < (f.nPetals || 6); k++) {
      const G = petalGrid(f, k, 0, head, eb, 1);
      for (let i = 0; i < PNU; i++) for (let j = 0; j < PNV; j += 2) o.push(G[i * PNV + j]);
    }
    if (!f.isBud && f.st) for (const l of stamenLines(f, head, 1)) {
      const n = l.pts.length;
      o.push(l.pts[n >> 1], l.pts[n - 1]);
    }
    return o;
  }

  // exact pass on real shapes: flowers that come closer than GAP are nudged apart until none touch.
  // Different stems -> move the stem tips; same umbel -> spread the florets on their pedicels.
  function separate(scene) {
    const GAP = .045, G2 = GAP * GAP, inv = 1 / GAP, fl = scene.flowers;
    const key = (x, y, z) => ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);
    let pts = null;
    for (let it = 0; it < 120; it++) {
      // spatial hash of every collision point -> touching flower pairs in one sweep
      pts = fl.map(hullPoints);
      const grid = new Map();
      pts.forEach((arr, fi) => { for (const p of arr) {
        const k = key(Math.floor(p[0] * inv), Math.floor(p[1] * inv), Math.floor(p[2] * inv));
        let b = grid.get(k); if (!b) grid.set(k, b = []); b.push(fi, p);
      } });
      const pairs = new Set();
      pts.forEach((arr, fi) => { for (const p of arr) {
        const x = Math.floor(p[0] * inv), y = Math.floor(p[1] * inv), z = Math.floor(p[2] * inv);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
          const b = grid.get(key(x + dx, y + dy, z + dz));
          if (!b) continue;
          for (let n = 0; n < b.length; n += 2) {
            const fj = b[n];
            if (fj <= fi) continue;
            const q = b[n + 1], ex = p[0] - q[0], ey = p[1] - q[1], ez = p[2] - q[2];
            if (ex * ex + ey * ey + ez * ez < G2) pairs.add(fi * 4096 + fj);
          }
        }
      } });
      if (!pairs.size) break;
      if (it >= 30) {
        // crowded: pushes start cancelling each other, so open the whole dome a little
        const tops = scene.stems.map(s => s.top);
        const cen = mul(tops.reduce(add, [0, 0, 0]), 1 / tops.length);
        for (const s of scene.stems) s.top = add(cen, mul(sub(s.top, cen), 1.02));
      }
      const heads = fl.map(headOf);
      for (const pk of pairs) {
        const a = Math.floor(pk / 4096), b = pk % 4096, A = fl[a], B = fl[b];
        const dv = sub(heads[a], heads[b]), dc = len3(dv) || 1e-4;
        const step = mul(dv, .02 / dc);
        if (A.stem !== B.stem) {
          A.stem.top = add(A.stem.top, step); B.stem.top = sub(B.stem.top, step);
        } else {
          for (const [F, sgn] of [[A, 1], [B, -1]]) {
            const l = len3(F.off);
            const nd = norm(madd(F.off, step, sgn * 1.5));
            F.off = mul(nd, l * 1.01);
            F.axis = norm(add(nd, mul(F.stem.axis, .25)));
            [F.e1, F.e2] = basis(F.axis);
          }
        }
      }
    }
    // bounds for automatic framing: height of the tallest point, widest horizontal reach
    let maxY = 1, maxR = .5;
    for (const arr of fl.map(hullPoints)) for (const p of arr) {
      if (p[1] > maxY) maxY = p[1];
      const r = Math.hypot(p[0], p[2]); if (r > maxR) maxR = r;
    }
    scene.bounds = { maxY, maxR };
  }

  // ---------- shared animation loop ----------
  const active = new Set();
  let loopOn = false;
  function loop(now) {
    for (const inst of active) inst._tick(now);
    if (active.size) requestAnimationFrame(loop); else loopOn = false;
  }
  function wake(inst) { active.add(inst); if (!loopOn) { loopOn = true; requestAnimationFrame(loop); } }

  const CODE_TEXT = (() => {
    const s = (document.currentScript && document.currentScript.textContent) || '';
    return (s || 'function bouquet() { return flowers.map(f => f.bloom()); } ').replace(/[^\x20-\x7e]/g, ' ').replace(/\s+/g, ' ');
  })();
  const LC = (() => { const l = Math.hypot(-.45, .7, .55); return [-.45 / l, .7 / l, .55 / l]; })();

  // ---------- an instance bound to one canvas ----------
  function create(canvas, opts = {}) {
    const vctx = canvas.getContext('2d');
    const glyphCv = document.createElement('canvas'), gctx = glyphCv.getContext('2d');
    const colorCv = document.createElement('canvas'), cctx = colorCv.getContext('2d');
    const atlas = document.createElement('canvas'), actx = atlas.getContext('2d');

    let species = opts.species || 'lys';
    let color = opts.color || 'melange';
    let seed = opts.seed ?? ((Math.random() * 1e9) | 0);
    let mode = opts.mode || 'ascii';
    let densityStep = 0;
    let W = 0, H = 0, dpr = 1, fontPx, cwD, chD, cw, ch, cols = 0, rows = 0, zb, img, jitter, stars = [];
    let scene = null, clock = opts.time || 0, last = 0, playing = false, paused = false;
    let yaw = opts.yaw ?? 0, pitch = opts.pitch ?? .1, dist = opts.dist ?? 4.8, vyaw = 0, vpitch = 0;
    let dragging = false, lastInteract = -1e9, autoSpin = opts.autoSpin ?? true;
    const spinSpeed = opts.spinSpeed ?? .12;
    const cam = {};
    let RC = 0, GC = 0, BC = 0;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth || 300; H = canvas.clientHeight || 300;
      fontPx = Math.max(4, Math.min(16, (opts.fontPx || Math.round(H / 175)) + densityStep));
      actx.font = `700 ${fontPx}px "Cascadia Mono", Consolas, "Courier New", monospace`;
      cwD = Math.max(2, Math.round(actx.measureText('M').width * dpr));
      chD = Math.max(3, Math.round(fontPx * 1.18 * dpr));
      cw = cwD / dpr; ch = chD / dpr;
      cols = Math.ceil(W / cw); rows = Math.ceil(H / ch);
      canvas.width = glyphCv.width = Math.round(W * dpr);
      canvas.height = glyphCv.height = Math.round(H * dpr);
      colorCv.width = cols; colorCv.height = rows;
      img = cctx.createImageData(cols, rows);
      zb = new Float32Array(cols * rows);
      atlas.width = cwD * 95; atlas.height = chD;
      actx.font = `700 ${fontPx * dpr}px "Cascadia Mono", Consolas, "Courier New", monospace`;
      actx.fillStyle = '#fff'; actx.textBaseline = 'middle'; actx.textAlign = 'center';
      for (let i = 0; i < 95; i++) actx.fillText(String.fromCharCode(32 + i), i * cwD + cwD / 2, chD / 2 + dpr * .5);
      jitter = new Float32Array(cols * rows);
      for (let i = 0; i < jitter.length; i++) jitter[i] = Math.random();
      const sr = mulberry32(seed ^ 0x5a5a);
      stars = [];
      for (let i = 0, n = Math.round(cols * rows * .0035); i < n; i++)
        stars.push({ c: (sr() * cols) | 0, r: (sr() * rows) | 0, ph: sr() * 6.28, sp: .6 + sr() * 1.8, ch: sr() < .8 ? 46 : (sr() < .5 ? 43 : 42) });
    }

    let recipe = opts.recipe || null; // [{species, color, count}] for a custom (mixed) bouquet
    function rebuild() {
      if (species === 'fanee') { scene = buildWilted(seed, paletteFor('lys', color === 'melange' ? 'rouge' : color)); return; }
      scene = buildRecipe(seed, recipe || (DEFAULT_RECIPE[species] || DEFAULT_RECIPE.lys)(color));
    }

    // ---------- camera ----------
    function setupCamera() {
      // frame the whole bouquet: from its base (y=0) to its top, and its widest reach
      const bd = scene.bounds || { maxY: 2.6, maxR: .8 };
      const T = [0, bd.maxY * .5, 0];
      cam.pos = [T[0] + dist * Math.cos(pitch) * Math.sin(yaw), T[1] + dist * Math.sin(pitch), T[2] + dist * Math.cos(pitch) * Math.cos(yaw)];
      cam.fwd = norm(sub(T, cam.pos));
      cam.right = norm(cross(cam.fwd, UP));
      cam.up = cross(cam.right, cam.fwd);
      const fit = opts.fit ?? .94;
      cam.f = Math.min(H * fit * 4.8 / (bd.maxY + .1), W * fit * 4.8 / (2 * bd.maxR + .2));
      cam.L = norm(add(add(mul(cam.right, -.45), mul(cam.up, .7)), mul(cam.fwd, -.55)));
    }
    function proj(P) {
      const dx = P[0] - cam.pos[0], dy = P[1] - cam.pos[1], dz = P[2] - cam.pos[2];
      const z = dx * cam.fwd[0] + dy * cam.fwd[1] + dz * cam.fwd[2];
      const x = dx * cam.right[0] + dy * cam.right[1] + dz * cam.right[2];
      const y = dx * cam.up[0] + dy * cam.up[1] + dz * cam.up[2];
      const k = cam.f / z;
      return { x: (W * .5 + x * k) / cw, y: (H * .5 - y * k) / ch, z };
    }
    function vert(P, n, u, v) {
      const o = proj(P);
      const vd = norm(sub(cam.pos, P));
      let b = 0;
      if (dot(n, vd) < 0) { n = mul(n, -1); b = 1; }
      const diff = Math.max(0, dot(n, cam.L));
      const hv = norm(add(cam.L, vd));
      o.s = .48 + .66 * diff;
      o.p = Math.pow(Math.max(0, dot(n, hv)), 22);
      o.b = b; o.u = u; o.v = v;
      return o;
    }

    // ---------- rasterizer ----------
    function material(m, u, v, back) {
      if (m.t === 0) { // petal
        const f = m.f, Pp = f.p;
        let a, b, t;
        if (u < .2) { a = Pp.throat; b = Pp.base; t = smooth(u / .2); }
        else if (u < .8) { a = Pp.base; b = Pp.light; t = (u - .2) / .6 * .45; }
        else { a = Pp.base; b = Pp.dark; t = (u - .8) / .2 * .4; }
        RC = a[0] + (b[0] - a[0]) * t; GC = a[1] + (b[1] - a[1]) * t; BC = a[2] + (b[2] - a[2]) * t;
        if (m.outer) { RC = RC * .9 + Pp.dark[0] * .1; GC = GC * .9 + Pp.dark[1] * .1; BC = BC * .9 + Pp.dark[2] * .1; }
        const mr = Math.exp(-v * v * 45) * (1 - u) * .45;
        RC += (Pp.throat[0] - RC) * mr; GC += (Pp.throat[1] - GC) * mr; BC += (Pp.throat[2] - BC) * mr;
        const vf = .92 + .08 * Math.cos(v * 24 + u * 4);
        RC *= vf; GC *= vf; BC *= vf;
        if (u > .08 && u < .55 && f.bloom > .5 && !back && f.specks[m.k]) {
          for (const s of f.specks[m.k]) {
            const du = (u - s[0]) * 3.2, dv = v - s[1];
            if (du * du + dv * dv < s[2] * s[2]) { RC = Pp.speck[0]; GC = Pp.speck[1]; BC = Pp.speck[2]; break; }
          }
        }
        if (back) { RC = RC * .75 + Pp.light[0] * .25; GC = GC * .75 + Pp.light[1] * .25; BC = BC * .75 + Pp.light[2] * .25; }
        const g = f.budMix;
        if (g > 0) { RC += (GREEN_BUD[0] - RC) * g; GC += (GREEN_BUD[1] - GC) * g; BC += (GREEN_BUD[2] - BC) * g; }
        const ao = .55 + .45 * Math.min(1, u * 3.5);
        RC *= ao; GC *= ao; BC *= ao;
      } else if (m.t === 2) { // sunflower seed disc: phyllotaxis spirals, pollen ring at the rim
        const r = u, th = (v + 1) * Math.PI, f = m.f;
        const q = Math.cos(th * 21 + r * 30 + f.seedTwist) * Math.cos(th * 34 - r * 48);
        let c;
        if (r < .2) c = mixc(DISC_C, DISC_B, smooth(r / .2));
        else if (r < .7) c = DISC_B;
        else c = mixc(DISC_B, DISC_R, smooth((r - .7) / .3));
        if (r > .72 && q > .5 && f.bloom > .6) c = POLLEN;
        const k = .72 + .32 * q;
        RC = c[0] * k; GC = c[1] * k; BC = c[2] * k;
        const g = f.budMix;
        if (g > 0) { RC += (GREEN_BUD[0] - RC) * g; GC += (GREEN_BUD[1] - GC) * g; BC += (GREEN_BUD[2] - BC) * g; }
      } else { // leaf / grass blade
        const a = m.col[0], b = m.col[1];
        const t = Math.min(1, u * 1.1);
        RC = a[0] + (b[0] - a[0]) * t; GC = a[1] + (b[1] - a[1]) * t; BC = a[2] + (b[2] - a[2]) * t;
        if (v > -.18 && v < .18) { RC *= 1.18; GC *= 1.18; BC *= 1.18; }
      }
    }
    function tri(A, B, Cv, m, gloss) {
      if (A.z < .2 || B.z < .2 || Cv.z < .2) return;
      const minX = Math.max(0, Math.floor(Math.min(A.x, B.x, Cv.x)));
      const maxX = Math.min(cols - 1, Math.ceil(Math.max(A.x, B.x, Cv.x)));
      const minY = Math.max(0, Math.floor(Math.min(A.y, B.y, Cv.y)));
      const maxY = Math.min(rows - 1, Math.ceil(Math.max(A.y, B.y, Cv.y)));
      if (minX > maxX || minY > maxY) return;
      const area = (B.x - A.x) * (Cv.y - A.y) - (B.y - A.y) * (Cv.x - A.x);
      if (Math.abs(area) < 1e-7) return;
      const ia = 1 / area, d = img.data;
      for (let y = minY; y <= maxY; y++) {
        const py = y + .5;
        for (let x = minX; x <= maxX; x++) {
          const px = x + .5;
          const w0 = ((B.x - px) * (Cv.y - py) - (B.y - py) * (Cv.x - px)) * ia;
          const w1 = ((px - A.x) * (Cv.y - A.y) - (py - A.y) * (Cv.x - A.x)) * ia;
          const w2 = 1 - w0 - w1;
          if (w0 < -.01 || w1 < -.01 || w2 < -.01) continue;
          const z = w0 * A.z + w1 * B.z + w2 * Cv.z;
          const i = y * cols + x;
          if (z >= zb[i]) continue;
          zb[i] = z;
          const u = w0 * A.u + w1 * B.u + w2 * Cv.u;
          const v = w0 * A.v + w1 * B.v + w2 * Cv.v;
          const s = w0 * A.s + w1 * B.s + w2 * Cv.s;
          const p = w0 * A.p + w1 * B.p + w2 * Cv.p;
          material(m, u, v, (w0 * A.b + w1 * B.b + w2 * Cv.b) > .5);
          const sp = p * gloss * 255, o = i * 4;
          d[o] = RC * s + sp; d[o + 1] = GC * s + sp; d[o + 2] = BC * s + sp; d[o + 3] = 255;
        }
      }
    }
    function surface(G, nu, nv, m, gloss) {
      const V = new Array(nu * nv);
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
        const a = G[Math.min(nu - 1, i + 1) * nv + j], b = G[Math.max(0, i - 1) * nv + j];
        const c = G[i * nv + Math.min(nv - 1, j + 1)], e = G[i * nv + Math.max(0, j - 1)];
        let n = cross(sub(a, b), sub(c, e));
        if (n[0] === 0 && n[1] === 0 && n[2] === 0) n = UP;
        V[i * nv + j] = vert(G[i * nv + j], norm(n), i / (nu - 1), j / (nv - 1) * 2 - 1);
      }
      for (let i = 0; i < nu - 1; i++) for (let j = 0; j < nv - 1; j++) {
        const a = V[i * nv + j], b = V[(i + 1) * nv + j], c = V[(i + 1) * nv + j + 1], e = V[i * nv + j + 1];
        tri(a, b, c, m, gloss); tri(a, c, e, m, gloss);
      }
    }
    function splat(Pt, r, col, minCells = .55) {
      const o = proj(Pt);
      if (o.z < .2) return;
      const k = cam.f / o.z;
      const rx = Math.max(minCells, r * k / cw), ry = Math.max(minCells, r * k / ch);
      const x0 = Math.max(0, Math.floor(o.x - rx)), x1 = Math.min(cols - 1, Math.ceil(o.x + rx));
      const y0 = Math.max(0, Math.floor(o.y - ry)), y1 = Math.min(rows - 1, Math.ceil(o.y + ry));
      const d = img.data;
      for (let y = y0; y <= y1; y++) {
        const dy = (y + .5 - o.y) / ry;
        for (let x = x0; x <= x1; x++) {
          const dx = (x + .5 - o.x) / rx;
          const d2 = dx * dx + dy * dy;
          if (d2 > 1) continue;
          const nz = Math.sqrt(1 - d2);
          const z = o.z - r * nz;
          const i = y * cols + x;
          if (z >= zb[i]) continue;
          zb[i] = z;
          const s = .45 + .7 * Math.max(0, dx * LC[0] - dy * LC[1] + nz * LC[2]);
          const oo = i * 4;
          d[oo] = col[0] * s; d[oo + 1] = col[1] * s; d[oo + 2] = col[2] * s; d[oo + 3] = 255;
        }
      }
    }

    // ---------- scene drawing ----------
    function ribbon(center, width, side, nu, m) {
      const G = [];
      for (let i = 0; i < nu; i++) {
        const u = i / (nu - 1), c = center(u), w = width(u), s = side(u);
        const t = sub(center(Math.min(1, u + .02)), center(Math.max(0, u - .02)));
        const fold = norm(cross(s, t));
        G.push(madd(madd(c, s, -w), fold, -w * .35), c, madd(madd(c, s, w), fold, -w * .35));
      }
      surface(G, nu, 3, m, .15);
    }
    function drawGrass(T) {
      for (const b of scene.grass) {
        let g = clamp01((T - b.start) / b.dur);
        if (g <= 0) continue;
        g = easeOut(g);
        const out = [Math.cos(b.az), 0, Math.sin(b.az)], side0 = [-Math.sin(b.az), 0, Math.cos(b.az)];
        const sw = sway(T, b.phase) * .05, sw2 = sway(T * .8, b.phase + 2) * .04;
        const base = [out[0] * b.r0, 0, out[2] * b.r0];
        const center = u => {
          const q = u * g;
          return [base[0] + out[0] * b.lean * Math.pow(q, 1.6) + sw * q * q, b.h * q - b.droop * q * q * q, base[2] + out[2] * b.lean * Math.pow(q, 1.6) + sw2 * q * q];
        };
        const side = u => { const a = b.twist * u * g; return add(mul(side0, Math.cos(a)), mul(out, Math.sin(a))); };
        ribbon(center, u => b.w * Math.pow(1 - u, .7), side, 12, { t: 1, col: b.col });
      }
    }
    function stemCurve(s, T) {
      const a = wind(T, s.top, 0), b = wind(T, s.top, 1), k = s.top[1] / 2;
      const top = [s.top[0] + a * .03 * k, s.top[1], s.top[2] + b * .025 * k];
      return { p0: s.base, p1: [s.base[0] * .4, .8, s.base[2] * .4], p2: madd(top, s.axis, -.55), p3: madd(top, s.axis, -.02), top };
    }
    function drawStem(s, T) {
      let g = clamp01((T - s.stemStart) / s.stemDur);
      if (g <= 0) return;
      g = easeOut(g);
      const c = stemCurve(s, T);
      const n = Math.ceil(160 * g);
      for (let i = 0; i <= n; i++) splat(cubic(c.p0, c.p1, c.p2, c.p3, g * i / Math.max(1, n)), s.rad, s.col);
      for (const l of s.leaves) {
        const k = clamp01((g - l.u) / .25);
        if (k <= 0) continue;
        const S = cubic(c.p0, c.p1, c.p2, c.p3, l.u);
        const out = [Math.cos(l.az), 0, Math.sin(l.az)];
        const dir = norm(add(out, [0, l.heart ? .45 : 1.3, 0]));
        const side = norm(cross(dir, UP));
        const len = l.len * easeOut(k), droop = l.heart ? .6 : .35;
        // heart-shaped (sunflower): wide near the base, pointed tip, with a short petiole
        const width = l.heart
          ? u => u < .12 ? l.w * .12 : l.w * Math.pow(Math.sin(Math.PI * Math.min(.999, (u - .12) / .88 * .95 + .02)), .55) * (1.2 - .55 * u)
          : u => l.w * Math.pow(Math.sin(Math.PI * Math.min(.999, u * .95 + .02)), .8);
        ribbon(u => [S[0] + dir[0] * len * u + out[0] * len * .3 * u * u, S[1] + dir[1] * len * u - len * droop * u * u, S[2] + dir[2] * len * u + out[2] * len * .3 * u * u],
          width, () => side, l.heart ? 12 : 8, { t: 1, col: l.col });
      }
    }
    function drawFlower(f, T) {
      const s = f.stem;
      if (T < s.stemEnd - .05) return;
      const bud = easeOut(clamp01((T - s.stemEnd + .05) / .9));
      const b = clamp01((T - f.bloomStart) / f.bloomDur);
      const eb = easeInOut(b);
      f.bloom = b;
      f.budMix = f.isBud ? f.budMixMax * .95 : f.budMixMax * (1 - smooth(clamp01(b * 1.4)));
      const top = stemCurve(s, T).top;
      const head = add(top, mul(f.off, bud));
      if (f.pedicel) for (let q = 1; q <= 6; q++) splat(madd(top, f.off, bud * q / 6), .0055, s.col);
      for (let k = 0; k < (f.nPetals || 6); k++) {
        if (f.gone && f.gone.includes(k)) continue; // petal already fell (404 flower)
        const outer = k % 2 === 0;
        surface(petalGrid(f, k, T, head, eb, bud), PNU, PNV, { t: 0, f, k, outer }, outer ? .35 : .45);
      }
      const A = f.axis, st = f.st;
      if (f.disc) {
        // green bracts cupping the head, then the seed disc in front of the rays' bases
        const br = f.bracts;
        for (let k = 0; k < br.nPetals; k++)
          surface(petalGrid(br, k, T, madd(head, A, -.012), .35 + .65 * eb, bud), PNU, PNV, { t: 0, f: br, k, outer: true }, .15);
        const d = discGrid(f, madd(head, A, .004), bud * (.55 + .45 * eb));
        surface(d.G, d.NR, d.NT, { t: 2, f }, .18);
        return;
      }
      if (eb > .02) splat(madd(head, A, .01), .03 * f.L / .3 * eb, f.p.throat);
      if (b > .45) {
        const k = easeOut(clamp01((b - .45) / .55));
        const fil = st.colorFixed || f.p.stamen;
        for (const l of stamenLines(f, head, k)) {
          for (const P of l.pts) splat(P, l.pistil ? st.pistilR : st.rad, l.pistil && st.colorFixed ? [160, 196, 98] : fil);
          const tip = l.pts[l.pts.length - 1];
          if (l.pistil) splat(tip, (st.colorFixed ? .017 : .006) * f.L / .3, st.colorFixed ? [214, 232, 160] : f.p.light);
          else {
            splat(tip, st.antherR * f.L / .3, f.p.anther);
            if (st.colorFixed) splat(madd(tip, l.er, .01), st.antherR * .8 * f.L / .3, mixc(f.p.anther, BLACK, .15));
          }
        }
      }
    }
    function drawScene(T) {
      zb.fill(Infinity);
      img.data.fill(0);
      if (scene.update) scene.update(T);
      setupCamera();
      drawGrass(T);
      for (const s of scene.stems) drawStem(s, T);
      for (const f of scene.flowers) drawFlower(f, T);
      if (scene.extra) for (const e of scene.extra(T)) surface(petalGrid(e.f, 0, T, e.head, 1, 1), PNU, PNV, { t: 0, f: e.f, k: 0, outer: true }, .35);
      const d = img.data;
      for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++) {
        const i = r * cols + c, z = zb[i];
        if (z === Infinity) continue;
        const lim = z - .09 * z / dist;
        if (zb[i - 1] < lim || zb[i + 1] < lim || zb[i - cols] < lim || zb[i + cols] < lim) {
          const o = i * 4;
          d[o] *= .35; d[o + 1] *= .35; d[o + 2] *= .35;
        }
      }
      cctx.putImageData(img, 0, 0);
    }

    // ---------- ASCII pass ----------
    let rawView = false;
    function render() {
      if (!cols) resize();
      if (!scene) rebuild();
      const T = clock;
      drawScene(T);
      vctx.setTransform(1, 0, 0, 1, 0, 0);
      if (rawView) {
        vctx.imageSmoothingEnabled = false;
        vctx.fillStyle = '#000'; vctx.fillRect(0, 0, canvas.width, canvas.height);
        vctx.drawImage(colorCv, 0, 0, cols * cwD, rows * chD);
        return;
      }
      const data = img.data;
      gctx.globalCompositeOperation = 'source-over';
      gctx.clearRect(0, 0, glyphCv.width, glyphCv.height);
      for (let i = 0, n = (jitter.length * .015) | 0; i < n; i++) jitter[(Math.random() * jitter.length) | 0] = Math.random();
      const nr = RAMP.length - 1, codeLen = CODE_TEXT.length, scroll = (T * 9) | 0;
      for (let r = 0, i = 0; r < rows; r++) {
        const y = r * chD;
        for (let c = 0; c < cols; c++, i++) {
          if (data[i * 4 + 3] === 0) continue;
          let code;
          if (mode === 'code') {
            code = CODE_TEXT.charCodeAt((r * 131 + c + scroll) % codeLen);
            if (code === 32) code = 46;
          } else {
            const edge = ((c === 0 || data[(i - 1) * 4 + 3] === 0) + (c === cols - 1 || data[(i + 1) * 4 + 3] === 0) +
              (r === 0 || data[(i - cols) * 4 + 3] === 0) + (r === rows - 1 || data[(i + cols) * 4 + 3] === 0)) >= 2;
            if (edge) code = EDGE.charCodeAt(2 + ((jitter[i] * 5) | 0));
            else {
              const lum = (data[i * 4] * .3 + data[i * 4 + 1] * .59 + data[i * 4 + 2] * .11) / 255;
              const v = .42 + .58 * lum + (jitter[i] - .5) * .3;
              code = RAMP.charCodeAt(Math.max(0, Math.min(nr, Math.round(v * nr))));
            }
          }
          gctx.drawImage(atlas, (code - 32) * cwD, 0, cwD, chD, c * cwD, y, cwD, chD);
        }
      }
      gctx.globalCompositeOperation = 'source-in';
      gctx.imageSmoothingEnabled = false;
      gctx.drawImage(colorCv, 0, 0, cols * cwD, rows * chD);
      vctx.globalAlpha = 1;
      vctx.fillStyle = opts.background || '#000';
      vctx.fillRect(0, 0, canvas.width, canvas.height);
      const starIn = opts.stars === false ? 0 : clamp01(T / 2);
      if (starIn > 0) for (const s of stars) {
        if (data[(s.r * cols + s.c) * 4 + 3] !== 0) continue;
        const tw = .5 + .5 * Math.sin(T * s.sp + s.ph);
        vctx.globalAlpha = starIn * (.08 + .32 * tw * tw);
        vctx.drawImage(atlas, (s.ch - 32) * cwD, 0, cwD, chD, s.c * cwD, s.r * chD, cwD, chD);
      }
      vctx.globalAlpha = 1;
      vctx.drawImage(glyphCv, 0, 0);
      vctx.globalCompositeOperation = 'lighter';
      vctx.globalAlpha = .2;
      vctx.drawImage(glyphCv, 0, 0);
      vctx.globalCompositeOperation = 'source-over';
      vctx.globalAlpha = 1;
    }

    const api = {
      _tick(now) {
        if (now - last < 1000 / 31) return;
        const dt = Math.min(.05, last ? (now - last) / 1000 : 0);
        last = now;
        if (!paused) clock += dt;
        if (!dragging) {
          yaw += vyaw; pitch = Math.max(-.35, Math.min(1.15, pitch + vpitch));
          vyaw *= .9; vpitch *= .85;
          if (autoSpin && now - lastInteract > 2500) yaw += spinSpeed * dt;
        }
        if (Math.abs(canvas.clientWidth - W) + Math.abs(canvas.clientHeight - H) > 2) resize();
        try { render(); } catch (err) { console.error(err); }
      },
      play() { playing = true; last = 0; wake(api); return api; },
      stop() { playing = false; active.delete(api); return api; },
      render() { render(); return api; },
      setTime(t) { clock = t; return api; },
      get time() { return clock; },
      setPaused(p) { paused = p; return api; },
      get paused() { return paused; },
      setColor(c) { color = c; rebuild(); if (!playing) render(); return api; },
      get color() { return color; },
      setSpecies(s) { species = s; recipe = null; rebuild(); clock = 0; if (!playing) render(); return api; },
      get species() { return species; },
      // custom bouquet: keeps the current time, so flowers added later appear already grown
      setRecipe(r) { recipe = r; rebuild(); if (!playing) render(); return api; },
      get recipe() { return recipe; },
      // test helper: a short digest of the arrangement, to check a shared link rebuilds the same bouquet
      fingerprint() {
        if (!scene) rebuild();
        let h = 0;
        for (const s of scene.stems) for (const v of s.top) h = (h * 31 + Math.round(v * 1e4)) | 0;
        return scene.stems.length + ':' + scene.flowers.length + ':' + (h >>> 0).toString(36);
      },
      get seed() { return seed; },
      replant(s) { seed = s ?? ((Math.random() * 1e9) | 0); rebuild(); clock = 0; if (!playing) render(); return api; },
      setMode(m) { mode = m; return api; },
      get mode() { return mode; },
      setAutoSpin(on) { autoSpin = on; return api; },
      get autoSpin() { return autoSpin; },
      setView(y, p = pitch, d = dist) { yaw = y; pitch = p; dist = d; vyaw = vpitch = 0; return api; },
      density(step) { densityStep = Math.max(-4, Math.min(6, densityStep + step)); resize(); return api; },
      raw(on = true) { rawView = on; render(); return api; },
      resize() { resize(); if (!playing) render(); return api; },
      destroy() { api.stop(); detach(); },
      bench(n = 10) { const a = performance.now(); for (let i = 0; i < n; i++) render(); return { msPerFrame: (performance.now() - a) / n, cols, rows }; },
      check(T = 30) { if (!scene) rebuild(); return checkScene(scene, T, stemCurve); },
    };

    // ---------- pointer interaction ----------
    let detach = () => {};
    if (opts.interactive) {
      let lx = 0, ly = 0;
      const down = e => { dragging = true; lx = e.clientX; ly = e.clientY; vyaw = vpitch = 0; canvas.setPointerCapture(e.pointerId); canvas.classList.add('drag'); };
      const move = e => {
        if (!dragging) return;
        const dx = e.clientX - lx, dy = e.clientY - ly;
        lx = e.clientX; ly = e.clientY;
        vyaw = -dx * .008; vpitch = dy * .006;
        yaw += vyaw; pitch = Math.max(-.35, Math.min(1.15, pitch + vpitch));
        lastInteract = performance.now();
      };
      const up = () => { dragging = false; lastInteract = performance.now(); canvas.classList.remove('drag'); };
      const wheel = e => { e.preventDefault(); dist = Math.max(2.6, Math.min(10, dist * (1 + e.deltaY * .001))); lastInteract = performance.now(); };
      canvas.addEventListener('pointerdown', down);
      canvas.addEventListener('pointermove', move);
      canvas.addEventListener('pointerup', up);
      canvas.addEventListener('pointercancel', up);
      canvas.addEventListener('wheel', wheel, { passive: false });
      detach = () => {
        canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
        canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up);
        canvas.removeEventListener('wheel', wheel);
      };
    }
    return api;
  }

  // collision report: closest gap between petals of different flowers, and stem-to-petal distance
  function checkScene(scene, T, stemCurve) {
    const fl = scene.flowers;
    const pts = fl.map(f => {
      if (T < f.stem.stemEnd) return [];
      const b = clamp01((T - f.bloomStart) / f.bloomDur), eb = easeInOut(b);
      const bud = easeOut(clamp01((T - f.stem.stemEnd + .05) / .9));
      const head = add(stemCurve(f.stem, T).top, mul(f.off, bud)), out = [];
      for (let k = 0; k < (f.nPetals || 6); k++) out.push(...petalGrid(f, k, T, head, eb, bud));
      return out;
    });
    const stemPts = scene.stems.map(s => { const c = stemCurve(s, T), o = []; for (let i = 0; i <= 60; i++) o.push(cubic(c.p0, c.p1, c.p2, c.p3, i / 60 * .97)); return o; });
    // spatial hash (cell = R): distances beyond R are reported as R
    const R = .06, inv = 1 / R, grid = new Map();
    const key = (x, y, z) => ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);
    pts.forEach((arr, fi) => { for (const p of arr) {
      const k = key(Math.floor(p[0] * inv), Math.floor(p[1] * inv), Math.floor(p[2] * inv));
      let b = grid.get(k); if (!b) grid.set(k, b = []); b.push(fi, p);
    } });
    const near = (p, skip, fn) => {
      const x = Math.floor(p[0] * inv), y = Math.floor(p[1] * inv), z = Math.floor(p[2] * inv);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const b = grid.get(key(x + dx, y + dy, z + dz));
        if (b) for (let n = 0; n < b.length; n += 2) if (!skip(b[n])) fn(b[n], b[n + 1]);
      }
    };
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    let petal = R, stem = R;
    const hitPairs = new Set();
    pts.forEach((arr, fi) => { for (const p of arr) near(p, fj => fj <= fi, (fj, q) => {
      const d = dist(p, q); if (d < petal) petal = d; if (d < .015) hitPairs.add(fi * 4096 + fj);
    }); });
    let stemHits = 0;
    scene.stems.forEach((s, si) => { for (const p of stemPts[si]) near(p, fj => fl[fj].stem === s, (fj, q) => {
      const d = dist(p, q); if (d < stem) stem = d; if (d < .025) stemHits++;
    }); });
    return { minPetalGap: +petal.toFixed(3), minStemToPetal: +stem.toFixed(3), hits: hitPairs.size + stemHits };
  }

  // ---------- share codes ----------
  // A bouquet is rebuilt from a short recipe, so a link only has to carry IDs, never the 3D data:
  //   <seed in base 36>.<item>-<item>-...[.<message>]   item = species letter + count + colour id
  //   e.g. "k3f.L3r-T2y-Y5w.Pour%20L%C3%A9a" = 3 red lilies, 2 yellow sunflowers, 5 white lycoris
  // These letters are part of the link format: never change or reuse them, only add new ones.
  const SPECIES_ID = { lys: 'L', lycoris: 'Y', tournesol: 'T' };
  const COLOR_ID = {
    melange: 'm', rouge: 'r', blanc: 'w', bleu: 'b', rose: 'p', jaune: 'y', dore: 'g', orange: 'o', violet: 'v',
    peche: 'h', carmin: 'c', corail: 'k', lavande: 'l', turquoise: 't', vert: 'e', noir: 'n', creme: 'i',
    fuchsia: 'f', bordeaux: 'd', saumon: 's', citron: 'j',
  };
  const invert = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k]));
  const SPECIES_OF = invert(SPECIES_ID), COLOR_OF = invert(COLOR_ID);
  const MSG_MAX = 80;
  function encode(seedN, recipe, message) {
    const items = recipe.filter(e => e.count > 0 && SPECIES_ID[e.species]).map(e => {
      const c = e.color[0] === '#' ? 'x' + e.color.slice(1).toLowerCase() : (COLOR_ID[e.color] || 'm');
      return SPECIES_ID[e.species] + Math.min(12, e.count | 0) + c;
    });
    let out = (seedN >>> 0).toString(36) + '.' + items.join('-');
    const msg = (message || '').trim().slice(0, MSG_MAX);
    if (msg) out += '.' + encodeURIComponent(msg);
    return out;
  }
  function decode(code) {
    if (!code) return null;
    const a = code.indexOf('.'), b = code.indexOf('.', a + 1);
    if (a < 1) return null;
    const seedN = parseInt(code.slice(0, a), 36);
    const itemsPart = b < 0 ? code.slice(a + 1) : code.slice(a + 1, b);
    let message = '';
    if (b >= 0) { try { message = decodeURIComponent(code.slice(b + 1)).slice(0, MSG_MAX); } catch (e) { message = ''; } }
    const recipe = [];
    let total = 0;
    for (const it of itemsPart.split('-')) {
      const m = it.match(/^([A-Z])(\d{1,2})(x[0-9a-f]{6}|[a-z])$/i);
      if (!m || !SPECIES_OF[m[1].toUpperCase()]) continue;
      const count = Math.min(12, +m[2], MAX_STEMS - total);
      if (count <= 0) continue;
      const color = m[3].length === 7 ? '#' + m[3].slice(1).toLowerCase() : (COLOR_OF[m[3].toLowerCase()] || 'melange');
      recipe.push({ species: SPECIES_OF[m[1].toUpperCase()], color, count });
      total += count;
    }
    if (!recipe.length || !isFinite(seedN)) return null;
    return { seed: seedN, recipe, message };
  }

  window.BouquetEngine = { create, COLORS, SPECIES, paletteFor, hexToRgb: hex, code: { encode, decode, MAX_STEMS, MSG_MAX } };
})();

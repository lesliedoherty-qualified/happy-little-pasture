#!/usr/bin/env node
// Generates the llama placeholder illustrations in site/img/.
//
//   npm run llamas
//
// Every image is built from the same parts (llama, props, backdrop), so a
// tweak here restyles the whole herd. Output is committed, so the site itself
// has no build step and GitHub Pages can serve site/ as-is.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "site", "img");

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

const INK = "#3f2d22";
const CREAM = "#fff4de";
const SNOUT = "#ffe8c6";
const PINK = "#ffb4ad";
const AFRO = "#8f5c3b";
const AFRO_HI = "#b27c55";
const HOOF = "#6b4a36";
const FONT = "'Chalkboard SE','Comic Sans MS','Marker Felt','Trebuchet MS',cursive";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const circles = (list) => list.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join("");

/**
 * A fluffy shape from overlapping circles, outlined only on its outer edge:
 * a wide-stroked copy underneath, then the same circles filled on top.
 */
const fluff = (list, fill, width = 3) =>
  `<g fill="${fill}" stroke="${INK}" stroke-width="${width * 2}" stroke-linejoin="round">${circles(list)}</g>` +
  `<g fill="${fill}">${circles(list)}</g>`;

const text = (x, y, value, { size = 14, fill = "#fff", weight = 700, anchor = "middle" } = {}) =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" dominant-baseline="middle">${value}</text>`;

const sparkle = (x, y, s = 1, fill = "#fff") =>
  `<path transform="translate(${x} ${y}) scale(${s})" d="M0 -9 C1.5 -2 2 -1.5 9 0 C2 1.5 1.5 2 0 9 C-1.5 2 -2 1.5 -9 0 C-2 -1.5 -1.5 -2 0 -9Z" fill="${fill}" opacity=".95"/>`;

// ---------------------------------------------------------------------------
// The llama (drawn in a 240 x 240 frame, centred on x = 120)
// ---------------------------------------------------------------------------

/**
 * @param {object} o
 * @param {boolean} [o.afro]      Bob Ross perm
 * @param {boolean} [o.beard]
 * @param {string}  [o.tie]       tie colour
 * @param {boolean} [o.glasses]
 * @param {boolean} [o.headset]
 * @param {string}  [o.lanyard]   lanyard colour
 * @param {boolean} [o.wink]
 * @param {boolean} [o.headOnly]
 * @param {number}  [o.x] @param {number} [o.y] @param {number} [o.scale]
 */
function llama(o = {}) {
  const parts = [];

  if (!o.headOnly) {
    // Legs, behind the body.
    for (const lx of [96, 113, 131, 148]) {
      parts.push(
        `<rect x="${lx - 7}" y="188" width="14" height="34" rx="7" fill="${CREAM}" stroke="${INK}" stroke-width="3"/>`,
        `<path d="M${lx - 5.5} 214 h11 v3.5 a3.5 3.5 0 0 1 -3.5 3.5 h-4 a3.5 3.5 0 0 1 -3.5 -3.5z" fill="${HOOF}"/>`
      );
    }
    // Tail, neck, body, chest fluff.
    parts.push(fluff([[172, 172, 9], [178, 182, 8]], CREAM));
    parts.push(`<rect x="101" y="96" width="38" height="92" rx="19" fill="${CREAM}" stroke="${INK}" stroke-width="3"/>`);
    parts.push(
      fluff(
        [[92, 184, 22], [110, 174, 26], [134, 174, 26], [154, 182, 22], [102, 198, 18], [124, 200, 20], [146, 198, 18]],
        CREAM
      )
    );
    parts.push(fluff([[108, 150, 12], [121, 146, 13], [134, 151, 12], [114, 160, 10], [128, 161, 10]], CREAM));
  }

  // Ears poke out of the perm at an angle; without one they stand up.
  const ear = (cx, cy, rot) =>
    `<g transform="rotate(${rot} ${cx} ${cy})"><ellipse cx="${cx}" cy="${cy}" rx="8" ry="18" fill="${CREAM}" stroke="${INK}" stroke-width="3"/>` +
    `<ellipse cx="${cx}" cy="${cy + 2}" rx="3.8" ry="11" fill="${PINK}"/></g>`;
  if (o.afro) parts.push(ear(84, 56, -38), ear(156, 56, 38));
  else parts.push(ear(99, 54, -14), ear(141, 54, 14));

  // Head.
  parts.push(`<ellipse cx="120" cy="90" rx="32" ry="28" fill="${CREAM}" stroke="${INK}" stroke-width="3"/>`);

  if (o.afro) {
    parts.push(
      fluff(
        [[91, 72, 11], [95, 57, 12], [107, 46, 13], [121, 41, 14], [135, 46, 13], [147, 57, 12], [151, 72, 11], [106, 62, 12], [121, 57, 13], [136, 62, 12]],
        AFRO
      ),
      `<g fill="none" stroke="${AFRO_HI}" stroke-width="2.4" stroke-linecap="round">` +
        `<path d="M101 50 q4 -4 8 0"/><path d="M117 44 q4 -4 8 0"/><path d="M133 50 q4 -4 8 0"/>` +
        `<path d="M93 64 q4 -4 8 0"/><path d="M141 64 q4 -4 8 0"/><path d="M112 58 q4 -4 8 0"/><path d="M126 58 q4 -4 8 0"/></g>`
    );
  } else {
    parts.push(fluff([[111, 64, 8], [120, 59, 9], [129, 64, 8]], CREAM));
  }

  if (o.beard) parts.push(fluff([[103, 116, 7], [112, 122, 8], [128, 122, 8], [137, 116, 7], [120, 125, 8]], AFRO));

  // Snout, nose, mouth.
  parts.push(
    `<ellipse cx="120" cy="103" rx="19" ry="13" fill="${SNOUT}" stroke="${INK}" stroke-width="2.5"/>`,
    `<ellipse cx="114" cy="99" rx="1.8" ry="1.3" fill="${INK}"/><ellipse cx="126" cy="99" rx="1.8" ry="1.3" fill="${INK}"/>`,
    `<path d="M113 106 Q120 112 127 106" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>`
  );

  // Eyes.
  parts.push(`<circle cx="106" cy="87" r="4.3" fill="${INK}"/><circle cx="107.6" cy="85.4" r="1.4" fill="#fff"/>`);
  parts.push(
    o.wink
      ? `<path d="M129 87 q5 -4 10 0" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/>`
      : `<circle cx="134" cy="87" r="4.3" fill="${INK}"/><circle cx="135.6" cy="85.4" r="1.4" fill="#fff"/>`
  );
  parts.push(`<ellipse cx="98" cy="97" rx="5.5" ry="3.2" fill="${PINK}" opacity=".85"/><ellipse cx="142" cy="97" rx="5.5" ry="3.2" fill="${PINK}" opacity=".85"/>`);

  if (o.glasses) {
    parts.push(
      `<g fill="#fff" fill-opacity=".25" stroke="${INK}" stroke-width="2.6"><circle cx="106" cy="87" r="9"/><circle cx="134" cy="87" r="9"/></g>`,
      `<path d="M115 86 q5 -3 10 0" fill="none" stroke="${INK}" stroke-width="2.6"/>`
    );
  }

  if (o.headset) {
    parts.push(
      `<path d="M89 86 Q90 44 120 44 Q150 44 151 86" fill="none" stroke="#56658f" stroke-width="5" stroke-linecap="round"/>`,
      `<rect x="82" y="78" width="11" height="19" rx="5" fill="#7d8cc4" stroke="${INK}" stroke-width="2.5"/>`,
      `<rect x="147" y="78" width="11" height="19" rx="5" fill="#7d8cc4" stroke="${INK}" stroke-width="2.5"/>`,
      `<path d="M88 96 Q92 114 106 113" fill="none" stroke="#56658f" stroke-width="3.5" stroke-linecap="round"/>`,
      `<circle cx="107" cy="113" r="3.5" fill="#56658f"/>`
    );
  }

  if (!o.headOnly && o.lanyard) {
    parts.push(
      `<path d="M106 122 L118 152 M134 122 L122 152" stroke="${o.lanyard}" stroke-width="3.5" stroke-linecap="round"/>`,
      `<rect x="110" y="150" width="20" height="25" rx="3" fill="#fff" stroke="${INK}" stroke-width="2.5"/>`,
      `<rect x="110" y="150" width="20" height="7" rx="2" fill="${o.lanyard}"/>`,
      `<path d="M114 163 h12 M114 168 h8" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`
    );
  }

  if (!o.headOnly && o.tie) {
    parts.push(
      `<path d="M105 121 L119 130 L111 137 Z M135 121 L121 130 L129 137 Z" fill="#fff" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>`,
      `<path d="M115 129 L125 129 L123 137 L117 137 Z" fill="${o.tie}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>`,
      `<path d="M117 137 L123 137 L128 162 L120 171 L112 162 Z" fill="${o.tie}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>`,
      `<path d="M116 148 L125 145 M115 157 L127 153" stroke="#fff" stroke-opacity=".55" stroke-width="2"/>`
    );
  }

  const { x = 0, y = 0, scale = 1 } = o;
  return `<g transform="translate(${x} ${y}) scale(${scale})">${parts.join("")}</g>`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

const PAINTS = ["#e85d75", "#4fa3e0", "#ffd25a", "#5cc28a", "#ffffff", "#8b6ad8"];

function palette(x, y, s = 1, hole = "#fff") {
  const dots = [[-16, -6], [-4, -11], [9, -9], [18, -1], [12, 9]]
    .map(([dx, dy], i) => `<circle cx="${dx}" cy="${dy}" r="4.6" fill="${PAINTS[i]}" stroke="${INK}" stroke-width="1.4"/>`)
    .join("");
  return (
    `<g transform="translate(${x} ${y}) scale(${s}) rotate(-12)">` +
    `<path d="M-30 0 C-30 -20 -8 -24 10 -21 C28 -18 34 -4 30 8 C27 16 17 13 12 15 C6 18 10 24 0 24 C-18 24 -30 16 -30 0Z" fill="#f2d29b" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>` +
    `<ellipse cx="-8" cy="9" rx="5.5" ry="4.2" fill="${hole}" stroke="${INK}" stroke-width="2.4"/>${dots}</g>`
  );
}

function brush(x1, y1, x2, y2, tip = "#4fa3e0") {
  const mx = x1 + (x2 - x1) * 0.72;
  const my = y1 + (y2 - y1) * 0.72;
  return (
    `<line x1="${x1}" y1="${y1}" x2="${mx}" y2="${my}" stroke="${INK}" stroke-width="8.5" stroke-linecap="round"/>` +
    `<line x1="${x1}" y1="${y1}" x2="${mx}" y2="${my}" stroke="#a5703f" stroke-width="5" stroke-linecap="round"/>` +
    `<line x1="${mx}" y1="${my}" x2="${x2}" y2="${y2}" stroke="${INK}" stroke-width="7.5" stroke-linecap="round"/>` +
    `<line x1="${mx}" y1="${my}" x2="${x2}" y2="${y2}" stroke="${tip}" stroke-width="4.5" stroke-linecap="round"/>`
  );
}

function tree(x, y, s = 1, fill = "#3f8f63") {
  return (
    `<g transform="translate(${x} ${y}) scale(${s})" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round">` +
    `<rect x="-3" y="0" width="6" height="10" fill="#8a5a3a"/>` +
    `<path d="M0 -36 L13 -16 L-13 -16Z M0 -26 L16 0 L-16 0Z" fill="${fill}"/></g>`
  );
}

function cloud(x, y, s = 1, { face = true } = {}) {
  return (
    `<g transform="translate(${x} ${y}) scale(${s})">` +
    fluff([[-24, 4, 14], [-8, -6, 18], [12, -4, 16], [27, 6, 12], [0, 8, 14]], "#ffffff") +
    (face
      ? `<circle cx="-8" cy="2" r="2.6" fill="${INK}"/><circle cx="8" cy="2" r="2.6" fill="${INK}"/>` +
        `<path d="M-5 9 q5 5 10 0" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>` +
        `<ellipse cx="-15" cy="8" rx="4" ry="2.4" fill="${PINK}" opacity=".8"/><ellipse cx="15" cy="8" rx="4" ry="2.4" fill="${PINK}" opacity=".8"/>`
      : "") +
    `</g>`
  );
}

function bubble(x, y, label, fill, { size = 12, pad = 10 } = {}) {
  const w = Math.round(label.length * size * 0.62 + pad * 2);
  const h = Math.round(size + pad * 1.4);
  return (
    `<g transform="translate(${x} ${y})">` +
    `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}" stroke="${INK}" stroke-width="2.5"/>` +
    text(0, 1, label, { size }) +
    `</g>`
  );
}

function laptop(x, y, s = 1) {
  return (
    `<g transform="translate(${x} ${y}) scale(${s})" stroke="${INK}" stroke-width="3" stroke-linejoin="round">` +
    `<path d="M-34 -42 L34 -42 L30 0 L-30 0Z" fill="#5d6b9a"/>` +
    `<path d="M-12 -24 c0 -6 8 -8 12 -2 c4 -6 12 -4 12 2 c0 6 -12 13 -12 13 c0 0 -12 -7 -12 -13Z" fill="${PINK}" stroke-width="2"/>` +
    `<path d="M-44 0 L44 0 L48 8 L-48 8Z" fill="#c7cde3"/></g>`
  );
}

function sign(x, y, label, { w = 66, h = 34, size = 15 } = {}) {
  return (
    `<g transform="translate(${x} ${y})" stroke="${INK}" stroke-width="3" stroke-linejoin="round">` +
    `<rect x="-4" y="0" width="8" height="46" fill="#8a5a3a"/>` +
    `<rect x="${-w / 2}" y="${-h}" width="${w}" height="${h}" rx="5" fill="#f2d29b"/></g>` +
    text(x, y - h / 2 + 1, label, { size, fill: INK })
  );
}

function mug(x, y, label, fill = "#ff8a7a") {
  return (
    `<g transform="translate(${x} ${y})" stroke="${INK}" stroke-width="3" stroke-linejoin="round">` +
    `<path d="M14 -16 q12 0 12 10 q0 10 -12 10" fill="none"/>` +
    `<rect x="-16" y="-24" width="32" height="34" rx="6" fill="${fill}"/>` +
    `<path d="M-6 -32 q4 -6 0 -12 M4 -32 q4 -6 0 -12" fill="none" stroke-width="2.2" stroke-linecap="round" opacity=".6"/></g>` +
    text(x, y - 7, label, { size: 10 })
  );
}

function pie(x, y, r = 22) {
  return (
    `<g transform="translate(${x} ${y})" stroke="${INK}" stroke-width="3" stroke-linejoin="round">` +
    `<circle r="${r}" fill="#ffd25a"/>` +
    `<path d="M0 0 L0 ${-r} A${r} ${r} 0 0 1 ${r * 0.95} ${r * 0.31} Z" fill="#e85d75"/>` +
    `<path d="M0 0 L${r * 0.95} ${r * 0.31} A${r} ${r} 0 0 1 ${-r * 0.4} ${r * 0.92} Z" fill="#5cc28a"/></g>`
  );
}

/** A canvas on an easel: mountains, happy little trees, and an up-and-to-the-right KPI. */
function easel(x, y, w = 120, h = 92) {
  const id = "canvas-clip";
  const bars = [0.25, 0.42, 0.58, 0.8]
    .map((p, i) => {
      const bw = w * 0.09;
      const bx = w * 0.52 + i * (bw + 4);
      const bh = h * 0.55 * p;
      return `<rect x="${bx}" y="${h * 0.82 - bh}" width="${bw}" height="${bh}" rx="2" fill="${["#ffd25a", "#ff8a7a", "#8b6ad8", "#4fa3e0"][i]}" stroke="${INK}" stroke-width="2"/>`;
    })
    .join("");
  return (
    `<g stroke="${INK}" stroke-width="4" stroke-linecap="round"><line x1="${x + w * 0.2}" y1="${y + h}" x2="${x + w * 0.08}" y2="${y + h + 70}"/>` +
    `<line x1="${x + w * 0.8}" y1="${y + h}" x2="${x + w * 0.92}" y2="${y + h + 70}"/><line x1="${x + w * 0.5}" y1="${y - 10}" x2="${x + w * 0.5}" y2="${y + h + 60}"/></g>` +
    `<g transform="translate(${x} ${y})">` +
    `<clipPath id="${id}"><rect width="${w}" height="${h}" rx="4"/></clipPath>` +
    `<g clip-path="url(#${id})"><rect width="${w}" height="${h}" fill="#d9f0ff"/>` +
    `<path d="M-5 ${h * 0.7} L${w * 0.22} ${h * 0.28} L${w * 0.42} ${h * 0.6} L${w * 0.6} ${h * 0.36} L${w + 5} ${h * 0.75} L${w + 5} ${h + 5} L-5 ${h + 5}Z" fill="#b9a8e8" stroke="${INK}" stroke-width="2"/>` +
    `<path d="M${w * 0.22} ${h * 0.28} L${w * 0.15} ${h * 0.4} L${w * 0.29} ${h * 0.4}Z" fill="#fff"/>` +
    `<path d="M-5 ${h * 0.82} Q${w * 0.5} ${h * 0.7} ${w + 5} ${h * 0.82} L${w + 5} ${h + 5} L-5 ${h + 5}Z" fill="#9ed9a4" stroke="${INK}" stroke-width="2"/>` +
    tree(w * 0.12, h * 0.84, 0.55) +
    tree(w * 0.3, h * 0.86, 0.75) +
    bars +
    `<path d="M${w * 0.5} ${h * 0.62} L${w * 0.88} ${h * 0.2}" stroke="#e85d75" stroke-width="3" fill="none" stroke-linecap="round"/>` +
    `<path d="M${w * 0.88} ${h * 0.2} l-9 1 M${w * 0.88} ${h * 0.2} l-1 9" stroke="#e85d75" stroke-width="3" stroke-linecap="round"/>` +
    `</g><rect width="${w}" height="${h}" rx="4" fill="none" stroke="${INK}" stroke-width="4"/></g>`
  );
}

// ---------------------------------------------------------------------------
// Backdrop: a soft glow halo behind a pastel vignette, like a sticker.
// ---------------------------------------------------------------------------

function backdrop(w, h, { glow, disc, ground = "#a9e2b1", cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.42 }) {
  return (
    `<defs><radialGradient id="halo"><stop offset="0" stop-color="${glow}" stop-opacity=".95"/>` +
    `<stop offset=".62" stop-color="${glow}" stop-opacity=".45"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient>` +
    `<clipPath id="vignette"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath></defs>` +
    `<circle cx="${cx}" cy="${cy}" r="${r * 1.22}" fill="url(#halo)"/>` +
    `<g clip-path="url(#vignette)"><rect width="${w}" height="${h}" fill="${disc}"/>` +
    `<ellipse cx="${cx}" cy="${cy + r * 0.98}" rx="${r * 1.3}" ry="${r * 0.5}" fill="${ground}"/></g>`
  );
}

const svg = (w, h, title, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${title}">` +
  `<title>${title}</title>${body}</svg>\n`;

// ---------------------------------------------------------------------------
// The herd
// ---------------------------------------------------------------------------

const images = {
  "logo.svg": svg(
    96,
    96,
    "Llamalytics logo: a llama with a magnificent perm",
    `<circle cx="48" cy="48" r="46" fill="#f4d4cf" stroke="${INK}" stroke-width="3"/>` + llama({ afro: true, headOnly: true, x: -24, y: 4, scale: 0.6 })
  ),

  "hero.svg": svg(
    520,
    360,
    "A llama with a Bob Ross perm paints a happy little KPI on an easel",
    backdrop(520, 360, { glow: "#e8c79a", disc: "#ece6fa", ground: "#bfe0c0", cx: 260, cy: 188, r: 158 }) +
      cloud(122, 92, 1) +
      cloud(420, 70, 0.7, { face: false }) +
      tree(408, 314, 0.9) +
      tree(440, 322, 0.7, "#4ea374") +
      easel(320, 132, 128, 96) +
      llama({ afro: true, beard: true, x: 56, y: 96, scale: 1.08 }) +
      brush(256, 262, 318, 196, "#4fa3e0") +
      palette(152, 284, 1.15, "#a9e2b1") +
      sparkle(476, 140, 1.1) +
      sparkle(92, 196, 0.8) +
      sparkle(300, 72, 0.9, "#ffd25a")
  ),

  "feature-synergy.svg": svg(
    240,
    240,
    "A llama on a laptop surrounded by synergy, circle back and ROI",
    backdrop(240, 240, { glow: "#9fd8ea", disc: "#e7f6fb", ground: "#a8dcc8" }) +
      llama({ afro: true, glasses: true, x: 22, y: 30, scale: 0.82 }) +
      laptop(120, 214, 0.9) +
      bubble(50, 64, "synergy", "#c96a3b", { size: 11 }) +
      bubble(190, 92, "circle back", "#6a3f8e", { size: 10 }) +
      bubble(40, 132, "ROI", "#1b9fc4", { size: 11 })
  ),

  "feature-cloud.svg": svg(
    240,
    240,
    "A llama admires a happy little cloud",
    backdrop(240, 240, { glow: "#b9c6ee", disc: "#eef1fc", ground: "#c9c0ea" }) +
      cloud(172, 64, 0.95) +
      sparkle(204, 112, 0.7, "#ffd25a") +
      tree(34, 214, 0.8) +
      tree(208, 216, 0.6, "#4ea374") +
      llama({ afro: true, x: 12, y: 36, scale: 0.84 })
  ),

  "feature-roadmap.svg": svg(
    240,
    240,
    "A llama holding a Q4 roadmap sign next to happy little trees",
    backdrop(240, 240, { glow: "#f4c7b9", disc: "#fdf0ec", ground: "#e8c79a" }) +
      tree(30, 210, 0.75) +
      tree(52, 218, 0.55, "#4ea374") +
      llama({ afro: true, wink: true, x: 4, y: 36, scale: 0.84 }) +
      sign(186, 166, "Q4 &#8599;", { w: 70 }) +
      sparkle(210, 96, 0.8)
  ),

};

mkdirSync(OUT, { recursive: true });
for (const [name, body] of Object.entries(images)) {
  writeFileSync(join(OUT, name), body);
  console.log(`wrote site/img/${name}`);
}

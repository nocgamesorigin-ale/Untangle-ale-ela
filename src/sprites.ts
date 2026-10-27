// Bitmap UI art. Vite inlines these PNGs as data URIs, so the build stays one file.
import hint from './assets/btn-hint.webp';
import menu from './assets/btn-menu.webp';
import retry from './assets/btn-retry.webp';
import slot from './assets/btn-slot.webp';
import undo from './assets/btn-undo.webp';
import hudCell from './assets/hud-cell.webp';
import hudPanel from './assets/hud-panel.webp';
import hudTab from './assets/hud-tab.webp';
import homeBg from './assets/home-bg.jpg';
import homeCoin from './assets/home-coin.webp';
import homeCrown from './assets/home-crown.webp';
import homeGear from './assets/home-gear.webp';
import homeLevel from './assets/home-level.webp';
import homeLogo from './assets/home-logo.webp';
import homePedestal from './assets/home-pedestal.webp';
import homePlay from './assets/home-play.webp';
import homeStar from './assets/home-star.webp';
import peg from './assets/peg.webp';
import popFail from './assets/pop-fail.webp';
import popFull from './assets/pop-full.webp';
import popPause from './assets/pop-pause.webp';
import popWin from './assets/pop-win.webp';
import popTimeUp from './assets/pop-timeup.webp';
import popOot from './assets/pop-oot.webp';
import starOff from './assets/star-off.webp';
import starOn from './assets/star-on.webp';
import slotEmpty from './assets/slot-empty.png';
import slotLocked from './assets/slot-locked.png';

function load(src: string): HTMLImageElement {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  return img;
}

/** Bottom booster buttons in toolbar order: Undo, Hint, +Slot, Retry, Settings. */
export const BOOSTER_ART = [undo, hint, slot, retry, menu].map(load);

/**
 * Each sprite is a square crop whose half-width is 1.06 × the button radius.
 * The art came with counter badges painted on; the game draws its live badge
 * over the same spot (offsets in button radii from the centre).
 */
export const ART_SCALE = 1.06;
export const BADGE_AT: [number, number][] = [[0.58, -0.79], [0.6, -0.8], [0.66, -0.84]];

export function ready(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}

/** Top HUD, split from the reference art with its text removed (text is drawn live). */
export const HUD_PANEL = load(hudPanel);
export const HUD_CELL = load(hudCell);
export const HUD_TAB = load(hudTab);
/** Width / height of the HUD panel art (keeps the reference proportions). */
export const HUD_ASPECT = 1050 / 207;

/**
 * Nine-slice draw: corners keep their shape (scaled by `k`), edges and centre stretch.
 * l/t/r/b are insets in source pixels.
 */
export function nine(
  c: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number },
  x: number, y: number, w: number, h: number, l: number, t: number, r: number, b: number, k: number,
): void {
  const sw = img.width, sh = img.height;
  const L = Math.min(l * k, w / 2), R = Math.min(r * k, w / 2), T = Math.min(t * k, h / 2), B = Math.min(b * k, h / 2);
  const sx = [0, l, sw - r, sw], sy = [0, t, sh - b, sh];
  const dx = [x, x + L, x + w - R, x + w], dy = [y, y + T, y + h - B, y + h];
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 3; i++) {
      const s0 = sx[i + 1] - sx[i], s1 = sy[j + 1] - sy[j], d0 = dx[i + 1] - dx[i], d1 = dy[j + 1] - dy[j];
      if (s0 > 0 && s1 > 0 && d0 > 0 && d1 > 0) c.drawImage(img, sx[i], sy[j], s0, s1, dx[i], dy[j], d0, d1);
    }
  }
}

/** Recoloured copies per image (keyed by the image itself, so art with equal URL lengths never collide). */
const tints = new WeakMap<HTMLImageElement, Map<string, HTMLCanvasElement>>();

function tintCache(img: HTMLImageElement): Map<string, HTMLCanvasElement> {
  let m = tints.get(img);
  if (!m) tints.set(img, (m = new Map()));
  return m;
}

/**
 * The art recoloured to `color` for bright hues (yellow, orange): its greyscale shading
 * is overlaid on the solid colour, so mid-tones keep the colour's own brightness.
 */
export function tintedBright(img: HTMLImageElement, color: string): HTMLCanvasElement | HTMLImageElement {
  if (!ready(img)) return img;
  const cache = tintCache(img), key = 'b' + color;
  let cv = cache.get(key);
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = img.naturalWidth;
    cv.height = img.naturalHeight;
    const c = cv.getContext('2d')!;
    // greyscale shading of the art
    const gray = document.createElement('canvas');
    gray.width = cv.width;
    gray.height = cv.height;
    const g = gray.getContext('2d')!;
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'saturation';
    g.fillStyle = '#808080';
    g.fillRect(0, 0, gray.width, gray.height);
    // solid colour, shaded by overlaying the greyscale (mid-grey keeps the colour as is)
    c.fillStyle = color;
    c.fillRect(0, 0, cv.width, cv.height);
    c.globalCompositeOperation = 'overlay';
    c.drawImage(gray, 0, 0);
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(img, 0, 0);
    cache.set(key, cv);
  }
  return cv;
}

/** The art recoloured to `color` (keeps its shading and alpha); cached per colour. */
export function tinted(img: HTMLImageElement, color: string): HTMLCanvasElement | HTMLImageElement {
  if (!ready(img)) return img;
  const cache = tintCache(img), key = color;
  let cv = cache.get(key);
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = img.naturalWidth;
    cv.height = img.naturalHeight;
    const c = cv.getContext('2d')!;
    c.drawImage(img, 0, 0);
    c.globalCompositeOperation = 'color';
    c.fillStyle = color;
    c.fillRect(0, 0, cv.width, cv.height);
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(img, 0, 0);
    cache.set(key, cv);
  }
  return cv;
}

// ---- holder slots (cut from the reference art: gold ring, purple face; locked has the pink X) ----

export const SLOT_ART = { empty: load(slotEmpty), locked: load(slotLocked) };

// ---- pegs ----------------------------------------------------------------

export const PEG = load(peg);

// ---- home screen (positions are in the 624 × 1280 reference frame) ----------------------------

export const HOME_W = 624;
export const HOME_H = 1280;
export const HOME_BG = load(homeBg);
export const HOME = {
  coin: { img: load(homeCoin), x: 18, y: 18, w: 247, h: 91 },
  gear: { img: load(homeGear), x: 508, y: 12, w: 109, h: 109 },
  crown: { img: load(homeCrown), x: 238, y: 94, w: 153, h: 107 },
  logo: { img: load(homeLogo), x: 80, y: 180, w: 495, h: 225 },
  star: { img: load(homeStar), x: 118, y: 405, w: 389, h: 374 },
  pedestal: { img: load(homePedestal), x: 90, y: 728, w: 445, h: 159 },
  play: { img: load(homePlay), x: 96, y: 887, w: 433, h: 136 },
  level: { img: load(homeLevel), x: 150, y: 1023, w: 325, h: 72 },
};
export type HomePart = (typeof HOME)[keyof typeof HOME];
/** Where live text goes (reference frame): coin count and "Level N". */
export const HOME_COIN_TEXT = { x: 150, y: 64, size: 26 };
export const HOME_LEVEL_TEXT = { x: 312, y: 1048, size: 22 };

// ---- popups (art with its live text removed; coordinates in the art's original pixels) --------

export type Box = [number, number, number, number];
export interface PopupArt { img: HTMLImageElement; w: number; h: number; close?: [number, number, number] }

export const POP_PAUSE = {
  img: load(popPause), w: 1159, h: 1356, close: [1050, 128, 64] as [number, number, number],
  resume: [170, 285, 985, 450] as Box, restart: [170, 478, 985, 640] as Box, sound: [170, 665, 985, 825] as Box,
  clear: [170, 850, 985, 1010] as Box, home: [170, 1035, 985, 1195] as Box,
  soundText: [645, 742, 66] as [number, number, number],
};
export const POP_WIN = {
  img: load(popWin), w: 1024, h: 1536,
  stars: [[284, 569, 216], [512, 538, 236], [743, 567, 214]] as [number, number, number][],
  coinText: [572, 748, 70] as [number, number, number], combo: [512, 845, 40] as [number, number, number],
  next: [125, 935, 900, 1130] as Box, ad: [150, 1150, 875, 1310] as Box,
};
export const POP_FULL = {
  img: load(popFull), w: 1199, h: 1312, close: [1100, 155, 64] as [number, number, number],
  slot: [160, 775, 1040, 965] as Box, undo: [170, 990, 1030, 1165] as Box,
};
export const POP_FAIL = {
  img: load(popFail), w: 1199, h: 1312, close: [1100, 170, 64] as [number, number, number],
  text: [600, 478, 50] as [number, number, number], retry: [170, 735, 1030, 945] as Box, home: [230, 965, 970, 1135] as Box,
};
export const STAR_ON = load(starOn);
export const STAR_OFF = load(starOff);

export const POP_TIMEUP = {
  img: load(popTimeUp), w: 1199, h: 1312, close: [1095, 155, 64] as [number, number, number],
  text: [600, 706, 52] as [number, number, number], buy: [150, 850, 1050, 1060] as Box,
};
export const POP_OOT = {
  img: load(popOot), w: 1199, h: 1312, close: [1097, 205, 64] as [number, number, number],
  text: [600, 500, 50] as [number, number, number], retry: [175, 740, 1025, 945] as Box, home: [210, 965, 985, 1140] as Box,
};

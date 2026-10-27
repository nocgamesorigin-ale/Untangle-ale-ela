// Untangle Ale Ela — gameplay.
//
// Rubber bands are stretched over the pegs of a board, stacked in layers.
// Tap a band that nothing lies on: it flies to the tray of its colour (3 per
// tray; a full tray clears and the next one slides in) or, when no such tray
// is showing, it parks in the holder. Fill the holder with no way out and you
// are "Out of Space". Clear every band to win.
//
// Boosters: Undo, Hint, +1 holder Slot, Retry, Menu. Boards are sized to fit the
// screen (no zoom). Levels come from levels.ts (seeded and solver-checked).
import { sfx, setSound, soundOn, unlockAudio } from './audio';
import {
  ART_SCALE, BADGE_AT, BOOSTER_ART, HOME, type HomePart, HOME_BG, HOME_COIN_TEXT, HOME_H, HOME_LEVEL_TEXT, HOME_W, HUD_ASPECT, HUD_CELL,
  HUD_PANEL, HUD_TAB, PEG, POP_FAIL, POP_FULL, POP_OOT, POP_TIMEUP, POP_PAUSE, POP_WIN, SLOT_ART, STAR_OFF, STAR_ON, nine, ready, tinted, type Box,
} from './sprites';
import { art } from './art';
import { emit, levelChanged, type GameEventData } from './gamekit';
import type { PointerEvt } from './input';
import {
  COLORS, SPECS, chooseMove, freesCount, getLevel, isFree, outlineOf, pointInPoly, segDist,
  type Band, type Level, type PlayState,
} from './levels';
import {
  BAND_W, LIFT, PEG_R, WRAP_R, badge, donut, flatSlot, trayBack, trayFront, trayGeom, coin, cream, crown, font, gem, hudCell, hudPanel, hudText, icon, label,
  keyAsset, makeCanvas, makePegSprites, mix, padlock, paintBackdrop, panel, pillButton, pillTab, roundButton, rr,
  star, text3D,
  type IconName, type PegSprites,
} from './render';

export type Phase = 'title' | 'playing' | 'won' | 'lost';
type Modal = 'none' | 'menu' | 'outOfSpace' | 'timeUp';

/**
 * Time to beat a level (hybrid-casual pacing): roomy on normal levels, tighter on
 * hard ones, always rounded to 5 s. About 6 s per band + 30 s on normal levels.
 */
export function timeLimit(level: number): number {
  const spec = SPECS[level - 1];
  const per = spec.diff === 'superhard' ? 4.5 : spec.diff === 'hard' ? 5 : 6;
  const base = spec.diff === 'normal' ? 30 : 20;
  return Math.ceil((spec.bands * per + base) / 5) * 5;
}

/** How many levels the preview's level list shows. */
export const LEVEL_COUNT = SPECS.length;

const SAVE_KEY = 'untangle-ale-ela.save';
const PRICES = { undo: 50, hint: 80, slot: 150, time: 100 };
const MAX_HOLDER = 7;

interface Rect { x: number; y: number; w: number; h: number }
interface Save { coins: number; maxLevel: number; undo: number; hint: number; slot: number }

interface Flyer {
  active: boolean;
  color: number;
  x0: number; y0: number; x1: number; y1: number;
  r0: number; r1: number;
  t: number;
  dur: number;
  /** Tray slot it goes to (-1 → holder slot `hs`). */
  slot: number;
  gen: number;
  hs: number;
  arc: number;
  /** Undo: the band this ring flies back to on the board (-1: none). */
  toBand: number;
  /** Tray well index (0..2) it lands in, -1 for the holder. */
  well: number;
  /** Not drawn before it starts (it is born from a band contracting on the board). */
  fromBoard: boolean;
}

interface Particle { active: boolean; x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; rot: number; vr: number; conf: boolean }

interface Snapshot {
  removed: Uint8Array;
  trayColor: number[];
  trayCount: number[];
  trayGen: number[];
  qi: number;
  holder: number[];
  combo: number;
}

/** Camera: near-frontal with a slight top-down tilt — depth is squashed and the
 *  far (upper) part of the board is drawn a little narrower (keystone). */
const TILT = 0.9;
const KEYSTONE = 0.05;
const tiltedCache = new Map<number, Level>();

function tilted(L: Level): Level {
  const hit = tiltedCache.get(L.index);
  if (hit) return hit;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < L.poly.length; i += 2) {
    x0 = Math.min(x0, L.poly[i]);
    x1 = Math.max(x1, L.poly[i]);
    y0 = Math.min(y0, L.poly[i + 1] * TILT);
    y1 = Math.max(y1, L.poly[i + 1] * TILT);
  }
  const cx = (x0 + x1) / 2, span = Math.max(1e-3, y1 - y0);
  const px = (x: number, y: number) => cx + (x - cx) * (1 - (KEYSTONE * (y1 - y)) / span);
  const tf = (a: Float32Array) => {
    const o = a.slice();
    for (let i = 0; i < o.length; i += 2) {
      o[i + 1] *= TILT;
      o[i] = px(o[i], o[i + 1]);
    }
    return o;
  };
  const pegY = L.pegY.map((v) => v * TILT);
  const t: Level = {
    ...L,
    pegY,
    pegX: L.pegX.map((x, i) => px(x, pegY[i])),
    poly: tf(L.poly),
    grid: tf(L.grid),
    hole: L.hole ? tf(L.hole) : null,
    bands: L.bands.map((b) => {
      const outline = tf(b.outline);
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < outline.length; i += 2) {
        minX = Math.min(minX, outline[i]);
        maxX = Math.max(maxX, outline[i]);
        minY = Math.min(minY, outline[i + 1]);
        maxY = Math.max(maxY, outline[i + 1]);
      }
      return { ...b, outline, hull: tf(b.hull), cx: px(b.cx, b.cy * TILT), cy: b.cy * TILT, minX, maxX, minY, maxY };
    }),
  };
  tiltedCache.set(L.index, t);
  return t;
}


function loadSave(): Save {
  const d: Save = { coins: 400, maxLevel: 1, undo: 3, hint: 1, slot: 1 };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return { ...d, ...(JSON.parse(raw) as Partial<Save>) };
  } catch {
    // fresh start
  }
  return d;
}

const inRect = (x: number, y: number, r: Rect) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
const inCircle = (x: number, y: number, cx: number, cy: number, r: number) => (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
const rect = (): Rect => ({ x: 0, y: 0, w: 0, h: 0 });
const ease = (t: number) => 1 - Math.pow(1 - t, 3);
/** Seconds a picked band takes to contract before its ring flies off. */
/** Vertical flattening of a loop round a peg as seen by the camera. */
const PEG_E = 0.78;
const PLUCK = 0.42;
/** Undo: the ring unrolls back onto the pegs. */
const UNPLUCK = 0.38;
/** Ring wells across a tray (fractions of its width from the centre). */
const TRAY_WELLS = [-0.28, 0, 0.28];
/** Level intro: the board drops in and the bands snap onto the pegs. */
const INTRO = 0.42;
/** Landing bounce length (seconds). */
const POP = 0.32;
/** Elastic settle: 1 → a little bigger → a little smaller → 1. */
const popScale = (p: number) => (p <= 0 ? 1 : 1 + Math.sin((1 - p / POP) * Math.PI * 2) * 0.16 * (p / POP));
const backOut = (t: number) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);

export class Game {
  phase: Phase = 'title';
  level = 1;
  private modal: Modal = 'none';
  private save = loadSave();

  private width = 0;
  private height = 0;
  private dpr = 1;
  private s = 1;
  private sat = 0;
  private sab = 0;
  private time = 0;

  // ---- level state ----
  private lvl!: Level;
  private bands: Band[] = [];
  private paths: Path2D[] = [];
  private cords: Float32Array[] = [];
  private contacts: Path2D[] = [];
  private cordsEven: Float32Array[] = [];
  private pegScale = 1;
  private pegArt = false;
  private lift = LIFT;
  private lockT = -1;
  private lockShake = 0;
  private keyFrom = { x: 0, y: 0 };
  private removed: Uint8Array = new Uint8Array(0);
  private removedCount = 0;
  private trayColor: number[] = [];
  private trayCount: number[] = [];
  private trayGen: number[] = [];
  private hist: number[][] = [];
  private qi = 0;
  private holder: number[] = [];
  private cap = 4;
  private undoStack: Snapshot[] = [];
  private combo = 0;
  private bestCombo = 0;
  private boostersUsed = 0;
  private reward = 0;
  private stars = 3;
  private endTimer = -1;
  private stuckTimer = -1;
  private movesMade = 0;
  private parkTipShown = false;
  private tutorialId = -1;

  // ---- visuals ----
  private visGen: number[] = [];
  private visPhase: number[] = [];
  private visT: number[] = [];
  private niceT: number[] = [];
  private flyers: Flyer[] = [];
  private trayPop: number[][] = [];
  private holderPop: number[] = [0, 0, 0, 0, 0, 0, 0];
  /** Slide offset (px) of each holder ring while it moves into a freed slot. */
  private holderOff: number[] = [0, 0, 0, 0, 0, 0, 0];
  private particles: Particle[] = [];
  /** Bands being picked; `r` is the on-screen ring radius they contract to (= the ring in its slot). */
  private plucks: { id: number; t: number; r: number; rev?: boolean }[] = [];
  /** Bands taken back by Undo stay hidden until their ring has flown back and unrolled. */
  private hidden: Uint8Array = new Uint8Array(0);
  private shakeT: Float32Array = new Float32Array(0);
  private hintId = -1;
  private hintT = 0;
  private bubble = '';
  private bubbleT = 0;
  private bannerT = 0;
  private popT = 0;
  private doubled = false;

  // ---- view ----
  private unit = 1;
  private ox = 0;
  private oy = 0;
  private fitUnit = 1;
  private boardCache: HTMLCanvasElement | null = null;
  private cacheUnit = 0;
  private cacheX0 = 0;
  private cacheY0 = 0;
  private pegs: PegSprites | null = null;
  private backdrops: (HTMLCanvasElement | null)[] = [null];

  // ---- layout ----
  private area = rect();
  private hudRect = rect();
  private homeS = 1;
  private homeX = 0;
  private homeY = 0;
  private elapsed = 0;
  private timeLeft = 60;
  private loseReason: 'stuck' | 'time' = 'stuck';
  private introT = 0;
  private trayBump = [0, 0];
  private floaters: { text: string; x: number; y: number; t: number; color: string }[] = [];
  private confetti = 0;
  private trayX = [0, 0];
  private trayY = 0;
  private TW = 100;
  private TH = 40;
  private holderY = 0;
  private holderGap = 36;
  private holderR = 14;
  private btnX: number[] = [0, 0, 0, 0, 0];
  private btnY = 0;
  private btnR = 26;
  private btnS = [1, 1, 1, 1, 1];
  private btnV = [0, 0, 0, 0, 0];
  private playBtn = rect();
  private mPanel = rect();
  private mA = rect();
  private mB = rect();
  private mC = rect();
  private mD = rect();
  private mCloseX = 0;
  private mCloseY = 0;
  private mCloseR = 22;
  private mE = rect();
  /** Art scale of the open popup (screen px per art px) and its origin. */
  private popK = 1;
  /** Clear Data asks for a second tap within this many seconds. */
  private clearArmed = 0;
  /** Cheat row under the pause popup: pick any level and jump straight to it. */
  private cheatLv = 1;
  private cDn = rect();
  private cUp = rect();
  private cGo = rect();
  /** Coins shown in the top-left counter (catches up as reward coins land). */
  private coinShown = 0;
  private coinPulse = 0;
  private coinFly: { x0: number; y0: number; sx: number; sy: number; t: number; value: number }[] = [];

  // ---- pointer ----
  private downX = 0;
  private downY = 0;
  private moved = false;
  private pressKey = '';

  constructor() {
    for (let i = 0; i < 48; i++) {
      this.flyers.push({ active: false, color: 0, x0: 0, y0: 0, x1: 0, y1: 0, r0: 0, r1: 0, t: 0, dur: 0, slot: 0, gen: 0, hs: 0, arc: 0, well: -1, fromBoard: false, toBand: -1 });
    }
    for (let i = 0; i < 200; i++) this.particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, color: '#fff', size: 3, rot: 0, vr: 0, conf: false });
    this.level = Math.min(LEVEL_COUNT, this.save.maxLevel);
    this.prepare(this.level);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.sat = readSafeTop();
    this.sab = readSafe('bottom');
    this.backdrops = [null];
    this.layout();
    this.computeView();
    this.boardCache = null;
  }

  // ---- persistence ----------------------------------------------------------------

  private persist(): void {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.save));
    } catch {
      // storage full / private mode: progress stays in memory
    }
  }

  // ---- state changes ----------------------------------------------------------------

  /** Loads a level's data without changing phase (used for the title backdrop too). */
  private prepare(level: number): void {
    this.level = level;
    this.lvl = tilted(getLevel(level));
    this.bands = this.lvl.bands;
    this.cords = [];
    this.paths = [];
    const n = this.bands.length;
    this.removed = new Uint8Array(n);
    this.shakeT = new Float32Array(n);
    this.hidden = new Uint8Array(n);
    this.removedCount = 0;
    const T = this.lvl.spec.trays;
    this.qi = 0;
    this.trayColor = [];
    this.trayCount = [];
    this.trayGen = [];
    this.hist = [];
    for (let i = 0; i < T; i++) {
      const c = this.qi < this.lvl.queue.length ? this.lvl.queue[this.qi++] : -1;
      this.trayColor.push(c);
      this.trayCount.push(0);
      this.trayGen.push(0);
      this.hist.push([c]);
    }
    this.visGen = this.trayGen.slice();
    this.visPhase = this.trayGen.map(() => 0);
    this.visT = this.trayGen.map(() => 1);
    this.niceT = this.trayGen.map(() => 0);
    this.trayPop = this.trayGen.map(() => [0, 0, 0]);
    this.cap = this.lvl.holder;
    this.holder = [];
    for (let i = 0; i < this.cap; i++) this.holder.push(-1);
    this.undoStack = [];
    this.combo = 0;
    this.bestCombo = 0;
    this.boostersUsed = 0;
    this.endTimer = -1;
    this.stuckTimer = -1;
    this.movesMade = 0;
    this.tutorialId = -1;
    this.elapsed = 0;
    this.timeLeft = timeLimit(level);
    this.loseReason = 'stuck';
    this.introT = INTRO;
    this.floaters = [];
    this.confetti = 0;
    this.hintId = -1;
    this.hintT = 0;
    this.bubble = '';
    this.bubbleT = 0;
    this.plucks = [];
    for (const f of this.flyers) f.active = false;
    for (const p of this.particles) p.active = false;
    this.lockT = -1;
    this.lockShake = 0;
    this.coinFly = [];
    this.coinShown = this.save.coins;
    this.boardCache = null;
    this.layout();
    this.computeView();
  }

  startLevel(level: number): void {
    level = Math.max(1, Math.min(LEVEL_COUNT, level));
    this.prepare(level);
    this.phase = 'playing';
    this.modal = 'none';
    this.bannerT = this.lvl.spec.diff === 'normal' ? 0 : 2.4;
    if (level === 1) this.showBubble('Tap a band that is on top — it flies to its tray!', 4);
    else if (this.lvl.lock && level === 5) this.showBubble('New! Collect the band with the key to open the padlock.', 4);
    emit('levelStart', { level, bands: this.bands.length, difficulty: this.lvl.spec.diff, holder: this.cap });
    levelChanged(level);
  }

  private win(): void {
    this.phase = 'won';
    this.popT = 0;
    this.layoutModal();
    this.doubled = false;
    this.stars = this.boostersUsed === 0 ? 3 : this.boostersUsed <= 2 ? 2 : 1;
    const diffBonus = this.lvl.spec.diff === 'superhard' ? 40 : this.lvl.spec.diff === 'hard' ? 20 : 0;
    this.reward = 20 + this.level * 2 + this.bestCombo * 3 + diffBonus;
    this.coinShown = this.save.coins;
    this.save.coins += this.reward;
    this.save.maxLevel = Math.max(this.save.maxLevel, Math.min(LEVEL_COUNT, this.level + 1));
    this.persist();
    sfx.win();
    this.burst(this.width / 2, this.height * 0.35, 40, '#ffd84a');
    const [rx, ry] = this.popPt(POP_WIN.coinText[0] - 170, POP_WIN.coinText[1]);
    this.flyCoins(rx, ry, this.reward, 0.9);
    this.confetti = 1.6;
    emit('win', { level: this.level, stars: this.stars, coins: this.reward, bestCombo: this.bestCombo });
  }

  private lose(reason: 'stuck' | 'time' = 'stuck'): void {
    this.loseReason = reason;
    this.phase = 'lost';
    this.modal = 'none';
    this.popT = 0;
    this.layoutModal();
    sfx.lose();
    emit('lose', { level: this.level, reason, bandsLeft: this.bands.length - this.removedCount });
  }

  // ---- update ----------------------------------------------------------------

  update(dt: number, events: PointerEvt[]): void {
    this.time += dt;
    this.popT += dt;
    for (const e of events) this.pointer(e);
    this.animate(dt);
    if (this.phase !== 'playing' || this.modal !== 'none') return;
    this.elapsed += dt;
    // countdown (paused by popups); the last 10 s tick
    if (this.introT <= 0 && this.removedCount < this.bands.length) {
      const before = Math.ceil(this.timeLeft);
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      if (this.timeLeft <= 10 && Math.ceil(this.timeLeft) < before && this.timeLeft > 0) sfx.tick();
      if (this.timeLeft <= 0) {
        this.modal = 'timeUp';
        this.popT = 0;
        this.layoutModal();
        sfx.timeUp();
        emit('timeUp', { level: this.level, bandsLeft: this.bands.length - this.removedCount });
        return;
      }
    }

    // End-of-level checks wait for the animations to settle.
    const busy = this.busy();
    if (this.removedCount === this.bands.length && this.holderUsed() === 0) {
      if (!busy) {
        if (this.endTimer < 0) this.endTimer = 0.35;
        this.endTimer -= dt;
        if (this.endTimer <= 0) this.win();
      }
    } else if (this.stuckTimer >= 0 && !busy) {
      this.stuckTimer -= dt;
      if (this.stuckTimer <= 0) {
        this.stuckTimer = -1;
        if (this.holderUsed() >= this.cap || this.isStuck()) {
          this.modal = 'outOfSpace';
          this.popT = 0;
          this.layoutModal();
          sfx.lose();
          emit('outOfSpace', { level: this.level, holder: this.cap });
        }
      }
    }
  }

  private busy(): boolean {
    for (const f of this.flyers) if (f.active) return true;
    for (let i = 0; i < this.visGen.length; i++) if (this.visGen[i] !== this.trayGen[i] || this.visPhase[i] !== 0) return true;
    return this.plucks.length > 0;
  }

  private animate(dt: number): void {
    for (let i = 0; i < this.shakeT.length; i++) if (this.shakeT[i] > 0) this.shakeT[i] = Math.max(0, this.shakeT[i] - dt);
    if (this.hintT > 0) this.hintT -= dt;
    if (this.bubbleT > 0) this.bubbleT -= dt;
    if (this.bannerT > 0) this.bannerT -= dt;
    if (this.lockShake > 0) this.lockShake = Math.max(0, this.lockShake - dt);
    if (this.clearArmed > 0) this.clearArmed = Math.max(0, this.clearArmed - dt);
    if (this.coinPulse > 0) this.coinPulse = Math.max(0, this.coinPulse - dt);
    for (let i = this.coinFly.length - 1; i >= 0; i--) {
      const f = this.coinFly[i];
      f.t += dt;
      if (f.t >= 0.77) {
        this.coinShown = Math.min(this.save.coins, this.coinShown + f.value);
        this.coinPulse = 0.18;
        sfx.coin();
        const [tx, ty] = this.coinTarget();
        this.sparkle(tx, ty, '#ffd84a', 3);
        this.coinFly.splice(i, 1);
      }
    }
    if (this.coinFly.length === 0) this.coinShown = this.save.coins;
    if (this.introT > 0) this.introT = Math.max(0, this.introT - dt);
    for (let i = 0; i < this.trayBump.length; i++) this.trayBump[i] = Math.max(0, this.trayBump[i] - dt);
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      this.floaters[i].t += dt;
      if (this.floaters[i].t > 0.9) this.floaters.splice(i, 1);
    }
    if (this.confetti > 0) {
      this.confetti -= dt;
      for (let k = 0; k < 3; k++) this.spawnConfetti();
    }
    const lk = this.lvl?.lock;
    if (lk) {
      if (!this.removed[lk.key]) this.lockT = -1;
      else if (this.lockT >= 0 && this.lockT < 2) this.lockT += dt;
    }
    for (let i = 0; i < 5; i++) {
      // pressed buttons scale to ~0.95 and spring back with a small overshoot
      const target = this.pressKey === 'b' + i ? 0.95 : 1;
      this.btnV[i] += (target - this.btnS[i]) * 520 * dt;
      this.btnV[i] *= Math.exp(-20 * dt);
      this.btnS[i] += this.btnV[i] * dt;
    }
    for (let i = this.plucks.length - 1; i >= 0; i--) {
      this.plucks[i].t += dt;
      const pk = this.plucks[i];
      if (pk.t > (pk.rev ? UNPLUCK : PLUCK)) {
        if (pk.rev) {
          // back on its pegs: a little elastic settle
          this.hidden[pk.id] = 0;
          this.shakeT[pk.id] = 0.3;
        }
        this.plucks.splice(i, 1);
      }
    }
    // flyers (a flyer bound for a tray waits until that tray is the visible one)
    for (const f of this.flyers) {
      if (!f.active) continue;
      if (f.slot >= 0 && (this.visGen[f.slot] !== f.gen || this.visPhase[f.slot] === 1) && f.t <= 0) continue;
      f.t += dt;
      if (f.t >= f.dur) {
        f.active = false;
        this.sparkle(f.x1, f.y1, COLORS[f.color].base, 6);
        // the ring settles into its well with a small elastic bounce
        if (f.toBand >= 0) this.plucks.push({ id: f.toBand, t: 0, r: f.r1, rev: true });
        else if (f.slot >= 0 && f.well >= 0) {
          this.trayPop[f.slot][f.well] = POP;
          this.trayBump[f.slot] = 0.22;
        }
        else if (f.hs >= 0) this.holderPop[f.hs] = POP;
      }
    }
    // trays
    for (let i = 0; i < this.visGen.length; i++) {
      this.niceT[i] = Math.max(0, this.niceT[i] - dt);
      if (this.visPhase[i] === 0 && this.visGen[i] < this.trayGen[i] && this.inflight(i, this.visGen[i]) === 0) {
        this.visPhase[i] = 1;
        this.visT[i] = 0;
        this.niceT[i] = 0.9;
        sfx.tray();
        this.burst(this.trayX[i], this.trayY, 18, COLORS[this.hist[i][this.visGen[i]]].base);
      } else if (this.visPhase[i] === 1) {
        this.visT[i] += dt;
        if (this.visT[i] >= 0.42) {
          this.visGen[i]++;
          this.visPhase[i] = 2;
          this.visT[i] = 0;
        }
      } else if (this.visPhase[i] === 2) {
        this.visT[i] += dt;
        if (this.visT[i] >= 0.3) this.visPhase[i] = 0;
      }
    }
    for (const pops of this.trayPop) for (let i = 0; i < 3; i++) pops[i] = Math.max(0, pops[i] - dt);
    for (let i = 0; i < this.holderPop.length; i++) this.holderPop[i] = Math.max(0, this.holderPop[i] - dt);
    for (let i = 0; i < this.holderOff.length; i++) this.holderOff[i] *= Math.exp(-12 * dt);
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.max) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.conf ? 120 : 600) * dt;
      if (p.conf) {
        p.rot += p.vr * dt;
        p.vx += Math.sin(this.time * 3 + p.y * 0.05) * 40 * dt;
      }
    }
  }

  private inflight(slot: number, gen: number): number {
    let n = 0;
    for (const f of this.flyers) if (f.active && f.slot === slot && f.gen === gen) n++;
    return n;
  }

  private holderUsed(): number {
    let n = 0;
    for (const h of this.holder) if (h >= 0) n++;
    return n;
  }

  // ---- input ----------------------------------------------------------------

  private pointer(e: PointerEvt): void {
    if (e.kind === 'down') {
      unlockAudio();
      this.downX = e.x;
      this.downY = e.y;
      this.moved = false;
      this.pressKey = this.buttonAt(e.x, e.y);
      return;
    }
    if (e.kind === 'move') {
      if (Math.abs(e.x - this.downX) + Math.abs(e.y - this.downY) > 24) this.moved = true;
      return;
    }
    this.pressKey = '';
    if (this.moved) return;
    this.tap(this.downX, this.downY);
  }

  private buttonAt(x: number, y: number): string {
    if (this.phase === 'title') {
      if (inRect(x, y, this.playBtn)) return 'play';
      return '';
    }
    if (this.modal !== 'none' || this.phase !== 'playing') {
      if (inRect(x, y, this.mA)) return 'mA';
      if (inRect(x, y, this.mB)) return 'mB';
      if (inRect(x, y, this.mC)) return 'mC';
      if (inRect(x, y, this.mD)) return 'mD';
      if (inRect(x, y, this.mE)) return 'mE';
      if (inRect(x, y, this.cDn)) return 'cDn';
      if (inRect(x, y, this.cUp)) return 'cUp';
      if (inRect(x, y, this.cGo)) return 'cGo';
      return '';
    }
    for (let i = 0; i < 5; i++) if (inCircle(x, y, this.btnX[i], this.btnY, this.btnR * 1.15)) return 'b' + i;
    return '';
  }

  private tap(x: number, y: number): void {
    if (this.phase === 'title') {
      if (inRect(x, y, this.playBtn)) {
        sfx.click();
        this.startLevel(Math.min(LEVEL_COUNT, this.save.maxLevel));
      }
      return;
    }
    if (this.phase === 'won') {
      if (this.popT < 0.4) return;
      if (inRect(x, y, this.mA)) {
        sfx.click();
        if (this.level >= LEVEL_COUNT) {
          this.phase = 'title';
          this.showBubble('', 0);
        } else this.startLevel(this.level + 1);
      } else if (inRect(x, y, this.mB) && !this.doubled) {
        // Stand-in for a rewarded ad: doubles the level reward.
        this.doubled = true;
        this.coinShown = Math.min(this.coinShown, this.save.coins);
        this.save.coins += this.reward;
        const [rx, ry] = this.popPt(POP_WIN.coinText[0] - 170, POP_WIN.coinText[1]);
        this.flyCoins(rx, ry, this.reward, 0.1);
        this.persist();
        sfx.booster();
        emit('rewardedAd', { placement: 'double_coins', coins: this.reward });
        this.burst(this.mB.x + this.mB.w / 2, this.mB.y, 20, '#ffd84a');
      }
      return;
    }
    if (this.phase === 'lost') {
      if (this.popT < 0.3) return;
      if (inRect(x, y, this.mA)) {
        sfx.click();
        this.startLevel(this.level);
      } else if (inRect(x, y, this.mB) || inCircle(x, y, this.mCloseX, this.mCloseY, this.mCloseR)) {
        sfx.click();
        this.phase = 'title';
      }
      return;
    }
    if (this.modal === 'timeUp') {
      if (inCircle(x, y, this.mCloseX, this.mCloseY, this.mCloseR)) {
        sfx.click();
        this.lose('time');
      } else if (inRect(x, y, this.mA) && this.spend(PRICES.time)) {
        this.timeLeft += 30;
        this.modal = 'none';
        sfx.booster();
        emit('extraTime', { level: this.level, seconds: 30 });
      }
      return;
    }
    if (this.modal === 'outOfSpace') {
      if (inCircle(x, y, this.mCloseX, this.mCloseY, this.mCloseR)) {
        sfx.click();
        this.lose();
      } else if (inRect(x, y, this.mA)) {
        if (this.spend(PRICES.slot)) {
          this.addSlot();
          this.modal = 'none';
        }
      } else if (inRect(x, y, this.mB)) {
        if (this.undoStack.length > 0 && this.spend(PRICES.undo)) {
          this.undo();
          this.modal = 'none';
        }
      }
      return;
    }
    if (this.modal === 'menu') {
      if (inCircle(x, y, this.mCloseX, this.mCloseY, this.mCloseR) || inRect(x, y, this.mA)) {
        sfx.click();
        this.modal = 'none';
      } else if (inRect(x, y, this.mB)) {
        sfx.click();
        this.startLevel(this.level);
      } else if (inRect(x, y, this.mC)) {
        setSound(!soundOn());
        sfx.click();
      } else if (inRect(x, y, this.mD)) {
        sfx.click();
        if (this.clearArmed > 0) {
          // second tap: wipe progress, coins and boosters back to a fresh install
          try {
            localStorage.removeItem(SAVE_KEY);
          } catch {
            // storage blocked: the in-memory reset below still applies
          }
          this.save = loadSave();
          this.persist();
          this.clearArmed = 0;
          emit('clearData', {});
          this.modal = 'none';
          this.phase = 'title';
        } else this.clearArmed = 2.5;
      } else if (inRect(x, y, this.mE)) {
        sfx.click();
        this.modal = 'none';
        this.phase = 'title';
      } else if (inRect(x, y, this.cDn)) {
        sfx.click();
        this.cheatLv = this.cheatLv <= 1 ? LEVEL_COUNT : this.cheatLv - 1;
      } else if (inRect(x, y, this.cUp)) {
        sfx.click();
        this.cheatLv = this.cheatLv >= LEVEL_COUNT ? 1 : this.cheatLv + 1;
      } else if (inRect(x, y, this.cGo)) {
        // cheat: unlock up to the picked level and play it right away
        sfx.click();
        this.save.maxLevel = Math.max(this.save.maxLevel, this.cheatLv);
        this.persist();
        emit('cheatLevel', { from: this.level, to: this.cheatLv });
        this.startLevel(this.cheatLv);
      }
      return;
    }

    // ---- playing ----
    for (let i = 0; i < 5; i++) {
      if (inCircle(x, y, this.btnX[i], this.btnY, this.btnR * 1.2)) {
        this.booster(i);
        return;
      }
    }
    // locked holder slot = Slot booster
    const n = this.holderSlotsShown();
    if (this.cap < MAX_HOLDER && inCircle(x, y, this.holderXAt(n - 1), this.holderY, this.holderR * 1.4)) {
      this.booster(2);
      return;
    }
    if (this.introT > INTRO * 0.4) return;
    if (this.hidden.indexOf(1) >= 0) return; // an undo is still flying back
    const lk = this.lvl.lock;
    if (lk && !this.removed[lk.band]) {
      const la = this.anchor(lk.band, -0.6, 1), sz = this.lockSize();
      if (Math.abs(x - la.x) < sz * 0.7 && y > la.y && y < la.y + sz * 1.4) {
        this.takeBand(lk.band);
        return;
      }
    }
    const id = this.bandAt(x, y);
    if (id >= 0) this.takeBand(id);
  }

  /** Topmost band under a screen point (stroke first, then interior). */
  private bandAt(sx: number, sy: number): number {
    const wx = (sx - this.ox) / this.unit;
    const wy = (sy - (this.oy - this.lift * this.unit)) / this.unit;
    const tol = Math.max(0.3, (16 * this.s) / this.unit);
    let blocked = -1;
    for (let i = this.bands.length - 1; i >= 0; i--) {
      if (this.removed[i]) continue;
      const b = this.bands[i];
      if (wx < b.minX - tol || wx > b.maxX + tol || wy < b.minY - tol || wy > b.maxY + tol) continue;
      const o = b.outline;
      const n = o.length / 2;
      let d = Infinity;
      for (let k = 0; k < n; k++) {
        const k2 = ((k + 1) % n) * 2;
        d = Math.min(d, segDist(wx, wy, o[k * 2], o[k * 2 + 1], o[k2], o[k2 + 1]));
      }
      if (d <= tol) {
        if (isFree(this.bands, this.removed, i)) return i;
        if (blocked < 0) blocked = i;
      }
    }
    if (blocked >= 0) return blocked;
    // inside a band (smallest first wins because upper bands come first)
    for (let i = this.bands.length - 1; i >= 0; i--) {
      if (this.removed[i]) continue;
      const b = this.bands[i];
      if (b.hull.length >= 6 && pointInPoly(wx, wy, b.hull) && isFree(this.bands, this.removed, i)) return i;
    }
    return -1;
  }

  private findTray(color: number): number {
    for (let t = 0; t < this.trayColor.length; t++) if (this.trayColor[t] === color && this.trayCount[t] < 3) return t;
    return -1;
  }

  private takeBand(id: number): void {
    if (!isFree(this.bands, this.removed, id)) {
      this.shakeT[id] = 0.35;
      sfx.blocked();
      const lk = this.lvl.lock;
      if (lk && id === lk.band && !this.removed[lk.key]) {
        this.lockShake = 0.4;
        this.showBubble('Locked! Collect the band with the key first.', 2.2);
      }
      return;
    }
    const b = this.bands[id];
    const c = b.color;
    const t = this.findTray(c);
    const hs = this.holder.indexOf(-1);
    if (t < 0 && hs < 0) {
      this.shakeT[id] = 0.35;
      sfx.blocked();
      this.showBubble('Holder is full — no tray for this colour!', 2);
      return;
    }
    this.pushUndo();
    const lk = this.lvl.lock;
    if (lk && id === lk.key && !this.removed[lk.band]) {
      this.keyFrom = this.anchor(id, 1, 0.2);
      this.lockT = 0;
    }
    this.removed[id] = 1;
    this.removedCount++;
    this.movesMade++;
    this.plucks.push({ id, t: 0, r: t >= 0 ? this.trayRingR() : this.holderR * 0.98 });
    sfx.boing();
    for (const below of b.below) if (!this.removed[below] && isFree(this.bands, this.removed, below)) this.shakeT[below] = 0.25;
    this.hintT = 0;
    this.hintId = -1;
    if (this.level === 1 && this.movesMade === 1) this.bubbleT = Math.min(this.bubbleT, 0.3);
    const fx = this.ox + b.cx * this.unit;
    const fy = this.oy - this.lift * this.unit + b.cy * this.unit;
    if (t >= 0) {
      const idx = this.trayCount[t]++;
      this.launch(c, fx, fy - 12 * this.s, this.traySlotX(t, idx), this.trayRingY(), t, this.trayGen[t], -1, PLUCK * 0.86, idx, true);
      this.combo++;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      if (this.combo >= 2) {
        this.floaters.push({ text: `Combo x${this.combo}`, x: this.trayX[t], y: this.trayY - this.TH * 0.75, t: -PLUCK, color: COLORS[c].light });
      }
      sfx.pluck();
      if (this.trayCount[t] >= 3) this.completeTray(t);
    } else {
      this.holder[hs] = c;
      this.launch(c, fx, fy - 12 * this.s, this.holderXAt(hs), this.holderY, -1, 0, hs, PLUCK * 0.86, -1, true);
      this.combo = 0;
      sfx.park();
      if (!this.parkTipShown && this.level <= 3) {
        this.parkTipShown = true;
        this.showBubble('No tray for this colour — it waits in the holder. Fill the holder and you lose!', 3);
      }
    }
    this.settle();
    if (this.holderUsed() >= this.cap || this.isStuck()) this.stuckTimer = 0.25;
  }

  private completeTray(t: number): void {
    const next = this.qi < this.lvl.queue.length ? this.lvl.queue[this.qi++] : -1;
    this.trayGen[t]++;
    this.trayColor[t] = next;
    this.trayCount[t] = 0;
    this.hist[t][this.trayGen[t]] = next;
    emit('trayComplete', { level: this.level, combo: this.combo });
  }

  /** Holder bands jump into any tray of their colour that has room. */
  private settle(): void {
    let changed = true;
    while (changed) {
      changed = false;
      for (let s = 0; s < this.holder.length; s++) {
        const c = this.holder[s];
        if (c < 0) continue;
        const t = this.findTray(c);
        if (t < 0) continue;
        const idx = this.trayCount[t]++;
        this.holder[s] = -1;
        this.launch(c, this.holderXAt(s), this.holderY, this.traySlotX(t, idx), this.trayRingY(), t, this.trayGen[t], -1, 0.12 + idx * 0.08, idx);
        if (this.trayCount[t] >= 3) this.completeTray(t);
        changed = true;
      }
    }
    this.packHolder();
  }

  /** No gaps in the holder: rings behind an empty slot slide forward into it. */
  private packHolder(): void {
    let j = 0;
    for (let i = 0; i < this.holder.length; i++) {
      const c = this.holder[i];
      if (c < 0) continue;
      if (i !== j) {
        this.holder[j] = c;
        this.holder[i] = -1;
        this.holderOff[j] = this.holderXAt(i) - this.holderXAt(j) + this.holderOff[i];
        this.holderOff[i] = 0;
        // a ring still flying into slot i now lands in slot j
        for (const f of this.flyers) {
          if (f.active && f.slot < 0 && f.hs === i) {
            f.hs = j;
            f.x1 = this.holderXAt(j);
            this.holderOff[j] = 0;
          }
        }
      }
      j++;
    }
  }

  private isStuck(): boolean {
    if (this.removedCount === this.bands.length) return false;
    if (this.holder.indexOf(-1) >= 0) return false;
    for (let i = 0; i < this.bands.length; i++) {
      if (isFree(this.bands, this.removed, i) && this.findTray(this.bands[i].color) >= 0) return false;
    }
    return true;
  }

  private launch(color: number, x0: number, y0: number, x1: number, y1: number, slot: number, gen: number, hs: number, delay: number, well = -1, fromBoard = false): Flyer {
    const f = this.flyers.find((ff) => !ff.active) ?? this.flyers[0];
    f.active = true;
    f.color = color;
    f.x0 = x0;
    f.y0 = y0;
    f.x1 = x1;
    f.y1 = y1;
    f.r0 = fromBoard ? (slot >= 0 ? this.trayRingR() : this.holderR * 0.98) : this.holderR * 0.98;
    f.r1 = slot >= 0 ? this.trayRingR() : this.holderR * 0.98;
    f.well = well;
    f.fromBoard = fromBoard;
    f.toBand = -1;
    f.t = -delay;
    f.dur = 0.4;
    f.slot = slot;
    f.gen = gen;
    f.hs = hs;
    f.arc = (Math.min(70, Math.abs(y1 - y0) * 0.16) + 22) * this.s;
    return f;
  }

  // ---- boosters ----------------------------------------------------------------

  private spend(price: number): boolean {
    if (this.save.coins < price) {
      this.showBubble('Not enough coins!', 1.6);
      sfx.blocked();
      return false;
    }
    this.save.coins -= price;
    this.persist();
    return true;
  }

  /** Uses one booster charge, or buys one with coins when none are left. */
  private charge(key: 'undo' | 'hint' | 'slot'): boolean {
    if (this.save[key] > 0) {
      this.save[key]--;
      this.persist();
      return true;
    }
    if (this.spend(PRICES[key])) {
      this.showBubble(`-${PRICES[key]} coins`, 1.2);
      return true;
    }
    return false;
  }

  private booster(i: number): void {
    if (this.busyForBooster() && i <= 2) return;
    switch (i) {
      case 0:
        if (this.undoStack.length === 0) {
          this.showBubble('Nothing to undo yet.', 1.4);
          sfx.blocked();
          return;
        }
        if (!this.charge('undo')) return;
        this.undo();
        break;
      case 1: {
        const m = chooseMove(this.bands, this.lvl.queue, this.playState(), this.cap - 1);
        if (!m) {
          this.showBubble('No safe move — try Undo or +Slot.', 2);
          sfx.blocked();
          return;
        }
        if (!this.charge('hint')) return;
        this.hintId = m.id;
        this.hintT = 5;
        const frees = freesCount(this.bands, this.removed, m.id);
        this.showBubble(
          m.direct
            ? 'Tap this one — its tray is waiting!'
            : `Park this one in the holder — it frees ${frees} band${frees === 1 ? '' : 's'} underneath.`,
          4,
        );
        break;
      }
      case 2:
        if (this.cap >= MAX_HOLDER) {
          this.showBubble('The holder is as big as it gets!', 1.6);
          sfx.blocked();
          return;
        }
        if (!this.charge('slot')) return;
        this.addSlot();
        break;
      case 3:
        sfx.click();
        emit('retry', { level: this.level });
        this.startLevel(this.level);
        return;
      case 4:
        sfx.click();
        this.modal = 'menu';
        this.popT = 0;
        this.clearArmed = 0;
        this.cheatLv = this.level;
        this.layoutModal();
        return;
    }
    this.boostersUsed++;
    sfx.booster();
    emit('booster', { type: ['undo', 'hint', 'slot'][i], level: this.level });
  }

  private busyForBooster(): boolean {
    for (const f of this.flyers) if (f.active) return true;
    return this.plucks.length > 0;
  }

  private addSlot(): void {
    this.cap++;
    this.holder.push(-1);
    this.layout();
    this.stuckTimer = -1;
    this.burst(this.holderXAt(this.cap - 1), this.holderY, 16, '#5fe05a');
    sfx.booster();
  }

  private playState(): PlayState {
    return {
      removed: this.removed,
      trays: this.trayColor.map((c, i) => ({ color: c, count: this.trayCount[i] })),
      qi: this.qi,
      holder: this.holder.filter((h) => h >= 0),
    };
  }

  private pushUndo(): void {
    this.undoStack.push({
      removed: this.removed.slice(),
      trayColor: this.trayColor.slice(),
      trayCount: this.trayCount.slice(),
      trayGen: this.trayGen.slice(),
      qi: this.qi,
      holder: this.holder.slice(),
      combo: this.combo,
    });
    if (this.undoStack.length > 60) this.undoStack.shift();
  }

  private undo(): void {
    const s = this.undoStack.pop();
    if (!s) return;
    // where the last move's rings are on screen *now*, before the state is restored
    const curHolder = this.holder.slice();
    const curGen = this.trayGen.slice();
    let moved = -1;
    for (let i = 0; i < this.removed.length; i++) if (this.removed[i] && !s.removed[i]) moved = i;
    let sx = 0, sy = 0, sr = this.trayRingR();
    if (moved >= 0) {
      const col = this.bands[moved].color;
      const hs = curHolder.findIndex((c, k) => c === col && (s.holder[k] ?? -1) === -1);
      if (hs >= 0) {
        sx = this.holderXAt(hs);
        sy = this.holderY;
        sr = this.holderR * 0.98;
      } else {
        const t = Math.max(0, s.trayColor.indexOf(col));
        sx = this.traySlotX(t, Math.min(2, s.trayCount[t]));
        sy = this.trayRingY();
      }
    }
    // restore the logic
    this.removed = s.removed;
    this.removedCount = 0;
    for (let i = 0; i < this.removed.length; i++) this.removedCount += this.removed[i];
    this.trayColor = s.trayColor;
    this.trayCount = s.trayCount;
    this.trayGen = s.trayGen;
    this.qi = s.qi;
    this.holder = s.holder;
    while (this.holder.length < this.cap) this.holder.push(-1);
    this.combo = s.combo;
    // only a tray that changed (a completion being undone) slides back in; the rest stay put
    for (let i = 0; i < this.visGen.length; i++) {
      if (curGen[i] !== this.trayGen[i] || this.visGen[i] !== this.trayGen[i]) {
        this.visPhase[i] = 2;
        this.visT[i] = 0;
      }
    }
    this.visGen = this.trayGen.slice();
    for (const f of this.flyers) f.active = false;
    this.plucks = [];
    // the band's ring flies back to the board and unrolls onto its pegs
    if (moved >= 0) {
      const b = this.bands[moved];
      this.hidden[moved] = 1;
      const tx = this.ox + b.cx * this.unit;
      const ty = this.oy - this.lift * this.unit + b.cy * this.unit - 12 * this.s;
      const f = this.launch(b.color, sx, sy, tx, ty, -1, 0, -1, 0);
      f.r0 = sr;
      f.r1 = this.trayRingR();
      f.toBand = moved;
      f.dur = 0.36;
    }
    // rings that had hopped from the holder into a tray hop back
    const need = new Map<number, number>();
    for (const c of this.holder) if (c >= 0) need.set(c, (need.get(c) ?? 0) + 1);
    for (const c of curHolder) if (c >= 0) need.set(c, (need.get(c) ?? 0) - 1);
    for (let k = this.holder.length - 1; k >= 0; k--) {
      const c = this.holder[k];
      if (c < 0 || (need.get(c) ?? 0) <= 0) continue;
      need.set(c, (need.get(c) ?? 0) - 1);
      const t = Math.max(0, this.trayColor.indexOf(c));
      this.launch(c, this.traySlotX(t, 1), this.trayRingY(), this.holderXAt(k), this.holderY, -1, 0, k, 0.05);
    }
    for (let i = 0; i < this.holderOff.length; i++) this.holderOff[i] = 0;
    this.stuckTimer = -1;
    this.endTimer = -1;
    this.hintId = -1;
  }

  private showBubble(text: string, secs: number): void {
    this.bubble = text;
    this.bubbleT = secs;
  }

  // ---- particles ----------------------------------------------------------------

  private spawnConfetti(): void {
    const p = this.particles.find((pp) => !pp.active);
    if (!p) return;
    const cols = ['#F34876', '#20CDA0', '#2689ED', '#ffc531', '#7549C8', '#ff8a3d'];
    p.active = true;
    p.conf = true;
    p.x = Math.random() * this.width;
    p.y = -10;
    p.vx = (Math.random() - 0.5) * 60 * this.s;
    p.vy = (120 + Math.random() * 140) * this.s;
    p.life = 0;
    p.max = 2.6 + Math.random();
    p.color = cols[Math.floor(Math.random() * cols.length)];
    p.size = (4 + Math.random() * 4) * this.s;
    p.rot = Math.random() * 6;
    p.vr = (Math.random() - 0.5) * 12;
  }

  private burst(x: number, y: number, n: number, color: string): void {
    for (let i = 0; i < n; i++) {
      const p = this.particles.find((pp) => !pp.active);
      if (!p) return;
      const a = Math.random() * Math.PI * 2;
      const v = (120 + Math.random() * 260) * this.s;
      p.active = true;
      p.conf = false;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * v;
      p.vy = Math.sin(a) * v - 200 * this.s;
      p.life = 0;
      p.max = 0.6 + Math.random() * 0.5;
      p.color = i % 3 === 0 ? '#ffffff' : color;
      p.size = (3 + Math.random() * 4) * this.s;
    }
  }

  private sparkle(x: number, y: number, color: string, n: number): void {
    for (let i = 0; i < n; i++) {
      const p = this.particles.find((pp) => !pp.active);
      if (!p) return;
      const a = Math.random() * Math.PI * 2;
      const v = (40 + Math.random() * 90) * this.s;
      p.active = true;
      p.conf = false;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * v;
      p.vy = Math.sin(a) * v - 60 * this.s;
      p.life = 0;
      p.max = 0.35 + Math.random() * 0.2;
      p.color = color;
      p.size = (2 + Math.random() * 2) * this.s;
    }
  }

  // ---- layout ----------------------------------------------------------------

  private layout(): void {
    const w = this.width, h = this.height;
    if (!w || !h) return;
    // Percentage anchors of the usable (safe-area) height, as in the layout spec.
    const top = this.sat, H = h - this.sat - this.sab;
    const Y = (f: number) => top + H * f;
    this.s = Math.min(w / 375, H / 760);
    // 90% wide at y 7%; height follows the HUD art's aspect (about 9% of the screen)
    this.hudRect = { x: w * 0.05, y: Y(0.07), w: w * 0.9, h: Math.min(H * 0.105, (w * 0.9) / HUD_ASPECT) };
    // trays: 68% wide band at y 23%, 7% tall
    this.TH = Math.max(36, H * 0.07);
    const T = this.lvl ? this.lvl.spec.trays : 2;
    this.TW = Math.min(w * 0.4, this.TH * 2.55);
    this.TH = this.TW / 2.55;
    this.trayY = Y(0.23) + this.TH / 2;
    if (T === 1) this.trayX = [w / 2];
    else this.trayX = [w / 2 - this.TW / 2 - w * 0.015, w / 2 + this.TW / 2 + w * 0.015];
    // holder slots: 42% wide at y 31%, 4% tall
    this.holderR = Math.min(H * 0.024, w * 0.052);
    this.holderGap = Math.min(w * 0.12, this.holderR * 2.55);
    this.holderY = Y(0.325) + H * 0.02;
    // boosters: 90% wide at y 86%, 9% tall
    this.btnR = Math.min(H * 0.045, w * 0.085);
    this.btnY = Y(0.86) + H * 0.045;
    for (let i = 0; i < 5; i++) this.btnX[i] = w * 0.05 + w * 0.9 * ((i + 0.5) / 5);
    // board: full width, y 37%–75%
    // board: full width, y 38.5%–81.5% (a little larger and lower than the 37–75% spec)
    this.area = { x: 0, y: Y(0.385), w, h: H * 0.43 };
    // Home screen: the reference art (624 × 1280) is scaled to cover the screen; the coin
    // pill stays pinned to the top-left corner inside the safe area.
    const hs = (this.homeS = Math.max(w / HOME_W, h / HOME_H));
    this.homeX = (w - HOME_W * hs) / 2;
    this.homeY = (h - HOME_H * hs) / 2;
    const pl = HOME.play;
    this.playBtn = { x: this.homeX + pl.x * hs, y: this.homeY + pl.y * hs, w: pl.w * hs, h: pl.h * hs * 0.9 };
    this.layoutModal();
  }

  private layoutModal(): void {
    const w = this.width, h = this.height, s = this.s;
    const pw = Math.min(320 * s, w - 32);
    let ph = 340 * s;
    if (this.modal === 'menu') ph = 360 * s;
    if (this.modal === 'timeUp') ph = 300 * s;
    if (this.phase === 'won') ph = 360 * s;
    if (this.phase === 'lost') ph = 300 * s;
    const px = (w - pw) / 2, py = Math.max(this.sat + 40 * s, (h - ph) / 2 - 20 * s);
    this.mPanel = { x: px, y: py, w: pw, h: ph };
    this.mCloseX = px + pw - 8 * s;
    this.mCloseY = py + 8 * s;
    const bw = pw * 0.72, bx = px + (pw - bw) / 2;
    const zero = { x: -1e4, y: -1e4, w: 0, h: 0 };
    this.mA = { ...zero };
    this.mB = { ...zero };
    this.mC = { ...zero };
    this.mD = { ...zero };
    if (this.phase === 'won') {
      this.mA = { x: bx, y: py + ph - 128 * s, w: bw, h: 56 * s };
      this.mB = { x: px + (pw - bw * 0.8) / 2, y: py + ph - 58 * s, w: bw * 0.8, h: 40 * s };
    } else if (this.phase === 'lost') {
      this.mA = { x: bx, y: py + ph - 132 * s, w: bw, h: 56 * s };
      this.mB = { x: px + (pw - bw * 0.7) / 2, y: py + ph - 62 * s, w: bw * 0.7, h: 42 * s };
    } else if (this.modal === 'timeUp') {
      this.mA = { x: bx, y: py + 214 * s, w: bw, h: 58 * s };
    } else if (this.modal === 'outOfSpace') {
      this.mA = { x: bx, y: py + 206 * s, w: bw, h: 58 * s };
      this.mB = { x: px + (pw - bw * 0.78) / 2, y: py + 278 * s, w: bw * 0.78, h: 46 * s };
    } else if (this.modal === 'menu') {
      const gap = 62 * s;
      this.mA = { x: bx, y: py + 70 * s, w: bw, h: 50 * s };
      this.mB = { x: bx, y: py + 70 * s + gap, w: bw, h: 50 * s };
      this.mC = { x: bx, y: py + 70 * s + gap * 2, w: bw, h: 50 * s };
      this.mD = { x: bx, y: py + 70 * s + gap * 3, w: bw, h: 50 * s };
    }
    this.mE = { ...zero };
    this.cDn = { ...zero };
    this.cUp = { ...zero };
    this.cGo = { ...zero };
    // room under the pause popup for the cheat row
    const cheatH = this.modal === 'menu' && this.phase === 'playing' ? 64 * s : 0;
    if (cheatH > 0) this.layoutCheat(px, py + ph + 14 * s, pw);
    this.mCloseR = 22 * s;
    // popups drawn from the art: place the art, then map its buttons
    const art = this.phase === 'won' ? POP_WIN : this.phase === 'lost' ? (this.loseReason === 'time' ? POP_OOT : POP_FAIL)
      : this.modal === 'outOfSpace' ? POP_FULL : this.modal === 'timeUp' ? POP_TIMEUP : this.modal === 'menu' ? POP_PAUSE : null;
    if (art) {
      let aw = Math.min(w - 20, 360 * s), ah = (aw * art.h) / art.w;
      if (ah > h * 0.8 - cheatH) {
        ah = h * 0.8 - cheatH;
        aw = (ah * art.w) / art.h;
      }
      const ax = (w - aw) / 2, ay = Math.max(this.sat + 30 * s, (h - ah - cheatH) / 2 - 10 * s);
      const k = (this.popK = aw / art.w);
      this.mPanel = { x: ax, y: ay, w: aw, h: ah };
      const R = (b: Box): Rect => ({ x: ax + b[0] * k, y: ay + b[1] * k, w: (b[2] - b[0]) * k, h: (b[3] - b[1]) * k });
      if ('close' in art && art.close) {
        this.mCloseX = ax + art.close[0] * k;
        this.mCloseY = ay + art.close[1] * k;
        this.mCloseR = art.close[2] * k * 1.15;
      } else this.mCloseX = this.mCloseY = -1e4;
      if (art === POP_WIN) {
        this.mA = R(POP_WIN.next);
        this.mB = R(POP_WIN.ad);
      } else if (art === POP_FAIL || art === POP_OOT) {
        this.mA = R(art.retry);
        this.mB = R(art.home);
      } else if (art === POP_TIMEUP) {
        this.mA = R(POP_TIMEUP.buy);
      } else if (art === POP_FULL) {
        this.mA = R(POP_FULL.slot);
        this.mB = R(POP_FULL.undo);
      } else {
        this.mA = R(POP_PAUSE.resume);
        this.mB = R(POP_PAUSE.restart);
        this.mC = R(POP_PAUSE.sound);
        this.mD = R(POP_PAUSE.clear);
        this.mE = R(POP_PAUSE.home);
        this.layoutCheat(ax, ay + ah + 4 * s, aw);
      }
    }
  }

  /** Cheat row: [-] Level n [+] [Play], centred under a popup of width `pw` at `px`. */
  private layoutCheat(px: number, y: number, pw: number): void {
    const s = this.s;
    const rw = pw * 0.84, x = px + (pw - rw) / 2, bh = 48 * s, gap = 8 * s;
    const goW = rw * 0.3;
    this.cDn = { x, y, w: bh, h: bh };
    this.cGo = { x: x + rw - goW, y, w: goW, h: bh };
    this.cUp = { x: this.cGo.x - gap - bh, y, w: bh, h: bh };
  }

  /** Screen position of a point given in the open popup's art pixels. */
  private popPt(x: number, y: number): [number, number] {
    return [this.mPanel.x + x * this.popK, this.mPanel.y + y * this.popK];
  }

  /** Pressed / disabled feedback on an art button. */
  private shadeButton(ctx: CanvasRenderingContext2D, r: Rect, key: string, disabled = false): void {
    if (!disabled && this.pressKey !== key) return;
    ctx.fillStyle = disabled ? 'rgba(40,40,70,0.45)' : 'rgba(20,0,60,0.18)';
    rr(ctx, r.x + r.h * 0.04, r.y + r.h * 0.06, r.w - r.h * 0.08, r.h * 0.84, r.h * 0.42);
    ctx.fill();
  }

  private holderSlotsShown(): number {
    return Math.min(MAX_HOLDER, this.cap + (this.cap < MAX_HOLDER ? 1 : 0));
  }

  private holderXAt(i: number): number {
    const n = this.holderSlotsShown();
    return this.width / 2 + (i - (n - 1) / 2) * this.holderGap;
  }

  /** Where a ring rests in a tray (screen y). */
  private trayRingY(): number {
    return trayGeom(0, this.trayY, this.TW, this.TH).midY + this.trayRingR() * 0.18;
  }

  /** Outer radius of a ring lying in a tray well. */
  private trayRingR(): number {
    return trayGeom(0, 0, this.TW, this.TH).ch * 0.6;
  }

  private traySlotX(t: number, idx: number): number {
    return this.trayX[t] + TRAY_WELLS[idx] * this.TW;
  }

  private boardBounds(): [number, number, number, number] {
    const p = this.lvl.poly;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < p.length; i += 2) {
      x0 = Math.min(x0, p[i]);
      x1 = Math.max(x1, p[i]);
      y0 = Math.min(y0, p[i + 1]);
      y1 = Math.max(y1, p[i + 1]);
    }
    const m = 0.62;
    return [x0 - m, y0 - m - 0.3, x1 + m, y1 + m + 0.4];
  }

  private computeView(): void {
    if (!this.lvl || !this.width) return;
    const [x0, y0, x1, y1] = this.boardBounds();
    const a = this.area;
    this.fitUnit = Math.min(a.w / (x1 - x0), a.h / (y1 - y0));
    this.unit = this.fitUnit;
    this.ox = a.x + a.w / 2 - ((x0 + x1) / 2) * this.unit;
    this.oy = a.y + a.h / 2 - ((y0 + y1) / 2) * this.unit;
  }

  // ---- board cache ----------------------------------------------------------------

  private buildCords(): void {
    // Render cords as smooth rounded loops around the (projected) pegs; gameplay
    // still uses the level's own outlines for hits and blocking.
    // A cord hugging a peg is a horizontal loop round the shaft; seen from the camera it
    // is an ellipse (flattened by PEG_E). Build the outline in "unflattened" space with
    // round wraps, then flatten it back, so every bend hugs its peg tightly.
    this.cords = this.bands.map((b) => {
      const hx: number[] = [], hy: number[] = [];
      for (let i = 0; i < b.hull.length; i += 2) {
        hx.push(b.hull[i]);
        hy.push(b.hull[i + 1] / PEG_E);
      }
      const o = outlineOf(hx, hy, WRAP_R * this.pegScale, Math.PI / 20);
      for (let i = 1; i < o.length; i += 2) o[i] *= PEG_E;
      return new Float32Array(o);
    });
    // evenly spaced copy of each outline for the "turn into a ring" morph
    this.cordsEven = this.cords.map((o) => resample(o, 72));
    // Arcs where a cord wraps a peg: drawn a touch thicker so the rubber looks pressed
    // against the peg while the straight spans read as taut.
    const wrap = WRAP_R * this.pegScale;
    this.contacts = this.cords.map((o, id) => {
      const hull = this.bands[id].hull;
      const p = new Path2D();
      let prev = -1;
      for (let k = 0; k < o.length; k += 2) {
        let v = -1;
        for (let h = 0; h < hull.length; h += 2) {
          if (Math.abs(Math.hypot(o[k] - hull[h], (o[k + 1] - hull[h + 1]) / PEG_E) - wrap) < 1e-3) v = h;
        }
        if (v >= 0 && v === prev) p.lineTo(o[k], o[k + 1]);
        else if (v >= 0) p.moveTo(o[k], o[k + 1]);
        prev = v;
      }
      return p;
    });
    this.paths = this.cords.map((o) => {
      const p = new Path2D();
      p.moveTo(o[0], o[1]);
      for (let i = 2; i < o.length; i += 2) p.lineTo(o[i], o[i + 1]);
      p.closePath();
      return p;
    });
  }

  private renderBoard(): void {
    const L = this.lvl;
    const k = this.unit * this.dpr;
    const [bx0, by0, bx1, by1] = this.boardBounds();
    const pad = 0.5;
    const x0 = bx0 - pad, y0 = by0 - pad, x1 = bx1 + pad, y1 = by1 + pad + 0.9;
    const [cv, c] = makeCanvas((x1 - x0) * k, (y1 - y0) * k);
    this.cacheX0 = x0;
    this.cacheY0 = y0;
    this.cacheUnit = this.unit;
    // On big boards pegs and cords keep a minimum on-screen size (reference proportions).
    const ps = Math.max(1, Math.min(1.6, (6.8 * this.s) / (PEG_R * this.unit)));
    if (Math.abs(ps - this.pegScale) > 0.01 || this.cords.length !== this.bands.length) {
      this.pegScale = ps;
      this.lift = LIFT * ps;
      this.buildCords();
    }
    this.pegs = makePegSprites(k, ps, PEG);
    this.pegArt = ready(PEG);
    // Materials sampled from the reference board art: a thick glossy orange frame
    // (bright top edge, saturated orange band, dark crease into the surface), a deep
    // burnt-orange front face with a dark lip, and a warm peach play surface with
    // light cream guide lines — the same on every level.
    const mat = {
      top: ['#feb74e', '#fc9a3c', '#f69540'],
      side: ['#f28830', '#be591e', '#a84c19'],
      lip: '#863309',
      crease: ['#8f3409', '#722504', '#dfa35e'],
      face: ['#f7cb8a', '#f8c47c', '#f6bf75'],
      shade: 'rgba(214,120,40,0.06)',
      grid: '#fddba8',
    };
    const rim = [mat.top[0], mat.top[1], mat.side[1], mat.lip];
    c.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
    c.lineJoin = 'round';
    const poly = new Path2D();
    const p = L.poly;
    poly.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) poly.lineTo(p[i], p[i + 1]);
    poly.closePath();
    // M: surface margin past the outer pegs (kept tight so pegs sit near the frame),
    // R: frame width, D: board thickness (reference: frame ≈ 1.1 peg radius, depth ≈ 2 × frame)
    const M = 0.18, R = 0.22, D = 0.4;
    const blobOn = (cx: CanvasRenderingContext2D, dx: number, dy: number, width: number, style: string | CanvasGradient) => {
      cx.save();
      cx.translate(dx, dy);
      cx.fillStyle = style;
      cx.strokeStyle = style;
      cx.lineWidth = width;
      cx.fill(poly);
      cx.stroke(poly);
      cx.restore();
    };
    const blob = (dx: number, dy: number, width: number, style: string | CanvasGradient) => blobOn(c, dx, dy, width, style);
    // one smooth contact shadow under the board: painted small and scaled up, which
    // blurs it on every browser (no ctx.filter needed)
    {
      const sk = k / 10;
      const [sm, sc] = makeCanvas((x1 - x0) * sk, (y1 - y0) * sk);
      sc.setTransform(sk, 0, 0, sk, -x0 * sk, -y0 * sk);
      sc.lineJoin = 'round';
      blobOn(sc, 0.05, D + 0.32, 2 * (M + R) + 0.5, 'rgba(70,40,150,0.28)');
      blobOn(sc, 0.05, D + 0.16, 2 * (M + R) + 0.12, 'rgba(50,25,120,0.42)');
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = 'high';
      c.drawImage(sm, 0, 0, cv.width, cv.height);
      c.restore();
    }
    // front face: the frame's orange runs a little way down the edge, then a sharp
    // turn into burnt orange that darkens towards a thin dark lip
    blob(0, D + 0.03, 2 * (M + R) - 0.04, mat.lip);
    const steps = 18;
    for (let i = steps; i >= 0; i--) {
      const f = i / steps; // 0 top of the side → 1 bottom
      let col: string;
      if (f < 0.1) col = mix(mat.top[2], mat.side[0], f / 0.1);
      else if (f < 0.2) col = mix(mat.side[0], mat.side[1], (f - 0.1) / 0.1);
      else col = mix(mat.side[1], mat.side[2], (f - 0.2) / 0.8);
      blob(0, D * f, 2 * (M + R), col);
    }
    // frame top: bright outer edge, then the glossy orange band
    const fgT = c.createLinearGradient(0, by0, 0, by1);
    fgT.addColorStop(0, mat.top[1]);
    fgT.addColorStop(1, mat.top[2]);
    blob(0, 0, 2 * (M + R), mat.top[0]);
    blob(0, 0.008, 2 * (M + R) - 0.06, fgT);
    // dark crease where the frame drops onto the surface, with a light bevel inside it
    blob(0, 0, 2 * M + 0.09, mat.crease[0]);
    blob(0, 0.008, 2 * M + 0.05, mat.crease[1]);
    blob(0, 0.008, 2 * M + 0.02, mat.crease[2]);
    // peach surface, painted on its own layer so the soft inner shading along the
    // frame (strokes kept to the surface with source-atop) never spills onto the frame
    {
      const [sv, s2] = makeCanvas(cv.width, cv.height);
      s2.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
      s2.lineJoin = 'round';
      const fg = s2.createLinearGradient(0, by0, 0, by1);
      fg.addColorStop(0, mat.face[0]);
      fg.addColorStop(0.55, mat.face[1]);
      fg.addColorStop(1, mat.face[2]);
      blobOn(s2, 0, 0.01, 2 * M, fg);
      s2.globalCompositeOperation = 'source-atop';
      s2.strokeStyle = mat.shade;
      for (let i = 1; i <= 6; i++) {
        s2.lineWidth = 2 * M + 0.06 * i;
        s2.stroke(poly);
      }
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.drawImage(sv, 0, 0);
      c.restore();
    }
    if (L.hole) {
      let hr = 0;
      for (let i = 0; i < L.hole.length; i += 2) hr = Math.max(hr, Math.abs(L.hole[i]));
      const r = Math.max(0.3, hr - M * 0.7);
      const ry = r * TILT;
      c.save();
      c.globalCompositeOperation = 'destination-out';
      c.beginPath();
      c.ellipse(0, 0, r, ry, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
      // the far inner wall of the hole
      c.save();
      c.beginPath();
      c.ellipse(0, 0, r, ry, 0, 0, Math.PI * 2);
      c.clip();
      c.fillStyle = rim[2];
      c.beginPath();
      c.ellipse(0, 0, r + 1, ry + 1, 0, 0, Math.PI * 2);
      c.ellipse(0, D, r, ry, 0, 0, Math.PI * 2, true);
      c.fill('evenodd');
      c.restore();
      c.strokeStyle = rim[0];
      c.lineWidth = R;
      c.beginPath();
      c.ellipse(0, 0, r, ry, 0, 0, Math.PI * 2);
      c.stroke();
    }
    // light cream guide lines on the peach surface, like the reference
    c.strokeStyle = mat.grid;
    c.lineWidth = 0.028;
    c.beginPath();
    for (let i = 0; i < L.grid.length; i += 4) {
      c.moveTo(L.grid[i], L.grid[i + 1]);
      c.lineTo(L.grid[i + 2], L.grid[i + 3]);
    }
    c.stroke();
    // pegs
    c.setTransform(1, 0, 0, 1, 0, 0);
    const sp = this.pegs;
    for (let i = 0; i < L.pegX.length; i++) {
      c.drawImage(sp.full, (L.pegX[i] - x0) * k - sp.ax, (L.pegY[i] - y0) * k - sp.ay);
    }
    this.boardCache = cv;
  }

  private backdrop(): HTMLCanvasElement {
    let b = this.backdrops[0];
    if (!b) {
      const [cv, c] = makeCanvas(this.width * this.dpr, this.height * this.dpr);
      c.scale(this.dpr, this.dpr);
      const bg = art('play_bg');
      if (bg) {
        // cover the screen with the Gemini backdrop (cropped evenly on the long side)
        const k = Math.max(this.width / bg.naturalWidth, this.height / bg.naturalHeight);
        const dw = bg.naturalWidth * k, dh = bg.naturalHeight * k;
        c.drawImage(bg, (this.width - dw) / 2, (this.height - dh) / 2, dw, dh);
      } else paintBackdrop(c, this.width, this.height, this.area.y + this.area.h * 0.5);
      b = this.backdrops[0] = cv;
    }
    return b;
  }

  // ---- draw ----------------------------------------------------------------

  draw(ctx: CanvasRenderingContext2D): void {
    const { width: w, height: h } = this;
    if (!w || !h) return;
    ctx.drawImage(this.backdrop(), 0, 0, w, h);
    if (this.phase === 'title') {
      this.drawTitle(ctx);
      return;
    }
    this.drawBoard(ctx);
    this.drawHud(ctx);
    this.drawBar(ctx);
    this.drawFlyers(ctx);
    this.drawParticles(ctx);
    this.drawBubble(ctx);
    for (const f of this.floaters) {
      if (f.t < 0) continue;
      const k = f.t / 0.9;
      ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      const sc = 0.6 + 0.4 * backOut(Math.min(1, k * 3));
      ctx.save();
      ctx.translate(f.x, f.y - k * 34 * this.s);
      ctx.scale(sc, sc);
      text3D(ctx, f.text, 0, 0, 20 * this.s, '#ffffff', f.color, '#1a3a9c', 0.08);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    if (this.bannerT > 0) this.drawBanner(ctx);
    if (this.level === 1 && this.movesMade === 0 && this.modal === 'none' && this.phase === 'playing') this.drawTutorialHand(ctx);
    if (this.modal === 'outOfSpace') this.drawOutOfSpace(ctx);
    else if (this.modal === 'timeUp') this.drawTimeUp(ctx);
    else if (this.modal === 'menu') this.drawMenu(ctx);
    if (this.phase === 'won') this.drawWon(ctx);
    else if (this.phase === 'lost') this.drawLost(ctx);
    if (this.modal !== 'none' || this.phase === 'won' || this.phase === 'lost') this.drawCoinBar(ctx);
    this.drawCoinFly(ctx);
  }

  private drawBoard(ctx: CanvasRenderingContext2D): void {
    if (!this.boardCache || this.pegArt !== ready(PEG) || Math.abs(this.unit / this.cacheUnit - 1) > 0.01) this.renderBoard();
    const cache = this.boardCache!;
    const sc = this.unit / this.cacheUnit;
    const ik = 1 - this.introT / INTRO; // 0 → 1 during the intro
    ctx.save();
    if (this.introT > 0) {
      ctx.globalAlpha = Math.min(1, ik * 2.5);
      ctx.translate(0, (1 - backOut(ik)) * -70 * this.s);
    }
    ctx.drawImage(cache, this.ox + this.cacheX0 * this.unit, this.oy + this.cacheY0 * this.unit, (cache.width / this.dpr) * sc, (cache.height / this.dpr) * sc);

    const sp = this.pegs!;
    const capW = (sp.cap.width / this.dpr) * sc, capH = (sp.cap.height / this.dpr) * sc;
    const ax = (sp.ax / this.dpr) * sc, ay = (sp.ay / this.dpr) * sc;
    const lift = this.oy - this.lift * this.unit;
    for (let i = 0; i < this.bands.length; i++) {
      if (this.removed[i] || this.hidden[i]) continue;
      const b = this.bands[i];
      const free = isFree(this.bands, this.removed, i);
      // a blocked band twangs: a small damped elastic wobble around its centre
      let wob = this.shakeT[i] > 0 ? Math.sin(this.shakeT[i] * 55) * 0.05 * (this.shakeT[i] / 0.35) : 0;
      if (this.introT > 0) wob += Math.sin(ik * 20 + i * 0.7) * 0.09 * (1 - ik);
      ctx.save();
      ctx.translate(this.ox + b.cx * this.unit, lift + b.cy * this.unit);
      ctx.scale(this.unit * (1 + wob), this.unit * (1 - wob * 0.6));
      ctx.translate(-b.cx, -b.cy);
      if (i === this.hintId && this.hintT > 0) {
        ctx.globalAlpha = 0.45 + 0.35 * Math.sin(this.time * 8);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = BAND_W * this.pegScale * 3.2;
        ctx.stroke(this.paths[i]);
        ctx.globalAlpha = 1;
      }
      this.strokeBand(ctx, i, free, 1);
      ctx.restore();
      for (const p of b.pegs) {
        ctx.drawImage(sp.cap, this.ox + this.lvl.pegX[p] * this.unit - ax, this.oy + this.lvl.pegY[p] * this.unit - ay, capW, capH);
      }
    }
    // bands being plucked: the loop rounds itself into a ring and contracts with a
    // springy overshoot, lifting off the pegs; then its ring flies to the tray
    for (const pk of this.plucks) {
      const b = this.bands[pk.id];
      // undo plays the same morph backwards: ring → loop back on the pegs
      const t = pk.rev ? 1 - ease(Math.min(1, pk.t / UNPLUCK)) : Math.min(1, pk.t / PLUCK);
      const o = this.cordsEven[pk.id];
      // centre and size of the loop
      let mr = 0;
      for (let k = 0; k < o.length; k += 2) mr += Math.hypot(o[k] - b.cx, o[k + 1] - b.cy);
      mr /= o.length / 2;
      const Rt = pk.r / this.unit;
      // the tube also thins/thickens to the ring's own tube (ring() uses 46% of its radius)
      // the loop's centre line ends at the donut's (67% of its radius) and the tube thickens to its body (66%)
      const Rc = Rt * 0.67;
      const tubeW = BAND_W * this.pegScale + (Rt * 0.66 - BAND_W * this.pegScale) * ease(Math.min(1, t / 0.45));
      // 1) the loop becomes a perfect circle (points spread evenly round it)
      const m = ease(Math.min(1, t / 0.32));
      // 2) it contracts to ring size, 3) overshoots once (squeezes in), springs out, settles
      const c = ease(Math.min(1, t / 0.45));
      const q = Math.max(0, Math.min(1, (t - 0.38) / 0.62));
      const bounce = -Math.sin(q * Math.PI * 2) * (1 - q) * 0.24;
      const R = Rc * (1 + bounce) + (mr - Rc) * (1 - c);
      const a0 = Math.atan2(o[1] - b.cy, o[0] - b.cx);
      let area = 0;
      for (let k = 0; k < o.length; k += 2) {
        const k2 = (k + 2) % o.length;
        area += o[k] * o[k2 + 1] - o[k2] * o[k + 1];
      }
      const dir = area >= 0 ? 1 : -1;
      const n = o.length / 2;
      const path = new Path2D();
      for (let k = 0; k < o.length; k += 2) {
        const a = a0 + dir * ((k / 2) / n) * Math.PI * 2;
        const x = o[k] + (b.cx + Math.cos(a) * R - o[k]) * m;
        const y = o[k + 1] + (b.cy + Math.sin(a) * R * (1 - bounce * 0.5) - o[k + 1]) * m;
        if (k === 0) path.moveTo(x, y);
        else path.lineTo(x, y);
      }
      path.closePath();
      ctx.save();
      ctx.translate(this.ox, lift - ease(t) * 12 * this.s);
      ctx.scale(this.unit, this.unit);
      this.strokeTube(ctx, path, COLORS[b.color], tubeW, pk.rev || t < 0.86 ? 1 : Math.max(0, 1 - (t - 0.86) / 0.14), 0.9);
      ctx.restore();
    }
    this.drawLockKey(ctx);
    ctx.restore();
  }

  /** Screen point of the cord vertex that maximises `ax*x + ay*y`. */
  private anchor(id: number, ax: number, ay: number): { x: number; y: number } {
    const o = this.cords[id];
    let best = -Infinity, bx = 0, by = 0;
    for (let i = 0; i < o.length; i += 2) {
      const v = ax * o[i] + ay * o[i + 1];
      if (v > best) {
        best = v;
        bx = o[i];
        by = o[i + 1];
      }
    }
    return { x: this.ox + bx * this.unit, y: this.oy - this.lift * this.unit + by * this.unit };
  }

  private lockSize(): number {
    return Math.max(26 * this.s, Math.min(44 * this.s, this.unit * 0.9));
  }

  /** Padlock on the locked band, key on the key band; the key flies to the lock when collected. */
  private drawLockKey(ctx: CanvasRenderingContext2D): void {
    const lk = this.lvl.lock;
    if (!lk || this.removed[lk.band]) return;
    const size = this.lockSize();
    const lc = COLORS[this.bands[lk.band].color];
    const la = this.anchor(lk.band, -0.6, 1);
    const shake = this.lockShake > 0 ? Math.sin(this.lockShake * 60) * 4 * this.s * (this.lockShake / 0.4) : 0;
    if (!this.removed[lk.key]) {
      const ka = this.anchor(lk.key, 1, 0.2);
      keyAsset(ctx, ka.x, ka.y, size * 0.95, Math.sin(this.time * 2.2) * 0.12, lc);
      padlock(ctx, la.x + shake, la.y, size, 0, lc);
      return;
    }
    const t = this.lockT;
    if (t < 0) return;
    if (t < 0.45) {
      const e = ease(t / 0.45);
      const x = this.keyFrom.x + (la.x - this.keyFrom.x) * e;
      const y = this.keyFrom.y + (la.y + size * 0.4 - this.keyFrom.y) * e - Math.sin((t / 0.45) * Math.PI) * 40 * this.s;
      padlock(ctx, la.x, la.y, size, 0, lc);
      keyAsset(ctx, x, y, size * 0.95, e * 1.2, lc);
    } else if (t < 1.1) {
      const open = Math.min(1, (t - 0.45) / 0.3);
      ctx.globalAlpha = t < 0.8 ? 1 : Math.max(0, 1 - (t - 0.8) / 0.3);
      padlock(ctx, la.x, la.y - (t > 0.8 ? (t - 0.8) * 40 * this.s : 0), size * (1 + 0.1 * Math.sin(open * Math.PI)), open, lc);
      ctx.globalAlpha = 1;
    }
  }

  /** A glossy round rubber tube: contact shadow, dark rim, body, soft light band and a crisp specular. */
  private strokeBand(ctx: CanvasRenderingContext2D, i: number, free: boolean, alpha: number): void {
    this.strokeTube(ctx, this.paths[i], COLORS[this.bands[i].color], BAND_W * this.pegScale, alpha, free ? 0.9 : 0.65, this.contacts[i]);
  }

  private strokeTube(
    ctx: CanvasRenderingContext2D, path: Path2D, col: { base: string; dark: string; light: string },
    w: number, alpha: number, spec: number, contacts?: Path2D,
  ): void {
    // A round rubber tube: dark outline, darker flanks, saturated body, a broad soft
    // highlight down the middle and a thin specular — shaded across its width.
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.globalAlpha = alpha;
    ctx.save();
    ctx.translate(w * 0.12, w * 0.32);
    ctx.strokeStyle = 'rgba(70,30,10,0.32)';
    ctx.lineWidth = w * 1.1;
    ctx.stroke(path);
    ctx.restore();
    const layer = (style: string, width: number, bulge = 1.0) => {
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.stroke(path);
      if (contacts) {
        ctx.lineWidth = width * bulge;
        ctx.stroke(contacts);
      }
    };
    layer(mix(col.dark, '#000000', 0.38), w, 1.12);
    layer(mix(col.base, col.dark, 0.55), w * 0.84, 1.1);
    layer(col.base, w * 0.6, 1.08);
    ctx.save();
    ctx.translate(-w * 0.02, -w * 0.06);
    ctx.globalAlpha = alpha * 0.9;
    ctx.strokeStyle = mix(col.base, col.light, 0.65);
    ctx.lineWidth = w * 0.3;
    ctx.stroke(path);
    ctx.translate(-w * 0.02, -w * 0.06);
    ctx.globalAlpha = alpha * spec;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = w * 0.1;
    ctx.stroke(path);
    ctx.restore();
    ctx.globalAlpha = 1;
  }





  private drawHud(ctx: CanvasRenderingContext2D): void {
    const s = this.s;
    const diff = this.lvl.spec.diff;
    const p = this.hudRect;
    const texts = [`Level ${this.level}`, `${this.removedCount}/${this.bands.length}`, clock(Math.ceil(this.timeLeft))];
    const tabText = diff === 'hard' ? 'HARD' : diff === 'superhard' ? 'SUPER HARD' : 'GOAL';
    // Geometry measured on the reference art (fractions of the panel image).
    const cw = p.w * 0.2823, gap = p.w * 0.025, cx0 = p.x + p.w * 0.051;
    const cy = p.y + p.h * 0.24, ch = p.h * 0.614;
    const tw = p.w * 0.302, th = p.h * 0.442, tx = p.x + (p.w - tw) / 2, ty = p.y - p.h * 0.205;
    if (ready(HUD_PANEL) && ready(HUD_CELL) && ready(HUD_TAB)) {
      const kp = p.h / HUD_PANEL.height;
      nine(ctx, HUD_PANEL, p.x, p.y, p.w, p.h, 70, 70, 70, 70, kp);
      const kc = ch / HUD_CELL.height;
      for (let k = 0; k < 3; k++) nine(ctx, HUD_CELL, cx0 + k * (cw + gap), cy, cw, ch, 30, 30, 30, 30, kc);
      const tab = diff === 'hard' ? tinted(HUD_TAB, '#ff2d55') : diff === 'superhard' ? tinted(HUD_TAB, '#7a3ff0') : HUD_TAB;
      nine(ctx, tab, tx, ty, tw, th, 46, 0, 46, 0, th / HUD_TAB.height);
    } else {
      hudPanel(ctx, p.x, p.y, p.w, p.h, Math.min(p.h * 0.3, 26 * s));
      for (let k = 0; k < 3; k++) hudCell(ctx, cx0 + k * (cw + gap), cy, cw, ch, Math.min(ch * 0.3, 14 * s));
      pillTab(ctx, tx, ty, tw, th);
    }
    for (let k = 0; k < 3; k++) {
      const tx2 = cx0 + k * (cw + gap) + cw / 2, ty2 = cy + ch * 0.5;
      if (k === 2 && this.timeLeft <= 10) {
        // hurry up: the timer cell glows red and the digits throb every second
        const beat = 1 - (this.timeLeft % 1);
        ctx.fillStyle = `rgba(255,40,80,${0.25 + 0.35 * beat})`;
        rr(ctx, cx0 + k * (cw + gap), cy, cw, ch, Math.min(ch * 0.3, 14 * s));
        ctx.fill();
        ctx.save();
        ctx.translate(tx2, ty2);
        ctx.scale(1 + 0.18 * beat * beat, 1 + 0.18 * beat * beat);
        hudText(ctx, texts[k], 0, 0, ch * 0.44);
        ctx.restore();
      } else hudText(ctx, texts[k], tx2, ty2, ch * 0.44);
    }
    hudText(ctx, tabText, tx + tw / 2, ty + th * 0.52, th * (tabText.length > 6 ? 0.42 : 0.6));

    // trays
    for (let k = 0; k < this.trayX.length; k++) this.drawTray(ctx, k);
    // holder
    const n = this.holderSlotsShown();
    const used = this.holderUsed();
    if (used > 0 && this.cap - used <= 1 && this.phase === 'playing') {
      // danger: only one free slot left — the row glows red
      const a = 0.25 + 0.25 * Math.sin(this.time * 7);
      ctx.fillStyle = `rgba(255,50,90,${a})`;
      rr(ctx, this.holderXAt(0) - this.holderR * 1.5, this.holderY - this.holderR * 1.5, this.holderXAt(n - 1) - this.holderXAt(0) + this.holderR * 3, this.holderR * 3, this.holderR * 1.5);
      ctx.fill();
    }
    for (let i = 0; i < n; i++) {
      const x = this.holderXAt(i), y = this.holderY;
      const hr = this.holderR * (this.introT > 0 ? Math.max(0.01, backOut(Math.min(1, (1 - this.introT / INTRO) * 1.5 - i * 0.08))) : 1);
      const locked = i >= this.cap;
      const hintPark = this.hintT > 0 && this.hintId >= 0 && this.findTray(this.bands[this.hintId].color) < 0 && i === this.holder.indexOf(-1);
      const state = locked ? 'disabled' : hintPark ? 'selected' : this.holder[i] >= 0 ? 'occupied' : 'empty';
      flatSlot(ctx, x, y, hr, state, 0.5 + 0.5 * Math.sin(this.time * 8), SLOT_ART);
      if (locked) continue;
      const c = this.holder[i];
      if (c >= 0 && !this.inboundHolder(i)) {
        const col = COLORS[c];
        donut(ctx, x + this.holderOff[i], y, hr * 0.98 * popScale(this.holderPop[i]), col);
      }
    }
  }

  private inboundHolder(i: number): boolean {
    for (const f of this.flyers) if (f.active && f.slot < 0 && f.hs === i) return true;
    return false;
  }

  private drawTray(ctx: CanvasRenderingContext2D, t: number): void {
    const s = this.s;
    const gen = this.visGen[t];
    const color = this.hist[t][gen] ?? -1;
    const cx = this.trayX[t], cy = this.trayY;
    if (color < 0) {
      ctx.fillStyle = 'rgba(80,90,200,0.18)';
      rr(ctx, cx - this.TW / 2, cy - this.TH / 2, this.TW, this.TH, 12 * s);
      ctx.fill();
      return;
    }
    let scale = 1, alpha = 1, dy = 0;
    if (this.visPhase[t] === 1) {
      const k = this.visT[t] / 0.42;
      scale = 1 + Math.sin(Math.min(1, k * 2) * Math.PI) * 0.12;
      alpha = k > 0.5 ? 1 - (k - 0.5) * 2 : 1;
      dy = k > 0.5 ? -(k - 0.5) * 40 * s : 0;
    } else if (this.visPhase[t] === 2) {
      const k = Math.min(1, this.visT[t] / 0.3);
      scale = 0.6 + 0.4 * backOut(k);
      alpha = k;
    }
    const filled = gen < this.trayGen[t] ? 3 - this.inflight(t, gen) : this.trayCount[t] - this.inflight(t, gen);
    const col = COLORS[color];
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.translate(cx, cy + dy);
    ctx.scale(scale, scale);
    if (this.introT > 0) {
      const k = backOut(Math.min(1, (1 - this.introT / INTRO) * 1.4 - t * 0.15));
      ctx.scale(Math.max(0.01, k), Math.max(0.01, k));
    }
    const bump = this.trayBump[t] ?? 0;
    if (bump > 0) {
      const q = Math.sin((1 - bump / 0.22) * Math.PI) * 0.07;
      ctx.scale(1 + q, 1 - q);
    }
    // tray (near-frontal), then the donuts sitting in its wells
    const R = this.trayRingR();
    trayBack(ctx, 0, 0, this.TW, this.TH, col, TRAY_WELLS, R, filled);
    const g = trayGeom(0, 0, this.TW, this.TH);
    for (let i = 0; i < filled; i++) {
      const b = gen === this.trayGen[t] || this.visPhase[t] === 0 ? popScale(this.trayPop[t][i]) : 1;
      donut(ctx, TRAY_WELLS[i] * this.TW, g.midY + R * 0.18, R * b, col);
    }
    trayFront(ctx, 0, 0, this.TW, this.TH, col);
    ctx.restore();
    if (this.niceT[t] > 0) {
      const k = 1 - this.niceT[t] / 0.9;
      ctx.globalAlpha = Math.min(1, this.niceT[t] * 3);
      text3D(ctx, 'NICE!', cx, cy - this.TH * 0.6 - k * 24 * s, 20 * s, '#ffffff', '#bfe3ff', '#2a3a9a', 0.08);
      ctx.globalAlpha = 1;
    }
  }

  private drawBar(ctx: CanvasRenderingContext2D): void {
    const names: IconName[] = ['undo', 'hint', 'slot', 'retry', 'menu'];
    const counts = [this.save.undo, this.save.hint, this.save.slot];
    const r = this.btnR;
    for (let i = 0; i < 5; i++) {
      const x = this.btnX[i], y = this.btnY;
      const pressed = this.pressKey === 'b' + i;
      const art = BOOSTER_ART[i];
      ctx.save();
      ctx.translate(x, y + (pressed ? r * 0.05 : 0));
      ctx.scale(this.btnS[i], this.btnS[i]);
      if (ready(art)) {
        // soft shadow, then the painted button
        ctx.fillStyle = 'rgba(60,40,140,0.28)';
        ctx.beginPath();
        ctx.ellipse(0, r * 0.98, r * 0.9, r * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
        const d = r * 2 * ART_SCALE;
        ctx.drawImage(art, -d / 2, -d / 2, d, d);
        if (pressed) {
          ctx.fillStyle = 'rgba(20,0,60,0.16)';
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        roundButton(ctx, 0, 0, r, '#7634C7', pressed);
        icon(ctx, names[i], 0, 0, r * 0.66);
      }
      if (i < 3) {
        const c = counts[i];
        const [bx, by] = BADGE_AT[i];
        badge(ctx, bx * r, by * r, r * 0.42, c > 0 ? String(c) : '+', c > 0 ? '#ff3b4e' : '#2fbf4f');
      }
      ctx.restore();
    }
  }

  private drawFlyers(ctx: CanvasRenderingContext2D): void {
    for (const f of this.flyers) {
      if (!f.active) continue;
      if (f.fromBoard && f.t < 0) continue;
      const col = COLORS[f.color];
      const k = Math.max(0, f.t) / f.dur;
      const e = ease(k);
      const x = f.x0 + (f.x1 - f.x0) * e;
      const y = f.y0 + (f.y1 - f.y0) * e - Math.sin(k * Math.PI) * f.arc;
      const r = f.r0 + (f.r1 - f.r0) * e;
      // born small from the contracted band (pop in), stretched along the flight, snug at the end
      const born = 1;
      const stretch = Math.sin(k * Math.PI) * 0.22;
      const vx = (f.x1 - f.x0) * (1 - k) - 0.0001, vy = (f.y1 - f.y0) * (1 - k) - Math.cos(k * Math.PI) * f.arc * Math.PI;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.atan2(vy, vx));
      ctx.scale((1 + stretch) * (0.55 + 0.45 * backOut(born)), (1 - stretch * 0.6) * (0.55 + 0.45 * backOut(born)));
      // heading into a tray it tilts to the tray's angle so it drops into the well flat
      donut(ctx, 0, 0, r, col);
      ctx.restore();
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      if (!p.active) continue;
      if (p.conf) {
        ctx.globalAlpha = Math.min(1, (p.max - p.life) * 2);
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, Math.cos(p.rot * 1.7));
        ctx.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6);
        ctx.restore();
        continue;
      }
      ctx.globalAlpha = 1 - p.life / p.max;
      ctx.fillStyle = p.color;
      const sz = p.size * (1 - (p.life / p.max) * 0.5);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - sz);
      ctx.lineTo(p.x + sz * 0.35, p.y - sz * 0.35);
      ctx.lineTo(p.x + sz, p.y);
      ctx.lineTo(p.x + sz * 0.35, p.y + sz * 0.35);
      ctx.lineTo(p.x, p.y + sz);
      ctx.lineTo(p.x - sz * 0.35, p.y + sz * 0.35);
      ctx.lineTo(p.x - sz, p.y);
      ctx.lineTo(p.x - sz * 0.35, p.y - sz * 0.35);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawBubble(ctx: CanvasRenderingContext2D): void {
    if (this.bubbleT <= 0 || !this.bubble) return;
    const s = this.s;
    const a = Math.min(1, this.bubbleT * 4);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = font(13 * s, 800);
    const maxW = Math.min(this.width - 40 * s, 250 * s);
    const lines = wrap(ctx, this.bubble, maxW - 24 * s);
    const lh = 17 * s;
    const bw = maxW, bh = lines.length * lh + 18 * s;
    const bx = this.width / 2 - bw / 2;
    const by = this.holderY + this.holderR + 14 * s;
    ctx.fillStyle = 'rgba(30,10,60,0.35)';
    rr(ctx, bx + 2, by + 4, bw, bh, 12 * s);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    rr(ctx, bx, by, bw, bh, 12 * s);
    ctx.fill();
    ctx.strokeStyle = '#8fbaff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(this.width / 2 - 8 * s, by + 1);
    ctx.lineTo(this.width / 2 + 8 * s, by + 1);
    ctx.lineTo(this.width / 2, by - 8 * s);
    ctx.fill();
    ctx.fillStyle = '#24407f';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], this.width / 2, by + 9 * s + lh * (i + 0.5));
    ctx.restore();
  }

  private drawBanner(ctx: CanvasRenderingContext2D): void {
    const s = this.s;
    const t = 2.4 - this.bannerT;
    const inK = Math.max(0, Math.min(1, t / 0.35));
    const outK = Math.max(0, Math.min(1, this.bannerT / 0.35));
    const k = Math.min(inK, outK);
    const superHard = this.lvl.spec.diff === 'superhard';
    const y = this.area.y + this.area.h * 0.42;
    ctx.save();
    ctx.globalAlpha = k;
    ctx.fillStyle = 'rgba(10,0,25,0.45)';
    ctx.fillRect(0, y - 52 * s, this.width, 104 * s);
    const bw = this.width * (0.4 + 0.5 * backOut(inK));
    ctx.translate(this.width / 2, y);
    ctx.fillStyle = superHard ? '#1a0f3a' : '#a0153e';
    ctx.beginPath();
    ctx.moveTo(-bw / 2 - 20 * s, -30 * s);
    ctx.lineTo(bw / 2 + 20 * s, -30 * s);
    ctx.lineTo(bw / 2, 0);
    ctx.lineTo(bw / 2 + 20 * s, 30 * s);
    ctx.lineTo(-bw / 2 - 20 * s, 30 * s);
    ctx.lineTo(-bw / 2, 0);
    ctx.closePath();
    ctx.fill();
    const g = ctx.createLinearGradient(0, -26 * s, 0, 26 * s);
    g.addColorStop(0, superHard ? '#4a2f9a' : '#ff4d6d');
    g.addColorStop(1, superHard ? '#1a0f4a' : '#b0123e');
    ctx.fillStyle = g;
    rr(ctx, -bw / 2, -26 * s, bw, 52 * s, 8 * s);
    ctx.fill();
    ctx.strokeStyle = superHard ? '#ff5d5d' : '#ffd25e';
    ctx.lineWidth = 3 * s;
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = k;
    text3D(ctx, superHard ? 'SUPER HARD!' : 'HARD LEVEL', this.width / 2, y - 2 * s, 30 * s, '#ffffff', superHard ? '#ffb0b0' : '#ffe08a', superHard ? '#2a0a20' : '#5a0a20', 0.1);
    label(ctx, superHard ? `Only ${this.cap} holder slots — plan every move!` : 'Think before you park!', this.width / 2, y + 40 * s, 12 * s, '#fff', '#1a3a9c');
    ctx.globalAlpha = 1;
  }

  private drawTutorialHand(ctx: CanvasRenderingContext2D): void {
    if (this.tutorialId < 0) {
      const m = chooseMove(this.bands, this.lvl.queue, this.playState(), this.cap - 1);
      if (!m) return;
      this.tutorialId = m.id;
    }
    const b = this.bands[this.tutorialId];
    const o = b.outline;
    const x = this.ox + o[0] * this.unit;
    const y = this.oy - this.lift * this.unit + o[1] * this.unit;
    const bob = Math.sin(this.time * 6) * 6 * this.s;
    drawHand(ctx, x + 8 * this.s, y + 8 * this.s + bob, this.s);
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.3 * Math.sin(this.time * 6);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3 * this.s;
    ctx.beginPath();
    ctx.arc(x, y, (14 + 6 * ((this.time * 1.5) % 1)) * this.s, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private dim(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = `rgba(12,2,32,${Math.min(0.62, this.popT * 3)})`;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  private popScale(ctx: CanvasRenderingContext2D): void {
    const k = backOut(Math.min(1, this.popT / 0.3));
    const p = this.mPanel;
    ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
    ctx.scale(k, k);
    ctx.translate(-(p.x + p.w / 2), -(p.y + p.h / 2));
  }

  private closeButton(ctx: CanvasRenderingContext2D): void {
    const s = this.s;
    roundButton(ctx, this.mCloseX, this.mCloseY, 18 * s, '#e0263f', false);
    icon(ctx, 'close', this.mCloseX, this.mCloseY, 16 * s);
  }

  private priceButton(ctx: CanvasRenderingContext2D, r: Rect, top: string, bot: string, edge: string, text: string, price: number, key: string): void {
    const s = this.s;
    pillButton(ctx, r.x, r.y, r.w, r.h, top, bot, edge, '', 0, this.pressKey === key);
    const oy = this.pressKey === key ? r.h * 0.08 : 0;
    coin(ctx, r.x + r.h * 0.55, r.y + r.h / 2 + oy, r.h * 0.26);
    label(ctx, text, r.x + r.w / 2 + 8 * s, r.y + r.h * 0.36 + oy, r.h * 0.32, '#fff', edge);
    coin(ctx, r.x + r.w / 2 - 6 * s, r.y + r.h * 0.72 + oy, r.h * 0.11);
    label(ctx, String(price), r.x + r.w / 2 + 14 * s, r.y + r.h * 0.73 + oy, r.h * 0.24, '#fff8c8', edge);
  }

  private drawOutOfSpace(ctx: CanvasRenderingContext2D): void {
    if (!ready(POP_FULL.img)) return this.drawOutOfSpaceFallback(ctx);
    const p = this.mPanel;
    this.dim(ctx);
    ctx.save();
    this.popScale(ctx);
    ctx.drawImage(POP_FULL.img, p.x, p.y, p.w, p.h);
    this.shadeButton(ctx, this.mA, 'mA', this.save.coins < PRICES.slot);
    this.shadeButton(ctx, this.mB, 'mB', this.undoStack.length === 0 || this.save.coins < PRICES.undo);
    ctx.restore();
  }

  private drawOutOfSpaceFallback(ctx: CanvasRenderingContext2D): void {
    const s = this.s, p = this.mPanel;
    this.dim(ctx);
    ctx.save();
    this.popScale(ctx);
    panel(ctx, p.x, p.y, p.w, p.h, s);
    label(ctx, 'Out of Space!', p.x + p.w / 2, p.y + 42 * s, 26 * s, '#fff', '#1a3a9c');
    cream(ctx, p.x + 24 * s, p.y + 70 * s, p.w - 48 * s, 118 * s, 14 * s);
    icon(ctx, 'slot', p.x + p.w / 2, p.y + 112 * s, 34 * s);
    label(ctx, 'The holder is full!', p.x + p.w / 2, p.y + 154 * s, 13 * s, '#24407f', '');
    label(ctx, 'Add a slot to keep going.', p.x + p.w / 2, p.y + 172 * s, 13 * s, '#24407f', '');
    this.priceButton(ctx, this.mA, '#7af06a', '#2aa83a', '#16702a', '+1 Holder Slot', PRICES.slot, 'mA');
    if (this.undoStack.length > 0) this.priceButton(ctx, this.mB, '#9a6af5', '#5a2bc0', '#33157a', 'Undo', PRICES.undo, 'mB');
    this.closeButton(ctx);
    ctx.restore();
  }

  private drawTimeUp(ctx: CanvasRenderingContext2D): void {
    if (ready(POP_TIMEUP.img)) {
      const p = this.mPanel, k = this.popK;
      this.dim(ctx);
      ctx.save();
      this.popScale(ctx);
      ctx.drawImage(POP_TIMEUP.img, p.x, p.y, p.w, p.h);
      this.shadeButton(ctx, this.mA, 'mA', this.save.coins < PRICES.time);
      const [tx, ty] = this.popPt(POP_TIMEUP.text[0], POP_TIMEUP.text[1]);
      const left = this.bands.length - this.removedCount;
      label(ctx, `${left} band${left === 1 ? '' : 's'} left to untangle!`, tx, ty, POP_TIMEUP.text[2] * k, '#16277a', '');
      ctx.restore();
      return;
    }
    const s = this.s, p = this.mPanel;
    this.dim(ctx);
    ctx.save();
    this.popScale(ctx);
    panel(ctx, p.x, p.y, p.w, p.h, s);
    label(ctx, "Time's Up!", p.x + p.w / 2, p.y + 42 * s, 26 * s, '#fff', '#1a3a9c');
    cream(ctx, p.x + 24 * s, p.y + 70 * s, p.w - 48 * s, 124 * s, 14 * s);
    drawClock(ctx, p.x + p.w / 2, p.y + 116 * s, 28 * s, this.time);
    label(ctx, `${this.bands.length - this.removedCount} bands left to untangle!`, p.x + p.w / 2, p.y + 160 * s, 13 * s, '#24407f', '');
    label(ctx, 'Need a little more time?', p.x + p.w / 2, p.y + 178 * s, 13 * s, '#24407f', '');
    this.priceButton(ctx, this.mA, '#7af06a', '#2aa83a', '#16702a', '+30 Seconds', PRICES.time, 'mA');
    this.closeButton(ctx);
    ctx.restore();
  }

  private drawMenu(ctx: CanvasRenderingContext2D): void {
    if (!ready(POP_PAUSE.img)) return this.drawMenuFallback(ctx);
    const p = this.mPanel, k = this.popK;
    this.dim(ctx);
    ctx.save();
    this.popScale(ctx);
    ctx.drawImage(POP_PAUSE.img, p.x, p.y, p.w, p.h);
    this.shadeButton(ctx, this.mA, 'mA');
    this.shadeButton(ctx, this.mB, 'mB');
    this.shadeButton(ctx, this.mC, 'mC');
    this.shadeButton(ctx, this.mD, 'mD');
    this.shadeButton(ctx, this.mE, 'mE');
    const [tx, ty] = this.popPt(POP_PAUSE.soundText[0], POP_PAUSE.soundText[1]);
    label(ctx, soundOn() ? 'Sound: On' : 'Sound: Off', tx, ty, POP_PAUSE.soundText[2] * k, '#ffffff', '#1747b8');
    if (this.clearArmed > 0) {
      const r = this.mD;
      ctx.fillStyle = 'rgba(120,0,30,0.55)';
      rr(ctx, r.x + r.h * 0.05, r.y + r.h * 0.08, r.w - r.h * 0.1, r.h * 0.8, r.h * 0.4);
      ctx.fill();
      label(ctx, 'Tap again to erase progress', r.x + r.w / 2, r.y + r.h * 0.48, r.h * 0.26, '#ffffff', '#7a0020');
    }
    this.drawCheat(ctx);
    ctx.restore();
  }

  private drawCheat(ctx: CanvasRenderingContext2D): void {
    const dn = this.cDn, up = this.cUp, go = this.cGo, h = dn.h;
    if (h <= 0) return;
    const step = (r: Rect, key: string, ic: IconName) => {
      pillButton(ctx, r.x, r.y, r.w, r.h, '#ffd84a', '#f0a020', '#8a5a08', '', 0, this.pressKey === key);
      icon(ctx, ic, r.x + r.w / 2, r.y + r.h / 2 + (this.pressKey === key ? r.h * 0.08 : 0), r.h * 0.3);
    };
    // value plate between the arrows
    const vx = dn.x + dn.w + 6 * this.s, vw = up.x - 6 * this.s - vx;
    ctx.fillStyle = 'rgba(10,30,100,0.72)';
    rr(ctx, vx, dn.y + h * 0.04, vw, h * 0.92, h * 0.3);
    ctx.fill();
    label(ctx, 'CHEAT', vx + vw / 2, dn.y + h * 0.3, h * 0.22, '#ffd84a', '');
    label(ctx, `Level ${this.cheatLv}`, vx + vw / 2, dn.y + h * 0.64, h * 0.34, '#ffffff', '#1747b8');
    step(dn, 'cDn', 'minus');
    step(up, 'cUp', 'plus');
    pillButton(ctx, go.x, go.y, go.w, go.h, '#7af06a', '#2aa83a', '#16702a', 'Play', h * 0.38, this.pressKey === 'cGo');
  }

  private drawMenuFallback(ctx: CanvasRenderingContext2D): void {
    const s = this.s, p = this.mPanel;
    this.dim(ctx);
    ctx.save();
    this.popScale(ctx);
    panel(ctx, p.x, p.y, p.w, p.h, s);
    label(ctx, 'Paused', p.x + p.w / 2, p.y + 40 * s, 26 * s, '#fff', '#1a3a9c');
    const btn = (r: Rect, key: string, top: string, bot: string, edge: string, text: string, ic: IconName) => {
      pillButton(ctx, r.x, r.y, r.w, r.h, top, bot, edge, '', 0, this.pressKey === key);
      const oy = this.pressKey === key ? r.h * 0.08 : 0;
      icon(ctx, ic, r.x + r.h * 0.6, r.y + r.h / 2 + oy, r.h * 0.32);
      label(ctx, text, r.x + r.w / 2 + 10 * s, r.y + r.h / 2 + oy, r.h * 0.4, '#fff', edge);
    };
    btn(this.mA, 'mA', '#7af06a', '#2aa83a', '#16702a', 'Resume', 'play');
    btn(this.mB, 'mB', '#ffb35a', '#e0701a', '#8a3a08', 'Restart', 'retry');
    btn(this.mC, 'mC', '#6ab8ff', '#2a6ad0', '#163a8a', soundOn() ? 'Sound: On' : 'Sound: Off', soundOn() ? 'sound' : 'mute');
    btn(this.mD, 'mD', '#c78af5', '#7a3fd0', '#3a1478', 'Home', 'home');
    this.closeButton(ctx);
    this.drawCheat(ctx);
    ctx.restore();
  }

  private drawWon(ctx: CanvasRenderingContext2D): void {
    if (!ready(POP_WIN.img)) return this.drawWonFallback(ctx);
    const s = this.s, p = this.mPanel, k = this.popK;
    this.dim(ctx);
    // light rays
    ctx.save();
    ctx.translate(this.width / 2, p.y + p.h * 0.35);
    ctx.rotate(this.time * 0.3);
    ctx.fillStyle = 'rgba(255,240,170,0.12)';
    for (let i = 0; i < 12; i++) {
      ctx.rotate(Math.PI / 6);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-30 * s, -this.height);
      ctx.lineTo(30 * s, -this.height);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    ctx.save();
    this.popScale(ctx);
    ctx.drawImage(POP_WIN.img, p.x, p.y, p.w, p.h);
    // stars pop in one after another
    for (let i = 0; i < 3; i++) {
      const [sx, sy, sz] = POP_WIN.stars[i];
      const appear = Math.min(1, Math.max(0, (this.popT - 0.3 - i * 0.18) / 0.25));
      const img = i < this.stars ? STAR_ON : STAR_OFF;
      if (appear <= 0 || !ready(img)) continue;
      const d = sz * k * backOut(appear);
      const [cx, cy] = this.popPt(sx, sy);
      ctx.drawImage(img, cx - d / 2, cy - d / 2, d, d * (img.naturalHeight / img.naturalWidth));
    }
    const [cx, cy] = this.popPt(POP_WIN.coinText[0], POP_WIN.coinText[1]);
    label(ctx, `+${this.doubled ? this.reward * 2 : this.reward}`, cx, cy, POP_WIN.coinText[2] * k, '#24245e', '');
    const [bx, by] = this.popPt(POP_WIN.combo[0], POP_WIN.combo[1]);
    label(ctx, `Best combo x${this.bestCombo}`, bx, by, POP_WIN.combo[2] * k, '#2f5cb4', '');
    this.shadeButton(ctx, this.mA, 'mA');
    this.shadeButton(ctx, this.mB, 'mB', this.doubled);
    if (this.doubled) label(ctx, 'Coins doubled!', this.mB.x + this.mB.w / 2, this.mB.y + this.mB.h * 0.48, this.mB.h * 0.3, '#ffffff', '#8a3a08');
    ctx.restore();
    this.drawParticles(ctx);
  }

  private drawWonFallback(ctx: CanvasRenderingContext2D): void {
    const s = this.s, p = this.mPanel;
    this.dim(ctx);
    // light rays
    ctx.save();
    ctx.translate(this.width / 2, p.y + 110 * s);
    ctx.rotate(this.time * 0.3);
    ctx.fillStyle = 'rgba(255,230,140,0.10)';
    for (let i = 0; i < 12; i++) {
      ctx.rotate(Math.PI / 6);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-30 * s, -this.height);
      ctx.lineTo(30 * s, -this.height);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    ctx.save();
    this.popScale(ctx);
    panel(ctx, p.x, p.y, p.w, p.h, s);
    label(ctx, 'Level Complete!', p.x + p.w / 2, p.y + 40 * s, 24 * s, '#fff', '#1a3a9c');
    cream(ctx, p.x + 24 * s, p.y + 66 * s, p.w - 48 * s, 150 * s, 14 * s);
    for (let i = 0; i < 3; i++) {
      const appear = Math.min(1, Math.max(0, (this.popT - 0.3 - i * 0.18) / 0.25));
      const r = (i === 1 ? 30 : 24) * s * backOut(appear);
      if (r > 0.5) star(ctx, p.x + p.w / 2 + (i - 1) * 62 * s, p.y + (i === 1 ? 108 : 118) * s, r, i < this.stars);
    }
    const pillW = 110 * s;
    ctx.fillStyle = '#e8d9f5';
    rr(ctx, p.x + p.w / 2 - pillW / 2, p.y + 150 * s, pillW, 34 * s, 17 * s);
    ctx.fill();
    coin(ctx, p.x + p.w / 2 - pillW / 2 + 18 * s, p.y + 167 * s, 12 * s);
    label(ctx, `+${this.doubled ? this.reward * 2 : this.reward}`, p.x + p.w / 2 + 12 * s, p.y + 167 * s, 20 * s, '#3b1a78', '');
    label(ctx, `Best combo x${this.bestCombo}`, p.x + p.w / 2, p.y + 200 * s, 13 * s, '#24407f', '');
    pillButton(ctx, this.mA.x, this.mA.y, this.mA.w, this.mA.h, '#7af06a', '#2aa83a', '#16702a', this.level >= LEVEL_COUNT ? 'Finish' : 'Next', 26 * s, this.pressKey === 'mA');
    if (!this.doubled) pillButton(ctx, this.mB.x, this.mB.y, this.mB.w, this.mB.h, '#ffb35a', '#e0701a', '#8a3a08', 'x2 Coins (Ad)', 15 * s, this.pressKey === 'mB');
    else label(ctx, 'Coins doubled!', p.x + p.w / 2, this.mB.y + this.mB.h / 2, 15 * s, '#ffe08a', '#1a3a9c');
    ctx.restore();
    this.drawParticles(ctx);
  }

  private drawLost(ctx: CanvasRenderingContext2D): void {
    const art = this.loseReason === 'time' ? POP_OOT : POP_FAIL;
    if (!ready(art.img)) return this.drawLostFallback(ctx);
    const p = this.mPanel, k = this.popK;
    this.dim(ctx);
    ctx.save();
    this.popScale(ctx);
    ctx.drawImage(art.img, p.x, p.y, p.w, p.h);
    this.shadeButton(ctx, this.mA, 'mA');
    this.shadeButton(ctx, this.mB, 'mB');
    const [tx, ty] = this.popPt(art.text[0], art.text[1]);
    const left = this.bands.length - this.removedCount;
    label(ctx, `${left} band${left === 1 ? ' was' : 's were'} still tangled.`, tx, ty, art.text[2] * k, '#16277a', '');
    ctx.restore();
  }

  private drawLostFallback(ctx: CanvasRenderingContext2D): void {
    const s = this.s, p = this.mPanel;
    this.dim(ctx);
    ctx.save();
    this.popScale(ctx);
    panel(ctx, p.x, p.y, p.w, p.h, s);
    label(ctx, this.loseReason === 'time' ? 'Out of Time' : 'Level Failed', p.x + p.w / 2, p.y + 42 * s, 26 * s, '#fff', '#1a3a9c');
    cream(ctx, p.x + 24 * s, p.y + 70 * s, p.w - 48 * s, 84 * s, 14 * s);
    label(ctx, `${this.bands.length - this.removedCount} bands were still tangled.`, p.x + p.w / 2, p.y + 100 * s, 13 * s, '#24407f', '');
    label(ctx, 'Tip: park bands that free the most!', p.x + p.w / 2, p.y + 124 * s, 12 * s, '#4a6aa8', '');
    pillButton(ctx, this.mA.x, this.mA.y, this.mA.w, this.mA.h, '#7af06a', '#2aa83a', '#16702a', 'Retry', 26 * s, this.pressKey === 'mA');
    pillButton(ctx, this.mB.x, this.mB.y, this.mB.w, this.mB.h, '#c78af5', '#7a3fd0', '#3a1478', 'Home', 18 * s, this.pressKey === 'mB');
    ctx.restore();
  }

  /** Top-left coin counter, the same art as on the home screen. */
  private coinBarRect(): { x: number; y: number; k: number } {
    const k = this.homeS;
    return { x: Math.max(0, this.homeX) + HOME.coin.x * k, y: this.sat + HOME.coin.y * k, k };
  }

  /** Where flying coins land: the coin icon of the top-left counter. */
  private coinTarget(): [number, number] {
    const b = this.coinBarRect();
    return [b.x + 38 * b.k, b.y + 45 * b.k];
  }

  private drawCoinBar(ctx: CanvasRenderingContext2D): void {
    const b = this.coinBarRect(), c = HOME.coin;
    const pulse = this.coinPulse > 0 ? 1 + Math.sin((this.coinPulse / 0.18) * Math.PI) * 0.08 : 1;
    ctx.save();
    ctx.translate(b.x + (c.w * b.k) / 2, b.y + (c.h * b.k) / 2);
    ctx.scale(pulse, pulse);
    ctx.translate(-(b.x + (c.w * b.k) / 2), -(b.y + (c.h * b.k) / 2));
    if (ready(c.img)) ctx.drawImage(c.img, b.x, b.y, c.w * b.k, c.h * b.k);
    hudText(ctx, String(Math.round(this.coinShown)), b.x + (HOME_COIN_TEXT.x - c.x) * b.k, b.y + (HOME_COIN_TEXT.y - c.y) * b.k, HOME_COIN_TEXT.size * b.k);
    ctx.restore();
  }

  /** Reward coins burst out of (x, y) and fly one by one into the top-left counter. */
  private flyCoins(x: number, y: number, amount: number, delay: number): void {
    const n = Math.min(12, Math.max(5, Math.round(amount / 6)));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const r = (18 + Math.random() * 26) * this.s;
      this.coinFly.push({ x0: x, y0: y, sx: x + Math.cos(a) * r, sy: y + Math.sin(a) * r * 0.7, t: -delay - i * 0.07, value: amount / n });
    }
  }

  private drawCoinFly(ctx: CanvasRenderingContext2D): void {
    const [tx, ty] = this.coinTarget();
    const r = 11 * this.s;
    for (const f of this.coinFly) {
      if (f.t < 0) continue;
      let x: number, y: number, sc = 1;
      if (f.t < 0.22) {
        // pop out around the reward
        const k = backOut(f.t / 0.22);
        x = f.x0 + (f.sx - f.x0) * k;
        y = f.y0 + (f.sy - f.y0) * k;
        sc = 0.4 + 0.6 * k;
      } else {
        // curve up to the counter, shrinking a little
        const k = ease(Math.min(1, (f.t - 0.22) / 0.55));
        const cx = (f.sx + tx) / 2 + 60 * this.s, cy = Math.min(f.sy, ty) - 40 * this.s;
        x = (1 - k) * (1 - k) * f.sx + 2 * (1 - k) * k * cx + k * k * tx;
        y = (1 - k) * (1 - k) * f.sy + 2 * (1 - k) * k * cy + k * k * ty;
        sc = 1 - 0.25 * k;
      }
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(sc * Math.abs(Math.cos(f.t * 9)) * 0.35 + sc * 0.65, sc);
      coin(ctx, 0, 0, r);
      ctx.restore();
    }
  }

  // ---- title ----------------------------------------------------------------

  /** Home screen built from the reference art's parts; Play pulses and the star bobs. */
  private drawHome(ctx: CanvasRenderingContext2D): void {
    const hs = this.homeS, ox = this.homeX, oy = this.homeY;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(HOME_BG, ox, oy, HOME_W * hs, HOME_H * hs);
    const put = (e: HomePart, dy = 0, sc = 1) => {
      if (!ready(e.img)) return;
      const ew = e.w * hs * sc, eh = e.h * hs * sc;
      ctx.drawImage(e.img, ox + (e.x + e.w / 2) * hs - ew / 2, oy + (e.y + e.h / 2) * hs - eh / 2 + dy, ew, eh);
    };
    put(HOME.pedestal);
    put(HOME.star, -(0.5 + 0.5 * Math.sin(this.time * 2.2)) * 10 * hs);
    put(HOME.logo);
    put(HOME.crown, Math.sin(this.time * 2.2 + 1.2) * 3 * hs);
    const pressed = this.pressKey === 'play';
    put(HOME.play, pressed ? 4 * hs : 0, pressed ? 0.95 : 1 + Math.sin(this.time * 4) * 0.035);
    put(HOME.level);
    const lv = Math.min(LEVEL_COUNT, this.save.maxLevel);
    const diff = SPECS[lv - 1].diff;
    const t = HOME_LEVEL_TEXT;
    hudText(ctx, `Level ${lv}${diff === 'hard' ? ' · Hard' : diff === 'superhard' ? ' · Super Hard' : ''}`, ox + t.x * hs, oy + t.y * hs, t.size * hs * (diff === 'normal' ? 1 : 0.8));
    // top corners, pinned inside the safe area
    const top = this.sat;
    const c = HOME.coin, cx = Math.max(0, ox) + c.x * hs, cy = top + c.y * hs;
    if (ready(c.img)) ctx.drawImage(c.img, cx, cy, c.w * hs, c.h * hs);
    hudText(ctx, String(this.save.coins), cx + (HOME_COIN_TEXT.x - c.x) * hs, cy + (HOME_COIN_TEXT.y - c.y) * hs, HOME_COIN_TEXT.size * hs);
  }

  private drawTitle(ctx: CanvasRenderingContext2D): void {
    if (ready(HOME_BG)) {
      this.drawHome(ctx);
      return;
    }
    const s = this.s, w = this.width, h = this.height;
    // coins + sound
    const pill = { x: 14 * s, y: this.sat + 16 * s };
    ctx.fillStyle = 'rgba(36,98,237,0.85)';
    rr(ctx, pill.x, pill.y, 116 * s, 36 * s, 18 * s);
    ctx.fill();
    ctx.strokeStyle = '#c8861c';
    ctx.lineWidth = 2;
    ctx.stroke();
    coin(ctx, pill.x + 18 * s, pill.y + 18 * s, 15 * s);
    label(ctx, String(this.save.coins), pill.x + 70 * s, pill.y + 18 * s, 17 * s, '#fff', '');

    // logo
    const ly = h * 0.17;
    crown(ctx, w / 2, ly - 52 * s, 26 * s);
    text3D(ctx, 'Untangle', w / 2, ly, 58 * s, '#e4b8ff', '#9a3cf0', '#3a0f78');
    text3D(ctx, 'Ale Ela', w / 2, ly + 62 * s, 50 * s, '#fff38a', '#ff9a1a', '#7a2a08');

    // trophy: interlocked bands on a pedestal
    const ty = h * 0.5;
    const bob = Math.sin(this.time * 2) * 6 * s;
    ctx.save();
    ctx.fillStyle = '#8a5208';
    ctx.beginPath();
    ctx.ellipse(w / 2, ty + 110 * s, 105 * s, 30 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    let g = ctx.createLinearGradient(w / 2 - 100 * s, 0, w / 2 + 100 * s, 0);
    g.addColorStop(0, '#d9961e');
    g.addColorStop(0.4, '#ffe17a');
    g.addColorStop(1, '#b0700f');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(w / 2, ty + 100 * s, 105 * s, 30 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    g = ctx.createLinearGradient(0, ty + 50 * s, 0, ty + 100 * s);
    g.addColorStop(0, '#5aa8ff');
    g.addColorStop(1, '#2462ED');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(w / 2, ty + 92 * s, 88 * s, 24 * s, 0, 0, Math.PI);
    ctx.lineTo(w / 2 - 88 * s, ty + 70 * s);
    ctx.ellipse(w / 2, ty + 70 * s, 88 * s, 24 * s, 0, Math.PI, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#9cc8ff';
    ctx.beginPath();
    ctx.ellipse(w / 2, ty + 70 * s, 88 * s, 24 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    crown(ctx, w / 2, ty + 92 * s, 9 * s);
    // golden star frame
    ctx.save();
    ctx.translate(w / 2, ty - 10 * s + bob);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 === 0 ? 92 * s : 46 * s;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.lineWidth = 14 * s;
    ctx.strokeStyle = '#a5680f';
    ctx.stroke();
    ctx.lineWidth = 9 * s;
    ctx.strokeStyle = '#ffd25e';
    ctx.stroke();
    // three interlocked bands
    const shapes: [number, number[]][] = [
      [5, [-34, -10, 18, -10, -8, 34]],
      [3, [-14, -46, 30, -2, -14, 40, -58, -2]],
      [0, [4, -14, 52, -14, 52, 34, 4, 34]],
    ];
    for (const [ci, pts] of shapes) {
      const col = COLORS[ci];
      const p = new Path2D();
      for (let i = 0; i < pts.length; i += 2) p.lineTo(pts[i] * s, pts[i + 1] * s);
      p.closePath();
      ctx.lineJoin = 'round';
      ctx.lineWidth = 15 * s;
      ctx.strokeStyle = col.dark;
      ctx.stroke(p);
      ctx.lineWidth = 11 * s;
      ctx.strokeStyle = col.base;
      ctx.stroke(p);
      ctx.save();
      ctx.translate(-1 * s, -3 * s);
      ctx.lineWidth = 3.5 * s;
      ctx.strokeStyle = col.light;
      ctx.stroke(p);
      ctx.restore();
    }
    ctx.restore();
    gem(ctx, w / 2, ty - 112 * s + bob, 12 * s, '#ffcc3d');

    // play button
    const pb = this.playBtn;
    const pulse = 1 + Math.sin(this.time * 4) * 0.03;
    ctx.save();
    ctx.translate(pb.x + pb.w / 2, pb.y + pb.h / 2);
    ctx.scale(pulse, pulse);
    ctx.translate(-(pb.x + pb.w / 2), -(pb.y + pb.h / 2));
    pillButton(ctx, pb.x, pb.y, pb.w, pb.h, '#8af56a', '#2aa83a', '#16702a', 'Play', 34 * s, this.pressKey === 'play');
    ctx.restore();
    const lv = Math.min(LEVEL_COUNT, this.save.maxLevel);
    const spec = SPECS[lv - 1];
    const tagW = 120 * s;
    ctx.fillStyle = spec.diff === 'normal' ? '#5a2bc0' : spec.diff === 'hard' ? '#c0183e' : '#1a1036';
    rr(ctx, w / 2 - tagW / 2, pb.y + pb.h + 8 * s, tagW, 26 * s, 13 * s);
    ctx.fill();
    ctx.strokeStyle = '#ffd25e';
    ctx.lineWidth = 2;
    ctx.stroke();
    label(ctx, `Level ${lv}${spec.diff === 'hard' ? ' · Hard' : spec.diff === 'superhard' ? ' · Super Hard' : ''}`, w / 2, pb.y + pb.h + 21 * s, 13 * s, '#fff', '');
  }

  /** Test hook: plays `n` moves chosen by the hint solver. */
  autoPlay(n: number): void {
    for (let i = 0; i < n && this.phase === 'playing'; i++) {
      const m = chooseMove(this.bands, this.lvl.queue, this.playState(), this.cap - 1);
      if (!m) break;
      this.takeBand(m.id);
    }
  }

  /** Anything the HUD/debug overlay may want to show. */
  snapshot(): GameEventData {
    return {
      phase: this.phase,
      level: this.level,
      bandsLeft: this.bands.length - this.removedCount,
      holder: `${this.holderUsed()}/${this.cap}`,
      coins: this.save.coins,
    };
  }
}

/** Closed polyline resampled to `n` points evenly spaced along its length. */
function resample(o: Float32Array, n: number): Float32Array {
  const m = o.length / 2;
  const cum = [0];
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m;
    cum.push(cum[i] + Math.hypot(o[j * 2] - o[i * 2], o[j * 2 + 1] - o[i * 2 + 1]));
  }
  const L = cum[m];
  const out = new Float32Array(n * 2);
  let seg = 0;
  for (let k = 0; k < n; k++) {
    const d = (k / n) * L;
    while (seg < m - 1 && cum[seg + 1] < d) seg++;
    const j = (seg + 1) % m;
    const f = (d - cum[seg]) / Math.max(1e-6, cum[seg + 1] - cum[seg]);
    out[k * 2] = o[seg * 2] + (o[j * 2] - o[seg * 2]) * f;
    out[k * 2 + 1] = o[seg * 2 + 1] + (o[j * 2 + 1] - o[seg * 2 + 1]) * f;
  }
  return out;
}

function drawClock(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(t * 18) * 0.08);
  ctx.fillStyle = '#e0284f';
  ctx.beginPath();
  ctx.arc(-r * 0.62, -r * 0.82, r * 0.28, 0, Math.PI * 2);
  ctx.arc(r * 0.62, -r * 0.82, r * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#24407f';
  ctx.lineCap = 'round';
  ctx.lineWidth = r * 0.12;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -r * 0.55);
  ctx.moveTo(0, 0);
  ctx.lineTo(r * 0.4, r * 0.1);
  ctx.stroke();
  ctx.restore();
}

function clock(t: number): string {
  const sec = Math.floor(t);
  const m = Math.floor(sec / 60), r = sec % 60;
  return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const t = line ? line + ' ' + word : word;
    if (ctx.measureText(t).width > maxW && line) {
      lines.push(line);
      line = word;
    } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

function drawHand(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.rotate(-0.4);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#1a3a9c';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-5, 0);
  ctx.quadraticCurveTo(-8, 0, -8, 4);
  ctx.lineTo(-8, 22);
  ctx.lineTo(-14, 18);
  ctx.quadraticCurveTo(-20, 16, -18, 24);
  ctx.lineTo(-6, 40);
  ctx.lineTo(16, 40);
  ctx.quadraticCurveTo(22, 30, 22, 22);
  ctx.lineTo(22, 16);
  ctx.quadraticCurveTo(22, 12, 18, 12);
  ctx.lineTo(4, 12);
  ctx.lineTo(4, 4);
  ctx.quadraticCurveTo(4, 0, 0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Top safe-area inset (notch) in CSS px, measured once per resize. */
function readSafeTop(): number {
  return readSafe('top');
}

function readSafe(side: 'top' | 'bottom'): number {
  const probe = document.createElement('div');
  probe.style.cssText = `position:fixed;top:0;left:0;height:0;visibility:hidden;padding-top:env(safe-area-inset-${side},0px)`;
  document.body.appendChild(probe);
  const v = parseFloat(getComputedStyle(probe).paddingTop);
  probe.remove();
  return Number.isFinite(v) ? v : 0;
}

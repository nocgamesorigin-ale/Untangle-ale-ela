// Drawing helpers for the glossy "3D" look: palace backdrop, beveled panels,
// round buttons, icons, pegs and rubber rings. Everything is Canvas 2D paths;
// the expensive pieces (backdrop, pegs) are painted once into offscreen canvases.

import { art } from './art';
import { tintedBright } from './sprites';

export const FONT = 'Fredoka, "Arial Rounded MT Bold", "Nunito", "Trebuchet MS", system-ui, sans-serif';

export function font(size: number, weight = 700): string {
  return `${weight} ${Math.round(size)}px ${FONT}`;
}

export function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mix two #rrggbb colours (t = 0 → a, 1 → b). */
export function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a), B = hexToRgb(b);
  const r = Math.round(A[0] + (B[0] - A[0]) * t);
  const g = Math.round(A[1] + (B[1] - A[1]) * t);
  const bl = Math.round(A[2] + (B[2] - A[2]) * t);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.ceil(w));
  cv.height = Math.max(1, Math.ceil(h));
  return [cv, cv.getContext('2d')!];
}

// ---- text ----------------------------------------------------------------------

/** Chunky toy-like text: extruded shadow, outline, gradient face. */
export function text3D(
  c: CanvasRenderingContext2D, s: string, x: number, y: number, size: number,
  top: string, bottom: string, edge = '#3a1470', depth = 0.12,
): void {
  c.save();
  c.font = font(size);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineJoin = 'round';
  const d = Math.max(2, size * depth);
  c.fillStyle = edge;
  c.strokeStyle = edge;
  c.lineWidth = size * 0.2;
  for (let i = d; i > 0; i -= 1.5) {
    c.strokeText(s, x, y + i);
    c.fillText(s, x, y + i);
  }
  c.strokeText(s, x, y);
  c.strokeStyle = '#ffffff';
  c.lineWidth = size * 0.09;
  c.strokeText(s, x, y);
  const g = c.createLinearGradient(0, y - size * 0.5, 0, y + size * 0.5);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  c.fillStyle = g;
  c.fillText(s, x, y);
  // gloss
  c.globalAlpha = 0.35;
  c.save();
  c.beginPath();
  c.rect(x - size * 10, y - size * 0.6, size * 20, size * 0.5);
  c.clip();
  c.fillStyle = '#ffffff';
  c.fillText(s, x, y);
  c.restore();
  c.restore();
}

/** Plain outlined label. */
export function label(c: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, fill = '#fff', stroke = '#2c0f5c', align: CanvasTextAlign = 'center'): void {
  c.font = font(size);
  c.textAlign = align;
  c.textBaseline = 'middle';
  c.lineJoin = 'round';
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = Math.max(2, size * 0.22);
    c.strokeText(s, x, y);
  }
  c.fillStyle = fill;
  c.fillText(s, x, y);
}

// ---- panels & buttons ----------------------------------------------------------------

export function pillButton(
  c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  top: string, bottom: string, edge: string, text: string, size: number, pressed = false,
): void {
  const d = pressed ? h * 0.04 : h * 0.12;
  const oy = pressed ? h * 0.08 : 0;
  c.save();
  // drop shadow
  c.fillStyle = 'rgba(20,0,40,0.35)';
  rr(c, x + 2, y + d + 4 + oy, w, h, h / 2);
  c.fill();
  // side
  c.fillStyle = edge;
  rr(c, x, y + d + oy, w, h, h / 2);
  c.fill();
  // face
  const g = c.createLinearGradient(0, y + oy, 0, y + h + oy);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  c.fillStyle = g;
  rr(c, x, y + oy, w, h, h / 2);
  c.fill();
  c.lineWidth = Math.max(2, h * 0.06);
  c.strokeStyle = edge;
  c.stroke();
  // gloss
  c.fillStyle = 'rgba(255,255,255,0.35)';
  rr(c, x + h * 0.25, y + oy + h * 0.1, w - h * 0.5, h * 0.3, h * 0.15);
  c.fill();
  c.restore();
  if (text) label(c, text, x + w / 2, y + oy + h * 0.5, size, '#fff', edge);
}

/** Popup frame: light-blue shell, saturated blue body, glossy title pill. */
export function panel(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, s: number): void {
  c.save();
  c.fillStyle = 'rgba(30,40,130,0.3)';
  rr(c, x + 3 * s, y + 12 * s, w, h, 26 * s);
  c.fill();
  hudPanel(c, x - 6 * s, y - 6 * s, w + 12 * s, h + 12 * s, 30 * s);
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#3a8ff6');
  g.addColorStop(1, '#2462ED');
  c.fillStyle = g;
  rr(c, x, y, w, h, 24 * s);
  c.fill();
  c.fillStyle = 'rgba(255,255,255,0.14)';
  rr(c, x + 10 * s, y + 8 * s, w - 20 * s, 30 * s, 15 * s);
  c.fill();
  c.restore();
}

export function gem(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  c.save();
  c.beginPath();
  c.moveTo(x, y - r);
  c.lineTo(x + r * 0.8, y - r * 0.2);
  c.lineTo(x, y + r);
  c.lineTo(x - r * 0.8, y - r * 0.2);
  c.closePath();
  const g = c.createLinearGradient(x - r, y - r, x + r, y + r);
  g.addColorStop(0, mix(color, '#ffffff', 0.5));
  g.addColorStop(0.5, color);
  g.addColorStop(1, mix(color, '#000000', 0.4));
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = mix(color, '#000000', 0.5);
  c.lineWidth = Math.max(1, r * 0.12);
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.7)';
  c.beginPath();
  c.moveTo(x - r * 0.3, y - r * 0.5);
  c.lineTo(x, y - r * 0.75);
  c.lineTo(x + r * 0.1, y - r * 0.3);
  c.closePath();
  c.fill();
  c.restore();
}

export function cream(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.save();
  c.fillStyle = 'rgba(20,50,150,0.35)';
  rr(c, x, y + 4, w, h, r);
  c.fill();
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#e3eeff');
  c.fillStyle = g;
  rr(c, x, y, w, h, r);
  c.fill();
  c.strokeStyle = '#a9ccff';
  c.lineWidth = 2;
  c.stroke();
  c.restore();
}

// ---- icons ----------------------------------------------------------------

export function coin(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  c.save();
  c.fillStyle = '#b8770e';
  c.beginPath();
  c.arc(x, y + r * 0.15, r, 0, Math.PI * 2);
  c.fill();
  const g = c.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, '#fff3a6');
  g.addColorStop(0.6, '#ffc93a');
  g.addColorStop(1, '#e79a12');
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = '#c47d0c';
  c.lineWidth = r * 0.14;
  c.beginPath();
  c.arc(x, y, r * 0.62, 0, Math.PI * 2);
  c.stroke();
  c.restore();
}

export function crown(c: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  c.beginPath();
  c.moveTo(-1, 0.55);
  c.lineTo(-1.1, -0.45);
  c.lineTo(-0.5, 0.05);
  c.lineTo(0, -0.75);
  c.lineTo(0.5, 0.05);
  c.lineTo(1.1, -0.45);
  c.lineTo(1, 0.55);
  c.closePath();
  const g = c.createLinearGradient(0, -0.8, 0, 0.6);
  g.addColorStop(0, '#fff09a');
  g.addColorStop(0.5, '#ffc22e');
  g.addColorStop(1, '#e0870e');
  c.fillStyle = g;
  c.fill();
  c.lineWidth = 0.1;
  c.strokeStyle = '#a5600a';
  c.stroke();
  c.fillStyle = '#e0870e';
  c.fillRect(-1, 0.38, 2, 0.2);
  c.restore();
  gem(c, x, y + 0.12 * s, 0.28 * s, '#ff3b5c');
  gem(c, x - 0.62 * s, y + 0.2 * s, 0.17 * s, '#3fa0ff');
  gem(c, x + 0.62 * s, y + 0.2 * s, 0.17 * s, '#3fa0ff');
}

export function star(c: CanvasRenderingContext2D, x: number, y: number, r: number, filled: boolean): void {
  c.save();
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr2 = i % 2 === 0 ? r : r * 0.48;
    c.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2);
  }
  c.closePath();
  c.lineJoin = 'round';
  c.lineWidth = r * 0.18;
  c.strokeStyle = filled ? '#c4720c' : '#6a4a9a';
  c.stroke();
  if (filled) {
    const g = c.createLinearGradient(0, y - r, 0, y + r);
    g.addColorStop(0, '#fff3a0');
    g.addColorStop(0.5, '#ffc833');
    g.addColorStop(1, '#f39a12');
    c.fillStyle = g;
  } else c.fillStyle = '#3b2266';
  c.fill();
  if (filled) {
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.beginPath();
    c.ellipse(x - r * 0.2, y - r * 0.3, r * 0.22, r * 0.12, -0.6, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

export type IconName = 'undo' | 'hint' | 'slot' | 'retry' | 'menu' | 'close' | 'sound' | 'mute' | 'home' | 'play' | 'plus' | 'minus' | 'fit';

export function icon(c: CanvasRenderingContext2D, name: IconName, x: number, y: number, r: number): void {
  c.save();
  c.translate(x, y);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  switch (name) {
    case 'undo': {
      c.strokeStyle = '#b45a0a';
      c.lineWidth = r * 0.5;
      c.beginPath();
      c.arc(r * 0.1, r * 0.15, r * 0.55, Math.PI * 1.05, Math.PI * 2.35);
      c.stroke();
      c.strokeStyle = '#ffbe3a';
      c.lineWidth = r * 0.3;
      c.stroke();
      c.fillStyle = '#ffbe3a';
      c.strokeStyle = '#b45a0a';
      c.lineWidth = r * 0.1;
      c.beginPath();
      c.moveTo(-r * 0.85, -r * 0.35);
      c.lineTo(-r * 0.15, -r * 0.35);
      c.lineTo(-r * 0.62, r * 0.35);
      c.closePath();
      c.fill();
      c.stroke();
      break;
    }
    case 'hint': {
      const g = c.createRadialGradient(-r * 0.2, -r * 0.4, r * 0.1, 0, -r * 0.15, r * 0.65);
      g.addColorStop(0, '#fffbd0');
      g.addColorStop(1, '#ffc21f');
      const glow = c.createRadialGradient(0, -r * 0.15, r * 0.2, 0, -r * 0.15, r * 1.05);
      glow.addColorStop(0, 'rgba(255,230,120,0.9)');
      glow.addColorStop(1, 'rgba(255,230,120,0)');
      c.fillStyle = glow;
      c.globalAlpha = 0.8;
      c.beginPath();
      c.arc(0, -r * 0.15, r * 1.05, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 1;
      c.fillStyle = g;
      c.strokeStyle = '#b47a06';
      c.lineWidth = r * 0.08;
      c.beginPath();
      c.arc(0, -r * 0.18, r * 0.55, Math.PI * 0.8, Math.PI * 2.2);
      c.lineTo(r * 0.25, r * 0.45);
      c.lineTo(-r * 0.25, r * 0.45);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = '#8a8fa8';
      rr(c, -r * 0.28, r * 0.45, r * 0.56, r * 0.3, r * 0.08);
      c.fill();
      break;
    }
    case 'slot': {
      c.fillStyle = '#b9bdd6';
      c.beginPath();
      c.ellipse(0, r * 0.5, r * 0.82, r * 0.32, 0, 0, Math.PI * 2);
      c.fill();
      const wg = c.createLinearGradient(0, r * 0.1, 0, r * 0.5);
      wg.addColorStop(0, '#ffffff');
      wg.addColorStop(1, '#e3e5f2');
      c.fillStyle = wg;
      c.beginPath();
      c.ellipse(0, r * 0.36, r * 0.82, r * 0.3, 0, 0, Math.PI * 2);
      c.fill();
      plus(c, 0, -r * 0.18, r * 0.7, '#3ddc58', '#127a2a');
      break;
    }
    case 'plus':
      plus(c, 0, 0, r, '#ffffff', '#3a1a78');
      break;
    case 'minus':
      c.strokeStyle = '#3a1a78';
      c.lineWidth = r * 0.6;
      c.beginPath();
      c.moveTo(-r * 0.6, 0);
      c.lineTo(r * 0.6, 0);
      c.stroke();
      c.strokeStyle = '#fff';
      c.lineWidth = r * 0.32;
      c.stroke();
      break;
    case 'fit':
      c.strokeStyle = '#fff';
      c.lineWidth = r * 0.18;
      for (let i = 0; i < 4; i++) {
        c.save();
        c.rotate((i * Math.PI) / 2);
        c.beginPath();
        c.moveTo(-r * 0.7, -r * 0.25);
        c.lineTo(-r * 0.7, -r * 0.7);
        c.lineTo(-r * 0.25, -r * 0.7);
        c.stroke();
        c.restore();
      }
      break;
    case 'retry': {
      c.strokeStyle = '#a3420a';
      c.lineWidth = r * 0.48;
      c.beginPath();
      c.arc(0, 0, r * 0.55, -Math.PI * 0.35, Math.PI * 1.45);
      c.stroke();
      c.strokeStyle = '#ffa33a';
      c.lineWidth = r * 0.28;
      c.stroke();
      c.fillStyle = '#ffa33a';
      c.strokeStyle = '#a3420a';
      c.lineWidth = r * 0.1;
      c.beginPath();
      c.moveTo(r * 0.15, -r * 0.95);
      c.lineTo(r * 0.75, -r * 0.55);
      c.lineTo(r * 0.12, -r * 0.18);
      c.closePath();
      c.fill();
      c.stroke();
      break;
    }
    case 'menu': {
      c.fillStyle = '#ffffff';
      c.strokeStyle = 'rgba(40,30,110,0.55)';
      c.lineWidth = r * 0.1;
      c.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const rad = i % 2 === 0 ? r * 0.78 : r * 0.58;
        c.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = '#5a3fb0';
      c.beginPath();
      c.arc(0, 0, r * 0.25, 0, Math.PI * 2);
      c.fill();
      break;
    }
    case 'close':
      c.strokeStyle = '#ffffff';
      c.lineWidth = r * 0.3;
      c.beginPath();
      c.moveTo(-r * 0.4, -r * 0.4);
      c.lineTo(r * 0.4, r * 0.4);
      c.moveTo(r * 0.4, -r * 0.4);
      c.lineTo(-r * 0.4, r * 0.4);
      c.stroke();
      break;
    case 'sound':
    case 'mute': {
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.moveTo(-r * 0.7, -r * 0.25);
      c.lineTo(-r * 0.35, -r * 0.25);
      c.lineTo(r * 0.05, -r * 0.6);
      c.lineTo(r * 0.05, r * 0.6);
      c.lineTo(-r * 0.35, r * 0.25);
      c.lineTo(-r * 0.7, r * 0.25);
      c.closePath();
      c.fill();
      c.strokeStyle = '#ffffff';
      c.lineWidth = r * 0.14;
      if (name === 'sound') {
        c.beginPath();
        c.arc(r * 0.1, 0, r * 0.4, -0.8, 0.8);
        c.stroke();
        c.beginPath();
        c.arc(r * 0.1, 0, r * 0.68, -0.8, 0.8);
        c.stroke();
      } else {
        c.beginPath();
        c.moveTo(r * 0.3, -r * 0.3);
        c.lineTo(r * 0.8, r * 0.3);
        c.moveTo(r * 0.8, -r * 0.3);
        c.lineTo(r * 0.3, r * 0.3);
        c.stroke();
      }
      break;
    }
    case 'home':
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.moveTo(0, -r * 0.7);
      c.lineTo(r * 0.75, 0);
      c.lineTo(r * 0.5, 0);
      c.lineTo(r * 0.5, r * 0.6);
      c.lineTo(-r * 0.5, r * 0.6);
      c.lineTo(-r * 0.5, 0);
      c.lineTo(-r * 0.75, 0);
      c.closePath();
      c.fill();
      break;
    case 'play':
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.moveTo(-r * 0.35, -r * 0.55);
      c.lineTo(r * 0.6, 0);
      c.lineTo(-r * 0.35, r * 0.55);
      c.closePath();
      c.fill();
      break;
  }
  c.restore();
}

function plus(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, edge: string): void {
  c.save();
  c.lineCap = 'round';
  c.strokeStyle = edge;
  c.lineWidth = r * 0.62;
  c.beginPath();
  c.moveTo(x - r * 0.6, y);
  c.lineTo(x + r * 0.6, y);
  c.moveTo(x, y - r * 0.6);
  c.lineTo(x, y + r * 0.6);
  c.stroke();
  c.strokeStyle = color;
  c.lineWidth = r * 0.4;
  c.stroke();
  c.restore();
}

/** A round 3D booster button: glossy purple body, thin warm rim, darker inner disc. */
export function roundButton(c: CanvasRenderingContext2D, x: number, y: number, r: number, face: string, pressed: boolean, dim = false): void {
  const oy = pressed ? r * 0.06 : 0;
  if (dim) face = '#7d7b8f';
  c.save();
  c.fillStyle = 'rgba(60,40,140,0.3)';
  c.beginPath();
  c.ellipse(x, y + r * 0.98, r * 0.92, r * 0.24, 0, 0, Math.PI * 2);
  c.fill();
  // body side
  c.fillStyle = mix(face, '#000000', 0.45);
  c.beginPath();
  c.arc(x, y + r * 0.1, r, 0, Math.PI * 2);
  c.fill();
  // thin warm rim
  const rim = c.createLinearGradient(0, y - r, 0, y + r);
  rim.addColorStop(0, dim ? '#d6d5de' : '#ffe08a');
  rim.addColorStop(1, dim ? '#9a99a8' : '#f2913f');
  c.fillStyle = rim;
  c.beginPath();
  c.arc(x, y + oy, r, 0, Math.PI * 2);
  c.fill();
  // glossy outer body
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.45 + oy, r * 0.1, x, y + oy, r);
  g.addColorStop(0, mix(face, '#ffffff', 0.4));
  g.addColorStop(1, face);
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y + oy, r * 0.88, 0, Math.PI * 2);
  c.fill();
  // darker inner region
  const ig = c.createRadialGradient(x, y + oy + r * 0.15, r * 0.1, x, y + oy, r * 0.72);
  ig.addColorStop(0, mix(face, '#000000', pressed ? 0.3 : 0.12));
  ig.addColorStop(1, mix(face, '#000000', pressed ? 0.42 : 0.25));
  c.fillStyle = ig;
  c.beginPath();
  c.arc(x, y + oy, r * 0.7, 0, Math.PI * 2);
  c.fill();
  // upper gloss
  c.fillStyle = 'rgba(255,255,255,0.28)';
  c.beginPath();
  c.ellipse(x - r * 0.08, y - r * 0.55 + oy, r * 0.5, r * 0.18, -0.15, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

export function badge(c: CanvasRenderingContext2D, x: number, y: number, r: number, text: string, color = '#ff3b4e'): void {
  c.save();
  c.fillStyle = 'rgba(80,0,30,0.3)';
  c.beginPath();
  c.arc(x + r * 0.05, y + r * 0.14, r * 1.05, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = mix(color, '#000000', 0.35);
  c.beginPath();
  c.arc(x, y, r * 1.02, 0, Math.PI * 2);
  c.fill();
  const g = c.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, mix(color, '#ffffff', 0.35));
  g.addColorStop(1, color);
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r * 0.92, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = 'rgba(255,255,255,0.35)';
  c.beginPath();
  c.ellipse(x - r * 0.15, y - r * 0.5, r * 0.45, r * 0.2, -0.2, 0, Math.PI * 2);
  c.fill();
  c.restore();
  c.font = font(r * 1.3);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = 'rgba(90,0,30,0.45)';
  c.fillText(text, x, y + r * 0.14);
  c.fillStyle = '#ffffff';
  c.fillText(text, x, y + r * 0.06);
}

// ---- rubber rings ----------------------------------------------------------------

/**
 * A chunky rubber ring seen from above (torus): soft drop shadow, dark rim, glossy
 * body, a light band on the upper-left, an inner shadow and a crisp specular.
 * `r` is the outer radius.
 */
export function ring(c: CanvasRenderingContext2D, x: number, y: number, r: number, base: string, dark: string, light: string, alpha = 1): void {
  const T = r * 0.46; // tube thickness
  const rc = r - T / 2; // centre line of the tube
  c.save();
  c.globalAlpha = alpha;
  c.lineCap = 'round';
  // drop shadow
  c.strokeStyle = 'rgba(30,10,60,0.32)';
  c.lineWidth = T;
  c.beginPath();
  c.arc(x + r * 0.05, y + r * 0.14, rc, 0, Math.PI * 2);
  c.stroke();
  // rim + body
  c.strokeStyle = mix(dark, '#000000', 0.15);
  c.lineWidth = T;
  c.beginPath();
  c.arc(x, y, rc, 0, Math.PI * 2);
  c.stroke();
  c.strokeStyle = base;
  c.lineWidth = T * 0.78;
  c.stroke();
  // inner shadow on the lower inside of the torus
  c.strokeStyle = mix(dark, base, 0.25);
  c.lineWidth = T * 0.3;
  c.beginPath();
  c.arc(x, y, rc - T * 0.2, Math.PI * 0.1, Math.PI * 0.9);
  c.stroke();
  // light band (upper-left) and lower-right bounce light
  c.strokeStyle = mix(base, light, 0.65);
  c.lineWidth = T * 0.38;
  c.beginPath();
  c.arc(x - T * 0.05, y - T * 0.08, rc, Math.PI * 0.95, Math.PI * 1.75);
  c.stroke();
  c.strokeStyle = mix(base, light, 0.3);
  c.lineWidth = T * 0.2;
  c.beginPath();
  c.arc(x + T * 0.05, y + T * 0.08, rc + T * 0.12, Math.PI * 0.15, Math.PI * 0.55);
  c.stroke();
  // specular
  c.strokeStyle = 'rgba(255,255,255,0.92)';
  c.lineWidth = T * 0.14;
  c.beginPath();
  c.arc(x - T * 0.1, y - T * 0.14, rc + T * 0.04, Math.PI * 1.12, Math.PI * 1.5);
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.9)';
  c.beginPath();
  c.arc(x - rc * 0.42, y - rc * 0.82, T * 0.1, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

// ---- pegs ----------------------------------------------------------------

/** World-unit sizes shared by the board renderer and the game. */
export const PEG_R = 0.17;
export const PEG_H = 0.33;
/** Bands sit this far above the board (world units). */
export const LIFT = 0.13;
/** Rubber cord diameter (world units) — a thin round cord, not a flat strap. */
export const BAND_W = 0.22;
/** Radius at which a cord wraps a peg (shaft radius + half the cord). */
export const WRAP_R = 0.245;

export interface PegSprites {
  full: HTMLCanvasElement;
  cap: HTMLCanvasElement;
  /** Pixel offset from the sprite's top-left to the peg's base centre. */
  ax: number;
  ay: number;
  k: number;
}

/** Where the painted peg art sits in its PNG: cap spans x 10..75, base centre at (42.5, 100). */
const PEG_ART = { capW: 65, cx: 42.5, base: 100 };

export function makePegSprites(k: number, scale = 1, art?: HTMLImageElement): PegSprites {
  if (art && art.complete && art.naturalWidth > 0) return pegSpritesFromArt(k, scale, art);
  const pr = PEG_R * k * scale;
  const ph = PEG_H * k * scale;
  const w = Math.ceil(pr * 2.6 + 4);
  const h = Math.ceil(ph + pr * 1.8 + 6);
  const ax = w / 2;
  const ay = Math.ceil(ph + pr * 0.7 + 2);
  const draw = (c: CanvasRenderingContext2D, capOnly: boolean) => {
    c.save();
    if (capOnly) {
      c.beginPath();
      c.rect(0, 0, w, ay - LIFT * k * scale);
      c.clip();
    } else {
      // contact shadow
      c.fillStyle = 'rgba(120,70,30,0.3)';
      c.beginPath();
      c.ellipse(ax + pr * 0.25, ay + pr * 0.1, pr * 1.15, pr * 0.55, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = 'rgba(110,60,20,0.22)';
      c.beginPath();
      c.ellipse(ax, ay, pr * 0.95, pr * 0.42, 0, 0, Math.PI * 2);
      c.fill();
    }
    const br = pr * 0.8;
    const g = c.createLinearGradient(ax - br, 0, ax + br, 0);
    g.addColorStop(0, '#a9adc4');
    g.addColorStop(0.32, '#ffffff');
    g.addColorStop(0.62, '#e2e4ef');
    g.addColorStop(1, '#9196b2');
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(ax, ay, br, br * 0.45, 0, 0, Math.PI);
    c.lineTo(ax - br, ay - ph);
    c.lineTo(ax + br, ay - ph);
    c.closePath();
    c.fill();
    // head: a rounded cap a bit wider than the shaft
    const hy = ay - ph;
    const hg = c.createLinearGradient(ax - pr, 0, ax + pr, 0);
    hg.addColorStop(0, '#b3b7cc');
    hg.addColorStop(0.35, '#ffffff');
    hg.addColorStop(1, '#9a9fba');
    c.fillStyle = hg;
    c.beginPath();
    c.ellipse(ax, hy + pr * 0.22, pr, pr * 0.62, 0, 0, Math.PI);
    c.lineTo(ax - pr, hy);
    c.ellipse(ax, hy, pr, pr * 0.62, 0, Math.PI, Math.PI * 2);
    c.closePath();
    c.fill();
    const tg = c.createRadialGradient(ax - pr * 0.35, hy - pr * 0.25, pr * 0.05, ax, hy, pr);
    tg.addColorStop(0, '#ffffff');
    tg.addColorStop(0.7, '#f3f4fa');
    tg.addColorStop(1, '#d4d7e6');
    c.fillStyle = tg;
    c.beginPath();
    c.ellipse(ax, hy, pr * 0.96, pr * 0.6, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  };
  const [full, fc] = makeCanvas(w, h);
  draw(fc, false);
  const [cap, cc] = makeCanvas(w, h);
  draw(cc, true);
  return { full, cap, ax, ay, k };
}

/** Peg sprites cut from the reference art: the cap width matches the peg radius. */
function pegSpritesFromArt(k: number, scale: number, art: HTMLImageElement): PegSprites {
  const pr = PEG_R * k * scale;
  const f = (pr * 2) / PEG_ART.capW;
  const iw = art.naturalWidth * f, ih = art.naturalHeight * f;
  const pad = Math.ceil(pr * 0.6) + 2;
  const w = Math.ceil(iw + pad * 2), h = Math.ceil(ih + pad * 2);
  const ax = pad + PEG_ART.cx * f, ay = pad + PEG_ART.base * f;
  const draw = (c: CanvasRenderingContext2D, capOnly: boolean) => {
    c.save();
    if (capOnly) {
      c.beginPath();
      c.rect(0, 0, w, ay - LIFT * k * scale);
      c.clip();
    } else {
      // soft contact shadow on the board (AO + cast towards lower right)
      c.fillStyle = 'rgba(132,76,32,0.32)';
      c.beginPath();
      c.ellipse(ax + pr * 0.18, ay + pr * 0.05, pr * 1.08, pr * 0.42, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = 'rgba(110,60,20,0.28)';
      c.beginPath();
      c.ellipse(ax, ay - pr * 0.02, pr * 0.9, pr * 0.32, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.imageSmoothingQuality = 'high';
    c.drawImage(art, pad, pad, iw, ih);
    c.restore();
  };
  const [full, fc] = makeCanvas(w, h);
  draw(fc, false);
  const [cap, cc] = makeCanvas(w, h);
  draw(cc, true);
  return { full, cap, ax, ay, k };
}

// ---- backdrop ----------------------------------------------------------------

/** Pastel baby-blue → lavender backdrop with soft out-of-focus blobs at the edges
 *  and a faint glow where the board sits. No scenery, no UI (painted once). */
export function paintBackdrop(c: CanvasRenderingContext2D, w: number, h: number, glowY: number): void {
  let g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#9CB9FF');
  g.addColorStop(0.5, '#A8B6F7');
  g.addColorStop(1, '#BDB4F5');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  // gentle blue-violet light variation
  g = c.createRadialGradient(w * 0.2, h * 0.08, 0, w * 0.2, h * 0.08, h * 0.5);
  g.addColorStop(0, 'rgba(200,220,255,0.45)');
  g.addColorStop(1, 'rgba(200,220,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  g = c.createRadialGradient(w * 0.85, h * 0.9, 0, w * 0.85, h * 0.9, h * 0.45);
  g.addColorStop(0, 'rgba(170,140,240,0.35)');
  g.addColorStop(1, 'rgba(170,140,240,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  // soft glow behind the board
  g = c.createRadialGradient(w / 2, glowY, 0, w / 2, glowY, w * 0.7);
  g.addColorStop(0, 'rgba(255,255,255,0.32)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  // faint blurry pastel spheres near the edges
  const blob = (x: number, y: number, r: number, col: string) => {
    const bg = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r);
    bg.addColorStop(0, `rgba(${col},0.55)`);
    bg.addColorStop(0.55, `rgba(${col},0.32)`);
    bg.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = bg;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  };
  blob(w * 1.02, h * 0.27, w * 0.2, '232,196,236');
  blob(-w * 0.02, h * 0.38, w * 0.17, '214,190,240');
  blob(w * 1.0, h * 0.37, w * 0.09, '240,200,230');
  blob(-w * 0.04, h * 0.7, w * 0.12, '190,200,250');
  blob(w * 1.04, h * 0.62, w * 0.14, '200,186,246');
  blob(w * 0.08, h * 0.08, w * 0.08, '206,220,255');
}

// ---- HUD components ----------------------------------------------------------------

/** Wide soft-3D blue HUD shell (light blue, translucent highlight, no gold). */
export function hudPanel(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.save();
  c.fillStyle = 'rgba(40,60,160,0.22)';
  rr(c, x, y + h * 0.1, w, h, r);
  c.fill();
  c.fillStyle = '#5c8ff2';
  rr(c, x, y + h * 0.045, w, h, r);
  c.fill();
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#b9d6ff');
  g.addColorStop(0.5, '#8fbaff');
  g.addColorStop(1, '#78a6fb');
  c.fillStyle = g;
  rr(c, x, y, w, h, r);
  c.fill();
  // translucent top highlight
  c.fillStyle = 'rgba(255,255,255,0.35)';
  rr(c, x + r * 0.5, y + h * 0.06, w - r, h * 0.22, h * 0.11);
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.55)';
  c.lineWidth = Math.max(1.5, h * 0.025);
  rr(c, x + 1, y + 1, w - 2, h - 2, r);
  c.stroke();
  c.restore();
}

/** Inset information cell (saturated blue, thin light rim on the upper edge). */
export function hudCell(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.save();
  c.fillStyle = 'rgba(20,50,150,0.35)';
  rr(c, x, y - h * 0.04, w, h, r);
  c.fill();
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#2462ED');
  g.addColorStop(1, '#2488F4');
  c.fillStyle = g;
  rr(c, x, y, w, h, r);
  c.fill();
  c.strokeStyle = 'rgba(190,225,255,0.85)';
  c.lineWidth = Math.max(1.2, h * 0.04);
  c.beginPath();
  c.moveTo(x + r, y + h * 0.04 + 0.5);
  c.lineTo(x + w - r, y + h * 0.04 + 0.5);
  c.stroke();
  c.strokeStyle = 'rgba(160,205,255,0.5)';
  c.lineWidth = 1;
  rr(c, x + 0.5, y + 0.5, w - 1, h - 1, r);
  c.stroke();
  c.restore();
}

/** Glossy bright-blue pill tab that floats above the HUD. */
export function pillTab(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, top = '#5aa8ff', bottom = '#2462ED'): void {
  c.save();
  c.fillStyle = 'rgba(20,50,150,0.3)';
  rr(c, x, y + h * 0.14, w, h, h / 2);
  c.fill();
  c.fillStyle = mix(bottom, '#000000', 0.25);
  rr(c, x, y + h * 0.08, w, h, h / 2);
  c.fill();
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  c.fillStyle = g;
  rr(c, x, y, w, h, h / 2);
  c.fill();
  c.fillStyle = 'rgba(255,255,255,0.38)';
  rr(c, x + h * 0.35, y + h * 0.1, w - h * 0.7, h * 0.3, h * 0.15);
  c.fill();
  c.strokeStyle = 'rgba(210,235,255,0.8)';
  c.lineWidth = Math.max(1.2, h * 0.05);
  rr(c, x + 0.5, y + 0.5, w - 1, h - 1, h / 2);
  c.stroke();
  c.restore();
}

/** White bold text with a small soft dark-blue drop shadow (HUD style). */
export function hudText(c: CanvasRenderingContext2D, s: string, x: number, y: number, size: number): void {
  c.font = font(size);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = 'rgba(16,40,130,0.55)';
  c.fillText(s, x, y + size * 0.08);
  c.lineJoin = 'round';
  c.strokeStyle = 'rgba(20,60,170,0.6)';
  c.lineWidth = Math.max(1.5, size * 0.12);
  c.strokeText(s, x, y);
  c.fillStyle = '#ffffff';
  c.fillText(s, x, y);
}

/** Round glossy blue gear button (settings). */
export function gearButton(c: CanvasRenderingContext2D, x: number, y: number, r: number, pressed: boolean): void {
  const oy = pressed ? r * 0.08 : 0;
  c.save();
  c.fillStyle = 'rgba(30,50,150,0.3)';
  c.beginPath();
  c.ellipse(x, y + r * 0.95, r * 0.9, r * 0.25, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#1a4fc8';
  c.beginPath();
  c.arc(x, y + r * 0.1, r, 0, Math.PI * 2);
  c.fill();
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.45 + oy, r * 0.1, x, y + oy, r);
  g.addColorStop(0, '#7cc0ff');
  g.addColorStop(1, '#2462ED');
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y + oy, r, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(210,235,255,0.85)';
  c.lineWidth = Math.max(1.5, r * 0.08);
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.3)';
  c.beginPath();
  c.ellipse(x - r * 0.1, y - r * 0.5 + oy, r * 0.5, r * 0.22, -0.2, 0, Math.PI * 2);
  c.fill();
  c.restore();
  icon(c, 'menu', x, y + oy, r * 0.62);
}

export type SlotState = 'empty' | 'occupied' | 'selected' | 'disabled';

/** Holder slot: glossy purple button with a golden-orange rim; disabled shows a pink X. */
export function holderSlot(c: CanvasRenderingContext2D, x: number, y: number, r: number, state: SlotState, pulse = 0): void {
  const disabled = state === 'disabled';
  c.save();
  c.fillStyle = 'rgba(60,40,140,0.28)';
  c.beginPath();
  c.ellipse(x, y + r * 0.98, r * 0.95, r * 0.26, 0, 0, Math.PI * 2);
  c.fill();
  if (state === 'selected') {
    c.fillStyle = `rgba(255,255,255,${0.35 + 0.3 * pulse})`;
    c.beginPath();
    c.arc(x, y, r * 1.45, 0, Math.PI * 2);
    c.fill();
  }
  const rim = c.createLinearGradient(0, y - r, 0, y + r);
  rim.addColorStop(0, '#ffe08a');
  rim.addColorStop(1, '#e8903a');
  c.fillStyle = rim;
  c.beginPath();
  c.arc(x, y, r * 1.12, 0, Math.PI * 2);
  c.fill();
  const g = c.createRadialGradient(x - r * 0.3, y - r * 0.45, r * 0.05, x, y, r);
  g.addColorStop(0, disabled ? '#8a5ad8' : '#5a2ab0');
  g.addColorStop(1, disabled ? '#5e2fb0' : '#3a1784');
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
  // soft inner shadow + gloss
  c.strokeStyle = 'rgba(20,0,60,0.35)';
  c.lineWidth = r * 0.14;
  c.beginPath();
  c.arc(x, y + r * 0.05, r * 0.9, Math.PI * 1.1, Math.PI * 1.9);
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.16)';
  c.beginPath();
  c.ellipse(x - r * 0.2, y - r * 0.45, r * 0.45, r * 0.18, -0.3, 0, Math.PI * 2);
  c.fill();
  if (disabled) {
    c.strokeStyle = '#ff5e9a';
    c.lineWidth = Math.max(1.5, r * 0.14);
    c.lineCap = 'round';
    c.beginPath();
    c.arc(x, y, r * 0.62, 0, Math.PI * 2);
    c.moveTo(x - r * 0.3, y - r * 0.3);
    c.lineTo(x + r * 0.3, y + r * 0.3);
    c.moveTo(x + r * 0.3, y - r * 0.3);
    c.lineTo(x - r * 0.3, y + r * 0.3);
    c.stroke();
  }
  c.restore();
}

/** Colour collection tray: raised glossy rim, recessed floor, three donut-shaped wells. */
export function trayAsset(
  c: CanvasRenderingContext2D, x: number, y: number, W: number, H: number,
  col: { base: string; dark: string; light: string }, filled: number, ringR: number,
): void {
  const r = H * 0.3, d = H * 0.16;
  c.save();
  // soft shadow beneath
  c.fillStyle = 'rgba(60,40,150,0.22)';
  rr(c, x - W / 2 + W * 0.03, y - H / 2 + d + H * 0.14, W * 0.97, H, r);
  c.fill();
  // molded thickness
  c.fillStyle = mix(col.dark, '#000000', 0.08);
  rr(c, x - W / 2, y - H / 2 + d, W, H, r);
  c.fill();
  // top surface
  const g = c.createLinearGradient(0, y - H / 2, 0, y + H / 2);
  g.addColorStop(0, mix(col.light, col.base, 0.3));
  g.addColorStop(0.4, col.base);
  g.addColorStop(1, mix(col.base, col.dark, 0.3));
  c.fillStyle = g;
  rr(c, x - W / 2, y - H / 2, W, H, r);
  c.fill();
  // upper-edge highlight
  c.strokeStyle = 'rgba(255,255,255,0.55)';
  c.lineWidth = Math.max(1.2, H * 0.035);
  c.beginPath();
  c.moveTo(x - W / 2 + r, y - H / 2 + H * 0.05);
  c.lineTo(x + W / 2 - r, y - H / 2 + H * 0.05);
  c.stroke();
  // recessed floor with an inner shadow along its top edge
  const ins = H * 0.15;
  const fx = x - W / 2 + ins, fy = y - H / 2 + ins, fw = W - ins * 2, fh = H - ins * 2;
  const fg = c.createLinearGradient(0, fy, 0, fy + fh);
  fg.addColorStop(0, mix(col.dark, '#000000', 0.15));
  fg.addColorStop(0.35, mix(col.dark, col.base, 0.25));
  fg.addColorStop(1, mix(col.dark, col.base, 0.45));
  c.fillStyle = fg;
  rr(c, fx, fy, fw, fh, r * 0.65);
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.3)';
  c.lineWidth = Math.max(1, H * 0.025);
  c.beginPath();
  c.moveTo(fx + r * 0.6, fy + fh - 0.5);
  c.lineTo(fx + fw - r * 0.6, fy + fh - 0.5);
  c.stroke();
  for (let i = 0; i < 3; i++) {
    const sx = x + (i - 1) * W * 0.28;
    // donut well
    c.fillStyle = mix(col.dark, '#000000', 0.3);
    c.beginPath();
    c.arc(sx, y, ringR * 1.05, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = mix(col.dark, col.base, 0.35);
    c.lineWidth = ringR * 0.36;
    c.beginPath();
    c.arc(sx, y + ringR * 0.04, ringR * 0.62, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = mix(col.dark, '#000000', 0.35);
    c.beginPath();
    c.arc(sx, y, ringR * 0.3, 0, Math.PI * 2);
    c.fill();
    if (i < filled) ring(c, sx, y, ringR, col.base, col.dark, '#ffffff');
  }
  c.restore();
}

type Tint = { base: string; dark: string; light: string };
const PINK: Tint = { base: '#f75d89', dark: '#b81a4a', light: '#ff9dbb' };

/** Glossy plastic padlock hanging from (x, y), in the colour of the band it locks. `open` 0..1 lifts the shackle. */
export function padlock(c: CanvasRenderingContext2D, x: number, y: number, size: number, open: number, col: Tint = PINK): void {
  const bw = size, bh = size * 0.82;
  const by = y + size * 0.42;
  c.save();
  // shackle
  const sr = size * 0.27;
  const lift = open * size * 0.28;
  c.lineCap = 'round';
  c.strokeStyle = '#8f93ad';
  c.lineWidth = size * 0.17;
  c.beginPath();
  c.moveTo(x - sr, by + size * 0.05 - lift);
  c.arc(x, by - size * 0.12 - lift, sr, Math.PI, 0);
  c.lineTo(x + sr, by + size * 0.05 - (open > 0 ? lift * 1.6 : 0));
  c.stroke();
  c.strokeStyle = '#f4f5fb';
  c.lineWidth = size * 0.11;
  c.stroke();
  // contact shadow
  c.fillStyle = 'rgba(110,30,60,0.25)';
  c.beginPath();
  c.ellipse(x + size * 0.05, by + bh + size * 0.06, bw * 0.45, size * 0.1, 0, 0, Math.PI * 2);
  c.fill();
  // body: greyscale Gemini art recoloured to the band's colour (sockets on top, keyhole baked in)
  const body = art('lock_body');
  if (body) {
    const ih = bw * (body.naturalHeight / body.naturalWidth);
    c.drawImage(tintedBright(body, col.base), x - bw / 2, by + bh + size * 0.04 - ih, bw, ih);
    c.restore();
    return;
  }
  c.fillStyle = col.dark;
  rr(c, x - bw / 2, by + size * 0.07, bw, bh, size * 0.24);
  c.fill();
  const g = c.createLinearGradient(x - bw / 2, by, x + bw / 2, by + bh);
  g.addColorStop(0, col.light);
  g.addColorStop(0.45, col.base);
  g.addColorStop(1, mix(col.base, col.dark, 0.35));
  c.fillStyle = g;
  rr(c, x - bw / 2, by, bw, bh, size * 0.24);
  c.fill();
  c.fillStyle = 'rgba(255,255,255,0.45)';
  rr(c, x - bw * 0.36, by + bh * 0.08, bw * 0.4, bh * 0.16, bh * 0.08);
  c.fill();
  // keyhole
  c.fillStyle = '#3a1a6a';
  c.beginPath();
  c.arc(x, by + bh * 0.45, size * 0.1, 0, Math.PI * 2);
  c.fill();
  rr(c, x - size * 0.045, by + bh * 0.45, size * 0.09, bh * 0.28, size * 0.04);
  c.fill();
  c.restore();
}

/** Pink plastic key hanging from (x, y), tilted by `angle`. */
export function keyAsset(c: CanvasRenderingContext2D, x: number, y: number, size: number, angle: number, col: Tint = PINK): void {
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  const hr = size * 0.3;
  // loop to the band
  c.strokeStyle = '#d9dbe8';
  c.lineWidth = size * 0.07;
  c.beginPath();
  c.arc(0, size * 0.08, size * 0.09, 0, Math.PI * 2);
  c.stroke();
  // greyscale Gemini art recoloured to the band's colour; its bow is as wide as the art
  const key = art('key_grey');
  if (key) {
    const kw = hr * 2, kh = kw * (key.naturalHeight / key.naturalWidth);
    c.drawImage(tintedBright(key, col.base), -kw / 2, size * 0.17, kw, kh);
    c.restore();
    return;
  }
  const draw = (fill: string | CanvasGradient, dy: number) => {
    c.fillStyle = fill;
    c.beginPath();
    c.arc(0, size * 0.17 + hr + dy, hr, 0, Math.PI * 2);
    c.fill();
    rr(c, -size * 0.085, size * 0.17 + hr * 1.6 + dy, size * 0.17, size * 0.75, size * 0.07);
    c.fill();
    rr(c, 0, size * 0.17 + hr * 1.6 + size * 0.45 + dy, size * 0.22, size * 0.11, size * 0.04);
    c.fill();
    rr(c, 0, size * 0.17 + hr * 1.6 + size * 0.62 + dy, size * 0.17, size * 0.1, size * 0.04);
    c.fill();
  };
  draw(col.dark, size * 0.05);
  const g = c.createLinearGradient(-hr, 0, hr, size * 1.2);
  g.addColorStop(0, col.light);
  g.addColorStop(1, mix(col.base, col.dark, 0.3));
  draw(g, 0);
  // hole in the head + gloss
  c.fillStyle = mix(col.base, col.dark, 0.55);
  c.beginPath();
  c.arc(0, size * 0.17 + hr, hr * 0.38, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = 'rgba(255,255,255,0.5)';
  c.beginPath();
  c.ellipse(-hr * 0.4, size * 0.17 + hr * 0.55, hr * 0.32, hr * 0.14, -0.6, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

// ---- tray, holder slot and donut ring (near-frontal view, as in the reference) --------------

type Col = { base: string; dark: string; light: string };

/** Geometry of a tray centred on (x, y), W × H on screen. */
export function trayGeom(x: number, y: number, W: number, H: number) {
  const front = H * 0.22; // visible front wall under the top face
  const Ht = H - front;
  const x0 = x - W / 2, y0 = y - H / 2;
  const ix = W * 0.05, top = Ht * 0.12, bottom = Ht * 0.2; // the near rim is wider than the far one
  const cx0 = x0 + ix, cy0 = y0 + top, cw = W - ix * 2, ch = Ht - top - bottom;
  return { x0, y0, front, Ht, r: Ht * 0.26, cx0, cy0, cw, ch, cr: ch * 0.22, midY: cy0 + ch / 2, cy1: cy0 + ch };
}

/** Tray: front wall, top rim, recessed cavity with an inner shadow, engraved empty wells. */
export function trayBack(
  c: CanvasRenderingContext2D, x: number, y: number, W: number, H: number, col: Col, wells: number[], ringR: number, filled: number,
  cavity = mix(col.base, col.dark, 0.32),
): void {
  const g = trayGeom(x, y, W, H);
  const outline = mix(col.dark, '#000000', 0.45);
  const lw = Math.max(1.2, H * 0.025);
  c.save();
  // one soft, continuous shadow under the tray
  c.save();
  c.shadowColor = 'rgba(50,25,120,0.38)';
  c.shadowBlur = H * 0.22;
  c.shadowOffsetY = H * 0.1;
  c.fillStyle = 'rgba(50,25,120,0.2)';
  rr(c, g.x0 + W * 0.02, g.y0 + g.front * 0.6, W - W * 0.04, g.Ht, g.r);
  c.fill();
  c.restore();
  trayWall(c, g, W, H, col, outline, lw);
  // top rim
  const tg = c.createLinearGradient(0, g.y0, 0, g.y0 + g.Ht);
  tg.addColorStop(0, mix(col.light, col.base, 0.45));
  tg.addColorStop(1, col.base);
  c.fillStyle = tg;
  rr(c, g.x0, g.y0, W, g.Ht, g.r);
  c.fill();
  c.stroke();
  // recessed cavity
  c.fillStyle = cavity;
  rr(c, g.cx0, g.cy0, g.cw, g.ch, g.cr);
  c.fill();
  c.save();
  rr(c, g.cx0, g.cy0, g.cw, g.ch, g.cr);
  c.clip();
  // inner shadow from the top-left rim
  c.strokeStyle = mix(col.dark, '#000000', 0.25);
  c.globalAlpha = 0.55;
  c.lineWidth = g.ch * 0.16;
  rr(c, g.cx0 + g.ch * 0.04, g.cy0 + g.ch * 0.05, g.cw, g.ch, g.cr);
  c.stroke();
  c.restore();
  // empty wells: a thin, pale grey groove pressed into the tray — dark crease on the
  // upper-left inner edge, light catch on the lower-right, so it reads as sunk in
  for (let i = filled; i < wells.length; i++) {
    const wx = x + wells[i] * W, wy = g.midY + ringR * 0.18;
    const rc = ringR * 0.64, gw = ringR * 0.16;
    c.strokeStyle = mix(col.base, '#c9c7d4', 0.55);
    c.lineWidth = gw;
    c.beginPath();
    c.arc(wx, wy, rc, 0, Math.PI * 2);
    c.stroke();
    c.lineWidth = Math.max(1, gw * 0.4);
    c.strokeStyle = 'rgba(30,15,50,0.38)';
    c.beginPath();
    c.arc(wx + gw * 0.12, wy + gw * 0.12, rc - gw * 0.42, Math.PI * 0.95, Math.PI * 1.9);
    c.stroke();
    c.beginPath();
    c.arc(wx - gw * 0.12, wy - gw * 0.12, rc + gw * 0.42, Math.PI * 0.95, Math.PI * 1.9);
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.5)';
    c.beginPath();
    c.arc(wx - gw * 0.1, wy - gw * 0.1, rc - gw * 0.42, Math.PI * 0.05, Math.PI * 0.85);
    c.stroke();
    c.beginPath();
    c.arc(wx + gw * 0.1, wy + gw * 0.1, rc + gw * 0.42, Math.PI * 0.05, Math.PI * 0.85);
    c.stroke();
  }
  c.restore();
}

function trayWall(c: CanvasRenderingContext2D, g: ReturnType<typeof trayGeom>, W: number, H: number, col: Col, outline: string, lw: number): void {
  const wg = c.createLinearGradient(0, g.y0 + g.Ht * 0.6, 0, g.y0 + H);
  wg.addColorStop(0, mix(col.base, col.dark, 0.3));
  wg.addColorStop(0.55, mix(col.base, col.dark, 0.6));
  wg.addColorStop(1, mix(col.dark, '#000000', 0.2));
  c.fillStyle = wg;
  rr(c, g.x0, g.y0 + g.front, W, g.Ht, g.r);
  c.fill();
  c.strokeStyle = outline;
  c.lineWidth = lw;
  c.stroke();
}

/**
 * The tray's near rim and front wall drawn again over the donuts, so they sit
 * sunk in the cavity; plus the far rim's shadow falling on them.
 */
export function trayFront(c: CanvasRenderingContext2D, x: number, y: number, W: number, H: number, col: Col): void {
  const g = trayGeom(x, y, W, H);
  const outline = mix(col.dark, '#000000', 0.45);
  const lw = Math.max(1.2, H * 0.025);
  c.save();
  // shadow of the far rim on whatever lies in the cavity
  rr(c, g.cx0, g.cy0, g.cw, g.ch, g.cr);
  c.clip();
  const sg = c.createLinearGradient(0, g.cy0, 0, g.cy0 + g.ch * 0.45);
  sg.addColorStop(0, 'rgba(20,0,30,0.38)');
  sg.addColorStop(1, 'rgba(20,0,30,0)');
  c.fillStyle = sg;
  c.fillRect(g.cx0, g.cy0, g.cw, g.ch);
  c.restore();
  c.save();
  // near rim: everything below the cavity's lower edge, drawn over the donuts
  c.beginPath();
  c.rect(g.x0 - lw * 2, g.cy1, W + lw * 4, H);
  c.clip();
  trayWall(c, g, W, H, col, outline, lw);
  const tg = c.createLinearGradient(0, g.y0, 0, g.y0 + g.Ht);
  tg.addColorStop(0, mix(col.light, col.base, 0.45));
  tg.addColorStop(1, col.base);
  c.fillStyle = tg;
  rr(c, g.x0, g.y0, W, g.Ht, g.r);
  c.fill();
  c.strokeStyle = outline;
  c.lineWidth = lw;
  c.stroke();
  c.restore();
  // the cavity's near lip: a dark crease, then a lit bevel
  c.save();
  c.lineCap = 'round';
  c.strokeStyle = mix(col.dark, '#000000', 0.3);
  c.lineWidth = lw * 1.2;
  c.beginPath();
  c.moveTo(g.cx0 + g.cr * 0.6, g.cy1);
  c.lineTo(g.cx0 + g.cw - g.cr * 0.6, g.cy1);
  c.stroke();
  c.strokeStyle = mix(col.light, '#ffffff', 0.25);
  c.lineWidth = lw;
  c.beginPath();
  c.moveTo(g.cx0 + g.cr * 0.6, g.cy1 + lw * 1.2);
  c.lineTo(g.cx0 + g.cw - g.cr * 0.6, g.cy1 + lw * 1.2);
  c.stroke();
  // bevel highlight where the top face turns into the front wall
  c.strokeStyle = 'rgba(255,255,255,0.35)';
  c.lineWidth = lw;
  c.beginPath();
  c.moveTo(g.x0 + g.r, g.y0 + g.Ht - lw * 0.8);
  c.lineTo(g.x0 + W - g.r, g.y0 + g.Ht - lw * 0.8);
  c.stroke();
  c.restore();
}

/**
 * A chunky rubber donut (thick body, small hole) seen from the front, with a dark
 * crescent behind it on the left like the reference art. `r` is the outer radius.
 */
export function donut(c: CanvasRenderingContext2D, x: number, y: number, r: number, col: Col): void {
  // greyscale Gemini art recoloured to the band's colour (cached per colour)
  const ring = art('ring_grey');
  if (ring) {
    c.drawImage(tintedBright(ring, col.base), x - r, y - r, r * 2, r * 2);
    return;
  }
  const T = r * 0.66, rc = r - T / 2; // thick body, hole radius ≈ 0.34 r
  c.save();
  c.lineCap = 'round';
  // depth crescent behind (left)
  c.strokeStyle = mix(col.dark, '#000000', 0.45);
  c.lineWidth = T;
  c.beginPath();
  c.arc(x - r * 0.13, y + r * 0.03, rc, 0, Math.PI * 2);
  c.stroke();
  // body
  c.strokeStyle = mix(col.dark, '#000000', 0.1);
  c.lineWidth = T + r * 0.06;
  c.beginPath();
  c.arc(x, y, rc, 0, Math.PI * 2);
  c.stroke();
  c.strokeStyle = col.base;
  c.lineWidth = T * 0.9;
  c.stroke();
  // shade on the lower right, light on the upper left
  c.strokeStyle = mix(col.base, col.dark, 0.45);
  c.lineWidth = T * 0.38;
  c.beginPath();
  c.arc(x + T * 0.04, y + T * 0.05, rc + T * 0.18, Math.PI * 0.05, Math.PI * 0.75);
  c.stroke();
  c.strokeStyle = mix(col.base, col.light, 0.7);
  c.lineWidth = T * 0.34;
  c.beginPath();
  c.arc(x - T * 0.05, y - T * 0.06, rc, Math.PI * 1.0, Math.PI * 1.7);
  c.stroke();
  // hole
  c.fillStyle = mix(col.dark, '#000000', 0.35);
  c.beginPath();
  c.arc(x, y, rc - T * 0.47, 0, Math.PI * 2);
  c.fill();
  // specular
  c.fillStyle = 'rgba(255,255,255,0.9)';
  c.beginPath();
  c.ellipse(x - rc * 0.5, y - rc * 0.62, T * 0.16, T * 0.09, -0.6, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

/**
 * Holder slot: dark-purple disc with a gold rim; disabled shows a pink X. With bitmap
 * art (empty / locked) the art replaces the painted disc; shadow and glow stay painted.
 */
export function flatSlot(
  c: CanvasRenderingContext2D, x: number, y: number, r: number, state: SlotState, pulse = 0,
  art?: { empty: HTMLImageElement; locked: HTMLImageElement },
): void {
  c.save();
  c.fillStyle = 'rgba(40,20,110,0.28)';
  c.beginPath();
  c.arc(x + r * 0.04, y + r * 0.14, r * 1.12, 0, Math.PI * 2);
  c.fill();
  if (state === 'selected') {
    c.fillStyle = `rgba(255,255,255,${0.3 + 0.35 * pulse})`;
    c.beginPath();
    c.arc(x, y, r * 1.45, 0, Math.PI * 2);
    c.fill();
  }
  const img = art && (state === 'disabled' ? art.locked : art.empty);
  if (img && img.complete && img.naturalWidth > 0) {
    // the art's gold ring fills 235 of its 241 px half-width, matching the painted r × 1.14 rim
    const h = r * 1.17;
    c.drawImage(img, x - h, y - h, h * 2, h * 2);
    c.restore();
    return;
  }
  c.fillStyle = '#2a1060';
  c.beginPath();
  c.arc(x, y, r * 1.14, 0, Math.PI * 2);
  c.fill();
  const rg = c.createLinearGradient(0, y - r, 0, y + r);
  rg.addColorStop(0, '#ffe08a');
  rg.addColorStop(1, '#f0b23e');
  c.fillStyle = rg;
  c.beginPath();
  c.arc(x, y, r * 1.08, 0, Math.PI * 2);
  c.fill();
  const disabled = state === 'disabled';
  c.fillStyle = disabled ? '#5d2fae' : '#381782';
  c.beginPath();
  c.arc(x, y, r * 0.94, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(20,0,50,0.35)';
  c.lineWidth = r * 0.12;
  c.beginPath();
  c.arc(x + r * 0.03, y + r * 0.05, r * 0.86, Math.PI * 1.05, Math.PI * 1.85);
  c.stroke();
  if (disabled) {
    c.strokeStyle = '#ff5e9a';
    c.lineWidth = Math.max(1.5, r * 0.13);
    c.lineCap = 'round';
    c.beginPath();
    c.arc(x, y, r * 0.6, 0, Math.PI * 2);
    c.moveTo(x - r * 0.28, y - r * 0.28);
    c.lineTo(x + r * 0.28, y + r * 0.28);
    c.moveTo(x + r * 0.28, y - r * 0.28);
    c.lineTo(x - r * 0.28, y + r * 0.28);
    c.stroke();
  }
  c.restore();
}

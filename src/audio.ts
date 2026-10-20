// Tiny synthesized sound effects (WebAudio, no files — the build stays one file).

let ctx: AudioContext | null = null;
let enabled = (() => {
  try {
    return localStorage.getItem('untangle-ale-ela.sound') !== '0';
  } catch {
    return true;
  }
})();

export function soundOn(): boolean {
  return enabled;
}

export function setSound(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem('untangle-ale-ela.sound', on ? '1' : '0');
  } catch {
    // private mode
  }
}

/** Call from a user gesture: browsers only start audio after one. */
export function unlockAudio(): void {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  try {
    ctx = new AC();
  } catch {
    ctx = null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0, slideTo = 0): void {
  if (!enabled || !ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo > 0) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  pluck(): void {
    tone(520, 0.14, 'triangle', 0.25, 0, 900);
  },
  park(): void {
    tone(330, 0.12, 'triangle', 0.2, 0, 260);
  },
  blocked(): void {
    tone(140, 0.12, 'square', 0.08);
  },
  tray(): void {
    tone(660, 0.12, 'sine', 0.22);
    tone(880, 0.12, 'sine', 0.22, 0.08);
    tone(1320, 0.18, 'sine', 0.18, 0.16);
  },
  click(): void {
    tone(700, 0.05, 'sine', 0.15);
  },
  win(): void {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.22, i * 0.11));
  },
  lose(): void {
    [392, 330, 262].forEach((f, i) => tone(f, 0.25, 'sawtooth', 0.08, i * 0.14));
  },
  /** Rubber band let go: a short springy "boing". */
  boing(): void {
    tone(260, 0.18, 'sine', 0.22, 0, 520);
    tone(620, 0.08, 'triangle', 0.1, 0.03, 380);
  },
  coin(): void {
    tone(1320, 0.07, 'triangle', 0.12, 0, 1760);
  },
  tick(): void {
    tone(1200, 0.04, 'square', 0.05);
  },
  timeUp(): void {
    [660, 520, 400].forEach((f, i) => tone(f, 0.18, 'square', 0.07, i * 0.12));
  },
  booster(): void {
    tone(440, 0.2, 'sine', 0.2, 0, 1200);
  },
};

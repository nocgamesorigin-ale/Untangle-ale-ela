// Pointer input in canvas CSS pixels. One code path for touch, mouse and pen.
// The game gets down / move / up events so it can tell taps from drags
// (zoom slider, panning a zoomed board).

export interface Tap {
  x: number;
  y: number;
}

export interface PointerEvt extends Tap {
  kind: 'down' | 'move' | 'up';
}

export class Input {
  private readonly events: PointerEvt[] = [];
  private readonly canvas: HTMLCanvasElement;
  private activeId = -1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.style.touchAction = 'none'; // no browser panning/zooming on the game surface
    canvas.addEventListener('pointerdown', this.onDown, { passive: false });
    canvas.addEventListener('pointermove', this.onMove, { passive: false });
    canvas.addEventListener('pointerup', this.onUp, { passive: false });
    canvas.addEventListener('pointercancel', this.onUp, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private push(kind: PointerEvt['kind'], e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.events.push({ kind, x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

  private readonly onDown = (e: PointerEvent): void => {
    e.preventDefault();
    if (this.activeId !== -1) return; // one finger
    this.activeId = e.pointerId;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // capture is a nicety
    }
    this.push('down', e);
  };

  private readonly onMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.activeId) return;
    e.preventDefault();
    this.push('move', e);
  };

  private readonly onUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.activeId) return;
    e.preventDefault();
    this.activeId = -1;
    this.push('up', e);
  };

  /** Pointer events since the previous call, oldest first. */
  drain(): PointerEvt[] {
    return this.events.splice(0, this.events.length);
  }
}

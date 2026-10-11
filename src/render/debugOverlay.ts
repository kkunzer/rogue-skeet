import { tuning } from '../feel/tuning';

/** FPS + last-input latency (pointerdown event.timeStamp -> next rendered frame). */
export class DebugOverlay {
  private el = document.createElement('div');
  private fps = 0;
  private lastFrame = 0;
  private pendingInputTs: number | null = null;
  private latencyMs: number | null = null;
  private lastText = '';
  private acc = 0;

  constructor(parent: HTMLElement = document.body) {
    Object.assign(this.el.style, {
      position: 'fixed',
      left: '6px',
      top: 'calc(6px + env(safe-area-inset-top))',
      zIndex: '10',
      font: '11px/1.3 ui-monospace, Menlo, monospace',
      color: '#9fe6a0',
      background: 'rgba(0,0,0,0.45)',
      padding: '3px 6px',
      borderRadius: '4px',
      pointerEvents: 'none',
      whiteSpace: 'pre',
    });
    this.el.id = 'debug-overlay';
    parent.appendChild(this.el);
    window.addEventListener(
      'pointerdown',
      (e) => {
        this.pendingInputTs = e.timeStamp;
      },
      { capture: true, passive: true },
    );
  }

  /** Call once per rendered frame. */
  frame(now: number = performance.now()): void {
    if (this.lastFrame > 0) {
      const inst = 1000 / Math.max(1, now - this.lastFrame);
      this.fps = this.fps === 0 ? inst : this.fps * 0.95 + inst * 0.05;
    }
    this.lastFrame = now;
    if (this.pendingInputTs !== null) {
      this.latencyMs = now - this.pendingInputTs;
      this.pendingInputTs = null;
    }
    this.el.style.display = tuning.debugOverlay ? 'block' : 'none';
    this.acc += 1;
    if (this.acc % 10 !== 0) return;
    const text = `${this.fps.toFixed(0)} fps\ninput ${
      this.latencyMs === null ? '--' : this.latencyMs.toFixed(1) + ' ms'
    }`;
    if (text !== this.lastText) {
      this.el.textContent = text;
      this.lastText = text;
    }
  }
}

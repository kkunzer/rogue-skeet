import type { World } from '../../sim/world';
import { el, uiRoot } from '../../ui/dom';

/** Simple DOM HUD: scheme, hits, barrels / reload. Extra lines (attempt, throw) go in `extra`. */
export class Hud {
  readonly root = el('div', { cls: 'hud', attrs: { id: 'hud' } });
  private schemeEl = el('span', { attrs: { id: 'hud-scheme' } });
  private hitsEl = el('span', { cls: 'stat', attrs: { id: 'hud-hits' } });
  private pipsEl = el('span', { cls: 'pips' });
  private reloadFill = el('i');
  private reloadEl = el('span', { cls: 'reload' }, [this.reloadFill]);
  private extraEl = el('div', { cls: 'hud-row hud-dim' });
  private last = '';

  constructor(parent: HTMLElement = uiRoot()) {
    this.root.append(
      el('div', { cls: 'hud-row' }, [
        this.schemeEl,
        this.hitsEl,
        el('span', { cls: 'pips' }, [this.pipsEl, this.reloadEl]),
      ]),
      this.extraEl,
    );
    parent.appendChild(this.root);
  }

  update(world: World | null, scheme: string, extra = '', hitsLabel?: string): void {
    const loaded = world?.gun.loaded ?? 0;
    const barrels = world?.cfg.barrels ?? 2;
    const hits = world?.stats.hits ?? 0;
    const shots = world?.stats.shots ?? 0;
    const rl = world ? world.gun.reloadProgress(world.time) : 1;
    const key = `${scheme}|${hits}|${shots}|${loaded}|${barrels}|${rl.toFixed(2)}|${extra}|${hitsLabel ?? ''}`;
    if (key === this.last) return;
    this.last = key;
    this.schemeEl.textContent = scheme;
    this.hitsEl.textContent = hitsLabel ?? `Hits ${hits} / ${shots} shots`;
    this.root.dataset.hits = String(hits);
    this.root.dataset.shots = String(shots);
    this.pipsEl.replaceChildren(
      ...Array.from({ length: barrels }, (_, i) =>
        el('i', { cls: i < loaded ? 'pip' : 'pip empty' }),
      ),
    );
    this.reloadEl.style.visibility = rl < 1 ? 'visible' : 'hidden';
    this.reloadFill.style.width = `${Math.round(rl * 100)}%`;
    this.extraEl.textContent = extra;
  }

  destroy(): void {
    this.root.remove();
  }
}

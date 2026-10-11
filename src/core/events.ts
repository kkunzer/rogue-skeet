/** Tiny typed event bus. `Events` maps event names to payload types. */
export type Handler<T> = (payload: T) => void;

export class EventBus<Events extends { [K in keyof Events]: unknown }> {
  private handlers: { [K in keyof Events]?: Set<Handler<Events[K]>> } = {};

  on<K extends keyof Events>(type: K, fn: Handler<Events[K]>): () => void {
    const set = (this.handlers[type] ??= new Set());
    set.add(fn);
    return () => this.off(type, fn);
  }

  off<K extends keyof Events>(type: K, fn: Handler<Events[K]>): void {
    this.handlers[type]?.delete(fn);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    // copy so handlers can unsubscribe during dispatch
    for (const fn of [...(this.handlers[type] ?? [])]) fn(payload);
  }

  clear(): void {
    this.handlers = {};
  }
}

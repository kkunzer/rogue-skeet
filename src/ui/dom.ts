/** Tiny DOM helpers for the prototype's overlay screens (HUD, forms, prompts). */
type Attrs = Record<string, string | number | boolean | undefined>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts: { cls?: string; text?: string; attrs?: Attrs; style?: Partial<CSSStyleDeclaration> } = {},
  children: (Node | string | null | undefined)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (opts.cls) node.className = opts.cls;
  if (opts.text !== undefined) node.textContent = opts.text;
  for (const [k, v] of Object.entries(opts.attrs ?? {})) {
    if (v === undefined || v === false) continue;
    node.setAttribute(k, v === true ? '' : String(v));
  }
  if (opts.style) Object.assign(node.style, opts.style);
  for (const c of children) if (c) node.append(c);
  return node;
}

export function button(
  label: string,
  onClick: () => void,
  opts: { cls?: string; id?: string; attrs?: Attrs } = {},
): HTMLButtonElement {
  const b = el('button', {
    cls: `btn ${opts.cls ?? ''}`.trim(),
    text: label,
    attrs: { type: 'button', id: opts.id, ...opts.attrs },
  });
  b.addEventListener('click', onClick);
  return b;
}

let root: HTMLElement | null = null;

/** Full-screen overlay container above the canvas. Children opt into pointer events. */
export function uiRoot(): HTMLElement {
  if (root && root.isConnected) return root;
  root = el('div', { attrs: { id: 'ui-root' } });
  document.body.appendChild(root);
  return root;
}

export function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: fine */
  }
}

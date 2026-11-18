/** Pembuat elemen DOM kecil. */
type Attrs = Record<string, string | number | boolean | undefined | null | ((e: Event) => void)>;
type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, '').toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'value' && 'value' in el) (el as HTMLInputElement).value = String(v);
    else if (k === 'checked' && 'checked' in el) (el as HTMLInputElement).checked = Boolean(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

let idCounter = 0;
export const uid = (prefix: string): string => `${prefix}-${++idCounter}`;

/** Label + input dalam satu .field (label selalu terlihat). */
export function field(label: string, input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, help?: string): HTMLDivElement {
  if (!input.id) input.id = uid('f');
  return h('div', { class: 'field' }, h('label', { for: input.id }, label), input, help ? h('p', { class: 'help' }, help) : null);
}

export function select(options: { value: string; label: string }[], value: string, onChange: (v: string) => void): HTMLSelectElement {
  const el = h(
    'select',
    { onchange: (e: Event) => onChange((e.target as HTMLSelectElement).value) },
    ...options.map((o) => h('option', { value: o.value }, o.label)),
  );
  el.value = value;
  return el;
}

export function numberInput(value: number, onChange: (v: number) => void, attrs: Attrs = {}): HTMLInputElement {
  return h('input', {
    type: 'number',
    value: String(value),
    ...attrs,
    onchange: (e: Event) => {
      const v = Number((e.target as HTMLInputElement).value.replace(',', '.'));
      if (Number.isFinite(v)) onChange(v);
    },
  });
}

export function textInput(value: string, onChange: (v: string) => void, attrs: Attrs = {}): HTMLInputElement {
  return h('input', { type: 'text', value, ...attrs, onchange: (e: Event) => onChange((e.target as HTMLInputElement).value) });
}

export const fmt = (n: number): string => String(Math.round(n * 100) / 100).replace('.', ',');

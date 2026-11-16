/** Helper kecil untuk membuat elemen DOM tanpa framework. */

type Child = Node | string | null | undefined | false;

export interface ElProps {
  className?: string;
  text?: string;
  attrs?: Record<string, string>;
  dataset?: Record<string, string>;
  onClick?: (event: MouseEvent) => void;
  children?: Child[];
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: ElProps = {}): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.attrs) for (const [k, v] of Object.entries(props.attrs)) node.setAttribute(k, v);
  if (props.dataset) for (const [k, v] of Object.entries(props.dataset)) node.dataset[k] = v;
  if (props.onClick) node.addEventListener('click', props.onClick as EventListener);
  if (props.children) {
    for (const child of props.children) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child);
    }
  }
  return node;
}

/** Komponen UI: punya elemen akar dan wajib bisa dihancurkan (lepas listener). */
export interface UIComponent {
  readonly root: HTMLElement;
  destroy(): void;
}

/** Ganti teks hanya jika berubah (hindari reflow yang tidak perlu). */
export function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

/** Jalankan ulang animasi CSS satu kali (mis. "bump" saat uang berubah). */
export function replayAnimation(node: HTMLElement, className: string): void {
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
}

/** Elemen induk terdekat yang bisa digulir (badan modal/sheet). */
export function scrollParent(node: HTMLElement): HTMLElement | null {
  let cur = node.parentElement;
  while (cur) {
    const oy = getComputedStyle(cur).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && cur.scrollHeight > cur.clientHeight) return cur;
    cur = cur.parentElement;
  }
  return null;
}

/**
 * Jalankan render ulang tanpa melompatkan posisi gulir: elemen jangkar (`[data-anchor]`) yang
 * terlihat — atau `preferAnchor` (mis. kartu yang baru diketuk) — tetap di posisi layar yang sama
 * walaupun isi di atasnya bertambah/berkurang.
 */
export function keepScroll(root: HTMLElement, renderFn: () => void, preferAnchor: string | null = null): void {
  const scroller = scrollParent(root);
  if (!scroller) {
    renderFn();
    return;
  }
  const top = scroller.getBoundingClientRect().top;
  const anchors = [...root.querySelectorAll<HTMLElement>('[data-anchor]')];
  const anchorEl =
    (preferAnchor ? anchors.find((a) => a.dataset.anchor === preferAnchor) : undefined) ??
    anchors.find((a) => a.getBoundingClientRect().bottom > top + 1);
  const key = anchorEl?.dataset.anchor ?? null;
  const before = anchorEl ? anchorEl.getBoundingClientRect().top : 0;
  const scrollTop = scroller.scrollTop;
  renderFn();
  scroller.scrollTop = scrollTop;
  if (!key) return;
  const after = [...root.querySelectorAll<HTMLElement>('[data-anchor]')].find((a) => a.dataset.anchor === key);
  if (after) scroller.scrollTop += after.getBoundingClientRect().top - before;
}

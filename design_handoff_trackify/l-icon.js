// <l-icon name="mic" size="20" color="#FFC65C" stroke="2"></l-icon> — inlines a Lucide icon (MIT) as real SVG.
(function () {
  if (customElements.get('l-icon')) return;
  const BASE = 'https://unpkg.com/lucide-static@0.460.0/icons/';
  const cache = new Map();
  const load = (name) => {
    if (!cache.has(name)) cache.set(name, fetch(BASE + name + '.svg').then((r) => (r.ok ? r.text() : '')).catch(() => ''));
    return cache.get(name);
  };
  class LIcon extends HTMLElement {
    static get observedAttributes() { return ['name', 'size', 'color', 'stroke']; }
    constructor() { super(); this.attachShadow({ mode: 'open' }); }
    connectedCallback() { this.render(); }
    attributeChangedCallback() { if (this.isConnected) this.render(); }
    async render() {
      const name = this.getAttribute('name') || 'circle';
      const size = this.getAttribute('size') || '20';
      const color = this.getAttribute('color') || 'currentColor';
      const sw = this.getAttribute('stroke') || '2';
      this.style.display = this.style.display || 'inline-flex';
      this.style.width = size + 'px'; this.style.height = size + 'px';
      this.style.flex = this.style.flex || 'none';
      const token = (this._token = (this._token || 0) + 1);
      let svg = await load(name);
      if (token !== this._token) return;
      if (!svg) svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"></svg>';
      svg = svg.replace(/<!--[\s\S]*?-->/g, '').replace(/\swidth="[^"]*"/, '').replace(/\sheight="[^"]*"/, '')
        .replace(/stroke="currentColor"/, 'stroke="' + color + '"').replace(/stroke-width="[^"]*"/, 'stroke-width="' + sw + '"')
        .replace('<svg', '<svg width="' + size + '" height="' + size + '" style="display:block"');
      this.shadowRoot.innerHTML = svg;
    }
  }
  customElements.define('l-icon', LIcon);
})();

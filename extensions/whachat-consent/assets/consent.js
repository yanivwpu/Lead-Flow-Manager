(() => {
  async function render() {
    const nodes = document.querySelectorAll('[data-whachat-consent]');
    for (const node of nodes) {
      if (node.dataset.loaded) continue;
      node.dataset.loaded = 'true';
      try {
        // Same-origin Shopify proxy: no cookie, account ID, phone or Liquid
        // customer field is forwarded. Shopify supplies the signed shop.
        const response = await fetch('/apps/whachat-consent', { credentials: 'omit', cache: 'no-store', redirect: 'error' });
        if (!response.ok || response.status === 204) continue;
        const html = await response.text();
        if (html.length > 32000) continue;
        const parsed = new DOMParser().parseFromString(html, 'text/html');
        const section = parsed.querySelector('section.whachat-consent');
        if (!section) continue;
        // Rebuild a strict content allowlist even if the proxy is customized or
        // returns a storefront error page. Never execute fetched markup.
        function clean(source) {
          if (source.nodeType === Node.TEXT_NODE) return document.createTextNode(source.textContent || '');
          if (source.nodeType !== Node.ELEMENT_NODE || !['SECTION', 'H2', 'H3', 'P', 'ARTICLE', 'CODE', 'A'].includes(source.tagName)) return document.createTextNode('');
          const target = document.createElement(source.tagName.toLowerCase());
          if (['ltr', 'rtl'].includes(source.getAttribute('dir'))) target.dir = source.getAttribute('dir');
          if (['en', 'es', 'he'].includes(source.getAttribute('lang'))) target.lang = source.getAttribute('lang');
          if (source.tagName === 'SECTION') { target.className = 'whachat-consent'; target.setAttribute('aria-label', source.getAttribute('aria-label') || 'WhatsApp'); }
          if (source.tagName === 'P') target.className = 'whachat-consent-notice';
          if (source.tagName === 'A') {
            const href = source.getAttribute('href') || '';
            if (!/^https:\/\/wa\.me\/[1-9][0-9]{7,14}\?text=[A-Za-z0-9%]+$/.test(href)) return document.createTextNode('');
            target.href = href; target.target = '_blank'; target.rel = 'noopener noreferrer';
          }
          for (const child of source.childNodes) target.append(clean(child));
          return target;
        }
        node.replaceChildren(clean(section));
      } catch { /* Keep existing theme and engine functions available on failure. */ }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, { once: true });
  else void render();
  document.addEventListener('shopify:section:load', render);
})();

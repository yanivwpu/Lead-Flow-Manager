(() => {
  const runtime = typeof window === 'undefined' ? globalThis : window;
  if (runtime.WhachatConsentDiagnostics) return;
  const states = new WeakMap();
  let active;
  const retryDelays = [500, 1500];
  const allowedTags = ['SECTION', 'H2', 'H3', 'P', 'ARTICLE', 'CODE', 'A'];
  const allowedClasses = ['whachat-consent-notice'];

  function status(node, state, reason) {
    const entry = states.get(node);
    entry.status = state;
    entry.reason = reason;
    node.dataset.whachatConsentState = state;
    node.dataset.whachatConsentReason = reason;
  }
  // Safe, read-only runtime evidence: no HTML, URLs, cookies, notices or identities.
  runtime.WhachatConsentDiagnostics = () => ({
    scriptLoaded: true,
    containers: document.querySelectorAll('[data-whachat-consent]').length,
    state: active && active.isConnected ? states.get(active)?.status || 'pending' : 'missing_container',
    reason: active && active.isConnected ? states.get(active)?.reason || 'none' : 'none',
    attempts: active && active.isConnected ? states.get(active)?.attempts || 0 : 0,
    rendered: !!(active && active.isConnected && active.querySelector('section.whachat-consent')),
  });
  function place(node) {
    if (node.dataset.placement === 'original') return;
    const main = document.querySelector('main, [role="main"], #MainContent');
    if (main && !node.contains(main)) { if (!main.contains(node)) main.append(node); return; }
    const footer = document.querySelector('footer, [role="contentinfo"]');
    if (footer && !node.contains(footer) && node.nextSibling !== footer) footer.before(node);
  }
  function clean(source) {
    if (source.nodeType === Node.TEXT_NODE) return document.createTextNode(source.textContent || '');
    if (source.nodeType !== Node.ELEMENT_NODE || !allowedTags.includes(source.tagName)) return document.createTextNode('');
    const target = document.createElement(source.tagName.toLowerCase());
    if (['ltr', 'rtl'].includes(source.getAttribute('dir'))) target.dir = source.getAttribute('dir');
    if (['en', 'es', 'he'].includes(source.getAttribute('lang'))) target.lang = source.getAttribute('lang');
    if (source.tagName === 'SECTION') {
      target.className = 'whachat-consent';
      target.setAttribute('aria-label', source.getAttribute('aria-label') || 'WhatsApp');
    }
    if (source.tagName === 'P') {
      const className = source.getAttribute('class');
      if (allowedClasses.includes(className)) target.className = className;
    }
    if (source.tagName === 'A') {
      const href = source.getAttribute('href') || '';
      if (!/^https:\/\/wa\.me\/[1-9][0-9]{7,14}\?text=[A-Za-z0-9%]+$/.test(href)) return document.createTextNode('');
      target.href = href; target.target = '_blank'; target.rel = 'noopener noreferrer';
    }
    for (const child of source.childNodes) target.append(clean(child));
    return target;
  }
  function retry(node, entry, reason) {
    if (states.get(node) !== entry) return;
    if (!node.isConnected || entry.attempts > retryDelays.length || typeof setTimeout !== 'function') {
      status(node, 'failed', reason); return;
    }
    status(node, 'retrying', reason);
    entry.timer = setTimeout(() => { entry.timer = null; void load(node, entry); }, retryDelays[entry.attempts - 1]);
  }
  async function load(node, entry) {
    if (!node.isConnected || entry.inFlight || entry.timer || entry.attempts >= 3) return;
    entry.inFlight = true; entry.attempts++;
    status(node, 'loading', 'none');
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    entry.controller = controller;
    const timeout = controller && typeof setTimeout === 'function' ? setTimeout(() => controller.abort(), 8000) : null;
    try {
      // Preserve Shopify's same-origin storefront/password session. Shopify's
      // proxy forwarder, not a browser cookie/customer selector, signs the shop.
      // Never fetch the application origin directly or follow a password redirect.
      const response = await fetch('/apps/whachat-consent', {
        credentials: 'same-origin', cache: 'no-store', redirect: 'error', ...(controller ? { signal: controller.signal } : {}),
      });
      if (!node.isConnected || active !== node || states.get(node) !== entry) return;
      if (response.status === 204) { status(node, 'empty', 'no_notices'); return; }
      if (!response.ok) {
        if (response.status >= 500) retry(node, entry, 'temporary_http_error');
        else status(node, 'blocked', 'http_denied');
        return;
      }
      const html = await response.text();
      if (!node.isConnected || active !== node || states.get(node) !== entry) return;
      if (html.length > 32000) { status(node, 'blocked', 'response_too_large'); return; }
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      const source = parsed.querySelector('section.whachat-consent');
      if (!source) { status(node, 'blocked', 'unexpected_response'); return; }
      const section = clean(source);
      if (!section.querySelector('a')) { status(node, 'blocked', 'no_safe_links'); return; }
      // Upgrade the unchanged proxy HTML locally. Older released assets still
      // receive their supported tags while this version adds disclosure UI.
      const heading = [...section.children].find(child => child.tagName === 'H2');
      if (heading) {
        const intro = heading.nextElementSibling;
        const header = document.createElement('header');
        header.append(heading);
        if (intro?.tagName === 'P') { intro.className = 'whachat-consent-intro'; header.append(intro); }
        section.prepend(header);
      }
      const messageLabel = { en: 'Message you’ll send', es: 'Mensaje que enviarás', he: 'ההודעה שתישלח' }[section.lang] || 'Message you’ll send';
      for (const code of section.querySelectorAll('article code')) {
        const details = document.createElement('details'), summary = document.createElement('summary');
        summary.textContent = messageLabel;
        const paragraph = code.parentElement;
        if (paragraph?.tagName === 'P' && paragraph.childNodes.length === 1) paragraph.replaceWith(details);
        else code.replaceWith(details);
        details.append(summary, code);
      }
      entry.section = section.cloneNode(true);
      node.replaceChildren(section);
      node.dataset.loaded = 'true';
      status(node, 'ready', 'notices_rendered');
      place(node);
    } catch { if (node.isConnected && active === node && states.get(node) === entry) retry(node, entry, 'fetch_failed'); }
    finally {
      if (timeout !== null) clearTimeout(timeout);
      entry.inFlight = false; entry.controller = null;
    }
  }
  function scan() {
    const nodes = document.querySelectorAll('[data-whachat-consent]');
    const next = active && active.isConnected ? active : nodes[0];
    if (active && active !== next) {
      const old = states.get(active);
      old?.controller?.abort();
      if (old?.timer) clearTimeout(old.timer);
      states.delete(active);
    }
    active = next;
    if (!active) return;
    if (!states.has(active)) states.set(active, { status: 'pending', reason: 'none', attempts: 0 });
    const entry = states.get(active);
    if (entry.status === 'pending') void load(active, entry);
    else if (entry.status === 'ready') {
      if (!active.querySelector('section.whachat-consent') && entry.section) active.replaceChildren(entry.section.cloneNode(true));
      place(active);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan, { once: true });
  else scan();
  document.addEventListener('shopify:section:load', scan);
  if (typeof MutationObserver === 'function' && document.documentElement) {
    new MutationObserver(records => {
      if ((active && (!active.isConnected || states.get(active)?.status === 'ready' && !active.querySelector('section.whachat-consent'))) || records.some(record => [...record.addedNodes].some(node =>
        node.nodeType === Node.ELEMENT_NODE && (node.matches('[data-whachat-consent], main, [role="main"], #MainContent, footer, [role="contentinfo"]') || node.querySelector('[data-whachat-consent]'))))) scan();
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
})();

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
    const footer = document.querySelector('footer, [role="contentinfo"]');
    if (node.dataset.placement !== 'content_end' && footer && !node.contains(footer)) {
      if (node.nextSibling !== footer) footer.before(node);
      return;
    }
    const main = document.querySelector('main, [role="main"], #MainContent');
    if (main && !node.contains(main)) { if (!main.contains(node)) main.append(node); return; }
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
      // Presentation only: choices are ephemeral, never consent or identity.
      const copy = {
        en: { title: 'Stay updated on WhatsApp.', intro: 'Choose optional updates. Each purpose requires its own message in WhatsApp. Send STOP anytime.', details: 'Consent details and exact message', action: 'Review WhatsApp messages', hint: 'Selecting options or opening links does not subscribe you. Review and send each exact message; consent requires verified customer identity.', choices: 'Optional WhatsApp updates' },
        es: { title: 'Mantente al día por WhatsApp.', intro: 'Elige actualizaciones opcionales. Cada finalidad requiere su propio mensaje en WhatsApp. Envía STOP cuando quieras.', details: 'Detalles del consentimiento y mensaje exacto', action: 'Revisar mensajes de WhatsApp', hint: 'Seleccionar opciones o abrir enlaces no te suscribe. Revisa y envía cada mensaje exacto; el consentimiento requiere una identidad de cliente verificada.', choices: 'Actualizaciones opcionales de WhatsApp' },
        he: { title: 'להישאר מעודכנים ב-WhatsApp.', intro: 'אפשר לבחור עדכונים. כל מטרה דורשת הודעה נפרדת ב-WhatsApp. אפשר לשלוח STOP בכל עת.', details: 'פרטי ההסכמה וההודעה המדויקת', action: 'בדיקת הודעות WhatsApp', hint: 'בחירת אפשרויות או פתיחת קישורים אינה הרשמה. יש לבדוק ולשלוח כל הודעה מדויקת; ההסכמה דורשת זהות לקוח מאומתת.', choices: 'עדכוני WhatsApp לבחירה' },
      }[section.lang] || null;
      if (copy) {
        const heading = section.querySelector('h2');
        const intro = heading?.nextElementSibling;
        if (heading) heading.textContent = copy.title;
        if (intro?.tagName === 'P') intro.textContent = copy.intro;
        const group = document.createElement('fieldset');
        const legend = document.createElement('legend');
        legend.textContent = copy.choices;
        group.append(legend);
        for (const article of [...section.querySelectorAll('article')]) {
          const title = article.querySelector('h3');
          const label = document.createElement('label');
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          const name = document.createElement('span');
          name.textContent = title?.textContent || '';
          label.append(checkbox, name);
          const details = document.createElement('details');
          const summary = document.createElement('summary');
          summary.textContent = copy.details;
          details.append(summary);
          title?.remove();
          for (const child of [...article.childNodes]) details.append(child);
          // Preserve the sanitized, exact-purpose href and message verbatim.
          const link = details.querySelector('a');
          if (link) link.hidden = true;
          article.append(label, details);
          group.append(article);
        }
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'whachat-consent-review';
        button.textContent = copy.action; button.disabled = true;
        const hint = document.createElement('p');
        hint.className = 'whachat-consent-hint'; hint.textContent = copy.hint;
        section.append(group, button, hint);
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
  document.addEventListener('change', event => {
    const section = event.target.closest?.('section.whachat-consent');
    if (!section || event.target.type !== 'checkbox') return;
    section.querySelector('.whachat-consent-review').disabled = !section.querySelector('input:checked');
    for (const link of section.querySelectorAll('article a')) link.hidden = true;
  });
  document.addEventListener('click', event => {
    const button = event.target.closest?.('.whachat-consent-review');
    if (!button) return;
    const section = button.closest('section.whachat-consent');
    let first;
    for (const article of section.querySelectorAll('article')) {
      const selected = article.querySelector('input').checked;
      const link = article.querySelector('a');
      if (link) link.hidden = !selected;
      if (selected) {
        article.querySelector('details').open = true;
        if (!first && link) first = link;
      }
    }
    first?.focus();
  });
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

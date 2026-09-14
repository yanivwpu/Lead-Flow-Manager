/**
 * Public /widget.js runtime. Stable loader — tenant branding is fetched from
 * /api/webchat/:id/settings with cache: "no-store". Layout CSS comes from that payload.
 */

import {
  PAGE_RULE_TEASER_AT_STORAGE_PREFIX,
  PAGE_RULE_TEASER_COOLDOWN_MS,
  PAGE_RULE_TEASER_DELAY_MS,
  PAGE_RULE_TEASER_HOLD_MS,
  PAGE_RULE_TEASER_MAX,
  PAGE_RULE_TEASER_STORAGE_PREFIX,
} from "@shared/webchatPageRuleTeaser";

export type WebchatPublicScriptInput = {
  /** Platform origin fallback when document.currentScript is missing. */
  origin: string;
};

export function buildWebchatPublicScript(input: WebchatPublicScriptInput): string {
  const originFallback = String(input.origin || "").replace(/\/$/, "");
  return `(function() {
  'use strict';
  if (window.__wcwInit) return;
  window.__wcwInit = true;

  var ORIGIN_FALLBACK = ${JSON.stringify(originFallback)};

  function parseInstall() {
    var el = document.currentScript;
    if (!el || !el.src) {
      var list = document.getElementsByTagName('script');
      for (var i = list.length - 1; i >= 0; i--) {
        if (list[i].src && list[i].src.indexOf('/widget.js') !== -1) {
          el = list[i];
          break;
        }
      }
    }
    var src = el && el.src ? String(el.src) : '';
    var origin = ORIGIN_FALLBACK;
    var widgetId = '';
    try {
      var u = new URL(src, window.location.href);
      origin = u.origin || origin;
      widgetId = String(u.searchParams.get('id') || '').trim();
    } catch (e) {
      var q = src.split('?')[1] || '';
      var parts = q.split('&');
      for (var p = 0; p < parts.length; p++) {
        var kv = parts[p].split('=');
        if (kv[0] === 'id') widgetId = decodeURIComponent((kv[1] || '').replace(/\\+/g, ' ')).trim();
      }
    }
    if (!widgetId || widgetId.indexOf('wgt_') !== 0) return null;
    return { origin: origin.replace(/\\/$/, ''), widgetId: widgetId };
  }

  function start(cfg) {
    var COLOR = cfg.color;
    var POSITION = cfg.position;
    var DEFAULT_WELCOME = cfg.welcomeMessage;
    var WIDGET_ID = cfg.widgetId;
    var ORIGIN = cfg.origin;
    var TRIGGER = cfg.triggerType;
    var DELAY_SEC = cfg.triggerDelaySeconds;
    var SCROLL_PCT = cfg.triggerScrollPercent;
    var SHOW_DESKTOP = cfg.showOnDesktop;
    var SHOW_MOBILE = cfg.showOnMobile;
    var PAGE_RULES = cfg.pageRules;
    var LAUNCHER_STYLE = cfg.launcherStyle;
    var OPEN_BEHAVIOR = cfg.openBehavior;
    var LAUNCHER_CSS = cfg.launcherCss;
    var TEASER_CSS = cfg.teaserCss;
    var PANEL_CSS = cfg.panelCss;
    var ARIA_OPEN = cfg.launcherAriaLabel;
    var ARIA_CLOSE = cfg.closeAriaLabel || 'Close website chat';
    var LAUNCHER_LABEL = cfg.launcherLabel;
    var DISPLAY_NAME = cfg.displayName;
    var TEASER_TEXT = cfg.teaserGreeting;
    var LOGO_URL = cfg.logoUrl;
    var ICON_SVG = cfg.iconSvg;
    var CLOSE_SVG = cfg.closeIconSvg;
    var LOCALE = cfg.locale || '';
    var DIR = (LOCALE === 'he' || LOCALE === 'ar') ? 'rtl' : 'ltr';

    if (!LAUNCHER_CSS || !WIDGET_ID) return;

    var btn, bubble, iframeLoaded = false;
    var revealed = false;
    var TEASER_KEY = 'wcw-teaser-' + WIDGET_ID;
    var PAGE_TEASER_KEY = ${JSON.stringify(PAGE_RULE_TEASER_STORAGE_PREFIX)} + ':' + WIDGET_ID;
    var PAGE_TEASER_AT_KEY = ${JSON.stringify(PAGE_RULE_TEASER_AT_STORAGE_PREFIX)} + ':' + WIDGET_ID;
    var PAGE_TEASER_MAX = ${PAGE_RULE_TEASER_MAX};
    var PAGE_TEASER_DELAY_MS = ${PAGE_RULE_TEASER_DELAY_MS};
    var PAGE_TEASER_HOLD_MS = ${PAGE_RULE_TEASER_HOLD_MS};
    var PAGE_TEASER_COOLDOWN_MS = ${PAGE_RULE_TEASER_COOLDOWN_MS};
    var pendingTeaserTimer = null;
    var teaserGen = 0;
    var teaserBlocked = false;

    function prefersReducedMotion() {
      try {
        return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      } catch (e) {
        return false;
      }
    }

    function teaserAlreadyShown() {
      try { return sessionStorage.getItem(TEASER_KEY) === '1'; } catch (e) { return false; }
    }

    function markTeaserShown() {
      try { sessionStorage.setItem(TEASER_KEY, '1'); } catch (e) {}
    }

    function iconHtml(inner) {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
    }

    function isMobileViewport() {
      try {
        return window.matchMedia && window.matchMedia('(max-width: 767px)').matches;
      } catch (e) {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');
      }
    }

    function allowDevice() {
      var m = isMobileViewport();
      if (m && !SHOW_MOBILE) return false;
      if (!m && !SHOW_DESKTOP) return false;
      return true;
    }

    function normalizePathname(pathname) {
      var pathOnly = String(pathname || '/').split('?')[0].split('#')[0] || '/';
      var p = pathOnly.charAt(0) === '/' ? pathOnly : '/' + pathOnly;
      if (p.length > 1 && p.charAt(p.length - 1) === '/') p = p.slice(0, -1) || '/';
      return p;
    }

    function hrefPathname(href) {
      try {
        var u = new URL(href, window.location.href);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
        return normalizePathname(u.pathname);
      } catch (e) {
        return null;
      }
    }

    function ruleMatches(rule, href) {
      var q = (rule && rule.urlContains ? String(rule.urlContains) : '').trim();
      if (!q) return false;
      var matchType = rule.matchType === 'pathname' || rule.matchType === 'pathname_prefix' ? rule.matchType : 'contains';
      if (matchType === 'contains') return href.indexOf(q) !== -1;
      var path = hrefPathname(href);
      var want = q.indexOf('://') !== -1 ? hrefPathname(q) : normalizePathname(q.split('?')[0].split('#')[0]);
      if (!path || !want) return false;
      if (matchType === 'pathname') return path === want;
      return path === want || path.indexOf(want + '/') === 0;
    }

    function activeRule() {
      var rules = PAGE_RULES || [];
      var href = '';
      try { href = window.location.href || ''; } catch (e) {}
      for (var i = 0; i < rules.length; i++) {
        try {
          if (ruleMatches(rules[i], href)) return rules[i];
        } catch (matchErr) {}
      }
      return null;
    }

    function welcomeText() {
      var r = activeRule();
      if (r && r.greeting) return r.greeting;
      return DEFAULT_WELCOME;
    }

    function prefillText() {
      var r = activeRule();
      if (r && r.prefilledMessage) return String(r.prefilledMessage);
      return '';
    }

    function teaserText() {
      return TEASER_TEXT || DEFAULT_WELCOME;
    }

    function ruleKey(rule) {
      if (!rule) return '';
      var matchType = rule.matchType === 'pathname' || rule.matchType === 'pathname_prefix' ? rule.matchType : 'contains';
      var fragment = String(rule.urlContains || '').trim().toLowerCase().slice(0, 200);
      if (!fragment) return '';
      return matchType + ':' + fragment;
    }

    function fallbackPageRuleTeaser(greeting) {
      var t = String(greeting || '').trim();
      if (!t) return '';
      var cut = t;
      var q = t.indexOf('?');
      var d = t.indexOf('.');
      var b = t.indexOf('!');
      var end = -1;
      if (q !== -1) end = q;
      if (d !== -1 && (end === -1 || d < end)) end = d;
      if (b !== -1 && (end === -1 || b < end)) end = b;
      if (end !== -1) cut = t.slice(0, end + 1);
      if (cut.length <= PAGE_TEASER_MAX) return cut;
      var sliced = cut.slice(0, PAGE_TEASER_MAX - 3).replace(/\\s+\\S*$/, '').replace(/\\s+$/, '');
      return (sliced || cut.slice(0, PAGE_TEASER_MAX - 3)).trim() + '...';
    }

    function pageRuleTeaserCopy(rule) {
      if (!rule) return '';
      var explicit = String(rule.teaserGreeting || '').trim();
      if (explicit) return explicit.slice(0, 200);
      return fallbackPageRuleTeaser(rule.greeting);
    }

    function readPageTeaserKeys() {
      try {
        var raw = localStorage.getItem(PAGE_TEASER_KEY);
        if (!raw) return [];
        var parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        var out = [];
        for (var i = 0; i < parsed.length && out.length < 30; i++) {
          var k = String(parsed[i] || '').trim().slice(0, 220);
          if (k && k.indexOf('://') === -1) out.push(k);
        }
        return out;
      } catch (e) {
        return [];
      }
    }

    function pageTeaserShown(key) {
      if (!key) return false;
      var keys = readPageTeaserKeys();
      return keys.indexOf(key) !== -1;
    }

    function markPageTeaserShown(key) {
      if (!key || key.indexOf('://') !== -1) return;
      var keys = readPageTeaserKeys();
      if (keys.indexOf(key) !== -1) return;
      keys.push(key);
      try { localStorage.setItem(PAGE_TEASER_KEY, JSON.stringify(keys.slice(0, 30))); } catch (e) {}
    }

    function pageTeaserCooldownActive() {
      try {
        var n = Number(localStorage.getItem(PAGE_TEASER_AT_KEY) || '0');
        if (!n || n !== n || n <= 0) return false;
        return (Date.now() - n) < PAGE_TEASER_COOLDOWN_MS;
      } catch (e) {
        return false;
      }
    }

    function markPageTeaserCooldown() {
      try { localStorage.setItem(PAGE_TEASER_AT_KEY, String(Date.now())); } catch (e) {}
    }

    function hideTeaserBubble() {
      if (!bubble) return;
      bubble.style.opacity = '0';
      bubble.style.pointerEvents = 'none';
    }

    function showTeaserBubble(text, kind) {
      if (!bubble || chatOpen) return;
      var body = bubble.lastChild;
      if (body && body.textContent !== undefined) body.textContent = text;
      try { bubble.setAttribute('data-wcw-teaser-kind', kind || ''); } catch (e) {}
      bubble.style.opacity = '1';
      bubble.style.pointerEvents = 'auto';
    }

    function cancelPendingTeaser() {
      teaserGen += 1;
      if (pendingTeaserTimer) {
        clearTimeout(pendingTeaserTimer);
        pendingTeaserTimer = null;
      }
    }

    function scheduleGlobalTeaser() {
      if (OPEN_BEHAVIOR !== 'teaser' || teaserAlreadyShown() || chatOpen) return false;
      markTeaserShown();
      var gen = teaserGen;
      var delay = prefersReducedMotion() ? 0 : PAGE_TEASER_DELAY_MS;
      var hold = prefersReducedMotion() ? 0 : PAGE_TEASER_HOLD_MS;
      pendingTeaserTimer = setTimeout(function() {
        if (gen !== teaserGen || chatOpen) return;
        showTeaserBubble(teaserText(), 'global');
        if (!hold) return;
        pendingTeaserTimer = setTimeout(function() {
          if (gen !== teaserGen || iframeLoaded) return;
          hideTeaserBubble();
        }, hold);
      }, delay);
      return true;
    }

    function schedulePageRuleTeaser() {
      if (OPEN_BEHAVIOR !== 'teaser' || chatOpen || !allowDevice() || teaserBlocked) return false;
      var r = activeRule();
      var key = ruleKey(r);
      var text = pageRuleTeaserCopy(r);
      if (!key || !text || pageTeaserShown(key) || pageTeaserCooldownActive()) return false;
      var gen = teaserGen;
      var delay = prefersReducedMotion() ? 0 : PAGE_TEASER_DELAY_MS;
      var hold = prefersReducedMotion() ? 0 : PAGE_TEASER_HOLD_MS;
      pendingTeaserTimer = setTimeout(function() {
        if (gen !== teaserGen || chatOpen || teaserBlocked) return;
        var now = activeRule();
        if (ruleKey(now) !== key) return;
        showTeaserBubble(text, 'page');
        markPageTeaserShown(key);
        markPageTeaserCooldown();
        if (!hold) return;
        pendingTeaserTimer = setTimeout(function() {
          if (gen !== teaserGen) return;
          hideTeaserBubble();
        }, hold);
      }, delay);
      return true;
    }

    function planTeasers() {
      if (!revealed || chatOpen || OPEN_BEHAVIOR !== 'teaser' || !allowDevice()) return;
      cancelPendingTeaser();
      if (activeRule()) {
        schedulePageRuleTeaser();
        return;
      }
      scheduleGlobalTeaser();
    }

    function iframeSrc() {
      var base = ORIGIN + '/widget-frame/' + WIDGET_ID;
      var qs = [];
      var pr = prefillText();
      if (pr) qs.push('prefill=' + encodeURIComponent(pr));
      var gr = welcomeText();
      if (gr) qs.push('greeting=' + encodeURIComponent(gr));
      try {
        if (typeof window !== 'undefined' && window.location && window.location.href) {
          qs.push('parentUrl=' + encodeURIComponent(window.location.href));
        }
      } catch (e) {}
      if (cfg.locale) qs.push('locale=' + encodeURIComponent(cfg.locale));
      return qs.length ? (base + '?' + qs.join('&')) : base;
    }

    function setLauncherOpen(open) {
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.setAttribute('aria-label', open ? ARIA_CLOSE : ARIA_OPEN);
      if (LAUNCHER_STYLE === 'circle') {
        btn.innerHTML = iconHtml(open ? CLOSE_SVG : ICON_SVG);
        return;
      }
      while (btn.firstChild) btn.removeChild(btn.firstChild);
      if (open) {
        btn.innerHTML = iconHtml(CLOSE_SVG);
        return;
      }
      if (LOGO_URL && LAUNCHER_STYLE === 'card') {
        var img = document.createElement('img');
        img.src = LOGO_URL;
        img.alt = '';
        img.width = 28;
        img.height = 28;
        img.referrerPolicy = 'no-referrer';
        img.addEventListener('error', function() {
          if (img.parentNode) img.parentNode.removeChild(img);
        });
        img.style.cssText = 'width:28px;height:28px;border-radius:999px;object-fit:cover;flex-shrink:0;';
        btn.appendChild(img);
      } else {
        var wrap = document.createElement('span');
        wrap.setAttribute('aria-hidden', 'true');
        wrap.innerHTML = iconHtml(ICON_SVG);
        btn.appendChild(wrap);
      }
      var label = document.createElement('span');
      label.style.cssText = 'min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:600;';
      label.textContent = LAUNCHER_STYLE === 'card' ? DISPLAY_NAME : LAUNCHER_LABEL;
      btn.appendChild(label);
    }

    function createButton() {
      btn = document.createElement('button');
      btn.setAttribute('type', 'button');
      btn.setAttribute('data-wcw', 'toggle');
      btn.setAttribute('data-testid', 'wcw-launcher');
      btn.style.cssText = LAUNCHER_CSS;
      setLauncherOpen(false);
      btn.setAttribute('dir', DIR);
      btn.addEventListener('click', toggleChat);
      document.body.appendChild(btn);
    }

    function createBubble() {
      bubble = document.createElement('button');
      bubble.setAttribute('type', 'button');
      bubble.setAttribute('data-wcw', 'teaser');
      bubble.style.cssText = TEASER_CSS + 'opacity:0;pointer-events:none;transition:opacity .2s;border:none;cursor:pointer;text-align:left;';
      if (prefersReducedMotion()) {
        bubble.style.transition = 'none';
      }
      var kicker = document.createElement('div');
      kicker.style.cssText = 'font-size:11px;font-weight:600;color:' + COLOR + ';margin-bottom:4px;overflow-wrap:anywhere;';
      kicker.textContent = DISPLAY_NAME;
      var body = document.createElement('div');
      body.style.cssText = 'overflow-wrap:anywhere;word-break:break-word;';
      body.textContent = teaserText();
      bubble.appendChild(kicker);
      bubble.appendChild(body);
      bubble.setAttribute('dir', DIR);
      bubble.addEventListener('click', function() {
        if (!chatOpen) toggleChat();
      });
      document.body.appendChild(bubble);
      planTeasers();
    }

    var brandingReady = false;
    var chatOpen = false;
    var frameContainer = null;
    var lastPostedPageKey = '';
    var historyHooked = false;

    function parentPagePayload() {
      var href = '';
      var pageTitle = '';
      var referrer = '';
      try { href = window.location.href || ''; } catch (e) {}
      try { pageTitle = document.title || ''; } catch (e2) {}
      try {
        var ref = String(document.referrer || '');
        if (ref.indexOf('https://') === 0 || ref.indexOf('http://') === 0) referrer = ref;
      } catch (e3) {}
      return {
        source: 'wcw-parent',
        type: 'wcw-page-context',
        widgetId: WIDGET_ID,
        href: href,
        pageTitle: pageTitle,
        referrer: referrer
      };
    }

    function postPageContext() {
      var fr = frameContainer && frameContainer.querySelector('iframe');
      if (!fr || !fr.contentWindow) return;
      var payload = parentPagePayload();
      var key = String(payload.href || '') + '\\n' + String(payload.pageTitle || '');
      if (key === lastPostedPageKey) return;
      lastPostedPageKey = key;
      try {
        fr.contentWindow.postMessage(payload, ORIGIN);
      } catch (err) {}
    }

    function hookHistory() {
      if (historyHooked) return;
      historyHooked = true;
      var hist = window.history;
      try {
        if (hist && typeof hist.pushState === 'function') {
          var origPush = hist.pushState;
          hist.pushState = function() {
            var ret = origPush.apply(this, arguments);
            try { onParentNavigate(); } catch (navErr) {}
            return ret;
          };
        }
      } catch (pushErr) {}
      try {
        if (hist && typeof hist.replaceState === 'function') {
          var origReplace = hist.replaceState;
          hist.replaceState = function() {
            var ret = origReplace.apply(this, arguments);
            try { onParentNavigate(); } catch (navErr2) {}
            return ret;
          };
        }
      } catch (replaceErr) {}
      try {
        window.addEventListener('popstate', onParentNavigate);
        window.addEventListener('hashchange', onParentNavigate);
      } catch (listenErr) {}
    }

    function onParentNavigate() {
      hideTeaserBubble();
      cancelPendingTeaser();
      postPageContext();
      planTeasers();
    }

    function hidePanelFrame(immediate) {
      if (!frameContainer) return;
      frameContainer.style.pointerEvents = 'none';
      frameContainer.style.visibility = 'hidden';
      frameContainer.style.opacity = '0';
      if (!prefersReducedMotion()) {
        frameContainer.style.transform = 'scale(0.9) translateY(16px)';
      }
      if (immediate) frameContainer.style.display = 'none';
    }

    function revealPanelIfOpen() {
      if (!chatOpen || !frameContainer || !brandingReady) return;
      frameContainer.style.display = 'block';
      frameContainer.style.visibility = 'visible';
      frameContainer.style.pointerEvents = 'auto';
      if (prefersReducedMotion()) {
        frameContainer.style.opacity = '1';
        frameContainer.style.transform = 'none';
        return;
      }
      requestAnimationFrame(function() {
        requestAnimationFrame(function() {
          if (!chatOpen || !frameContainer || !brandingReady) return;
          frameContainer.style.transform = 'scale(1) translateY(0)';
          frameContainer.style.opacity = '1';
        });
      });
    }

    function onHostMessage(e) {
      try {
        if (e.origin !== ORIGIN) return;
        var data = e.data;
        if (!data || data.source !== 'wcw') return;
        if (String(data.widgetId || '') !== String(WIDGET_ID)) return;
        if (data.type === 'wcw-branding-ready') {
          brandingReady = true;
          revealPanelIfOpen();
          return;
        }
        if (data.type === 'wcw-teaser-gate') {
          teaserBlocked = data.blocked === true;
          if (teaserBlocked) {
            cancelPendingTeaser();
            hideTeaserBubble();
          }
        }
      } catch (err) {}
    }
    window.addEventListener('message', onHostMessage);

    function syncFrameSrc() {
      var fr = frameContainer && frameContainer.querySelector('iframe');
      if (!fr) return;
      postPageContext();
    }

    function loadIframe() {
      if (iframeLoaded) return;
      iframeLoaded = true;
      var container = document.createElement('div');
      container.style.cssText = PANEL_CSS + (prefersReducedMotion()
        ? 'opacity:0;visibility:hidden;pointer-events:none;'
        : 'transform:scale(0.9) translateY(16px);opacity:0;visibility:hidden;pointer-events:none;transition:transform .2s,opacity .2s;');
      container.setAttribute('data-wcw', 'frame-container');
      container.setAttribute('role', 'dialog');
      container.setAttribute('aria-label', DISPLAY_NAME);

      var frame = document.createElement('iframe');
      frame.src = iframeSrc();
      frame.style.cssText = 'width:100%;height:100%;border:none;display:block;max-width:100%;background:transparent;';
      frame.setAttribute('loading', 'eager');
      frame.setAttribute('title', DISPLAY_NAME);
      frame.setAttribute('allow', 'clipboard-write');
      frame.addEventListener('load', function() {
        lastPostedPageKey = '';
        postPageContext();
      });
      container.appendChild(frame);
      document.body.appendChild(container);
      hookHistory();

      return container;
    }

    function toggleChat() {
      chatOpen = !chatOpen;
      setLauncherOpen(chatOpen);
      if (chatOpen) {
        cancelPendingTeaser();
        hideTeaserBubble();
        if (!frameContainer) {
          frameContainer = loadIframe();
        } else {
          frameContainer.style.display = 'block';
          syncFrameSrc();
        }
        revealPanelIfOpen();
      } else {
        if (frameContainer) {
          frameContainer.style.pointerEvents = 'none';
          if (prefersReducedMotion()) {
            hidePanelFrame(true);
          } else {
            frameContainer.style.transform = 'scale(0.9) translateY(16px)';
            frameContainer.style.opacity = '0';
            setTimeout(function() {
              if (frameContainer && !chatOpen) hidePanelFrame(true);
            }, 200);
          }
        }
      }
    }

    function onKey(e) {
      if (e.key === 'Escape' && chatOpen) {
        e.preventDefault();
        toggleChat();
      }
    }

    function scrollDepthPercent() {
      var h = document.documentElement;
      var st = window.pageYOffset != null ? window.pageYOffset : h.scrollTop;
      var sh = h.scrollHeight - h.clientHeight;
      if (sh <= 0) return 100;
      return Math.round((st / sh) * 100);
    }

    function isTouchDevice() {
      return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    }

    function reveal() {
      if (revealed) return;
      if (!allowDevice()) return;
      revealed = true;
      try { createButton(); } catch (btnErr) {}
      try { createBubble(); } catch (bubbleErr) {}
      try { document.addEventListener('keydown', onKey); } catch (keyErr) {}
    }

    function scheduleReveal() {
      if (!allowDevice()) return;
      if (TRIGGER === 'always') {
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(function() { reveal(); }, { timeout: 3000 });
        } else {
          setTimeout(reveal, 0);
        }
        return;
      }
      if (TRIGGER === 'delay') {
        var sec = Math.max(0, parseInt(String(DELAY_SEC), 10) || 0);
        setTimeout(reveal, sec * 1000);
        return;
      }
      if (TRIGGER === 'scroll') {
        function onScroll() {
          if (scrollDepthPercent() >= (parseInt(String(SCROLL_PCT), 10) || 50)) {
            window.removeEventListener('scroll', onScroll, true);
            reveal();
          }
        }
        window.addEventListener('scroll', onScroll, { passive: true, capture: true });
        setTimeout(onScroll, 0);
        return;
      }
      if (TRIGGER === 'exit_intent') {
        if (isTouchDevice()) {
          function onScrollExit() {
            if (scrollDepthPercent() >= (parseInt(String(SCROLL_PCT), 10) || 50)) {
              window.removeEventListener('scroll', onScrollExit, true);
              reveal();
            }
          }
          window.addEventListener('scroll', onScrollExit, { passive: true, capture: true });
          setTimeout(onScrollExit, 0);
        } else {
          function onLeave(e) {
            if (e.clientY <= 0) {
              document.documentElement.removeEventListener('mouseleave', onLeave);
              reveal();
            }
          }
          document.documentElement.addEventListener('mouseleave', onLeave);
        }
        return;
      }
      reveal();
    }

    function boot() {
      if (!document.body) return;
      try { hookHistory(); } catch (hookErr) {}
      scheduleReveal();
    }

    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(function() {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', boot);
        } else {
          boot();
        }
      }, { timeout: 3000 });
    } else {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
      } else {
        setTimeout(boot, 300);
      }
    }
  }

  function cfgFromPayload(data, origin, widgetId) {
    if (!data || typeof data !== 'object') return null;
    var L = data.launcher && typeof data.launcher === 'object' ? data.launcher : {};
    if (!L.launcherCss) return null;
    return {
      color: data.color,
      position: data.position === 'left' ? 'left' : 'right',
      welcomeMessage: data.welcomeMessage,
      widgetId: widgetId,
      origin: origin,
      triggerType: L.triggerType || 'always',
      triggerDelaySeconds: L.triggerDelaySeconds,
      triggerScrollPercent: L.triggerScrollPercent,
      showOnDesktop: L.showOnDesktop !== false,
      showOnMobile: L.showOnMobile !== false,
      pageRules: Array.isArray(L.pageRules) ? L.pageRules : [],
      launcherStyle: data.launcherStyle,
      openBehavior: data.openBehavior,
      launcherCss: L.launcherCss,
      teaserCss: L.teaserCss || '',
      panelCss: L.panelCss || '',
      launcherAriaLabel: L.launcherAriaLabel || 'Open website chat',
      launcherLabel: data.launcherLabel,
      displayName: data.displayName,
      teaserGreeting: data.teaserGreeting,
      logoUrl: data.logoUrl || '',
      iconSvg: L.iconSvg || '',
      closeIconSvg: L.closeIconSvg || '',
      locale: data.locale || '',
      closeAriaLabel: data.chromeCopy && data.chromeCopy.closeAriaLabel ? data.chromeCopy.closeAriaLabel : ''
    };
  }

  function resolveParentLocale() {
    var explicit = '';
    try {
      var el = document.documentElement;
      if (el && el.getAttribute && el.getAttribute('data-webchat-locale')) {
        explicit = String(el.getAttribute('data-webchat-locale') || '');
      }
    } catch (e) {}
    var htmlLang = '';
    try { htmlLang = document.documentElement && document.documentElement.lang ? String(document.documentElement.lang) : ''; } catch (e2) {}
    var path = '';
    try { path = window.location && window.location.pathname ? String(window.location.pathname) : ''; } catch (e3) {}
    var browser = '';
    try { browser = navigator && navigator.language ? String(navigator.language) : ''; } catch (e4) {}
    var fromPath = path.match(/\\/(es|he)(?:\\/|$)/i);
    if (explicit) return explicit.split('-')[0].toLowerCase();
    if (htmlLang) return htmlLang.split('-')[0].toLowerCase();
    if (fromPath) return fromPath[1].toLowerCase();
    if (browser) return browser.split('-')[0].toLowerCase();
    return 'en';
  }

  var install = parseInstall();
  if (!install) return;

  var href = '';
  try { href = window.location.href || ''; } catch (e) {}
  var parentLocale = resolveParentLocale();
  var settingsUrl = install.origin + '/api/webchat/' + encodeURIComponent(install.widgetId) + '/settings';
  var qs = [];
  if (href) qs.push('href=' + encodeURIComponent(href));
  if (parentLocale) qs.push('locale=' + encodeURIComponent(parentLocale));
  if (qs.length) settingsUrl += '?' + qs.join('&');

  fetch(settingsUrl, { cache: 'no-store', credentials: 'omit' })
    .then(function(res) { return res.ok ? res.json() : null; })
    .then(function(data) {
      var cfg = cfgFromPayload(data, install.origin, install.widgetId);
      if (!cfg) return;
      start(cfg);
    })
    .catch(function() {});
})();`;
}

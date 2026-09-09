/**
 * Public /widget.js runtime. Layout CSS and labels come from shared chrome — no user HTML.
 */

import type { WebchatChromeLayout } from "@shared/webchatWidgetChrome";

export type WebchatPublicScriptInput = {
  enabled: boolean;
  widgetId: string;
  origin: string;
  chrome: WebchatChromeLayout;
  triggerType: "always" | "delay" | "scroll" | "exit_intent";
  triggerDelaySeconds: number;
  triggerScrollPercent: number;
  showOnDesktop: boolean;
  showOnMobile: boolean;
  pageRules: Array<{
    urlContains: string;
    greeting: string;
    prefilledMessage: string;
    suggestedQuestions?: string[];
  }>;
};

export function buildWebchatPublicScript(input: WebchatPublicScriptInput): string {
  if (!input.enabled) return "/* widget disabled */";
  const p = input.chrome.presentation;
  return `(function() {
  'use strict';
  var COLOR = ${JSON.stringify(p.color)};
  var POSITION = ${JSON.stringify(p.position)};
  var DEFAULT_WELCOME = ${JSON.stringify(p.welcomeMessage)};
  var WIDGET_ID = ${JSON.stringify(input.widgetId || "")};
  var ORIGIN = ${JSON.stringify(input.origin)};
  var TRIGGER = ${JSON.stringify(input.triggerType)};
  var DELAY_SEC = ${JSON.stringify(input.triggerDelaySeconds)};
  var SCROLL_PCT = ${JSON.stringify(input.triggerScrollPercent)};
  var SHOW_DESKTOP = ${JSON.stringify(input.showOnDesktop)};
  var SHOW_MOBILE = ${JSON.stringify(input.showOnMobile)};
  var PAGE_RULES = ${JSON.stringify(input.pageRules)};
  var LAUNCHER_STYLE = ${JSON.stringify(p.launcherStyle)};
  var OPEN_BEHAVIOR = ${JSON.stringify(p.openBehavior)};
  var LAUNCHER_CSS = ${JSON.stringify(input.chrome.launcherCss)};
  var TEASER_CSS = ${JSON.stringify(input.chrome.teaserCss)};
  var PANEL_CSS = ${JSON.stringify(input.chrome.panelCss)};
  var ARIA_OPEN = ${JSON.stringify(input.chrome.launcherAriaLabel)};
  var ARIA_CLOSE = ${JSON.stringify("Close website chat")};
  var LAUNCHER_LABEL = ${JSON.stringify(p.launcherLabel)};
  var DISPLAY_NAME = ${JSON.stringify(p.displayName)};
  var TEASER_TEXT = ${JSON.stringify(p.teaserGreeting)};
  var LOGO_URL = ${JSON.stringify(p.logoUrl)};
  var ICON_SVG = ${JSON.stringify(input.chrome.iconSvg)};
  var CLOSE_SVG = ${JSON.stringify(input.chrome.closeIconSvg)};
  var HEADER_COLOR = ${JSON.stringify(p.headerTextColor)};

  if (window.__wcwInit) return;
  window.__wcwInit = true;

  var btn, bubble, iframeLoaded = false;
  var revealed = false;

  var TEASER_KEY = 'wcw-teaser-' + WIDGET_ID;

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

  function activeRule() {
    var rules = PAGE_RULES || [];
    for (var i = 0; i < rules.length; i++) {
      var q = (rules[i].urlContains || '').trim();
      if (q && window.location.href.indexOf(q) !== -1) return rules[i];
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
    var r = activeRule();
    if (r && r.greeting) return r.greeting;
    return TEASER_TEXT || DEFAULT_WELCOME;
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
    bubble.addEventListener('click', function() {
      if (!chatOpen) toggleChat();
    });
    document.body.appendChild(bubble);
    if (OPEN_BEHAVIOR !== 'teaser' || teaserAlreadyShown()) return;
    markTeaserShown();
    var teaserDelay = prefersReducedMotion() ? 0 : 1200;
    var teaserHold = prefersReducedMotion() ? 0 : 8000;
    setTimeout(function() {
      bubble.style.opacity = '1';
      bubble.style.pointerEvents = 'auto';
      if (!teaserHold) return;
      setTimeout(function() {
        if (!iframeLoaded) {
          bubble.style.opacity = '0';
          bubble.style.pointerEvents = 'none';
        }
      }, teaserHold);
    }, teaserDelay);
  }

  function loadIframe() {
    if (iframeLoaded) return;
    iframeLoaded = true;
    var container = document.createElement('div');
    container.style.cssText = PANEL_CSS + (prefersReducedMotion()
      ? 'opacity:1;'
      : 'transform:scale(0.9) translateY(16px);opacity:0;transition:transform .2s,opacity .2s;');
    container.setAttribute('data-wcw', 'frame-container');
    container.setAttribute('role', 'dialog');
    container.setAttribute('aria-label', DISPLAY_NAME);

    var frame = document.createElement('iframe');
    frame.src = iframeSrc();
    frame.style.cssText = 'width:100%;height:100%;border:none;display:block;max-width:100%;';
    frame.setAttribute('loading', 'lazy');
    frame.setAttribute('title', DISPLAY_NAME);
    frame.setAttribute('allow', 'clipboard-write');
    container.appendChild(frame);
    document.body.appendChild(container);

    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        container.style.transform = 'scale(1) translateY(0)';
        container.style.opacity = '1';
      });
    });

    return container;
  }

  var chatOpen = false;
  var frameContainer = null;

  function toggleChat() {
    chatOpen = !chatOpen;
    setLauncherOpen(chatOpen);
    if (chatOpen) {
      if (bubble) {
        bubble.style.opacity = '0';
        bubble.style.pointerEvents = 'none';
      }
      if (!frameContainer) {
        frameContainer = loadIframe();
      } else {
        var fr = frameContainer.querySelector('iframe');
        if (fr) fr.src = iframeSrc();
        frameContainer.style.display = 'block';
        requestAnimationFrame(function() {
          requestAnimationFrame(function() {
            frameContainer.style.transform = 'scale(1) translateY(0)';
            frameContainer.style.opacity = '1';
          });
        });
      }
    } else {
      if (frameContainer) {
        if (prefersReducedMotion()) {
          frameContainer.style.display = 'none';
          frameContainer.style.opacity = '0';
        } else {
          frameContainer.style.transform = 'scale(0.9) translateY(16px)';
          frameContainer.style.opacity = '0';
          setTimeout(function() {
            if (frameContainer && !chatOpen) frameContainer.style.display = 'none';
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
    createButton();
    createBubble();
    document.addEventListener('keydown', onKey);
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
})();`;
}

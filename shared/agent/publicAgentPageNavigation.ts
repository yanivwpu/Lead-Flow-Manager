export const agentPageNavigationCss = `
    .agent-site-nav {
      position: relative;
      z-index: 12;
      margin-bottom: 10px;
      padding: 4px 8px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: #fff;
    }
    .agent-nav-items, .agent-nav-submenu { margin: 0; padding: 0; list-style: none; }
    .agent-nav-items { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; }
    .agent-site-nav :is(a, summary, button) {
      display: block;
      padding: 8px 12px;
      border-radius: 8px;
      color: var(--ink);
      font: inherit;
      font-size: .875rem;
      font-weight: 500;
      text-decoration: none;
    }
    .agent-site-nav :is(a, summary, button):hover { background: var(--bg); }
    .agent-site-nav :is(a, summary, button):focus-visible {
      outline: 2px solid var(--brand-dark);
      outline-offset: 1px;
    }
    .agent-site-nav [aria-current="page"], .agent-site-nav [data-current-section] > summary {
      background: #ecfdf5;
      color: #065f46;
      font-weight: 600;
    }
    .agent-nav-disclosure { position: relative; }
    .agent-nav-disclosure summary { cursor: pointer; display: list-item; }
    .agent-nav-submenu {
      position: absolute;
      inset: calc(100% + 6px) auto auto 0;
      width: min(18rem, 72vw);
      max-height: min(50vh, 24rem);
      overflow-y: auto;
      overflow-wrap: anywhere;
      padding: 4px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: #fff;
      box-shadow: 0 8px 24px #0f172a18;
    }
    .agent-site-nav button {
      min-height: 44px;
      border: 1px solid var(--border);
      background: #fff;
      cursor: pointer;
    }
    .agent-site-nav .agent-menu-toggle { display: none; align-items: center; gap: 8px; }
    .agent-menu-icon {
      width: 16px;
      height: 12px;
      border-block: 2px solid currentColor;
      background: linear-gradient(currentColor, currentColor) center / 100% 2px no-repeat;
    }
    .agent-menu-drawer {
      position: fixed;
      inset: 0 auto 0 0;
      margin: 0;
      max-width: none;
      max-height: none;
      width: min(88vw, 22rem);
      height: 100%;
      height: 100dvh;
      padding: 0;
      overflow: auto;
      overscroll-behavior: contain;
      border: 0;
      border-right: 1px solid var(--border);
      background: #fff;
      color: var(--ink);
      transform: translateX(-100%);
      transition: transform 180ms ease, display 180ms allow-discrete, overlay 180ms allow-discrete;
    }
    .agent-menu-drawer[open] { transform: translateX(0); }
    .agent-menu-drawer::backdrop {
      background: #0f172a00;
      transition: background-color 180ms ease, display 180ms allow-discrete, overlay 180ms allow-discrete;
    }
    .agent-menu-drawer[open]::backdrop { background: #0f172a70; }
    @starting-style {
      .agent-menu-drawer[open] { transform: translateX(-100%); }
      .agent-menu-drawer[open]::backdrop { background: #0f172a00; }
    }
    html:has(.agent-menu-drawer[open]) { overflow: hidden; }
    .agent-menu-drawer-body { min-height: 100%; padding: 16px; }
    .agent-drawer-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }
    .agent-menu-drawer .agent-nav-items { display: grid; gap: 4px; margin-top: 8px; }
    .agent-menu-drawer :is(a, summary) { padding-block: 11px; }
    .agent-menu-drawer .agent-nav-submenu {
      position: static;
      width: auto;
      max-height: none;
      margin-left: 12px;
      padding: 0 0 0 8px;
      border: 0;
      border-left: 1px solid var(--border);
      border-radius: 0;
      box-shadow: none;
    }
    @media (max-width: 639px) {
      .agent-site-nav.is-enhanced .agent-nav-inline { display: none; }
      .agent-site-nav.is-enhanced .agent-menu-toggle { display: inline-flex; }
      .agent-nav-inline .agent-nav-submenu { position: static; width: auto; }
    }
    @media (prefers-reduced-motion: reduce) {
      .agent-menu-drawer, .agent-menu-drawer::backdrop { transition: none; }
    }
`;

export const agentPageNavigationScript = `
      var navigation = document.getElementById("agent-site-nav");
      if (navigation) {
        var menuToggle = document.getElementById("agent-menu-toggle");
        var menuDrawer = document.getElementById("agent-menu-drawer");
        var inlineDisclosure = navigation.querySelector(".agent-nav-inline details");
        var drawerDisclosure = menuDrawer.querySelector("details");

        if (typeof menuDrawer.showModal === "function") {
          navigation.classList.add("is-enhanced");
          menuToggle.addEventListener("click", function () {
            if (drawerDisclosure) drawerDisclosure.open = drawerDisclosure.hasAttribute("data-current-section");
            menuDrawer.showModal();
            menuToggle.setAttribute("aria-expanded", "true");
          });
          document.getElementById("agent-menu-close").addEventListener("click", function () {
            menuDrawer.close();
          });
          menuDrawer.addEventListener("close", function () {
            menuToggle.setAttribute("aria-expanded", "false");
          });
          menuDrawer.addEventListener("click", function (event) {
            if (event.target === menuDrawer) {
              var bounds = menuDrawer.getBoundingClientRect();
              if (event.clientX < bounds.left || event.clientX > bounds.right ||
                  event.clientY < bounds.top || event.clientY > bounds.bottom) menuDrawer.close();
            }
          });
          window.matchMedia("(max-width: 639px)").addEventListener("change", function (event) {
            if (!event.matches && menuDrawer.open) {
              menuDrawer.close();
              navigation.querySelector(".agent-nav-inline a").focus();
            } else if (event.matches && inlineDisclosure && inlineDisclosure.open) {
              inlineDisclosure.open = false;
            }
          });
        }

        if (inlineDisclosure) {
          document.addEventListener("click", function (event) {
            if (!inlineDisclosure.contains(event.target)) inlineDisclosure.open = false;
          });
          inlineDisclosure.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && inlineDisclosure.open) {
              event.preventDefault();
              inlineDisclosure.open = false;
              inlineDisclosure.querySelector("summary").focus();
            }
          });
        }

        navigation.addEventListener("click", function (event) {
          var link = event.target.closest("a");
          if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
          if (menuDrawer.open) menuDrawer.close();
          if (inlineDisclosure) inlineDisclosure.open = false;
          if (link.hasAttribute("data-agent-nav-contact") && btnMessage) {
            event.preventDefault();
            btnMessage.focus();
            btnMessage.click();
            if (backdrop.classList.contains("open")) form.querySelector('input[name="name"]').focus();
            else if (chatWidget && chatWidget.classList.contains("open") && chatClose) chatClose.focus();
          }
        });
      }
`;

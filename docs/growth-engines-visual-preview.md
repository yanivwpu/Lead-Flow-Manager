# Growth Engines visual preview

This development-only page renders the production `GrowthEngineGalleryCard` and
`WorkflowWalkthrough` components with local fixture data. It does not load the
application shell, authenticate a user, call an API, or require `DATABASE_URL`.

## Run it

```bash
npm run dev:client -- --host 0.0.0.0
```

Open:

```text
http://localhost:5000/growth-engines-preview.html
```

The page is guarded by `import.meta.env.DEV`. A production build shows only a
development-only notice if the HTML entry is explicitly built or served.

## Review checklist

1. At 1440 px and 1280 px, confirm the cards align without clipped names or
   status badges and the workflow connectors terminate at the intended nodes.
2. At 390 px, confirm cards stack, actions remain readable, and the workflow is
   presented as full-width steps rather than a miniaturized canvas.
3. Use the **EN**, **ES**, and **HE** controls. For Hebrew, confirm the page and
   captions use RTL while the process canvas keeps a stable visual direction.
4. Select each route: **Viewing**, **Financing**, **Moving**, and **Not ready**.
5. Select **Play example**, pause during a route, resume it, and use **Replay**
   after completion. Confirm the lead marker and active-node highlight follow
   the selected green connectors.
6. Enable the operating system/browser `prefers-reduced-motion: reduce`
   emulation, reload, and confirm the lead marker changes steps without motion.
7. Tab through language, branch, and playback controls and confirm visible focus
   and keyboard activation.

CTA clicks are intentionally intercepted and printed as **Mock navigation** so
the fixture never enters authenticated production routes.

/**
 * Homepage hero LCP image — shared markup for static shell + React.
 * Keeps aspect ratio 560/871 and responsive AVIF/WebP sources.
 */

export const HERO_IMAGE_WIDTH = 560;
export const HERO_IMAGE_HEIGHT = 871;
export const HERO_IMAGE_SIZES = "(min-width: 1024px) 380px, 350px";
export const HERO_IMAGE_PNG = "/hero/whachat-hero-mockup.png";

export const HERO_AVIF_SRCSET = [
  "/hero/hero-400.avif 400w",
  "/hero/hero-640.avif 640w",
  "/hero/hero-768.avif 768w",
  "/hero/hero-1024.avif 1024w",
].join(", ");

export const HERO_WEBP_SRCSET = [
  "/hero/hero-400.webp 400w",
  "/hero/hero-640.webp 640w",
  "/hero/hero-768.webp 768w",
  "/hero/hero-1024.webp 1024w",
].join(", ");

/** Preferred preload candidate for mobile LCP (covers ~350–380 CSS px at 2x). */
export const HERO_LCP_PRELOAD_AVIF = "/hero/hero-640.avif";

/**
 * Product-page visual themes — shared brand, distinct accents.
 * Green remains reserved for primary CTA and success/approved states.
 */

export type ProductThemeId =
  | "violet"
  | "indigo"
  | "teal"
  | "amber"
  | "rose"
  | "emerald"
  | "sky"
  | "slate";

export type ProductTheme = {
  id: ProductThemeId;
  /** Tailwind-ish class tokens used by ProductPage */
  accentText: string;
  accentBg: string;
  accentSoft: string;
  accentBorder: string;
  accentRing: string;
  heroBg: string;
  sectionAltBg: string;
  nodeBg: string;
  nodeText: string;
  badgeBg: string;
  badgeText: string;
  gradientFrom: string;
  gradientTo: string;
};

export const PRODUCT_THEMES: Record<ProductThemeId, ProductTheme> = {
  violet: {
    id: "violet",
    accentText: "text-violet-700",
    accentBg: "bg-violet-600",
    accentSoft: "bg-violet-50",
    accentBorder: "border-violet-200",
    accentRing: "ring-violet-100",
    heroBg: "bg-gradient-to-br from-violet-50 via-white to-fuchsia-50/40",
    sectionAltBg: "bg-violet-50/50",
    nodeBg: "bg-violet-600",
    nodeText: "text-white",
    badgeBg: "bg-violet-100",
    badgeText: "text-violet-800",
    gradientFrom: "from-violet-600",
    gradientTo: "to-fuchsia-500",
  },
  indigo: {
    id: "indigo",
    accentText: "text-indigo-700",
    accentBg: "bg-indigo-600",
    accentSoft: "bg-indigo-50",
    accentBorder: "border-indigo-200",
    accentRing: "ring-indigo-100",
    heroBg: "bg-gradient-to-br from-indigo-50 via-white to-sky-50/50",
    sectionAltBg: "bg-indigo-50/45",
    nodeBg: "bg-indigo-600",
    nodeText: "text-white",
    badgeBg: "bg-indigo-100",
    badgeText: "text-indigo-800",
    gradientFrom: "from-indigo-600",
    gradientTo: "to-violet-500",
  },
  teal: {
    id: "teal",
    accentText: "text-teal-700",
    accentBg: "bg-teal-600",
    accentSoft: "bg-teal-50",
    accentBorder: "border-teal-200",
    accentRing: "ring-teal-100",
    heroBg: "bg-gradient-to-br from-teal-50 via-white to-cyan-50/50",
    sectionAltBg: "bg-teal-50/45",
    nodeBg: "bg-teal-600",
    nodeText: "text-white",
    badgeBg: "bg-teal-100",
    badgeText: "text-teal-800",
    gradientFrom: "from-teal-600",
    gradientTo: "to-cyan-500",
  },
  amber: {
    id: "amber",
    accentText: "text-amber-800",
    accentBg: "bg-amber-500",
    accentSoft: "bg-amber-50",
    accentBorder: "border-amber-200",
    accentRing: "ring-amber-100",
    heroBg: "bg-gradient-to-br from-amber-50 via-white to-orange-50/40",
    sectionAltBg: "bg-amber-50/50",
    nodeBg: "bg-amber-500",
    nodeText: "text-white",
    badgeBg: "bg-amber-100",
    badgeText: "text-amber-900",
    gradientFrom: "from-amber-500",
    gradientTo: "to-orange-500",
  },
  rose: {
    id: "rose",
    accentText: "text-rose-700",
    accentBg: "bg-rose-600",
    accentSoft: "bg-rose-50",
    accentBorder: "border-rose-200",
    accentRing: "ring-rose-100",
    heroBg: "bg-gradient-to-br from-rose-50 via-white to-fuchsia-50/40",
    sectionAltBg: "bg-rose-50/45",
    nodeBg: "bg-rose-600",
    nodeText: "text-white",
    badgeBg: "bg-rose-100",
    badgeText: "text-rose-800",
    gradientFrom: "from-rose-600",
    gradientTo: "to-fuchsia-500",
  },
  emerald: {
    id: "emerald",
    accentText: "text-emerald-700",
    accentBg: "bg-emerald-600",
    accentSoft: "bg-emerald-50",
    accentBorder: "border-emerald-200",
    accentRing: "ring-emerald-100",
    heroBg: "bg-gradient-to-br from-emerald-50 via-white to-sky-50/50",
    sectionAltBg: "bg-emerald-50/40",
    nodeBg: "bg-emerald-600",
    nodeText: "text-white",
    badgeBg: "bg-emerald-100",
    badgeText: "text-emerald-800",
    gradientFrom: "from-emerald-600",
    gradientTo: "to-teal-500",
  },
  sky: {
    id: "sky",
    accentText: "text-sky-700",
    accentBg: "bg-sky-600",
    accentSoft: "bg-sky-50",
    accentBorder: "border-sky-200",
    accentRing: "ring-sky-100",
    heroBg: "bg-gradient-to-br from-sky-50 via-white to-slate-50",
    sectionAltBg: "bg-sky-50/45",
    nodeBg: "bg-sky-600",
    nodeText: "text-white",
    badgeBg: "bg-sky-100",
    badgeText: "text-sky-800",
    gradientFrom: "from-sky-600",
    gradientTo: "to-blue-500",
  },
  slate: {
    id: "slate",
    accentText: "text-slate-700",
    accentBg: "bg-slate-700",
    accentSoft: "bg-slate-50",
    accentBorder: "border-slate-200",
    accentRing: "ring-slate-100",
    heroBg: "bg-gradient-to-br from-slate-50 via-white to-sky-50/40",
    sectionAltBg: "bg-slate-50",
    nodeBg: "bg-slate-700",
    nodeText: "text-white",
    badgeBg: "bg-slate-100",
    badgeText: "text-slate-800",
    gradientFrom: "from-slate-700",
    gradientTo: "to-sky-600",
  },
};

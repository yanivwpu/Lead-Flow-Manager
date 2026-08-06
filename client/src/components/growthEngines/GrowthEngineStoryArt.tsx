import { useId, type ReactNode } from "react";

export type GrowthEngineStoryVariant = "property" | "wellness" | "capital" | "trades";

type StoryConfig = {
  caption: string;
  industry: ReactNode;
  outcome: ReactNode;
};

/**
 * Neutral placeholder artwork for Coming Soon Growth Engines.
 * Soft slate / blue-gray — not emerald (Realtor) and not navy/cyan (Prospect AI).
 * Final engines get their own permanent visual identity later.
 * Pattern: Industry → AI → Business Outcome.
 */
export function GrowthEngineStoryArt({
  variant,
  className,
}: {
  variant: GrowthEngineStoryVariant;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const stroke = `ge-ph-stroke-${uid}`;
  const story = STORIES[variant];

  return (
    <div
      className={className}
      aria-hidden
      style={{
        background:
          "radial-gradient(ellipse 80% 60% at 50% 40%, rgba(148, 163, 184, 0.18), transparent 55%), linear-gradient(165deg, #334155 0%, #475569 48%, #64748B 100%)",
      }}
    >
      <svg
        viewBox="0 0 640 220"
        className="h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id={stroke} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#CBD5E1" stopOpacity="0.25" />
            <stop offset="50%" stopColor="#E2E8F0" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#CBD5E1" stopOpacity="0.3" />
          </linearGradient>
        </defs>

        <g stroke={`url(#${stroke})`} strokeWidth="1.2" fill="none" strokeLinecap="round">
          <path d="M130 70 C190 78, 240 88, 286 96" />
          <path d="M120 120 C190 110, 240 100, 286 96" />
          <path d="M354 96 C410 96, 460 80, 520 70" />
          <path d="M354 96 C410 96, 460 112, 520 126" />
        </g>

        <g
          fill="none"
          stroke="#E2E8F0"
          strokeWidth="1.45"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.88"
        >
          {story.industry}
        </g>

        {/* Simple placeholder AI — chat + spark (not branded Prospect/Realtor) */}
        <g transform="translate(320 96)">
          <path
            d="M-22 -16 h44 a8 8 0 0 1 8 8 v18 a8 8 0 0 1-8 8 H-2 l-8 8 v-8 h-12 a8 8 0 0 1-8-8 v-18 a8 8 0 0 1 8-8z"
            fill="#334155"
            stroke="#F1F5F9"
            strokeWidth="1.4"
          />
          <path
            d="M0 -4 l1.6 3.8 4.1.3-3.1 2.6 1 3.9L0 4.2l-3.6 2.4 1-3.9-3.1-2.6 4.1-.3z"
            fill="#F8FAFC"
            opacity="0.9"
          />
        </g>

        <g
          fill="none"
          stroke="#E2E8F0"
          strokeWidth="1.45"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.88"
        >
          {story.outcome}
        </g>

        <text
          x="320"
          y="202"
          textAnchor="middle"
          fill="#F8FAFC"
          opacity="0.5"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize="10"
          letterSpacing="1.8"
          fontWeight="600"
        >
          {story.caption}
        </text>
      </svg>
    </div>
  );
}

const STORIES: Record<GrowthEngineStoryVariant, StoryConfig> = {
  property: {
    caption: "TENANTS • LEASING • FOLLOW-UP",
    industry: (
      <>
        <g transform="translate(78 52)">
          <path d="M4 22 V8 h20 v14" />
          <path d="M4 8 l10-6 10 6" />
          <path d="M10 12 h3 v3 h-3 z M17 12 h3 v3 h-3 z" />
        </g>
        <g transform="translate(120 108)">
          <path d="M4 20 V6 h18 v14" />
          <path d="M4 6 l9-5 9 5" />
          <path d="M11 12 h4 v8 h-4 z" />
        </g>
      </>
    ),
    outcome: (
      <>
        <g transform="translate(504 52)">
          <path d="M4 6 h24 a4 4 0 0 1 4 4 v10 a4 4 0 0 1-4 4 H14 l-6 6 v-6 H4 a4 4 0 0 1-4-4 V10 a4 4 0 0 1 4-4z" />
        </g>
        <g transform="translate(508 112)">
          <rect x="2" y="4" width="24" height="22" rx="3" />
          <path d="M8 10 h12 M8 15 h12" opacity="0.75" />
        </g>
      </>
    ),
  },
  wellness: {
    caption: "CAPTURE • BOOK • RETAIN",
    industry: (
      <>
        <g transform="translate(86 56)">
          <circle cx="14" cy="14" r="11" />
          <path d="M14 7 v14 M7 14 h14" />
        </g>
        <g transform="translate(118 112)">
          <path d="M8 6 c0-3 4-5 7-2 3-3 7-1 7 2 0 5-7 11-7 11S8 11 8 6z" />
        </g>
      </>
    ),
    outcome: (
      <>
        <g transform="translate(506 54)">
          <rect x="4" y="4" width="24" height="22" rx="3" />
          <path d="M4 10 h24" />
        </g>
        <g transform="translate(508 114)">
          <circle cx="16" cy="12" r="8" />
          <path d="M16 8 v4 l3 2" />
        </g>
      </>
    ),
  },
  capital: {
    caption: "QUALIFY • NURTURE • CLOSE",
    industry: (
      <>
        <g transform="translate(82 58)">
          <path d="M4 22 V6" />
          <path d="M4 22 h24" />
          <path d="M8 18 V12 M14 18 V8 M20 18 V14" />
        </g>
        <g transform="translate(122 110)">
          <circle cx="14" cy="10" r="7" />
          <path d="M14 17 v7 M8 24 h12" />
        </g>
      </>
    ),
    outcome: (
      <>
        <g transform="translate(506 52)">
          <path d="M8 4 h14 l8 8 v16 H8 z" />
          <path d="M22 4 v8 h8" />
        </g>
        <g transform="translate(508 114)">
          <path d="M4 6 h24 a4 4 0 0 1 4 4 v10 a4 4 0 0 1-4 4 H14 l-6 6 v-6 H4 a4 4 0 0 1-4-4 V10 a4 4 0 0 1 4-4z" />
        </g>
      </>
    ),
  },
  trades: {
    caption: "INTAKE • BOOK • FOLLOW-UP",
    industry: (
      <>
        <g transform="translate(86 58)">
          <path d="M8 8 l6 6-4 4 8 8 4-4 6 6" />
        </g>
        <g transform="translate(120 112)">
          <path d="M6 8 h20 v14 H6 z" />
          <path d="M10 8 V5 h12 v3" />
        </g>
      </>
    ),
    outcome: (
      <>
        <g transform="translate(506 54)">
          <rect x="4" y="4" width="24" height="22" rx="3" />
          <path d="M4 10 h24" />
        </g>
        <g transform="translate(508 114)">
          <path d="M4 6 h24 a4 4 0 0 1 4 4 v10 a4 4 0 0 1-4 4 H14 l-6 6 v-6 H4 a4 4 0 0 1-4-4 V10 a4 4 0 0 1 4-4z" />
        </g>
      </>
    ),
  },
};

import { useId, type ReactNode } from "react";

export type GrowthEngineStoryVariant = "property" | "wellness" | "capital" | "trades";

type StoryConfig = {
  caption: string;
  /** Industry icons drawn at left (translate origins already applied inside). */
  industry: ReactNode;
  /** Outcome icons drawn at right. */
  outcome: ReactNode;
};

/**
 * Shared dark-green storytelling header for Growth Engine cards.
 * Pattern: Industry → AI → Business Outcome (readable in under two seconds).
 */
export function GrowthEngineStoryArt({
  variant,
  className,
}: {
  variant: GrowthEngineStoryVariant;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const stroke = `ge-stroke-${uid}`;
  const story = STORIES[variant];

  return (
    <div
      className={className}
      aria-hidden
      style={{
        background:
          "radial-gradient(ellipse 85% 70% at 50% 40%, rgba(5, 150, 105, 0.2), transparent 58%), linear-gradient(160deg, #052e24 0%, #064e3b 42%, #065f46 78%, #0a3d32 100%)",
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
            <stop offset="0%" stopColor="#059669" stopOpacity="0.25" />
            <stop offset="45%" stopColor="#34d399" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#059669" stopOpacity="0.3" />
          </linearGradient>
        </defs>

        <circle cx="320" cy="96" r="78" fill="#059669" opacity="0.06" />

        <g stroke={`url(#${stroke})`} strokeWidth="1.25" fill="none" strokeLinecap="round">
          <path d="M130 70 C190 78, 240 88, 286 96" />
          <path d="M120 120 C190 110, 240 100, 286 96" />
          <path d="M354 96 C410 96, 460 80, 520 70" />
          <path d="M354 96 C410 96, 460 112, 520 126" />
        </g>

        <g
          fill="none"
          stroke="#34d399"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.92"
        >
          {story.industry}
        </g>

        {/* Central AI node */}
        <g transform="translate(320 96)">
          <circle r="26" fill="#022c22" stroke="#34d399" strokeWidth="1.4" />
          <g
            fill="none"
            stroke="#a7f3d0"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M-9 -5 c-3.5-4.5 1-10 6.5-9 2-3.5 7-3.5 9 0 4.5-1.5 9 2 7 6.5 2.5 1 3.5 5.5 1 8-1 3.5-4.5 5.5-8 4.5-2 2.5-6.5 2.5-8.5 0-3.5 1-7-2-7-5.5 0-2 1-3.5 0-4.5z" />
            <path d="M-1 -11 v16 M-1 -2 c-3.5 0-5.5 2-5.5 4.5 M-1 -2 c3.5 0 5.5 2 5.5 4.5" />
          </g>
          <text
            y="32"
            textAnchor="middle"
            fill="#ecfdf5"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fontSize="9"
            fontWeight="700"
            letterSpacing="1.2"
            opacity="0.85"
          >
            AI
          </text>
        </g>

        <g
          fill="none"
          stroke="#34d399"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.95"
        >
          {story.outcome}
        </g>

        <text
          x="320"
          y="202"
          textAnchor="middle"
          fill="#ecfdf5"
          opacity="0.62"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize="11"
          letterSpacing="2"
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
          <path d="M10 12 h3 v3 h-3 z M17 12 h3 v3 h-3 z M10 17 h3 v3 h-3 z M17 17 h3 v3 h-3 z" />
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
          <path d="M10 14 h12 M10 19 h8" opacity="0.75" />
        </g>
        <g transform="translate(508 112)">
          <rect x="2" y="4" width="24" height="22" rx="3" />
          <path d="M8 10 h12 M8 15 h12 M8 20 h8" opacity="0.75" />
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
          <path d="M10 15 h4 M16 15 h4 M10 20 h4" opacity="0.8" />
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
          <path d="M12 16 h12 M12 21 h8" opacity="0.75" />
        </g>
        <g transform="translate(508 114)">
          <rect x="2" y="6" width="28" height="18" rx="3" />
          <path d="M2 9 l14 8 14-8" />
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
          <path d="M6 18 l-3 3 6 6 3-3" />
        </g>
        <g transform="translate(120 112)">
          <path d="M6 8 h20 v14 H6 z" />
          <path d="M10 8 V5 h12 v3" />
          <path d="M12 14 h8" />
        </g>
      </>
    ),
    outcome: (
      <>
        <g transform="translate(506 54)">
          <rect x="4" y="4" width="24" height="22" rx="3" />
          <path d="M4 10 h24" />
          <path d="M10 15 h4 M16 15 h4 M10 20 h4" opacity="0.8" />
        </g>
        <g transform="translate(508 114)">
          <path d="M4 6 h24 a4 4 0 0 1 4 4 v10 a4 4 0 0 1-4 4 H14 l-6 6 v-6 H4 a4 4 0 0 1-4-4 V10 a4 4 0 0 1 4-4z" />
        </g>
      </>
    ),
  },
};

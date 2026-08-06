import { useId } from "react";

/**
 * Prospect AI Growth Engine card artwork.
 * Visual story (under 2 seconds): local businesses → AI Brain → personalized outreach.
 * Matches the dark-green, thin line-art language of the Realtor Growth Engine card.
 */
export function ProspectAiCardArt({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  const stroke = `pai-stroke-${uid}`;

  return (
    <div
      className={className}
      aria-hidden
      style={{
        background:
          "radial-gradient(ellipse 85% 70% at 50% 40%, rgba(5, 150, 105, 0.22), transparent 58%), linear-gradient(160deg, #052e24 0%, #064e3b 42%, #065f46 78%, #0a3d32 100%)",
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
            <stop offset="0%" stopColor="#059669" stopOpacity="0.2" />
            <stop offset="50%" stopColor="#34d399" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#059669" stopOpacity="0.25" />
          </linearGradient>
        </defs>

        <circle cx="320" cy="94" r="72" fill="#059669" opacity="0.055" />

        {/* Thin connection lines — businesses → AI → outreach */}
        <g stroke={`url(#${stroke})`} strokeWidth="1.2" fill="none" strokeLinecap="round">
          <path d="M112 48 C175 55, 235 78, 288 94" />
          <path d="M88 94 C175 94, 240 94, 288 94" />
          <path d="M112 148 C175 135, 240 110, 288 94" />
          <path d="M160 176 C215 145, 255 115, 288 94" />
          <path d="M352 94 C410 94, 465 70, 528 54" />
          <path d="M352 94 C410 94, 465 118, 528 140" />
        </g>

        {/* Industry: local businesses */}
        <g
          fill="none"
          stroke="#34d399"
          strokeWidth="1.55"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Hotel / lodging */}
          <g transform="translate(48 34)">
            <path d="M5 24 V7 h22 v17" />
            <path d="M5 7 l11-5 11 5" />
            <path d="M11 12 h3.5 v3.5 H11 z M17.5 12 H21 v3.5 h-3.5 z" />
            <path d="M11 18 h3.5 v3.5 H11 z M17.5 18 H21 v3.5 h-3.5 z" />
          </g>

          {/* Restaurant (storefront + fork) */}
          <g transform="translate(98 30)">
            <path d="M4 24 V10 h24 v14" />
            <path d="M4 10 l12-6 12 6" />
            <path d="M12 14 v7 M16 14 v7 M20 14 v4 c0 2-2 3-2 3" />
          </g>

          {/* Dentist */}
          <g transform="translate(62 82)">
            <path d="M14 3 c5 0 8 3.5 8 8.5 0 6-3 12-8 16.5-5-4.5-8-10.5-8-16.5C6 6.5 9 3 14 3z" />
            <path d="M10 12 h8" opacity="0.7" />
          </g>

          {/* Attorney scales */}
          <g transform="translate(100 126)">
            <path d="M16 3 v20" />
            <path d="M7 8 h18" />
            <path d="M7 8 l-5 9 h10 z" />
            <path d="M25 8 l-5 9 h10 z" />
            <path d="M10 23 h12" />
          </g>

          {/* Tour / map pin */}
          <g transform="translate(154 40)">
            <path d="M13 3 c5 0 9 3.8 9 8.5 0 6-9 14-9 14S4 17.5 4 11.5C4 6.8 8 3 13 3z" />
            <circle cx="13" cy="11" r="2.8" />
          </g>

          {/* Auto shop */}
          <g transform="translate(148 158)">
            <path d="M3 15 h26" />
            <path d="M6 15 l3.5-8 h13 l3.5 8" />
            <circle cx="11" cy="17" r="2.6" />
            <circle cx="23" cy="17" r="2.6" />
          </g>
        </g>

        {/* Central AI Brain */}
        <g transform="translate(320 94)">
          <circle r="30" fill="#022c22" stroke="#34d399" strokeWidth="1.45" />
          <g
            fill="none"
            stroke="#a7f3d0"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M-11 -7 c-4-5 1-11 7.5-10 2.2-4 8.5-4 10.5 0 5-2 10.5 2.2 8.5 7.5 3 1.2 4.2 6.2 1.2 9.2-1.2 4-5.5 6.2-9.5 5.2-2.2 3-7.5 3-9.8 0-4 1-8.2-2.2-8.2-6.2 0-2.2 1-4 0-5.7z" />
            <path d="M-1.5 -13 v19 M-1.5 -2.5 c-4.2 0-6.5 2.2-6.5 5.2 M-1.5 -2.5 c4.2 0 6.5 2.2 6.5 5.2" />
          </g>
          <text
            y="36"
            textAnchor="middle"
            fill="#ecfdf5"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fontSize="9"
            fontWeight="700"
            letterSpacing="1.4"
            opacity="0.88"
          >
            AI
          </text>
        </g>

        {/* Outcome: personalized outreach */}
        <g
          fill="none"
          stroke="#34d399"
          strokeWidth="1.55"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Email */}
          <g transform="translate(512 36)">
            <rect x="1" y="6" width="30" height="20" rx="3.5" />
            <path d="M1 9.5 l15 9.5 15-9.5" />
          </g>
          {/* Message */}
          <g transform="translate(512 120)">
            <path d="M3 5 h26 a4 4 0 0 1 4 4 v11 a4 4 0 0 1-4 4 H14 l-7 7 v-7 H3 a4 4 0 0 1-4-4 V9 a4 4 0 0 1 4-4z" />
            <path d="M9 14 h14 M9 19 h9" opacity="0.75" />
          </g>
        </g>

        <text
          x="320"
          y="204"
          textAnchor="middle"
          fill="#ecfdf5"
          opacity="0.64"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize="11"
          letterSpacing="2.2"
          fontWeight="600"
        >
          DISCOVER • QUALIFY • OUTREACH
        </text>
      </svg>
    </div>
  );
}

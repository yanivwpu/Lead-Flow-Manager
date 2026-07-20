/**
 * Branded header artwork for the Prospect AI Growth Engine gallery card.
 * Dark emerald networking motif — nodes feed a central AI hub, then flow to outreach/inbox.
 */
export function ProspectAiCardArt({ className }: { className?: string }) {
  return (
    <div
      className={className}
      aria-hidden
      style={{
        background:
          "radial-gradient(ellipse 90% 70% at 18% 12%, rgba(52, 211, 153, 0.28), transparent 55%), radial-gradient(ellipse 70% 60% at 88% 88%, rgba(16, 185, 129, 0.18), transparent 50%), linear-gradient(145deg, #064e3b 0%, #065f46 38%, #047857 72%, #0f766e 100%)",
      }}
    >
      <svg
        viewBox="0 0 640 220"
        className="h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="pai-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#6ee7b7" stopOpacity="0.15" />
            <stop offset="50%" stopColor="#a7f3d0" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#6ee7b7" stopOpacity="0.2" />
          </linearGradient>
          <linearGradient id="pai-hub" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ecfdf5" />
            <stop offset="100%" stopColor="#a7f3d0" />
          </linearGradient>
          <filter id="pai-soft" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Soft grid */}
        <g opacity="0.12" stroke="#ecfdf5" strokeWidth="0.6">
          <path d="M40 40 H600 M40 80 H600 M40 120 H600 M40 160 H600 M40 200 H600" />
          <path d="M80 20 V200 M160 20 V200 M240 20 V200 M320 20 V200 M400 20 V200 M480 20 V200 M560 20 V200" />
        </g>

        {/* Connection lines: nodes → hub → pipeline */}
        <g stroke="url(#pai-line)" strokeWidth="1.6" fill="none">
          <path d="M92 58 C150 58, 180 98, 268 110" />
          <path d="M78 118 C150 118, 190 112, 268 110" />
          <path d="M98 176 C160 168, 200 130, 268 110" />
          <path d="M372 110 C430 110, 470 96, 534 78" />
          <path d="M372 110 C430 110, 470 124, 534 142" />
        </g>

        {/* Directional chevrons on main flow */}
        <g fill="#a7f3d0" opacity="0.85">
          <path d="M210 104 l8 6 -8 6 z" />
          <path d="M430 104 l8 6 -8 6 z" />
          <path d="M490 72 l8 6 -8 6 z" />
          <path d="M490 136 l8 6 -8 6 z" />
        </g>

        {/* Source business / location nodes */}
        <g filter="url(#pai-soft)">
          <circle cx="92" cy="58" r="14" fill="#064e3b" stroke="#6ee7b7" strokeWidth="1.5" />
          <circle cx="92" cy="58" r="4.5" fill="#a7f3d0" />
          <circle cx="78" cy="118" r="16" fill="#065f46" stroke="#6ee7b7" strokeWidth="1.5" />
          <circle cx="78" cy="118" r="5" fill="#d1fae5" />
          <circle cx="98" cy="176" r="13" fill="#064e3b" stroke="#6ee7b7" strokeWidth="1.5" />
          <circle cx="98" cy="176" r="4" fill="#a7f3d0" />
        </g>

        {/* Small satellite nodes */}
        <g fill="#34d399" opacity="0.55">
          <circle cx="148" cy="42" r="3.5" />
          <circle cx="136" cy="156" r="3" />
          <circle cx="168" cy="188" r="2.5" />
        </g>

        {/* Central AI hub */}
        <g filter="url(#pai-soft)">
          <circle cx="320" cy="110" r="42" fill="#022c22" opacity="0.35" />
          <circle cx="320" cy="110" r="34" fill="url(#pai-hub)" />
          <circle cx="320" cy="110" r="34" fill="none" stroke="#ecfdf5" strokeWidth="1.2" opacity="0.9" />
          {/* Abstract AI mark */}
          <g transform="translate(320 110)">
            <circle r="7" fill="#065f46" />
            <circle cx="-14" cy="-8" r="3.2" fill="#047857" />
            <circle cx="14" cy="-8" r="3.2" fill="#047857" />
            <circle cx="0" cy="16" r="3.2" fill="#047857" />
            <path
              d="M-14 -8 L0 0 L14 -8 M0 0 L0 16"
              stroke="#065f46"
              strokeWidth="1.4"
              fill="none"
              strokeLinecap="round"
            />
          </g>
        </g>

        {/* Downstream stage nodes: qualify → outreach → inbox */}
        <g>
          <rect
            x="508"
            y="58"
            width="44"
            height="28"
            rx="8"
            fill="#022c22"
            stroke="#6ee7b7"
            strokeWidth="1.2"
            opacity="0.92"
          />
          <circle cx="530" cy="72" r="4" fill="#a7f3d0" />

          <rect
            x="508"
            y="122"
            width="44"
            height="28"
            rx="8"
            fill="#022c22"
            stroke="#6ee7b7"
            strokeWidth="1.2"
            opacity="0.92"
          />
          <rect x="520" y="132" width="20" height="8" rx="2" fill="#6ee7b7" opacity="0.85" />
        </g>

        {/* Tiny workflow caption — minimal */}
        <text
          x="320"
          y="198"
          textAnchor="middle"
          fill="#ecfdf5"
          opacity="0.55"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize="11"
          letterSpacing="1.6"
          fontWeight="600"
        >
          DISCOVER · ANALYZE · OUTREACH
        </text>
      </svg>
    </div>
  );
}

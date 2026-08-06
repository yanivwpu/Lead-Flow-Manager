import { useId } from "react";

/**
 * Prospect AI Growth Engine artwork (V2B).
 * Story: Businesses → AI (chat+spark salesperson) → Conversations → Replies.
 * Navy / cyan / teal — sibling to emerald Realtor, not a twin.
 */
export function ProspectAiCardArt({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  const flow = `pai-flow-${uid}`;

  return (
    <div
      className={className}
      aria-hidden
      style={{
        background:
          "radial-gradient(ellipse 80% 55% at 50% 48%, rgba(34, 211, 238, 0.14), transparent 58%), linear-gradient(165deg, #0B1F3A 0%, #123A5C 55%, #0E2A4A 100%)",
      }}
    >
      <svg
        viewBox="0 0 640 220"
        className="h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id={flow} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.2" />
            <stop offset="55%" stopColor="#22D3EE" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#2DD4BF" stopOpacity="0.35" />
          </linearGradient>
        </defs>

        {/* Title inside artwork */}
        <text
          x="320"
          y="28"
          textAnchor="middle"
          fill="#F8FAFC"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize="20"
          fontWeight="700"
        >
          Prospect AI
        </text>
        <text
          x="320"
          y="46"
          textAnchor="middle"
          fill="#BAE6FD"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize="10"
          fontWeight="500"
          opacity="0.9"
        >
          Your AI Sales Team
        </text>

        {/* Businesses (upper) */}
        <g
          fill="none"
          stroke="#22D3EE"
          strokeWidth="1.45"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Restaurant */}
          <g transform="translate(88 58)">
            <path d="M4 22 V10 h24 v12" />
            <path d="M4 10 l12-6 12 6" />
            <path d="M12 14 v6 M16 14 v6 M20 14 v3c0 2-2 3-2 3" />
          </g>
          {/* Dentist */}
          <g transform="translate(178 56)">
            <path d="M14 2 c5 0 8 3.2 8 8 0 5.5-3 11-8 15.5C9 21 6 15.5 6 10 6 5.2 9 2 14 2z" />
          </g>
          {/* Attorney */}
          <g transform="translate(268 56)">
            <path d="M14 2 v18" />
            <path d="M6 7 h16" />
            <path d="M6 7 l-4 8 h8 z" />
            <path d="M22 7 l-4 8 h8 z" />
            <path d="M8 20 h12" />
          </g>
          {/* Auto */}
          <g transform="translate(358 62)">
            <path d="M2 14 h26" />
            <path d="M5 14 l3.5-7 h13 l3.5 7" />
            <circle cx="10" cy="16" r="2.4" />
            <circle cx="22" cy="16" r="2.4" />
          </g>
          {/* Hotel */}
          <g transform="translate(448 56)">
            <path d="M6 22 V8 h18 v14" />
            <path d="M6 8 l9-5 9 5" />
            <path d="M11 12 h3 v3 h-3 z M17 12 h3 v3 h-3 z M11 17 h3 v3 h-3 z M17 17 h3 v3 h-3 z" />
          </g>
        </g>

        {/* Flow into AI */}
        <g stroke={`url(#${flow})`} strokeWidth="1.2" fill="none" strokeLinecap="round">
          <path d="M102 82 L320 108" />
          <path d="M192 82 L320 108" />
          <path d="M282 82 L320 108" />
          <path d="M372 82 L320 108" />
          <path d="M462 82 L320 108" />
        </g>

        {/* AI hero — conversation bubble + spark (salesperson, not neural net) */}
        <g transform="translate(320 118)">
          <path
            d="M-28 -22 h56 a10 10 0 0 1 10 10 v24 a10 10 0 0 1-10 10 H-4 l-12 12 v-12 h-12 a10 10 0 0 1-10-10 v-24 a10 10 0 0 1 10-10z"
            fill="#0B1F3A"
            stroke="#22D3EE"
            strokeWidth="2"
          />
          {/* Spark */}
          <path
            d="M0 -8 l2.2 5.2 5.6.4-4.2 3.6 1.4 5.4L0 3.2l-4.9 3.4 1.4-5.4-4.2-3.6 5.6-.4z"
            fill="#67E8F9"
            stroke="#22D3EE"
            strokeWidth="0.6"
          />
        </g>

        {/* Conversations — reduced count (~3) */}
        <g fill="#0E2A4A" stroke="#22D3EE" strokeWidth="1.2">
          <rect x="168" y="158" width="78" height="28" rx="8" opacity="0.92" />
          <rect x="280" y="156" width="86" height="30" rx="8" opacity="0.95" />
          <rect x="396" y="158" width="78" height="28" rx="8" opacity="0.9" />
        </g>
        <g fill="none" stroke="#67E8F9" strokeWidth="1.1" strokeLinecap="round" opacity="0.85">
          <circle cx="184" cy="172" r="5" />
          <path d="M196 168 h36 M196 175 h28" />
          <circle cx="298" cy="171" r="5" />
          <path d="M310 167 h40 M310 174 h30" />
          <circle cx="412" cy="172" r="5" />
          <path d="M424 168 h36 M424 175 h24" />
        </g>
        {/* Quiet notification dots (no loud labels) */}
        <circle cx="238" cy="162" r="3.5" fill="#22D3EE" />
        <circle cx="358" cy="160" r="3.5" fill="#22D3EE" />

        {/* Soft reply arrows — no REPLY text */}
        <g fill="none" stroke="#2DD4BF" strokeWidth="1.2" strokeLinecap="round" opacity="0.45">
          <path d="M210 196 c-8 0-12-4-12-4" />
          <path d="M198 188 l-4 4 4 4" />
          <path d="M330 196 c-8 0-12-4-12-4" />
          <path d="M318 188 l-4 4 4 4" />
        </g>

        <text
          x="320"
          y="214"
          textAnchor="middle"
          fill="#F8FAFC"
          opacity="0.62"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize="9"
          letterSpacing="2.2"
          fontWeight="600"
        >
          DISCOVER • QUALIFY • ENGAGE
        </text>
      </svg>
    </div>
  );
}

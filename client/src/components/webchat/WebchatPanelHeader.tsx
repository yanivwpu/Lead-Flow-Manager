import { useEffect, useState } from "react";
import type { PublicWebchatPresentation } from "@shared/webchatWidgetBranding";
import { WEBCHAT_CORNER_PX } from "@shared/webchatWidgetBranding";

export function WebchatPanelHeader({ presentation }: { presentation: PublicWebchatPresentation }) {
  const initial = presentation.displayName.trim().charAt(0).toUpperCase() || "W";
  const [logoFailed, setLogoFailed] = useState(false);
  useEffect(() => {
    setLogoFailed(false);
  }, [presentation.logoUrl]);
  const showLogo = Boolean(presentation.logoUrl) && !logoFailed;
  return (
    <div
      className="flex min-w-0 items-center gap-2 px-4 py-3 flex-shrink-0 shadow-sm"
      style={{ background: presentation.color, color: presentation.headerTextColor }}
      data-testid="webchat-panel-header"
    >
      {showLogo ? (
        <img
          src={presentation.logoUrl}
          alt=""
          width={32}
          height={32}
          className="h-8 w-8 shrink-0 object-cover"
          style={{ borderRadius: presentation.cornerStyle === "square" ? 4 : 999 }}
          referrerPolicy="no-referrer"
          data-testid="webchat-panel-logo"
          onError={() => setLogoFailed(true)}
        />
      ) : (
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center text-sm font-bold"
          style={{
            background: "rgba(255,255,255,0.2)",
            borderRadius: presentation.cornerStyle === "square" ? 4 : 999,
          }}
          data-testid="webchat-panel-avatar"
        >
          {initial}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="font-semibold text-sm leading-tight break-words [overflow-wrap:anywhere]">
          {presentation.panelHeading}
        </h1>
        <p className="text-xs opacity-80 mt-0.5 break-words [overflow-wrap:anywhere]">
          {presentation.panelSubtitle}
        </p>
      </div>
    </div>
  );
}

export function webchatPanelRadiusStyle(presentation: PublicWebchatPresentation): {
  borderRadius: number;
} {
  return { borderRadius: WEBCHAT_CORNER_PX[presentation.cornerStyle] };
}

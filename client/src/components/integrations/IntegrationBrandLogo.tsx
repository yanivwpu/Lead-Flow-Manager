import { cn } from "@/lib/utils";

type Props = {
  name: string;
  logoUrl?: string;
  className?: string;
};

function fallbackLetter(name: string) {
  const c = name.trim().charAt(0);
  if (c && /[A-Za-z0-9]/.test(c)) return c.toUpperCase();
  return null;
}

export function IntegrationBrandLogo({ name, logoUrl, className }: Props) {
  const letter = fallbackLetter(name);

  return (
    <div
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-100 bg-white",
        className,
      )}
      aria-hidden
    >
      {logoUrl ? (
        <img src={logoUrl} alt="" className="h-full w-full object-contain p-1.5" loading="lazy" />
      ) : letter ? (
        <span className="text-sm font-semibold text-gray-700">{letter}</span>
      ) : (
        <svg className="h-5 w-5 text-gray-400" viewBox="0 0 24 24" aria-hidden>
          <circle cx="8" cy="8" r="1.5" fill="currentColor" />
          <circle cx="16" cy="8" r="1.5" fill="currentColor" />
          <circle cx="8" cy="16" r="1.5" fill="currentColor" />
          <circle cx="16" cy="16" r="1.5" fill="currentColor" />
        </svg>
      )}
    </div>
  );
}

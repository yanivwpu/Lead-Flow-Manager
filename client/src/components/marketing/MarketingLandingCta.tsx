import { Link } from "wouter";
import { ArrowRight, Check } from "lucide-react";

type Props = {
  onBookDemo: () => void;
  headline?: string;
};

const DEFAULT_BULLETS = [
  "Connect WhatsApp in minutes",
  "Try AI Copilot free",
  "No credit card required",
];

export function MarketingLandingCta({
  onBookDemo,
  headline = "Ready to automate customer conversations?",
}: Props) {
  return (
    <section className="border-t border-gray-100 bg-gradient-to-b from-gray-50 to-white px-4 py-16 md:px-6 md:py-20">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="font-display text-2xl font-bold text-gray-900 md:text-3xl">{headline}</h2>
        <ul className="mx-auto mt-6 inline-flex flex-col items-start gap-2 text-left text-gray-600 sm:items-center">
          {DEFAULT_BULLETS.map((item) => (
            <li key={item} className="flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-brand-green" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/auth">
            <a className="inline-flex h-12 min-w-[180px] items-center justify-center gap-2 rounded-full bg-brand-green px-8 font-semibold text-white hover:bg-emerald-700">
              Start Free Trial
              <ArrowRight className="h-4 w-4" />
            </a>
          </Link>
          <button
            type="button"
            onClick={onBookDemo}
            className="inline-flex h-12 min-w-[180px] items-center justify-center rounded-full border border-gray-300 bg-white px-8 font-semibold text-gray-900 hover:border-gray-400 hover:bg-gray-50"
          >
            Book a Demo
          </button>
        </div>
      </div>
    </section>
  );
}

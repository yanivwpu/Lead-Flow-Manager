import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot, Building2, CalendarDays, Clock3, Database, Filter, Home, Landmark,
  MessageCircle, Pause, Play, RotateCcw, Truck, UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WorkflowWalkthroughConfig, WorkflowLocale } from "./workflowWalkthroughConfig";

const ICONS = {
  whatsapp: MessageCircle, bot: Bot, home: Home, database: Database, filter: Filter,
  calendar: CalendarDays, user: UserRound, landmark: Landmark, truck: Truck, clock: Clock3,
} as const;

const copy = {
  en: { eyebrow: "How it works", title: "Follow a lead through the Growth Engine", intro: "Choose an example route, then play the illustration step by step.", illustrative: "Illustrative example — not live activity", play: "Play example", pause: "Pause", replay: "Replay", select: "Example route", support: "Knowledge connected to the AI Agent", static: "Reduced motion is on. Use Replay to step through the route." },
  es: { eyebrow: "Cómo funciona", title: "Sigue un lead por el Growth Engine", intro: "Elige una ruta de ejemplo y reproduce la ilustración paso a paso.", illustrative: "Ejemplo ilustrativo — no es actividad en vivo", play: "Reproducir ejemplo", pause: "Pausa", replay: "Repetir", select: "Ruta de ejemplo", support: "Conocimiento conectado al Agente de IA", static: "El movimiento reducido está activo. Usa Repetir para avanzar por la ruta." },
  he: { eyebrow: "איך זה עובד", title: "עקבו אחר ליד בתוך מנוע הצמיחה", intro: "בחרו מסלול לדוגמה והפעילו את ההמחשה שלב אחר שלב.", illustrative: "דוגמה להמחשה — לא פעילות בזמן אמת", play: "הפעלת דוגמה", pause: "השהיה", replay: "הפעלה מחדש", select: "מסלול לדוגמה", support: "ידע המחובר לסוכן ה-AI", static: "מופעלת הפחתת תנועה. השתמשו בהפעלה מחדש כדי להתקדם במסלול." },
} satisfies Record<WorkflowLocale, Record<string, string>>;

export type WalkthroughPlaybackAction = "play" | "pause" | "resume" | "replay";

export function getWalkthroughPlaybackAction(
  step: number,
  stepCount: number,
  playing: boolean,
): WalkthroughPlaybackAction {
  if (playing) return "pause";
  if (step === 0) return "play";
  if (step >= stepCount - 1) return "replay";
  return "resume";
}

export function WorkflowWalkthrough({ config, locale = "en" }: { config: WorkflowWalkthroughConfig; locale?: WorkflowLocale }) {
  const [routeId, setRouteId] = useState(config.routes[0]?.id ?? "");
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const timer = useRef<number | null>(null);
  const route = config.routes.find((item) => item.id === routeId) ?? config.routes[0];
  const nodes = useMemo(() => new Map(config.nodes.map((node) => [node.id, node])), [config.nodes]);
  const activeIds = new Set(route.nodeIds.slice(0, step + 1));
  const activeNode = nodes.get(route.nodeIds[step]);
  const t = copy[locale];
  const playbackAction = getWalkthroughPlaybackAction(step, route.nodeIds.length, playing);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    if (!playing) return;
    if (step >= route.nodeIds.length - 1) {
      setPlaying(false);
      return;
    }
    timer.current = window.setTimeout(() => setStep((value) => value + 1), reducedMotion ? 900 : 1500);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [playing, step, route.nodeIds.length, reducedMotion]);

  const selectRoute = (id: string) => { setRouteId(id); setStep(0); setPlaying(false); };
  const handlePlayback = () => {
    if (playbackAction === "pause") {
      setPlaying(false);
      return;
    }
    if (playbackAction === "replay") setStep(0);
    setPlaying(true);
  };

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 md:p-8" aria-labelledby="workflow-walkthrough-title" data-testid="workflow-walkthrough">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">{t.eyebrow}</p>
          <h2 id="workflow-walkthrough-title" className="mt-1 text-xl font-bold tracking-tight text-slate-950 md:text-2xl">{t.title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">{t.intro}</p>
          <p className="mt-2 inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">{t.illustrative}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t.select}>
          {playbackAction === "play" || playbackAction === "resume" ? (
            <Button size="sm" onClick={handlePlayback} data-testid="workflow-play"><Play className="me-1.5 h-3.5 w-3.5" />{t.play}</Button>
          ) : playbackAction === "pause" ? (
            <Button size="sm" variant="outline" onClick={handlePlayback} data-testid="workflow-pause"><Pause className="me-1.5 h-3.5 w-3.5" />{t.pause}</Button>
          ) : (
            <Button size="sm" variant="outline" onClick={handlePlayback} data-testid="workflow-replay"><RotateCcw className="me-1.5 h-3.5 w-3.5" />{t.replay}</Button>
          )}
        </div>
      </div>

      <div className="mt-5 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label={t.select}>
        {config.routes.map((item) => <button key={item.id} type="button" role="tab" aria-selected={item.id === route.id} onClick={() => selectRoute(item.id)} className={cn("whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2", item.id === route.id ? "border-emerald-600 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")}>{item.label[locale]}</button>)}
      </div>

      <div className="relative mt-4 hidden h-[390px] overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70 md:block" dir="ltr">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {[...config.connections, ...config.supportingConnections].map(([from, to]) => {
            const a = nodes.get(from)!; const b = nodes.get(to)!;
            const selected = route.nodeIds.some((id, index) => id === from && route.nodeIds[index + 1] === to);
            return <line key={`${from}-${to}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} vectorEffect="non-scaling-stroke" stroke={selected ? "#34d399" : "#cbd5e1"} strokeWidth={selected ? 2.5 : 1.5} strokeDasharray={config.supportingConnections.some((c) => c[0] === from && c[1] === to) ? "5 5" : undefined} />;
          })}
        </svg>
        {config.nodes.map((node) => {
          const Icon = ICONS[node.icon]; const active = activeIds.has(node.id); const current = activeNode?.id === node.id;
          return <div key={node.id} className={cn("absolute z-10 w-[112px] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-white px-2 py-2 text-center shadow-sm transition-[border-color,box-shadow,transform]", node.kind === "ai" && "border-violet-300", active ? "border-emerald-500 shadow-md" : "border-slate-200", current && "ring-4 ring-emerald-100")} style={{ left: `${node.x}%`, top: `${node.y}%` }} data-active={active || undefined}>
            <span className={cn("mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-lg", node.kind === "ai" ? "bg-violet-100 text-violet-700" : active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600")}><Icon className="h-4 w-4" aria-hidden /></span>
            <span className="block text-[11px] font-semibold leading-tight text-slate-800">{node.label[locale]}</span>
          </div>;
        })}
        {activeNode ? <span className={cn("pointer-events-none absolute z-20 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500 shadow-[0_0_0_5px_rgba(16,185,129,.18)]", !reducedMotion && "transition-[left,top] duration-1000 ease-in-out")} style={{ left: `${activeNode.x}%`, top: `${activeNode.y}%` }} aria-hidden /> : null}
        <div className="absolute bottom-2 start-3 flex items-center gap-1.5 text-[11px] text-slate-500"><Building2 className="h-3.5 w-3.5" />{t.support}</div>
      </div>

      <ol className="mt-4 space-y-2 md:hidden">
        {route.nodeIds.map((id, index) => { const node = nodes.get(id)!; const Icon = ICONS[node.icon]; const active = index <= step; return <li key={id} className={cn("flex items-start gap-3 rounded-xl border p-3", active ? "border-emerald-300 bg-emerald-50/50" : "border-slate-200 bg-slate-50")}><span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", active ? "bg-emerald-100 text-emerald-700" : "bg-white text-slate-500")}><Icon className="h-4 w-4" /></span><div><p className="text-sm font-semibold text-slate-900">{node.label[locale]}</p><p className="mt-0.5 text-xs leading-relaxed text-slate-600">{route.captions[locale][index]}</p></div></li>; })}
      </ol>

      <div className="mt-4 min-h-[76px] rounded-xl border border-slate-200 bg-white p-3" role="status" aria-live="polite">
        <p className="text-xs font-semibold text-emerald-800">{activeNode?.label[locale]}</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-700">{route.captions[locale][step]}</p>
        {route.note ? <p className="mt-2 text-xs leading-relaxed text-slate-500">{route.note[locale]}</p> : null}
        {reducedMotion ? <p className="mt-2 text-xs text-slate-500">{t.static}</p> : null}
      </div>
    </section>
  );
}

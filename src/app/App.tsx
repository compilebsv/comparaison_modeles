import { useState, useMemo, useEffect, useRef } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { MapPin, ChevronDown, Leaf, CalendarDays } from "lucide-react";
import riskData from "./riskData.json";

// ─── Risk levels ──────────────────────────────────────────────────────────────

const RISK = [
  { label: "Nul",       bg: "#f1f5f9", text: "#64748b", border: "#cbd5e1", dot: "#94a3b8" },
  { label: "Faible",    bg: "#dcfce7", text: "#15803d", border: "#86efac", dot: "#22c55e" },
  { label: "Moyen",     bg: "#fef9c3", text: "#a16207", border: "#fde047", dot: "#eab308" },
  { label: "Fort",      bg: "#ffedd5", text: "#c2410c", border: "#fdba74", dot: "#f97316" },
  { label: "Très fort", bg: "#fee2e2", text: "#b91c1c", border: "#fca5a5", dot: "#ef4444" },
];

// ─── Rain (pluie) color scale ─────────────────────────────────────────────────
// White → blue → violet (very strong). Reference points are placed at equal
// distance along the gradient; values in between are interpolated.

const PLUIE_STOPS: { v: number; c: string }[] = [
  { v: 0,    c: "#ffffff" },
  { v: 0.25, c: "#e3ecfa" },
  { v: 0.5,  c: "#cde0f4" },
  { v: 1,    c: "#b8cdef" },
  { v: 1.5,  c: "#a3bfeb" },
  { v: 2,    c: "#8db1e7" },
  { v: 3,    c: "#789fdf" },
  { v: 5,    c: "#6390d6" },
  { v: 7,    c: "#527fcb" },
  { v: 10,   c: "#4471bf" },
  { v: 15,   c: "#4a63b4" },
  { v: 20,   c: "#585eae" },
  { v: 25,   c: "#6b5aa8" },
  { v: 30,   c: "#7d57a3" },
];

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function pluieScale(v: number | undefined): { bg: string; text: string } {
  if (v == null || !isFinite(v)) return { bg: "#f1f5f9", text: "#64748b" };
  const first = PLUIE_STOPS[0];
  const last = PLUIE_STOPS[PLUIE_STOPS.length - 1];
  let rgb: [number, number, number];
  if (v <= first.v) rgb = hexToRgb(first.c);
  else if (v >= last.v) rgb = hexToRgb(last.c);
  else {
    let a = first;
    let b = last;
    for (let i = 0; i < PLUIE_STOPS.length - 1; i++) {
      if (v >= PLUIE_STOPS[i].v && v <= PLUIE_STOPS[i + 1].v) {
        a = PLUIE_STOPS[i];
        b = PLUIE_STOPS[i + 1];
        break;
      }
    }
    const t = (v - a.v) / (b.v - a.v);
    const [r1, g1, bl1] = hexToRgb(a.c);
    const [r2, g2, bl2] = hexToRgb(b.c);
    rgb = [
      Math.round(r1 + (r2 - r1) * t),
      Math.round(g1 + (g2 - g1) * t),
      Math.round(bl1 + (bl2 - bl1) * t),
    ];
  }
  const [r, g, b] = rgb;
  const text = v >= 1 ? "#ffffff" : "#1f2937";
  return { bg: `rgb(${r}, ${g}, ${b})`, text };
}

// ─── Models ───────────────────────────────────────────────────────────────────

const MODELS = [
  { id: "rossi",   name: "ROSSI",    color: "#16a34a" },
  { id: "potsys",  name: "POT SYS",  color: "#0284c7" },
  { id: "milvit",  name: "MILVIT",   color: "#9333ea" },
  { id: "milstop", name: "MILSTOP",  color: "#dc2626" },
];

// ─── Hypotheses ───────────────────────────────────────────────────────────────

const HYPOTHESES = [
  { id: "h1", label: "Hypothèse 1" },
  { id: "h2", label: "Hypothèse 2" },
  { id: "h3", label: "Hypothèse 3" },
];

// ─── Locations (from COMMUNE column) ──────────────────────────────────────────

type CommuneEntry = { latitude?: string; longitude?: string; region?: unknown };
type CommuneDay = {
  latitude?: string;
  longitude?: string;
  region?: unknown;
  rossi?: Record<string, number>;
  potsys?: Record<string, number>;
  milvit?: Record<string, number>;
  milstop?: Record<string, number>;
  pluie?: Record<string, number>;
};

const COMMUNES: string[] = riskData.communes;
const DATA_BY_COMMUNE: Record<string, Record<string, CommuneDay>> = riskData.byCommune;
const DATES: string[] = riskData.dates;

// Excel serial date → JS Date
function excelSerialToDate(serial: number): Date {
  return new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
}

const LOCATIONS = COMMUNES.map(name => {
  const firstDay = DATA_BY_COMMUNE[name]?.[DATES[0]] as CommuneEntry | undefined;
  const lat = firstDay?.latitude;
  const lon = firstDay?.longitude;
  return {
    name,
    region: String(firstDay?.region ?? ""),
    lat: lat != null ? `${lat}°` : "",
    lon: lon != null ? `${lon}°` : "",
  };
});

// ─── Region display labels ───────────────────────────────────────────────────
// Underlying region codes stay the same ("16", "33"); only the labels change.
const REGION_LABELS: Record<string, string> = {
  "16": "Charentes",
  "33": "Nouvelle-Aquitaine",
};
const regionLabel = (r: string): string => REGION_LABELS[r] ?? r;

// ─── Sub-components ───────────────────────────────────────────────────────────

function RiskCell({ level, showLabel = false, isToday = false }: { level?: number; showLabel?: boolean; isToday?: boolean }) {
  if (level == null) {
    return (
      <td className="border border-border/30 p-1.5 text-center transition-colors">
        <span className="text-[10px] text-muted-foreground font-medium">N/A</span>
      </td>
    );
  }
  const r = RISK[level];
  return (
    <td
      className="border border-border/30 p-1.5 text-center transition-colors"
      style={{ backgroundColor: r.bg }}
    >
      <div className="flex flex-col items-center gap-0.5">
        <span
          className="font-semibold text-sm leading-none"
          style={{ color: r.text, fontFamily: "var(--font-mono)" }}
        > 
          {level}
        </span>
        {showLabel && (
          <span className="text-[10px] leading-none" style={{ color: r.text }}>
            {r.label}
          </span>
        )}
      </div>
    </td>
  );
}

function RiskBadge({ level, size = "md" }: { level: number; size?: "sm" | "md" | "lg" }) {
  const r = RISK[level];
  if (!r) return null;
  const sizeClass = size === "sm" ? "text-[10px] px-1.5 py-0.5" : size === "lg" ? "text-sm px-3 py-1.5 font-semibold" : "text-xs px-2 py-0.5";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded font-medium leading-none border ${sizeClass}`}
      style={{ backgroundColor: r.bg, color: r.text, borderColor: r.border }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: r.dot }} />
      {r.label}
    </span>
  );
}

// ─── Consensus bar chart ─────────────────────────────────────────────────────

type ChartRow = {
  date: string;
  dateShort: string;
  idx: number;
  isForecast: boolean;
  isToday: boolean;
  observed?: number;
  rossi?: number;
  potsys?: number;
  milvit?: number;
  milstop?: number;
};

const BAR_COLOR = "#2d6a4f";
const BAR_OPACITY = 0.27;

function ConsensusChart({
   data,
   activeModels,
   showObserved,
 }: {
   data: ChartRow[];
   activeModels: Set<string>;
   showObserved: boolean;
 }) {
   const [hovered, setHovered] = useState<number | null>(null);
   const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
   const scrollRef = useRef<HTMLDivElement>(null);

  const PLOT_H = 260;
  const L = 92;
  const R = 24;
  const T = 24;
  const B = 52;

  const n = data.length;
  const activeList = MODELS.filter(m => activeModels.has(m.id));

  const GROUP_W = Math.max(20, Math.floor(820 / n));
  const BAR_W = GROUP_W * 0.72;
  const BAR_OFF = GROUP_W * 0.14;
  const SVG_W = L + R + n * GROUP_W;
  const SVG_H = PLOT_H + T + B;

  const yOf = (v: number) => PLOT_H - (v / 4) * PLOT_H;

  const labelEvery = Math.max(1, Math.ceil(n / 10));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
        <span className="font-medium text-foreground/70">Concordance des modèles :</span>
        {[1, 2, 3, 4].map(count => {
          const eff = Math.round((1 - Math.pow(1 - BAR_OPACITY, count)) * 100);
          return (
            <span key={count} className="flex items-center gap-1.5">
              <span
                className="w-5 h-4 rounded-sm inline-block border border-border/30"
                style={{ backgroundColor: BAR_COLOR, opacity: 1 - Math.pow(1 - BAR_OPACITY, count) }}
              />
              <span style={{ fontFamily: "var(--font-mono)" }}>
                {count} modèle{count > 1 ? "s" : ""} ({eff}%)
              </span>
            </span>
          );
        })}
        {showObserved && (
          <span className="flex items-center gap-1.5 ml-2 border-l border-border pl-4">
            <span className="w-5 h-0 border-t-2 border-foreground/70 inline-block" />
            <span>Observé</span>
          </span>
        )}
      </div>

<div ref={scrollRef} className="overflow-x-auto w-full rounded-lg border border-border">
         <svg width={SVG_W} height={SVG_H} style={{ display: "block", minWidth: "100%" }}
           onMouseMove={e => {
             const rect = e.currentTarget.getBoundingClientRect();
             setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
           }}
           onMouseLeave={() => setMousePos(null)}
         >
           <g transform={`translate(${L}, ${T})`}>
              {[0, 1, 2, 3].map(v => (
                <rect
                  key={v}
                  x={0}
                  y={yOf(v + 1)}
                  width={n * GROUP_W}
                  height={yOf(v) - yOf(v + 1)}
                  fill={RISK[v + 1].bg}
                  fillOpacity={0.35}
                />
              ))}

              {[0, 1, 2, 3, 4].map(v => (
                <line
                  key={v}
                  x1={0} y1={yOf(v)}
                  x2={n * GROUP_W} y2={yOf(v)}
                  stroke={RISK[v].border}
                  strokeWidth={v === 0 ? 1 : 0.75}
                  strokeDasharray={v === 0 ? undefined : "3 5"}
                  strokeOpacity={0.8}
                />
              ))}

            {data.map((d, i) => {
              const x = i * GROUP_W + BAR_OFF;
              const isHov = hovered === i;

              return (
                <g
                  key={i}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ cursor: "default" }}
                >
                  {isHov && (
                    <rect
                      x={i * GROUP_W} y={0}
                      width={GROUP_W} height={PLOT_H}
                      fill={BAR_COLOR} fillOpacity={0.05}
                    />
                  )}

                  {d.isToday && (
                    <line
                      x1={x + BAR_W / 2} y1={0}
                      x2={x + BAR_W / 2} y2={PLOT_H}
                      stroke="#2d6a4f" strokeDasharray="4 3"
                      strokeWidth={1.5} strokeOpacity={0.6}
                    />
                  )}

                  {activeList.map(m => {
                    const v = (d as Record<string, unknown>)[m.id] as number | undefined;
                    if (!v || v === 0) return null;
                    const barH = (v / 4) * PLOT_H;
                    return (
                      <rect
                        key={m.id}
                        x={x}
                        y={yOf(v)}
                        width={BAR_W}
                        height={barH}
                        fill={BAR_COLOR}
                        fillOpacity={BAR_OPACITY}
                        rx={2}
                      />
                    );
                  })}

                  {showObserved && d.observed !== undefined && (
                    <>
                      <line
                        x1={x - 2} x2={x + BAR_W + 2}
                        y1={d.observed === 0 ? PLOT_H : yOf(d.observed)}
                        y2={d.observed === 0 ? PLOT_H : yOf(d.observed)}
                        stroke="#1c2b1c" strokeWidth={2.5} strokeLinecap="round"
                      />
                      <rect
                        x={x + BAR_W / 2 - 3}
                        y={(d.observed === 0 ? PLOT_H : yOf(d.observed)) - 3}
                        width={6} height={6} fill="#1c2b1c"
                        transform={`rotate(45, ${x + BAR_W / 2}, ${d.observed === 0 ? PLOT_H : yOf(d.observed)})`}
                      />
                    </>
                  )}

                  {i % labelEvery === 0 && (
                    <text
                      x={x + BAR_W / 2} y={PLOT_H + 14}
                      textAnchor="middle" fontSize={9}
                      fill={d.isToday ? "#2d6a4f" : "#6b7a69"}
                      fontFamily="'Open Sans', system-ui, sans-serif"
                      fontWeight={d.isToday ? "bold" : "normal"}
                    >
                      {d.date}
                    </text>
                  )}

                  {d.isToday && (
                    <text
                      x={x + BAR_W / 2} y={PLOT_H + 26}
                      textAnchor="middle" fontSize={8.5}
                      fill="#2d6a4f" fontFamily="'Open Sans', system-ui, sans-serif"
                      fontWeight="bold"
                    >
                      auj.
                    </text>
                  )}
                </g>
              );
            })}

            <text
              x={n * GROUP_W / 2} y={10}
              textAnchor="middle" fontSize={9}
              fill="#9ca3af" fontFamily="'Open Sans', system-ui, sans-serif"
            >
              ← historique  |  prévision →
            </text>
          </g>

{hovered !== null && mousePos && (() => {
             const d = data[hovered];
             if (!d) return null;
             const lines = activeList.map(m => {
               const v = (d as Record<string, unknown>)[m.id] as number | undefined;
               return { name: m.name, v };
             });
              const boxW = 130;
              const boxH = 20 + lines.length * 16 + (d.observed !== undefined ? 16 : 0) + 10;
              const el = scrollRef.current;
              const visibleLeft = el?.scrollLeft ?? 0;
              const visibleRight = el ? el.scrollLeft + el.clientWidth : SVG_W;
              const mx = mousePos.x - L;
              const my = mousePos.y - T;
              let boxLeft = mx + 10;
              if (boxLeft + boxW > visibleRight - L - 8) {
                boxLeft = mx - 8 - boxW;
              }
              boxLeft = Math.max(visibleLeft - L + 8, Math.min(boxLeft, visibleRight - L - boxW - 8));
              const tipX = boxLeft;
              const tipY = Math.max(0, Math.min(my - boxH - 4, PLOT_H - boxH));
             return (
               <g>
                 <rect
                   x={tipX + 8} y={tipY}
                   width={130} height={boxH}
                   fill="white" stroke="#e5e7eb" strokeWidth={1} rx={5}
                   filter="drop-shadow(0 2px 6px rgba(0,0,0,0.12))"
                 />
                 <text
                   x={tipX + 16} y={tipY + 14}
                   fontSize={9.5} fill="#6b7280"
                   fontFamily="'Open Sans', system-ui, sans-serif" fontWeight="bold"
                 >
                   {d.date}{d.isToday ? " (auj.)" : d.isForecast ? " (prévu)" : " (hist.)"}
                 </text>
                 {showObserved && d.observed !== undefined && (
                   <text
                     x={tipX + 16} y={tipY + 30}
                     fontSize={9.5} fill="#1c2b1c"
                     fontFamily="'Open Sans', system-ui, sans-serif"
                   >
                     {`Observé : ${d.observed} – ${RISK[d.observed]?.label}`}
                   </text>
                 )}
                 {lines.map((l, li) => {
                   const baseY = tipY + 30 + (showObserved && d.observed !== undefined ? 16 : 0) + li * 16;
                   const r = RISK[l.v ?? 0];
                   return (
                     <text
                       key={li}
                       x={tipX + 16} y={baseY}
                       fontSize={9.5}
                       fill={r?.text ?? "#374151"}
                       fontFamily="'Open Sans', system-ui, sans-serif"
                     >
                       {`${l.name} : ${l.v ?? "—"} – ${r?.label ?? "N/A"}`}
                     </text>
                   );
                 })}
               </g>
             );
           })()}
        </svg>
      </div>

      <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-mono)" }}>
        Barres superposées (opacité {Math.round(BAR_OPACITY * 100)}% / modèle) ·
        Plus sombre = plus de modèles prédisent ce niveau de risque
        {showObserved && " · ◆ = valeur observée"}
      </p>
    </div>
  );
}

// ─── Stacked Bar Chart ─────────────────────────────────────────────────────

const STACK_BAR_COLOR = "#64748b";
const STACK_BAR_OPACITY = 0.27;

function StackedBarChart({
  data,
  activeModels,
}: {
  data: ChartRow[];
  activeModels: Set<string>;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const PLOT_H = 260;
  const L = 80;
  const R = 24;
  const T = 24;
  const B = 52;

  const n = data.length;
  const activeList = MODELS.filter(m => activeModels.has(m.id));

  const GROUP_W = 52;
  const BAR_W = GROUP_W * 0.72;
  const BAR_OFF = GROUP_W * 0.14;
  const SVG_W = R + n * GROUP_W;
  const SVG_H = PLOT_H + T + B;

  const yOf = (v: number) => PLOT_H - (v / 4) * PLOT_H;

  const labelEvery = Math.max(1, Math.ceil(n / 10));

  const legendItems = [1, 2, 3, 4].map(count => {
    const eff = Math.round((1 - Math.pow(1 - STACK_BAR_OPACITY, count)) * 100);
    const opacity = 1 - Math.pow(1 - STACK_BAR_OPACITY, count);
    return { count, eff, opacity };
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !data.length) return;
    const todayIdx = data.findIndex(d => d.isToday);
    if (todayIdx < 0) {
      el.scrollLeft = 0;
      return;
    }
    const todayPos = todayIdx * GROUP_W;
    el.scrollLeft = Math.max(0, Math.min(todayPos, el.scrollWidth - el.clientWidth));
  }, [data, L, GROUP_W]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-stretch">
        <div
          className="shrink-0 select-none relative"
          style={{ width: L, height: SVG_H }}
        >
          {[0, 1, 2, 3, 4].map(v => (
            <div
              key={v}
              className="absolute right-2 text-right"
              style={{
                top: T + yOf(v),
                transform: "translateY(-50%)",
                fontSize: 9.5,
                lineHeight: 1,
                color: RISK[v].text,
                fontFamily: "'Open Sans', system-ui, sans-serif",
                fontWeight: 500,
              }}
            >
              {v} {RISK[v].label}
            </div>
          ))}
        </div>

        <div ref={scrollRef} className="overflow-x-auto flex-1 min-w-0">
          <svg
          width={SVG_W}
          height={SVG_H}
          style={{ display: "block" }}
          onMouseMove={e => {
            const rect = e.currentTarget.getBoundingClientRect();
            setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
          }}
          onMouseLeave={() => setMousePos(null)}
        >
           <g transform={`translate(0, ${T})`}>
             {[0, 1, 2, 3].map(v => (
               <rect
                 key={v}
                 x={0}
                 y={yOf(v + 1)}
                 width={n * GROUP_W}
                 height={yOf(v) - yOf(v + 1)}
                 fill={RISK[v + 1].bg}
                 fillOpacity={0.35}
               />
             ))}

            {[0, 1, 2, 3, 4].map(v => (
              <g key={v}>
                <line
                  x1={0} y1={yOf(v)}
                  x2={n * GROUP_W} y2={yOf(v)}
                  stroke={RISK[v].border}
                  strokeWidth={v === 0 ? 1 : 0.75}
                  strokeDasharray={v === 0 ? undefined : "3 5"}
                  strokeOpacity={0.8}
                />
                <text
                  x={-6} y={yOf(v)}
                  dominantBaseline="middle"
                  textAnchor="end"
                  fontSize={9.5}
                  fill={RISK[v].text}
                  fontFamily="'Open Sans', system-ui, sans-serif"
                  fontWeight="500"
                >
                  {v} {RISK[v].label}
                </text>
              </g>
            ))}

            {data.map((d, i) => {
              const x = i * GROUP_W + BAR_OFF;
              const isHov = hovered === i;

              return (
                <g
                  key={i}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ cursor: "default" }}
                >
                  <rect
                    x={i * GROUP_W} y={0}
                    width={GROUP_W} height={PLOT_H}
                    fill="transparent"
                  />
                  {isHov && (
                    <rect
                      x={i * GROUP_W} y={0}
                      width={GROUP_W} height={PLOT_H}
                      fill={STACK_BAR_COLOR} fillOpacity={0.05}
                    />
                  )}

                  {d.isToday && (
                    <line
                      x1={x + BAR_W / 2} y1={0}
                      x2={x + BAR_W / 2} y2={PLOT_H}
                      stroke="#2d6a4f" strokeDasharray="4 3"
                      strokeWidth={1.5} strokeOpacity={0.6}
                    />
                  )}

                  {activeList.map(m => {
                    const v = (d as Record<string, unknown>)[m.id] as number | undefined;
                    if (!v || v === 0) return null;
                    const barH = (v / 4) * PLOT_H;
                    return (
                      <rect
                        key={m.id}
                        x={x}
                        y={yOf(v)}
                        width={BAR_W}
                        height={barH}
                        fill={STACK_BAR_COLOR}
                        fillOpacity={STACK_BAR_OPACITY}
                        rx={2}
                      />
                    );
                  })}

                  {i % labelEvery === 0 && (
                    <text
                      x={x + BAR_W / 2} y={PLOT_H + 14}
                      textAnchor="middle" fontSize={9}
                      fill={d.isToday ? "#2d6a4f" : "#6b7a69"}
                      fontFamily="'Open Sans', system-ui, sans-serif"
                      fontWeight={d.isToday ? "bold" : "normal"}
                    >
                      {d.date}
                    </text>
                  )}

                  {d.isToday && (
                    <text
                      x={x + BAR_W / 2} y={PLOT_H + 26}
                      textAnchor="middle" fontSize={8.5}
                      fill="#2d6a4f" fontFamily="'Open Sans', system-ui, sans-serif"
                      fontWeight="bold"
                    >
                      auj.
                    </text>
                  )}
                </g>
              );
            })}

            {hovered !== null && mousePos && (() => {
              const d = data[hovered];
              if (!d) return null;
              const lines = activeList.map(m => {
                const v = (d as Record<string, unknown>)[m.id] as number | undefined;
                return { name: m.name, v };
              });
const boxW = 130;
               const boxH = 16 + lines.length * 16 + 8;
               const offset = 0;
               const el = scrollRef.current;
               const visibleLeft = el?.scrollLeft ?? 0;
               const visibleRight = el ? el.scrollLeft + el.clientWidth : SVG_W;
 const mx = mousePos.x;
                 const my = mousePos.y - T;
                 let boxLeft = mx + 10;
                 if (boxLeft + boxW > visibleRight - offset) {
                   boxLeft = mx - offset - boxW;
                 }
                 boxLeft = Math.max(visibleLeft + offset, Math.min(boxLeft, visibleRight - boxW - offset));
                const tipX = boxLeft - offset;
                const tipY = Math.max(0, Math.min(my - boxH - 4, PLOT_H - boxH));
              return (
                <g>
                  <rect
                    x={tipX + 2} y={tipY}
                    width={boxW} height={boxH}
                    fill="white" stroke="#e5e7eb" strokeWidth={1} rx={5}
                    filter="drop-shadow(0 2px 6px rgba(0,0,0,0.12))"
                  />
                  <text
                    x={tipX + 10} y={tipY + 14}
                    fontSize={9.5} fill="#6b7280"
                    fontFamily="'Open Sans', system-ui, sans-serif" fontWeight="bold"
                  >
                    {d.date}{d.isToday ? " (auj.)" : d.isForecast ? " (prévu)" : " (hist.)"}
                  </text>
                  {lines.map((l, li) => {
                    const baseY = tipY + 30 + li * 16;
                    const r = RISK[l.v ?? 0];
                    return (
                      <text
                        key={li}
                        x={tipX + 10} y={baseY}
                        fontSize={9.5}
                        fill={r?.text ?? "#374151"}
                        fontFamily="'Open Sans', system-ui, sans-serif"
                      >
                        {`${l.name} : ${l.v ?? "—"} – ${r?.label ?? "N/A"}`}
                      </text>
                    );
                  })}
                </g>
              );
            })()}
          </g>
         </svg>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground/70">Risque empilé :</span>
        {legendItems.map(({ count, eff, opacity }) => (
          <span key={count} className="flex items-center gap-1.5">
            <span
              className="w-5 h-4 rounded-sm inline-block border border-border/30"
              style={{ backgroundColor: STACK_BAR_COLOR, opacity }}
            />
            <span style={{ fontFamily: "var(--font-mono)" }}>
              {count} modèle{count > 1 ? "s" : ""} ({eff}%)
            </span>
          </span>
        ))}
      </div>

      <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-sans)" }}>
        Barres empilées (opacité {Math.round(STACK_BAR_OPACITY * 100)}% / modèle) ·
        Plus sombre = plus de modèles prédisent ce niveau de risque
      </p>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────

export default function App() {
  const [activeModels, setActiveModels] = useState<Set<string>>(new Set(MODELS.map(m => m.id)));
  const [hypothesis, setHypothesis] = useState<"h1" | "h2" | "h3">("h2");
  const [location, setLocation] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const region = params.get("region");
    if (region) {
      const regionLocs = LOCATIONS.filter(l => l.region === region);
      if (regionLocs.length > 0) return regionLocs[0];
    }
    const commune = params.get("commune");
    if (commune) {
      const loc = LOCATIONS.find(l => l.name === commune);
      if (loc) return loc;
    }
    return LOCATIONS[0];
  });
  const [locationOpen, setLocationOpen] = useState(false);
  const [regionOpen, setRegionOpen] = useState(false);
  const SORTED_REGIONS = [...new Set(LOCATIONS.map(l => l.region).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
  const urlParams = new URLSearchParams(window.location.search);
  const urlRegion = urlParams.get("region");
  const [regionFilter, setRegionFilter] = useState<string | null>(() => {
    if (urlRegion) return urlRegion;
    const commune = urlParams.get("commune");
    if (commune) {
      const loc = LOCATIONS.find(l => l.name === commune);
      if (loc) return loc.region;
    }
    return SORTED_REGIONS[0] ?? null;
  });
  const regionLocked = urlRegion !== null;
  const filteredLocations = regionFilter
    ? LOCATIONS.filter(l => l.region === regionFilter)
    : LOCATIONS;

  const [pastDays, setPastDays] = useState(21);
  const [futureDays, setFutureDays] = useState(14);

  const communeData = DATA_BY_COMMUNE[location.name] ?? {};

  // "Today" = the dataset date closest to the actual current date (Paris)
  const TODAY_INDEX = useMemo(() => {
    const now = new Date();
    let best = 0;
    let bestDiff = Infinity;
    DATES.forEach((serial, i) => {
      const diff = Math.abs(excelSerialToDate(Number(serial)).getTime() - now.getTime());
      if (diff < bestDiff) { bestDiff = diff; best = i; }
    });
    return best;
  }, []);

  const allDates = useMemo(
    () => DATES.map(serial => excelSerialToDate(Number(serial))),
    [],
  );

  // Visible window based on the period selectors
  const visibleRange = useMemo(() => {
    const start = Math.max(0, TODAY_INDEX - pastDays);
    const end = Math.min(DATES.length, TODAY_INDEX + futureDays + 1);
    return { start, end };
  }, [pastDays, futureDays]);

  const visibleDates = useMemo(
    () => allDates.slice(visibleRange.start, visibleRange.end),
    [allDates, visibleRange],
  );
  const visibleSerials = useMemo(
    () => DATES.slice(visibleRange.start, visibleRange.end),
    [visibleRange],
  );

  // Current risk per model for the selected location & hypothesis (actual today)
  const todaySerial = DATES[TODAY_INDEX];
  const tomorrowSerial = DATES[Math.min(DATES.length - 1, TODAY_INDEX + 1)];
  const currentRisk = MODELS.map(m => {
    const day = communeData[todaySerial];
    const nextDay = communeData[tomorrowSerial];
    const todayValue = day?.[m.id as keyof CommuneDay]?.[hypothesis] as number | undefined;
    const tomorrowValue = nextDay?.[m.id as keyof CommuneDay]?.[hypothesis] as number | undefined;
    return { ...m, today: todayValue, tomorrow: tomorrowValue };
  });

  const currentPluie = useMemo(() => {
    const day = communeData[todaySerial];
    const nextDay = communeData[tomorrowSerial];
    const todayPluie = day?.pluie?.[hypothesis] as number | undefined;
    const tomorrowPluie = nextDay?.pluie?.[hypothesis] as number | undefined;
    return { today: todayPluie, tomorrow: tomorrowPluie };
  }, [communeData, todaySerial, tomorrowSerial, hypothesis]);

  const chartData = useMemo((): ChartRow[] => {
    return visibleSerials.map((serial, i) => {
      const globalIdx = visibleRange.start + i;
      const day = communeData[serial];
      return {
        date: format(visibleDates[i], "d MMM", { locale: fr }),
        dateShort: format(visibleDates[i], "dd/MM"),
        idx: globalIdx,
        isForecast: globalIdx > TODAY_INDEX,
        isToday: globalIdx === TODAY_INDEX,
        rossi: day?.rossi?.[hypothesis] as number | undefined,
        potsys: day?.potsys?.[hypothesis] as number | undefined,
        milvit: day?.milvit?.[hypothesis] as number | undefined,
        milstop: day?.milstop?.[hypothesis] as number | undefined,
      };
    });
  }, [visibleSerials, visibleDates, visibleRange, communeData, hypothesis, TODAY_INDEX]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("commune") !== location.name) {
      const url = new URL(window.location.href);
      url.searchParams.set("commune", location.name);
      window.history.replaceState({}, "", url.toString());
    }
  }, [location.name]);

  const tableScrollRef = useRef<HTMLDivElement>(null);

  const STICKY_COL_W = 80;
  const TABLE_COL_W = 52;

  useEffect(() => {
    const el = tableScrollRef.current;
    if (!el || visibleSerials.length === 0) return;
    const todayIdx = TODAY_INDEX - visibleRange.start;
    if (todayIdx < 0) {
      el.scrollLeft = 0;
      return;
    }
    const todayPos = STICKY_COL_W + todayIdx * TABLE_COL_W;
    el.scrollLeft = Math.max(0, Math.min(todayPos, el.scrollWidth - el.clientWidth));
  }, [visibleSerials, visibleRange, TODAY_INDEX]);

  const toggleModel = (id: string) => {
    setActiveModels(prev => {
      const next = new Set(prev);
      if (next.has(id) && next.size > 1) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div
      className="min-h-screen bg-background text-foreground flex flex-col"
      style={{ fontFamily: "var(--font-sans)" }}
      onClick={() => setLocationOpen(false)}
    >
      {/* ── Header ── */}
      <header className="bg-card border-b border-border px-6 py-3.5 flex items-center justify-between gap-4 flex-wrap shadow-sm">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: "#2d6a4f22", border: "1.5px solid #2d6a4f44" }}
          >
            <Leaf className="w-5 h-5" style={{ color: "#2d6a4f" }} />
          </div>
          <div>
            <h1
              className="text-xl font-semibold tracking-tight leading-none"
              style={{ fontFamily: "var(--font-display)", color: "#1c2b1c" }}
            >
              Comparaison des modèles
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground" style={{ fontFamily: "var(--font-sans)" }}>
          <span className="hidden sm:block">Mis à jour : {format(new Date(), "d MMMM yyyy, HH:mm", { locale: fr, timeZone: "Europe/Paris" })} (Paris)</span>
          <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            En direct
          </span>
        </div>
      </header>

      {/* ── Controls ── */}
      <div className="bg-card border-b border-border px-6 py-3 flex flex-wrap items-center gap-3 shadow-sm">

        {/* Location */}
        <div className="relative" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => setLocationOpen(v => !v)}
            className="flex items-center gap-2 border border-border rounded-md px-3 py-1.5 text-sm bg-background hover:border-primary/50 transition-colors"
          >
            <MapPin className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            <span className="font-medium">{location.name}</span>
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          {locationOpen && (
            <div className="absolute top-full left-0 mt-1 z-30 bg-card border border-border rounded-lg shadow-xl min-w-64 py-1 max-h-[28rem] overflow-y-auto">
              {filteredLocations.map(loc => (
                <button
                  key={loc.name}
                  onClick={() => { setLocation(loc); setLocationOpen(false); }}
                  className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between gap-4 hover:bg-secondary transition-colors ${loc.name === location.name ? "text-primary font-semibold" : ""}`}
                >
                  <span>{loc.name}</span>
                  <span className="text-xs text-muted-foreground">{regionLabel(loc.region)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Region filter - hidden when locked via URL ?region= */}
        {!regionLocked && (
          <div className="relative" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setRegionOpen(v => !v)}
              className="flex items-center gap-2 border border-border rounded-md px-3 py-1.5 text-sm bg-background hover:border-primary/50 transition-colors"
            >
              <span className="font-medium">{regionFilter ? regionLabel(regionFilter) : 'Région'}</span>
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            {regionOpen && (
              <div className="absolute top-full left-0 mt-1 z-30 bg-card border border-border rounded-lg shadow-xl min-w-32 py-1 max-h-64 overflow-y-auto">
                {SORTED_REGIONS.map(r => (
                  <button
                    key={r}
                    onClick={() => { setRegionFilter(r); setRegionOpen(false); }}
                    className={"w-full text-left px-4 py-2 text-sm hover:bg-secondary transition-colors " + (regionFilter === r ? 'text-primary font-semibold' : '')}
                  >
                    <span>{regionLabel(r)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground mr-1">Modèles :</span>
          {MODELS.map(m => {
            const active = activeModels.has(m.id);
            return (
              <button
                key={m.id}
                onClick={() => toggleModel(m.id)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                  active ? "border-transparent text-white shadow-sm" : "border-border text-muted-foreground bg-background opacity-50 hover:opacity-75"
                }`}
                style={{ backgroundColor: active ? m.color : undefined }}
              >
                {m.name}
              </button>
            );
          })}
        </div>

        {/* Hypothesis selector */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground mr-1">Hypothèses :</span>
          {HYPOTHESES.map(h => {
            const active = hypothesis === h.id;
            return (
              <button
                key={h.id}
                onClick={() => setHypothesis(h.id as "h1" | "h2" | "h3")}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                  active ? "border-transparent text-white shadow-sm bg-primary" : "border-border text-muted-foreground bg-background hover:opacity-75"
                }`}
              >
                {h.label}
              </button>
            );
          })}
        </div>

        {/* Period controls */}
        <div className="flex items-center gap-2 bg-background border border-border rounded-md px-3 py-1.5">
          <CalendarDays className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-xs text-muted-foreground">Passé :</span>
          <select
            value={pastDays}
            onChange={e => setPastDays(Number(e.target.value))}
            className="text-xs bg-transparent focus:outline-none cursor-pointer text-foreground"
          >
            <option value={7}>7 j</option>
            <option value={14}>14 j</option>
            <option value={21}>21 j</option>
            <option value={90}>90 j</option>
          </select>
          <span className="text-border">|</span>
          <span className="text-xs text-muted-foreground">Prévision :</span>
          <select
            value={futureDays}
            onChange={e => setFutureDays(Number(e.target.value))}
            className="text-xs bg-transparent focus:outline-none cursor-pointer text-foreground"
          >
            <option value={0}>0 j</option>
            <option value={7}>7 j</option>
            <option value={14}>14 j</option>
          </select>
        </div>
      </div>

{/* ── Risk legend ── */}
       <div className="px-6 py-2.5 border-b border-border bg-background flex items-center gap-3 flex-wrap" style={{ fontFamily: "'Open Sans', system-ui, sans-serif" }}>
         <span className="text-xs text-muted-foreground font-medium">Classe de risque :</span>
         {RISK.map((r, i) => (
           <span
             key={i}
             className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border font-medium"
             style={{ backgroundColor: r.bg, color: r.text, borderColor: r.border }}
           >
             <span
               className="w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold"
               style={{ backgroundColor: r.dot + "33", color: r.text }}
             >
               {i}
             </span>
             {r.label}
           </span>
          ))}
        </div>

       {/* ── Rain legend ── */}
       <div className="px-6 py-2.5 border-b border-border bg-background flex items-center gap-3 flex-wrap" style={{ fontFamily: "'Open Sans', system-ui, sans-serif" }}>
         <span className="text-xs text-muted-foreground font-medium">Pluie (mm) :</span>
         <div className="flex items-end">
           {PLUIE_STOPS.map((s, i) => (
             <div key={i} className="flex flex-col items-center">
               <div
                 className="h-4 w-8"
                 style={{ backgroundColor: s.c, borderLeft: i === 0 ? "1px solid rgb(226 232 240 / 0.6)" : undefined, borderRight: i === PLUIE_STOPS.length - 1 ? "1px solid rgb(226 232 240 / 0.6)" : "1px solid rgba(255,255,255,0.7)" }}
               />
               <span className="text-[9px] text-muted-foreground mt-0.5 leading-none" style={{ fontFamily: "var(--font-mono)" }}>
                 {s.v === 30 ? "30+" : s.v}
               </span>
             </div>
           ))}
         </div>
       </div>

       {/* ── Body ── */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0">

        {/* Sidebar */}
        <aside className="lg:w-56 xl:w-64 border-b lg:border-b-0 lg:border-r border-border bg-card px-4 py-5 flex flex-row lg:flex-col gap-3 overflow-x-auto lg:overflow-y-auto">
          <div className="hidden lg:block mb-1">
            <p className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">
              Risque aujourd'hui
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {location.name} • {HYPOTHESES.find(h => h.id === hypothesis)?.label}
            </p>
          </div>

              <div className="mt-2 pt-2 border-t border-border/50">
                <p className="text-[10px] font-semibold text-foreground/70 uppercase tracking-wider mb-2">
                  Pluie
                </p>
                {(() => {
                  const ps = pluieScale(currentPluie.today);
                  return (
                    <div
                      className="rounded-lg border p-3 cursor-default select-none"
                      style={{ backgroundColor: ps.bg, borderColor: "#e2e8f0" }}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ps.text }} />
                        <span className="text-xs font-semibold text-foreground/70">Aujourd'hui</span>
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <span
                          className="text-2xl font-bold leading-none tabular-nums"
                          style={{ color: ps.text, fontFamily: "var(--font-numbers)" }}
                        >
                          {currentPluie.today !== undefined ? currentPluie.today.toFixed(1) : "N/A"}
                        </span>
                        <span className="text-[10px] text-muted-foreground">mm</span>
                      </div>
                    </div>
                  );
                })()}
                {(() => {
                  const ps = pluieScale(currentPluie.tomorrow);
                  return (
                    <div
                      className="rounded-lg border p-3 mt-2 cursor-default select-none"
                      style={{ backgroundColor: ps.bg, borderColor: "#e2e8f0" }}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ps.text }} />
                        <span className="text-xs font-semibold text-foreground/70">Demain</span>
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <span
                          className="text-2xl font-bold leading-none tabular-nums"
                          style={{ color: ps.text, fontFamily: "var(--font-numbers)" }}
                        >
                          {currentPluie.tomorrow !== undefined ? currentPluie.tomorrow.toFixed(1) : "N/A"}
                        </span>
                        <span className="text-[10px] text-muted-foreground">mm</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
              {currentRisk.map(m => {
            const active = activeModels.has(m.id);
            const r = m.today != null ? RISK[m.today] : undefined;
            const tr = m.tomorrow != null ? RISK[m.tomorrow] : undefined;
            return (
              <div
                key={m.id}
                onClick={() => toggleModel(m.id)}
                className={`flex-shrink-0 rounded-lg border p-3.5 cursor-pointer transition-all select-none ${
                  active ? "border-border shadow-sm" : "opacity-35"
                }`}
                style={{ backgroundColor: active ? (r ? r.bg : "#f1f5f9") : "#f8f8f8", borderColor: active ? (r ? r.border : "#cbd5e1") : "#e5e7eb" }}
              >
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: m.color }} />
                  <span className="text-xs font-semibold text-foreground/70">{m.name}</span>
                </div>
                <div className="flex items-end gap-2">
                  {m.today != null ? (
                    <>
                      <span
                        className="text-4xl font-bold leading-none tabular-nums"
                        style={{ color: r.text, fontFamily: "var(--font-numbers)" }}
                      >
                        {m.today}
                      </span>
                      <span className="text-xs font-medium pb-0.5" style={{ color: r.text }}>
                        {r.label}
                      </span>
                    </>
                  ) : (
                    <span className="text-xl font-semibold text-muted-foreground">N/A</span>
                  )}
                </div>
                <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
                  <span>Demain :</span>
                  {m.tomorrow != null ? (
                    <RiskBadge level={m.tomorrow} size="sm" />
                  ) : (
                    <span className="text-[10px] text-muted-foreground">N/A</span>
                  )}
                </div>
              </div>
            );
          })}


        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col p-5 gap-4 min-w-0 bg-background overflow-y-auto">

          <div className="flex items-center border-b border-border gap-0 -mb-1 pb-2">
                <span className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-sans)" }}>
                  {location.name} • Mildiou de la vigne • {HYPOTHESES.find(h => h.id === hypothesis)?.label}
                </span>
              </div>

              {/* ── Heatmap ── */}
              <div ref={tableScrollRef} className="overflow-x-auto w-full">
              <table className="border-collapse text-sm">
                <thead>
                  <tr>
                    <th
                      className="text-left py-2 pr-4 text-xs text-muted-foreground font-medium sticky left-0 bg-background z-10 border-b border-r border-border"
                      style={{ minWidth: "80px", width: "80px" }}
                    >
                      Modèle
                    </th>
                    {visibleDates.map((d, i) => {
                      const globalIdx = visibleRange.start + i;
                      const isToday = globalIdx === TODAY_INDEX;
                      const isForecast = globalIdx > TODAY_INDEX;
                      return (
                        <th
                          key={i}
                          className={`py-2 px-1 text-center border-b border-border/40 ${isToday ? "border-b-2 border-b-primary bg-neutral-100 rounded-t-md" : ""}`}
                          style={{ minWidth: "52px", width: "52px" }}
                        >
                          <div
                            className={`text-[10px] leading-tight ${isToday ? "text-primary font-bold" : "text-muted-foreground"}`}
                            style={{ fontFamily: "var(--font-sans)" }}
                          >
                            {format(d, "d MMM", { locale: fr })}
                          </div>
                          <div
                            className={`text-[9px] leading-tight ${isToday ? "text-primary font-semibold" : "text-muted-foreground/60"}`}
                            style={{ fontFamily: "var(--font-sans)" }}
                          >
                            {isToday ? "auj." : isForecast ? "prévu" : ""}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {/* Meteo row */}
                  <tr>
                    <td
                      className="py-2 pr-4 text-xs font-semibold sticky left-0 bg-background z-10 border-r border-border whitespace-nowrap"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: "#64748b" }} />
                        Pluie
                      </div>
                      <span className="text-[10px] text-muted-foreground font-normal">(mm)</span>
                    </td>
                      {visibleSerials.map((serial, ci) => {
                        const day = communeData[serial];
                        const pluieVal = day?.pluie?.[hypothesis] as number | undefined;
                        const globalIdx = visibleRange.start + ci;
                        const isTodayCell = globalIdx === TODAY_INDEX;
                        const { bg, text } = pluieScale(pluieVal);
                        return (
                          <td
                            key={serial}
                            className={`border border-border/30 p-1.5 text-center transition-colors ${isTodayCell ? "border-t-2 border-t-primary" : ""}`}
                            style={{ backgroundColor: bg }}
                          >
                            <div className="flex flex-col items-center gap-0.5">
                              <span
                                className="font-semibold text-sm leading-none"
                                style={{ fontFamily: "var(--font-mono)", color: text }}
                              >
                                {pluieVal !== undefined ? pluieVal.toFixed(1) : "N/A"}
                              </span>
                            </div>
                        </td>
                      );
                    })}
                  </tr>
                {/* Model rows */}
                  {MODELS.filter(m => activeModels.has(m.id)).map(m => (
                    <tr key={m.id}>
                      <td
                        className="py-2 pr-4 text-xs font-semibold sticky left-0 bg-background z-10 border-r border-border whitespace-nowrap"
                        style={{ color: m.color }}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: m.color }} />
                          {m.name}
                        </div>
                      </td>
                      {visibleSerials.map((serial, ci) => {
                        const globalIdx = visibleRange.start + ci;
                        const isTodayCell = globalIdx === TODAY_INDEX;
                        const day = communeData[serial];
                        const value = day?.[m.id as keyof CommuneDay]?.[hypothesis] as number | undefined;
                        return (
                          <RiskCell
                            key={serial}
                            level={value}
                            showLabel
                            isToday={isTodayCell}
                          />
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
               </table>
              </div>

<div className="mt-4 pt-4 border-t border-border/50">
                  <StackedBarChart data={chartData} activeModels={activeModels} />
                </div>
          </main>
      </div>
    </div>
  );
}

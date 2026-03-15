import { useFormContext } from "react-hook-form";
import type { DistributionConfig } from "@/types/graph";

// ── Safe number coercion ────────────────────────────────────────────────────
function s(v: unknown, fallback = 0): number {
  const n = Number(v);
  return isFinite(n) ? n : fallback;
}

// ── Lanczos Gamma for Weibull mean ──────────────────────────────────────────
function gamma(z: number): number {
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  z -= 1;
  const C = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  let x = C[0];
  for (let i = 1; i <= 8; i++) x += C[i] / (z + i);
  const t = z + 7.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

// ── Point computation ───────────────────────────────────────────────────────
interface Pt { x: number; y: number }

function computeCurve(cfg: DistributionConfig): { pts: Pt[]; discrete: boolean } {
  const N = 100;

  switch (cfg.type) {
    case "fixed":
      return { pts: [{ x: s(cfg.value, 0), y: 1 }], discrete: true };

    case "normal": {
      const μ = s(cfg.mean, 0);
      const σ = Math.max(s(cfg.std, 1), 0.001);
      const lo = μ - 4 * σ, hi = μ + 4 * σ;
      const C = 1 / (σ * Math.sqrt(2 * Math.PI));
      return {
        pts: Array.from({ length: N }, (_, i) => {
          const x = lo + (hi - lo) * i / (N - 1);
          return { x, y: C * Math.exp(-0.5 * ((x - μ) / σ) ** 2) };
        }),
        discrete: false,
      };
    }

    case "lognormal": {
      const μ = s(cfg.mean, 0);
      const σ = Math.max(s(cfg.std, 0.5), 0.001);
      const hi = Math.exp(μ + 3.5 * σ);
      return {
        pts: Array.from({ length: N }, (_, i) => {
          const x = hi * (i + 1) / N;
          const y =
            Math.exp(-0.5 * ((Math.log(x) - μ) / σ) ** 2) /
            (x * σ * Math.sqrt(2 * Math.PI));
          return { x, y: isFinite(y) && y >= 0 ? y : 0 };
        }),
        discrete: false,
      };
    }

    case "exponential": {
      const sc = Math.max(s(cfg.scale, 1), 0.001);
      return {
        pts: Array.from({ length: N }, (_, i) => {
          const x = 5 * sc * i / (N - 1);
          return { x, y: Math.exp(-x / sc) / sc };
        }),
        discrete: false,
      };
    }

    case "triangular": {
      const lo = s(cfg.low, 0);
      const hi = Math.max(s(cfg.high, 2), lo + 0.001);
      const mo = Math.min(Math.max(s(cfg.mode, (lo + hi) / 2), lo), hi);
      return {
        pts: [{ x: lo, y: 0 }, { x: mo, y: 2 / (hi - lo) }, { x: hi, y: 0 }],
        discrete: false,
      };
    }

    case "uniform": {
      const lo = s(cfg.low, 0);
      const hi = Math.max(s(cfg.high, 1), lo + 0.001);
      const h = 1 / (hi - lo);
      const m = (hi - lo) * 0.12;
      return {
        pts: [
          { x: lo - m, y: 0 }, { x: lo, y: 0 }, { x: lo, y: h },
          { x: hi, y: h }, { x: hi, y: 0 }, { x: hi + m, y: 0 },
        ],
        discrete: false,
      };
    }

    case "weibull": {
      const sc = Math.max(s(cfg.scale, 1), 0.001);
      const sh = Math.max(s(cfg.shape, 1), 0.1);
      const p999 = sc * Math.pow(-Math.log(0.001), 1 / sh);
      return {
        pts: Array.from({ length: N }, (_, i) => {
          const x = p999 * (i + 1) / N;
          const y =
            (sh / sc) * Math.pow(x / sc, sh - 1) * Math.exp(-Math.pow(x / sc, sh));
          return { x, y: isFinite(y) ? Math.max(0, y) : 0 };
        }),
        discrete: false,
      };
    }

    case "poisson": {
      const λ = Math.max(s(cfg.mean, 1), 0.001);
      const kMax = Math.min(Math.ceil(λ + 4 * Math.sqrt(λ) + 4), 50);
      const lf: number[] = [0];
      for (let k = 1; k <= kMax; k++) lf[k] = lf[k - 1] + Math.log(k);
      return {
        pts: Array.from({ length: kMax + 1 }, (_, k) => ({
          x: k,
          y: Math.exp(-λ + k * Math.log(Math.max(λ, 1e-300)) - lf[k]),
        })),
        discrete: true,
      };
    }

    default:
      return { pts: [], discrete: false };
  }
}

// ── Key statistics ──────────────────────────────────────────────────────────
function getStats(cfg: DistributionConfig): [string, string][] {
  const f = (n: number): string => {
    if (!isFinite(n)) return "—";
    if (Math.abs(n) >= 10000 || (n !== 0 && Math.abs(n) < 0.001))
      return n.toExponential(2);
    return parseFloat(n.toFixed(4)).toString();
  };

  switch (cfg.type) {
    case "fixed":
      return [["Value", f(s(cfg.value, 0))]];

    case "normal": {
      const μ = s(cfg.mean, 0), σ = s(cfg.std, 1);
      return [
        ["Mean (μ)", f(μ)],
        ["Std Dev (σ)", f(σ)],
        ["±2σ range", `[${f(μ - 2 * σ)},  ${f(μ + 2 * σ)}]`],
      ];
    }

    case "lognormal": {
      const μ = s(cfg.mean, 0), σ = s(cfg.std, 0.5);
      const mean = Math.exp(μ + (σ * σ) / 2);
      const std = Math.sqrt((Math.exp(σ * σ) - 1) * Math.exp(2 * μ + σ * σ));
      return [["Median", f(Math.exp(μ))], ["Mean", f(mean)], ["Std Dev", f(std)]];
    }

    case "exponential": {
      const sc = s(cfg.scale, 1);
      return [["Mean", f(sc)], ["Std Dev", f(sc)], ["P95", f(sc * Math.log(20))]];
    }

    case "triangular": {
      const lo = s(cfg.low, 0), hi = s(cfg.high, 2), mo = s(cfg.mode, 1);
      const mean = (lo + mo + hi) / 3;
      const variance =
        (lo * lo + mo * mo + hi * hi - lo * mo - lo * hi - mo * hi) / 18;
      return [
        ["Mean", f(mean)],
        ["Std Dev", f(Math.sqrt(Math.max(0, variance)))],
        ["Range", `[${f(lo)},  ${f(hi)}]`],
      ];
    }

    case "uniform": {
      const lo = s(cfg.low, 0), hi = s(cfg.high, 1);
      return [
        ["Mean", f((lo + hi) / 2)],
        ["Std Dev", f((hi - lo) / Math.sqrt(12))],
        ["Range", `[${f(lo)},  ${f(hi)}]`],
      ];
    }

    case "weibull": {
      const sc = s(cfg.scale, 1), sh = s(cfg.shape, 1);
      const mean = isFinite(sh) && sh > 0 ? sc * gamma(1 + 1 / sh) : NaN;
      return [["Mean", f(mean)], ["Scale", f(sc)], ["Shape", f(sh)]];
    }

    case "poisson": {
      const λ = s(cfg.mean, 1);
      return [["Mean (λ)", f(λ)], ["Std Dev", f(Math.sqrt(λ))]];
    }

    default:
      return [];
  }
}

// ── SVG chart dimensions ────────────────────────────────────────────────────
const VW = 200, VH = 108;
const PL = 6, PR = 6, PT = 8, PB = 20;
const PW = VW - PL - PR;
const PH = VH - PT - PB;

export function DistributionChart({ fieldPrefix }: { fieldPrefix: string }) {
  const { watch } = useFormContext();
  const cfg = watch(fieldPrefix) as DistributionConfig | undefined;
  if (!cfg) return null;

  const { pts, discrete } = computeCurve(cfg);
  const stats = getStats(cfg);
  if (pts.length === 0) return null;

  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMax = Math.max(...ys, 0.001);

  const sx = (x: number) => PL + ((x - xMin) / (xMax - xMin || 1)) * PW;
  const sy = (y: number) => PT + (1 - y / yMax) * PH;
  const baseY = sy(0);

  const fmtTick = (n: number): string => {
    if (!isFinite(n)) return "";
    if (Math.abs(n) >= 10000) return n.toExponential(1);
    if (n !== 0 && Math.abs(n) < 0.01) return n.toFixed(3);
    if (Math.abs(n) < 1) return n.toFixed(2);
    return n.toFixed(1);
  };

  const gradId = `dg_${fieldPrefix}`;

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
        Preview
      </p>

      <div className="rounded border border-gray-100 bg-gray-50 p-1.5">
        <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" style={{ display: "block" }}>
          {/* x-axis baseline */}
          <line
            x1={PL} y1={baseY} x2={VW - PR} y2={baseY}
            stroke="#e5e7eb" strokeWidth={1}
          />

          {/* ── Fixed: vertical impulse ── */}
          {cfg.type === "fixed" && (
            <line
              x1={VW / 2} y1={PT + PH * 0.1}
              x2={VW / 2} y2={baseY}
              stroke="#f59e0b" strokeWidth={3} strokeLinecap="round"
            />
          )}

          {/* ── Poisson: discrete bars ── */}
          {discrete && cfg.type !== "fixed" && (() => {
            const bw = Math.max(2, PW / (pts.length + 1) * 0.55);
            return pts.map((p, i) => (
              <rect
                key={i}
                x={sx(p.x) - bw / 2}
                y={sy(p.y)}
                width={bw}
                height={Math.max(0, baseY - sy(p.y))}
                fill="#3b82f6"
                opacity={0.72}
                rx={1}
              />
            ));
          })()}

          {/* ── Continuous: area + stroke ── */}
          {!discrete && (() => {
            const lineD = pts
              .map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`)
              .join(" ");
            const areaD =
              `${lineD}` +
              ` L ${sx(pts[pts.length - 1].x).toFixed(1)} ${baseY.toFixed(1)}` +
              ` L ${sx(pts[0].x).toFixed(1)} ${baseY.toFixed(1)} Z`;
            return (
              <g>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.03" />
                  </linearGradient>
                </defs>
                <path d={areaD} fill={`url(#${gradId})`} />
                <path
                  d={lineD}
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                />
              </g>
            );
          })()}

          {/* x-axis tick labels */}
          {cfg.type === "fixed" ? (
            <text x={VW / 2} y={VH - 3} fontSize={8} fill="#9ca3af" textAnchor="middle">
              {fmtTick(s(cfg.value, 0))}
            </text>
          ) : (
            <>
              <text x={PL} y={VH - 3} fontSize={8} fill="#9ca3af" textAnchor="start">
                {fmtTick(xMin)}
              </text>
              <text x={VW / 2} y={VH - 3} fontSize={8} fill="#9ca3af" textAnchor="middle">
                {fmtTick((xMin + xMax) / 2)}
              </text>
              <text x={VW - PR} y={VH - 3} fontSize={8} fill="#9ca3af" textAnchor="end">
                {fmtTick(xMax)}
              </text>
            </>
          )}
        </svg>
      </div>

      {/* Stats table */}
      <div className="space-y-1.5">
        {stats.map(([label, value]) => (
          <div key={label} className="flex justify-between items-baseline gap-1">
            <span className="text-[11px] text-gray-400 shrink-0">{label}</span>
            <span className="text-[11px] font-mono text-gray-700 font-medium text-right leading-tight">
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

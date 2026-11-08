// Display formatting only. Money stays a decimal string end to end; never do math on parsed floats.

const DECIMALS = 3;

/** Normalise a decimal string to exactly 3 decimals (half-up), using string/BigInt math only. */
export function normalizeDecimal(value: string | number, decimals = DECIMALS): string | null {
  const raw = typeof value === "number" ? (Number.isFinite(value) ? value.toFixed(decimals + 2) : "") : value.trim();
  const m = /^([+-])?(\d*)(?:\.(\d*))?$/.exec(raw);
  if (!m || (!m[2] && !m[3])) return null;
  const neg = m[1] === "-";
  const int = m[2] || "0";
  const frac = m[3] ?? "";
  const scaled = BigInt(int + frac.padEnd(decimals, "0").slice(0, decimals));
  const roundUp = frac.length > decimals && Number(frac[decimals]) >= 5;
  const total = scaled + (roundUp ? 1n : 0n);
  const s = total.toString().padStart(decimals + 1, "0");
  const out = `${s.slice(0, -decimals)}.${s.slice(-decimals)}`;
  return neg && total !== 0n ? `-${out}` : out;
}

/** formatMoney("1290.000", "TND") -> "1,290.000 TND" */
export function formatMoney(
  value: string | number | null | undefined,
  currency = "TND",
  opts: { trim?: boolean } = {},
): string {
  if (value === null || value === undefined || value === "") return "-";
  const norm = normalizeDecimal(value);
  if (norm === null) return String(value);
  const neg = norm.startsWith("-");
  const [int, frac] = (neg ? norm.slice(1) : norm).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const tail = opts.trim && /^0*$/.test(frac ?? "") ? "" : `.${frac}`;
  return `${neg ? "-" : ""}${grouped}${tail}${currency ? ` ${currency}` : ""}`;
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function toDate(v: string | number | Date | null | undefined): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(v: string | number | Date | null | undefined): string {
  const d = toDate(v);
  return d ? dateFmt.format(d) : "-";
}

export function formatDateTime(v: string | number | Date | null | undefined): string {
  const d = toDate(v);
  return d ? dateTimeFmt.format(d) : "-";
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31536000],
  ["month", 2592000],
  ["week", 604800],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
];

export function formatRelative(v: string | number | Date | null | undefined, now: number = Date.now()): string {
  const d = toDate(v);
  if (!d) return "-";
  const diff = Math.round((d.getTime() - now) / 1000);
  if (Math.abs(diff) < 10) return "just now";
  for (const [unit, secs] of UNITS) {
    if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
  }
  return "just now";
}

/** formatPercent(0.1234) -> "12.3%". Pass `fromRatio: false` when the value is already 0-100. */
export function formatPercent(v: number | null | undefined, { digits = 1, fromRatio = true } = {}): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "-";
  return `${(fromRatio ? v * 100 : v).toFixed(digits)}%`;
}

export function formatNumber(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "-";
  return new Intl.NumberFormat("en-US").format(v);
}

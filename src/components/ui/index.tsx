import type { ReactNode } from "react";
import Link from "next/link";
import { Icon, IconChip, type IconName } from "@/components/icons";

// Shared visual primitives matching reference/IBF_FG_Warehouse_Frontend_Design_v5.html
// (.card/.ch/.cb, .kpi, .pl-*, .btn-*, .note, table th/td). Visual only - no data logic.

export function Card({
  title,
  sub,
  action,
  accentColor,
  accentTop,
  className = "",
  bodyClassName = "p-4",
  children,
}: {
  title?: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
  accentColor?: string;
  accentTop?: string;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const style: React.CSSProperties = {};
  if (accentColor) style.borderLeft = `4px solid ${accentColor}`;
  if (accentTop) style.borderTop = `4px solid ${accentTop}`;
  return (
    <section className={"rounded-xl border border-line bg-white shadow-card " + className} style={style}>
      {title ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div>
            <h2 className="text-sm font-extrabold text-navy">{title}</h2>
            {sub ? <span className="text-[11px] font-semibold text-muted2">{sub}</span> : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function KpiCard({
  color,
  label,
  value,
  sub,
  subTone = "muted",
}: {
  color: string;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  subTone?: "muted" | "danger";
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-white p-3.5 shadow-card sm:p-4">
      <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: color }} />
      <div className="text-[10px] font-bold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-extrabold tracking-tight text-navy">{value}</div>
      {sub !== undefined ? (
        <div className={"mt-0.5 text-[11px] font-semibold " + (subTone === "danger" ? "text-danger" : "text-muted2")}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

// Centered stat tile with a coloured top border (reference Hold/Transfer summary tiles).
export function StatTile({
  color,
  label,
  value,
  sub,
}: {
  color: string;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-white p-4 text-center shadow-card" style={{ borderTop: `4px solid ${color}` }}>
      <div className="text-[10px] font-extrabold uppercase tracking-widest" style={{ color }}>
        {label}
      </div>
      <div className="mt-1 text-3xl font-extrabold tracking-tight text-navy">{value}</div>
      {sub !== undefined ? <div className="mt-0.5 text-[11px] font-semibold text-muted2">{sub}</div> : null}
    </div>
  );
}

export type PillTone = "ok" | "hold" | "qc" | "bulk" | "rejected" | "transit" | "shift" | "neutral";

const PILL_TONE: Record<PillTone, string> = {
  ok: "bg-success-light text-success",
  hold: "bg-warning-light text-[#B45309]",
  qc: "bg-sky-light text-sky",
  bulk: "bg-accent-light text-accent",
  rejected: "bg-danger-light text-danger",
  transit: "bg-line text-slate",
  shift: "bg-[#CFFAFE] text-[#0E7490]",
  neutral: "bg-line text-muted",
};

export function Pill({ tone, children, className = "" }: { tone: PillTone; children: ReactNode; className?: string }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-0.5 text-[11px] font-extrabold " +
        PILL_TONE[tone] +
        " " +
        className
      }
    >
      {children}
    </span>
  );
}

// Maps a material/pallet status enum value to its reference pill colour.
export function statusTone(status: string): PillTone {
  switch (status) {
    case "OK":
    case "LOCKED":
    case "RELEASED":
    case "RECEIVED":
    case "DISPATCHED":
    case "CLOSED":
    case "RESOLVED":
    case "COMPLETED":
    case "REPACKED":
      return "ok";
    case "HOLD":
    case "PENDING_PACKING":
    case "PENDING_WAREHOUSE":
    case "IN_PROGRESS":
    case "HIGH":
    case "STAGING":
      return "hold";
    case "QC_HOLD":
    case "PICKED":
    case "LOADED":
    case "MEDIUM":
    case "ACKNOWLEDGED":
      return "qc";
    case "BULK":
      return "bulk";
    case "REJECTED":
    case "CANCELLED":
    case "CRITICAL":
      return "rejected";
    case "IN_TRANSIT":
      return "transit";
    default:
      return "neutral";
  }
}

export function Note({ children, tone = "gold" }: { children: ReactNode; tone?: "gold" | "danger" }) {
  const cls =
    tone === "danger"
      ? "border-danger/40 border-l-danger bg-danger-light/50 text-danger"
      : "border-[#FDE68A] border-l-gold bg-[#FFFBEB] text-[#78350F]";
  return (
    <div className={"rounded-r-lg border border-l-4 px-4 py-2.5 text-xs leading-relaxed " + cls}>{children}</div>
  );
}

export function StateBox({ tone = "muted", children }: { tone?: "muted" | "danger"; children: ReactNode }) {
  return tone === "danger" ? (
    <div className="rounded-xl border border-danger bg-danger-light p-6 text-sm text-danger shadow-card" role="alert">
      {children}
    </div>
  ) : (
    <div className="rounded-xl border border-line bg-white p-6 text-sm text-muted shadow-card">{children}</div>
  );
}

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block text-xs font-bold text-ink2">
      {label}
      <div className="mt-1.5">{children}</div>
      {hint ? <span className="mt-1 block text-[11px] font-medium text-muted2">{hint}</span> : null}
      {error ? <span className="mt-1 block text-xs font-semibold text-danger">{error}</span> : null}
    </label>
  );
}

export function inputClass(error?: string | boolean) {
  return (
    "min-h-[48px] w-full rounded-[11px] border-[1.5px] bg-white px-3.5 text-sm text-ink outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/15 disabled:bg-canvas " +
    (error ? "border-danger" : "border-[#D6DFE9]")
  );
}

export type BtnVariant = "primary" | "teal" | "outline" | "gold" | "danger";

const BTN_VARIANT: Record<BtnVariant, string> = {
  primary: "bg-gradient-to-br from-navy-3 to-navy text-white shadow-[0_6px_18px_-6px_rgba(11,31,58,.5)]",
  teal: "bg-gradient-to-br from-teal to-teal-2 text-white shadow-[0_6px_18px_-6px_rgba(13,148,136,.5)]",
  outline: "border-[1.5px] border-[#C9D5E3] bg-white text-navy-3",
  gold: "bg-gradient-to-br from-warning to-gold text-white shadow-[0_6px_16px_-6px_rgba(217,119,6,.5)]",
  danger: "bg-gradient-to-br from-[#EF4444] to-danger text-white",
};

export function btn(variant: BtnVariant = "primary", extra = "") {
  return (
    "inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[11px] px-4 text-sm font-bold transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60 " +
    BTN_VARIANT[variant] +
    " " +
    extra
  );
}

// Table styling matching the reference's th/td rules.
export const tableCls = "w-full border-collapse text-left text-[13px]";
export const theadRowCls = "";
export const thCls =
  "whitespace-nowrap border-b border-line bg-[#F8FAFC] px-3 py-2.5 text-[10px] font-extrabold uppercase tracking-wider text-muted";
export const tdCls = "border-b border-[#F1F5F9] px-3 py-2.5 align-middle";
export const trCls = "hover:bg-[#F8FAFC]";

export function TableWrap({ children, minWidth = 640 }: { children: ReactNode; minWidth?: number }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <div style={{ minWidth }}>{children}</div>
    </div>
  );
}

export function linkCls() {
  return "text-xs font-bold text-teal hover:underline";
}

// Sub-caption line used under bold primary cell values (.sm in the reference).
export function SubText({ children }: { children: ReactNode }) {
  return <div className="mt-0.5 text-[11px] text-muted2">{children}</div>;
}

// Section landing-page entry: a large tappable card linking to one screen, or a
// dashed "not built" placeholder when href is omitted.
export function SectionLink({
  href,
  icon,
  title,
  description,
  accent = "#0D9488",
}: {
  href?: string;
  icon: IconName;
  title: string;
  description: string;
  accent?: string;
}) {
  const body = (
    <>
      {href ? (
        <IconChip name={icon} from={`color-mix(in srgb, ${accent} 70%, white)`} to={accent} size={48} iconSize={22} />
      ) : (
        <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-line/70 text-muted2">
          <Icon name={icon} size={22} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className={"text-[14.5px] font-extrabold tracking-tight " + (href ? "text-navy" : "text-muted")}>{title}</div>
        <div className="mt-0.5 text-xs leading-relaxed text-muted">{description}</div>
      </div>
      {href ? (
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-canvas text-muted transition group-hover:bg-teal group-hover:text-white"
        >
          <Icon name="chevronRight" size={18} strokeWidth={2.4} />
        </span>
      ) : (
        <Pill tone="neutral">Coming soon</Pill>
      )}
    </>
  );
  return href ? (
    <Link
      href={href}
      className="group flex min-h-[80px] items-center gap-4 rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,.05),0_10px_24px_-14px_rgba(15,23,42,.25)] ring-1 ring-[#E6ECF3] transition duration-150 hover:-translate-y-0.5 hover:ring-teal/50 active:scale-[0.99]"
    >
      {body}
    </Link>
  ) : (
    <div className="flex min-h-[80px] items-center gap-4 rounded-2xl border border-dashed border-[#CBD5E1] bg-white/60 p-4">
      {body}
    </div>
  );
}

// Reference ".steps" progress strip. `current` is 1-based; earlier steps render as done.
export function Steps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex overflow-hidden rounded-xl border border-line shadow-card">
      {steps.map((label, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "on" : "todo";
        return (
          <li
            key={label}
            className={
              "flex flex-1 flex-col items-center justify-center gap-1 border-r sm:flex-row sm:gap-2 border-line px-2 py-3 text-center text-[11px] font-extrabold last:border-r-0 sm:text-xs " +
              (state === "on"
                ? "bg-gradient-to-br from-navy-3 to-navy text-white"
                : state === "done"
                  ? "bg-white text-teal"
                  : "bg-white text-muted2")
            }
          >
            <span
              className={
                "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11px] " +
                (state === "on" ? "bg-teal text-white" : state === "done" ? "bg-teal-light text-teal" : "bg-line text-muted")
              }
            >
              {state === "done" ? "✓" : n}
            </span>
            <span className="leading-tight">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

// Reference ".rf-*" row flag: inset left bar + light tint.
export function rowFlagCls(flag: "ok" | "warn" | "critical" | "violet" | null) {
  switch (flag) {
    case "ok":
      return "shadow-[inset_3px_0_0_#059669]";
    case "warn":
      return "bg-[#FFFBEB] shadow-[inset_3px_0_0_#F59E0B]";
    case "critical":
      return "bg-[#FEF2F2] shadow-[inset_3px_0_0_#DC2626]";
    case "violet":
      return "bg-[#F5F3FF] shadow-[inset_3px_0_0_#7C3AED]";
    default:
      return "";
  }
}

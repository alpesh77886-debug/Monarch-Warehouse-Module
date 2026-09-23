"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, SECTION_LABELS, isActiveNav } from "@/lib/nav-items";
import { Icon, IconChip } from "@/components/icons";
import { AccountControls } from "./AccountControls";

const SECTIONS = ["main", "operations", "support"] as const;

/**
 * Mobile-only sticky bottom tab bar (<768px): the 5 primary sections as
 * links plus a "More" button that opens a sheet with every section, so
 * Holds/Bulk/Transfers/Maintenance/Masters/Reports are reachable on a
 * phone too.
 */
export function BottomNav({ authEnabled = false }: { authEnabled?: boolean }) {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const primaryItems = NAV_ITEMS.filter((item) => item.primary);
  const secondaryActive = NAV_ITEMS.some((item) => !item.primary && isActiveNav(pathname, item.href));

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-[60] flex animate-fade-in items-end bg-navy/55 backdrop-blur-[3px] md:hidden"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="All sections"
            className="max-h-[88vh] w-full animate-sheet-up overflow-y-auto rounded-t-[28px] bg-[#F4F7FB] px-4 pt-2.5 shadow-elevated"
            style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[#CBD5E1]" aria-hidden />
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-[17px] font-extrabold tracking-tight text-navy">All sections</div>
                <div className="text-[11px] font-semibold text-muted2">IBF FG Warehouse &middot; Limbasi Plant</div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-ink2 shadow-card ring-1 ring-line transition active:scale-95"
                aria-label="Close menu"
              >
                <Icon name="close" size={18} strokeWidth={2.2} />
              </button>
            </div>

            {authEnabled ? (
              <div className="mb-5">
                <AccountControls variant="sheet" />
              </div>
            ) : null}

            {SECTIONS.map((section) => (
              <div key={section} className="mb-5 last:mb-0">
                <div className="mb-2.5 flex items-center gap-2 px-0.5">
                  <span className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-muted">
                    {SECTION_LABELS[section]}
                  </span>
                  <span className="h-px flex-1 bg-line" aria-hidden />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {NAV_ITEMS.filter((item) => item.section === section).map((item) => {
                    const active = isActiveNav(pathname, item.href);
                    return (
                      <Link
                        key={item.key}
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={
                          "group relative flex min-h-[104px] flex-col items-center justify-center gap-2.5 rounded-[18px] px-1.5 py-3.5 text-center transition duration-150 active:scale-[0.96] " +
                          (active
                            ? "bg-white shadow-[0_10px_24px_-12px_rgba(13,148,136,.55)] ring-2 ring-teal"
                            : "bg-white shadow-[0_1px_2px_rgba(15,23,42,.05),0_8px_20px_-12px_rgba(15,23,42,.22)] ring-1 ring-[#E6ECF3]")
                        }
                      >
                        <IconChip name={item.icon} from={item.tint[0]} to={item.tint[1]} size={46} iconSize={22} />
                        <span className="text-[12px] font-bold leading-tight text-ink">{item.label}</span>
                        {active ? (
                          <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-teal" aria-hidden />
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line/80 bg-white/95 px-1 shadow-[0_-8px_24px_-12px_rgba(15,23,42,.18)] backdrop-blur-md md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {primaryItems.map((item) => {
          const active = isActiveNav(pathname, item.href);
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="flex min-h-[60px] flex-1 flex-col items-center justify-center gap-1"
            >
              <TabIcon active={active} name={item.icon} />
              <span className={"text-[10.5px] font-bold " + (active ? "text-teal-2" : "text-muted")}>{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          className="flex min-h-[60px] flex-1 flex-col items-center justify-center gap-1"
        >
          <TabIcon active={open || secondaryActive} name="more" />
          <span className={"text-[10.5px] font-bold " + (open || secondaryActive ? "text-teal-2" : "text-muted")}>
            More
          </span>
        </button>
      </nav>
    </>
  );
}

function TabIcon({ active, name }: { active: boolean; name: Parameters<typeof Icon>[0]["name"] }) {
  return (
    <span
      className={
        "flex h-8 w-[52px] items-center justify-center rounded-full transition " +
        (active ? "bg-teal-light text-teal-2" : "text-[#7B8BA3]")
      }
    >
      <Icon name={name} size={21} strokeWidth={active ? 2.2 : 1.9} />
    </span>
  );
}

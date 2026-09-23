"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, SECTION_LABELS, isActiveNav } from "@/lib/nav-items";
import { AccountControls } from "./AccountControls";

const SECTIONS = ["main", "operations", "support"] as const;

/**
 * Mobile-only sticky bottom tab bar (<768px): the 5 primary sections as
 * links plus a "More" button that opens a sheet with every section, so
 * Holds/Bulk/Transfers/Maintenance/Masters/Reports are reachable on a
 * phone too (they previously existed only in the desktop sidebar).
 */
export function BottomNav({ authEnabled = false }: { authEnabled?: boolean }) {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const primaryItems = NAV_ITEMS.filter((item) => item.primary);
  const secondaryActive = NAV_ITEMS.some((item) => !item.primary && isActiveNav(pathname, item.href));

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end bg-ink/40 md:hidden" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-label="All sections"
            className="max-h-[80vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 pb-8 shadow-elevated"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-extrabold text-navy">All sections</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-[48px] min-w-[48px] text-xl text-muted"
                aria-label="Close menu"
              >
                &times;
              </button>
            </div>
            {authEnabled ? (
              <div className="mb-3 rounded-xl border border-line bg-canvas px-3 py-1">
                <AccountControls variant="sheet" />
              </div>
            ) : null}
            {SECTIONS.map((section) => (
              <div key={section} className="mb-3">
                <div className="mb-1.5 text-[10px] font-extrabold uppercase tracking-widest text-muted2">
                  {SECTION_LABELS[section]}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {NAV_ITEMS.filter((item) => item.section === section).map((item) => {
                    const active = isActiveNav(pathname, item.href);
                    return (
                      <Link
                        key={item.key}
                        href={item.href}
                        className={
                          "flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-xl border px-1 text-center text-[11px] font-bold " +
                          (active ? "border-teal bg-teal-light text-teal-2" : "border-line bg-canvas text-ink2")
                        }
                      >
                        <span aria-hidden className="text-xl leading-none">
                          {item.icon}
                        </span>
                        {item.label}
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
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {primaryItems.map((item) => {
          const active = isActiveNav(pathname, item.href);
          return (
            <Link
              key={item.key}
              href={item.href}
              className={
                "flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] font-semibold " +
                (active ? "text-teal" : "text-ink2")
              }
            >
              <span aria-hidden className="text-lg leading-none">
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          className={
            "flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] font-semibold " +
            (secondaryActive ? "text-teal" : "text-ink2")
          }
        >
          <span aria-hidden className="text-lg leading-none">
            ⋯
          </span>
          More
        </button>
      </nav>
    </>
  );
}

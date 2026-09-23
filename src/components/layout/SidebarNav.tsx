"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, SECTION_LABELS, isActiveNav } from "@/lib/nav-items";

const SECTIONS = ["main", "operations", "support"] as const;

/**
 * Desktop/tablet sidebar. Hidden below md; icon-only between md and lg;
 * full labels at lg+. Never rendered on phone widths - see BottomNav.
 */
export function SidebarNav() {
  const pathname = usePathname() ?? "";
  return (
    <aside className="hidden bg-gradient-to-b from-navy to-[#0A1F3F] text-[#8FA3C0] md:sticky md:top-0 md:flex md:h-screen md:w-16 md:shrink-0 md:flex-col lg:w-60">
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-gradient-to-br from-[#0EA5A4] to-teal text-sm font-extrabold text-white">
          IBF
        </div>
        <div className="hidden lg:block">
          <div className="text-sm font-extrabold text-white">FG Warehouse</div>
          <div className="text-[9px] font-bold uppercase tracking-[1.3px] text-[#5D7899]">Limbasi Plant</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {SECTIONS.map((section) => {
          const items = NAV_ITEMS.filter((item) => item.section === section);
          if (items.length === 0) return null;
          return (
            <div key={section} className="mb-1">
              <div className="hidden px-4 pb-1 pt-3 text-[9px] font-extrabold uppercase tracking-[1.2px] text-[#4D6484] lg:block">
                {SECTION_LABELS[section]}
              </div>
              {items.map((item) => {
                const active = isActiveNav(pathname, item.href);
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={
                      "relative mx-2 flex min-h-[44px] items-center justify-center gap-3 rounded-[10px] px-3 text-[13px] transition lg:justify-start " +
                      (active
                        ? "bg-gradient-to-r from-teal/25 to-teal/5 font-bold text-[#2DD4BF]"
                        : "hover:bg-white/5 hover:text-[#DBE7F5]")
                    }
                    title={item.label}
                    aria-current={active ? "page" : undefined}
                  >
                    {active ? <span className="absolute left-0 h-[22px] w-[3.5px] rounded-r bg-[#2DD4BF]" /> : null}
                    <span aria-hidden className="w-5 text-center text-[15px]">
                      {item.icon}
                    </span>
                    <span className="hidden lg:inline">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

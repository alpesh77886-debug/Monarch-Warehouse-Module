import Link from "next/link";
import { NAV_ITEMS, SECTION_LABELS } from "@/lib/nav-items";

const SECTIONS = ["main", "operations", "support"] as const;

/**
 * Desktop/tablet sidebar. Hidden below md; icon-only between md and lg;
 * full labels at lg+. Never rendered on phone widths - see BottomNav.
 */
export function SidebarNav() {
  return (
    <aside className="hidden md:flex md:w-16 lg:w-60 md:flex-col md:shrink-0 md:border-r md:border-line bg-navy text-slate-300">
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal font-bold text-white">
          IBF
        </div>
        <div className="hidden lg:block">
          <div className="text-sm font-bold text-white">FG Warehouse</div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400">Limbasi Plant</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {SECTIONS.map((section) => {
          const items = NAV_ITEMS.filter((item) => item.section === section);
          if (items.length === 0) return null;
          return (
            <div key={section} className="mb-1">
              <div className="hidden lg:block px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {SECTION_LABELS[section]}
              </div>
              {items.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className="mx-2 flex min-h-[48px] items-center justify-center gap-3 rounded-lg px-3 text-sm hover:bg-white/5 lg:justify-start"
                  title={item.label}
                >
                  <span aria-hidden className="text-base">•</span>
                  <span className="hidden lg:inline">{item.label}</span>
                </Link>
              ))}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

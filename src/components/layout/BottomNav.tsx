import Link from "next/link";
import { NAV_ITEMS } from "@/lib/nav-items";

/**
 * Mobile-only sticky bottom tab bar (phone widths, <768px). Shows the
 * 5 primary sections only - large touch targets (>=48px), no horizontal
 * scroll, thumb-reachable at the bottom of the screen per the mobile
 * acceptance requirements.
 */
export function BottomNav() {
  const primaryItems = NAV_ITEMS.filter((item) => item.primary);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {primaryItems.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-ink2"
        >
          <span aria-hidden className="text-lg leading-none">•</span>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

import type { ReactNode } from "react";
import { SidebarNav } from "./SidebarNav";
import { BottomNav } from "./BottomNav";
import { NotificationBell } from "./NotificationBell";

/**
 * Real responsive app shell (Loop 4). NOT the reference HTML's fixed
 * 1240px-wide layout scaled down with a CSS transform - this reflows
 * genuinely at every required phone/tablet/desktop width, per the
 * mobile acceptance requirements.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-canvas">
      <SidebarNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 pb-20 md:pb-0">{children}</main>
      </div>
      <BottomNav />
      {/* Loop 50 / PEN-038: on every page via the shared shell, not a
          per-page addition - see this component's own doc comment. */}
      <NotificationBell />
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { buildCrumbs, parentHref } from "@/lib/nav-items";
import { Icon } from "@/components/icons";

type PageHeaderProps = {
  title: string;
  actions?: ReactNode;
};

/**
 * Shared page header: Back button + clickable breadcrumb trail (both derived
 * from the current route), then the title with an optional actions slot.
 * The top row keeps its right edge clear for the fixed notification bell.
 */
export function PageHeader({ title, actions }: PageHeaderProps) {
  const pathname = usePathname() ?? "/dashboard";
  const crumbs = buildCrumbs(pathname);
  const back = parentHref(pathname);

  return (
    <header className="border-b border-line/80 bg-white/90 px-4 pb-4 pt-3 backdrop-blur-md sm:px-6 sm:pt-4 md:sticky md:top-0 md:z-30">
      <div className="flex min-h-[48px] items-center gap-2 pr-16 sm:pr-[72px]">
        {back ? (
          <Link
            href={back}
            aria-label="Back"
            className="flex h-12 shrink-0 items-center gap-1 rounded-full bg-white pl-2.5 pr-3.5 text-[13px] font-bold text-navy shadow-[0_1px_2px_rgba(15,23,42,.06),0_4px_12px_-6px_rgba(15,23,42,.2)] ring-1 ring-line transition hover:ring-teal/40 active:scale-95"
          >
            <Icon name="back" size={18} strokeWidth={2.4} />
            <span aria-hidden>Back</span>
          </Link>
        ) : null}
        <nav aria-label="Breadcrumb" className="min-w-0">
          <div className="flex min-w-0 items-center gap-1 text-[12px] font-semibold text-muted">
            {crumbs.map((crumb, i) => {
              const last = i === crumbs.length - 1;
              // On phones the current page is already the big title below, so
              // the trail stops at its parent there.
              const phoneHidden = last && crumbs.length > 1 ? "hidden sm:inline " : "";
              return (
                <Fragment key={crumb.href + i}>
                  {i > 0 ? (
                    <span aria-hidden className={phoneHidden + "shrink-0 text-[#B6C2D2]"}>
                      <Icon name="chevronRight" size={13} strokeWidth={2.4} />
                    </span>
                  ) : null}
                  <span className={phoneHidden + (last ? "min-w-0 truncate" : "shrink-0")}>
                    {last ? (
                      <span aria-current="page" className="text-ink2">
                        {crumb.label}
                      </span>
                    ) : (
                      <Link
                        href={crumb.href}
                        className="inline-flex h-12 min-w-[48px] items-center justify-center gap-1 rounded-lg px-1 transition hover:text-teal-2"
                      >
                        {i === 0 ? <Icon name="home" size={14} strokeWidth={2.2} /> : null}
                        <span className={i === 0 ? "sr-only sm:not-sr-only" : ""}>{crumb.label}</span>
                      </Link>
                    )}
                  </span>
                </Fragment>
              );
            })}
          </div>
        </nav>
      </div>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-navy sm:text-2xl">{title}</h1>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

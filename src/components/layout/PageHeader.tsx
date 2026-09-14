import type { ReactNode } from "react";

type PageHeaderProps = {
  breadcrumb: string;
  title: string;
  actions?: ReactNode;
};

/**
 * Shared page header: breadcrumb + title on the left, an optional
 * actions slot on the right. Stacks to two rows on phone widths so
 * action buttons never get clipped or force horizontal scroll.
 */
export function PageHeader({ breadcrumb, title, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-3 border-b border-line bg-white/90 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div>
        <div className="text-xs font-semibold text-muted2">{breadcrumb}</div>
        <h1 className="mt-0.5 text-lg font-extrabold tracking-tight text-navy sm:text-xl">
          {title}
        </h1>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

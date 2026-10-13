import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** The one empty state: icon, one-line title, one-line why, one action. `page` fills a room; otherwise a dashed sheet. */
export function EmptyState({ icon: Icon, title, body, action, page = false, alert = false }: {
  icon: LucideIcon;
  title: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
  /** the whole page is empty: title is the page's h1 */
  page?: boolean;
  /** something failed: announced assertively, icon in alert */
  alert?: boolean;
}) {
  const Heading = page ? "h1" : "h2";
  return (
    <div role={alert ? "alert" : "status"}
      className={cn("flex flex-col items-center text-center",
        page ? "mx-auto max-w-md px-4 py-24" : "mx-4 my-8 rounded-xl border border-dashed bg-card px-6 py-10 sm:mx-6")}>
      <Icon className={cn(page ? "size-10" : "size-8", alert ? "text-alert" : "text-muted-foreground")} aria-hidden />
      <Heading className={cn("mt-4", page ? "text-2xl" : "text-xl")}>{title}</Heading>
      {body && <p className="mt-2 max-w-sm text-sm text-muted-foreground">{body}</p>}
      {action && <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  );
}

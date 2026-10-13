import { cn } from "@/lib/utils";

/** The one section frame: a sheet with a Fraunces heading and an optional action on the right */
export function Section({ id, title, action, children, className, plain = false }: {
  id: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** no card: heading + content straight on the paper */
  plain?: boolean;
}) {
  return (
    <section aria-labelledby={id} className={cn(!plain && "rounded-xl border bg-card p-5", className)}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id={id} className="text-xl">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

import { TicketStatus } from "@prisma/client";
import { cn } from "@/lib/utils";

const STYLE: Record<TicketStatus, { label: string; cls: string }> = {
  OPEN: {
    label: "Baru",
    cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  },
  AWAITING_ADMIN: {
    label: "Menunggu Admin",
    cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  AWAITING_USER: {
    label: "Menunggu Anda",
    cls: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  },
  RESOLVED: {
    label: "Selesai",
    cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  CLOSED: {
    label: "Ditutup",
    cls: "bg-muted text-muted-foreground",
  },
};

export function TicketStatusBadge({
  status,
  className,
}: {
  status: TicketStatus;
  className?: string;
}) {
  const s = STYLE[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        s.cls,
        className,
      )}
    >
      {s.label}
    </span>
  );
}

const PRIORITY_STYLE: Record<string, string> = {
  LOW: "bg-muted text-muted-foreground",
  NORMAL: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  HIGH: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  URGENT: "bg-destructive/15 text-destructive",
};

export function TicketPriorityBadge({
  priority,
  className,
}: {
  priority: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        PRIORITY_STYLE[priority] ?? PRIORITY_STYLE.NORMAL,
        className,
      )}
    >
      {priority}
    </span>
  );
}

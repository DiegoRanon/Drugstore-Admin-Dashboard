import {
  Circle,
  CircleCheck,
  CircleSlash,
  Truck,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import type { OrderStatus } from "@/api/types";
import { STATUS_STYLE } from "@/lib/orders";
import { cn } from "@/lib/utils";

const STATUS_ICON: Record<OrderStatus, LucideIcon> = {
  in_pharmacy: Circle,
  picked_up: Truck,
  completed: CircleCheck,
  returned: Undo2,
  cancelled: CircleSlash,
};

/**
 * Status is always icon + word + colour. Never colour alone — a colour-blind
 * pharmacist has to read this board all day (PRD 7).
 */
export async function StatusChip({
  status,
  className,
}: {
  status: OrderStatus;
  className?: string;
}) {
  const t = await getTranslations();
  const Icon = STATUS_ICON[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold",
        STATUS_STYLE[status].chip,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {t(`status.${status}`)}
    </span>
  );
}

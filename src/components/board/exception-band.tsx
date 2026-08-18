import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Flag, Snowflake, TriangleAlert, Undo2, type LucideIcon } from "lucide-react";

import type { Order } from "@/api/types";
import { collectExceptions, type ExceptionKind } from "@/lib/orders";

const KIND_STYLE: Record<ExceptionKind, { icon: LucideIcon; className: string }> = {
  returned: {
    icon: Undo2,
    className: "border-status-returned/30 bg-status-returned-soft text-status-returned",
  },
  unpaidDelivered: {
    icon: Flag,
    className: "border-status-picked-up/30 bg-status-picked-up-soft text-status-picked-up",
  },
  coolerUnconfirmed: {
    icon: Snowflake,
    className: "border-cooler/30 bg-cooler-soft text-cooler",
  },
};

/**
 * Exceptions surface above everything else: a pharmacist should see what went
 * wrong before reading the day's detail (PRD 5.2).
 */
export async function ExceptionBand({ orders }: { orders: Order[] }) {
  const t = await getTranslations();
  const exceptions = collectExceptions(orders);

  if (exceptions.length === 0) return null;

  return (
    <section aria-label={t("exceptions.title")} className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 text-sm font-semibold">
        <TriangleAlert className="size-4 text-muted-foreground" aria-hidden />
        {t("exceptions.title")}
        <span className="text-muted-foreground">({exceptions.length})</span>
      </span>

      {exceptions.map(({ order, kind }) => {
        const { icon: Icon, className } = KIND_STYLE[kind];
        return (
          <Link
            key={`${order.id}-${kind}`}
            href={`/orders/${order.id}`}
            prefetch={false}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-medium hover:underline ${className}`}
          >
            <Icon className="size-3.5" aria-hidden />
            {t(`exceptions.${kind}`, { patient: order.patient_name })}
          </Link>
        );
      })}
    </section>
  );
}

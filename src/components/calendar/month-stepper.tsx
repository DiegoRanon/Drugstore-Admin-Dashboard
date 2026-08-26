"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import { formatMonth, shiftMonth } from "@/lib/format";

/**
 * Steps a month at a time as plain `YYYY-MM-DD` strings. No `Date` arithmetic
 * in local time: a Montreal pharmacy would see the grid jump a day.
 */
export function MonthStepper({ month, thisMonth }: { month: string; thisMonth: string }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();

  const go = (next: string) => {
    router.push(next === thisMonth ? "/calendar" : `/calendar?month=${next}`);
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        aria-label={t("calendar.previousMonth")}
        onClick={() => go(shiftMonth(month, -1))}
      >
        <ChevronLeft className="size-4" />
      </Button>

      <h1 className="min-w-[14ch] text-lg font-semibold first-letter:uppercase">
        {formatMonth(month, locale)}
      </h1>

      <Button
        variant="outline"
        size="icon"
        aria-label={t("calendar.nextMonth")}
        onClick={() => go(shiftMonth(month, 1))}
      >
        <ChevronRight className="size-4" />
      </Button>

      {month !== thisMonth && (
        <Button variant="outline" size="sm" onClick={() => go(thisMonth)}>
          {t("calendar.thisMonth")}
        </Button>
      )}
    </div>
  );
}

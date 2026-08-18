"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import { formatPlainDate, shiftDate } from "@/lib/format";

/**
 * Steps through calendar dates as plain `YYYY-MM-DD` strings. No `Date`
 * arithmetic in local time: a Montreal pharmacy would see the board jump a day.
 */
export function DateStepper({ date, today }: { date: string; today: string }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();

  const go = (next: string) => {
    router.push(next === today ? "/" : `/?date=${next}`);
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        aria-label={t("board.previousDay")}
        onClick={() => go(shiftDate(date, -1))}
      >
        <ChevronLeft className="size-4" />
      </Button>

      <h1 className="min-w-[16ch] text-lg font-semibold first-letter:uppercase">
        {formatPlainDate(date, locale)}
      </h1>

      <Button
        variant="outline"
        size="icon"
        aria-label={t("board.nextDay")}
        onClick={() => go(shiftDate(date, 1))}
      >
        <ChevronRight className="size-4" />
      </Button>

      {date !== today && (
        <Button variant="outline" size="sm" onClick={() => go(today)}>
          {t("board.today")}
        </Button>
      )}
    </div>
  );
}

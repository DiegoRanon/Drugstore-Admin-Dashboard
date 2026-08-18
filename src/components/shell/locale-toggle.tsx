"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";

import { setUserLocale } from "@/i18n/actions";
import { LOCALES, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

/**
 * FR/EN switch. French is the product's source language, so this is a toggle
 * between two complete UIs, not a fallback into English.
 */
export function LocaleToggle() {
  const active = useLocale() as Locale;
  const t = useTranslations();
  const [pending, startTransition] = useTransition();

  return (
    <div
      role="group"
      aria-label={t("nav.language")}
      className="flex items-center rounded-md border bg-background p-0.5"
    >
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          disabled={pending || locale === active}
          aria-pressed={locale === active}
          onClick={() => startTransition(() => setUserLocale(locale))}
          className={cn(
            "rounded px-2 py-1 text-xs font-semibold uppercase transition-colors",
            locale === active
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {locale}
        </button>
      ))}
    </div>
  );
}

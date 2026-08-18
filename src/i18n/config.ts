/**
 * Locale constants shared by both tiers.
 *
 * Kept separate from `locale.ts` on purpose: that module reads `cookies()` and
 * is `server-only`, so a Client Component importing a constant from it would
 * drag a server API into the browser bundle and fail the build.
 */

/**
 * French is the product's source language, not a translation of an English UI
 * (PRD 5.8). `en` exists so the toggle works; `fr` is what ships complete.
 */
export const LOCALES = ["fr", "en"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "fr";

/** Locale lives in a preference cookie — no `/fr` or `/en` URL prefix. */
export const LOCALE_COOKIE = "dsd_locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && LOCALES.includes(value as Locale);
}

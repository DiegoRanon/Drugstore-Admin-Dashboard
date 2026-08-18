import type { Locale } from "@/i18n/config";

const INTL_LOCALE: Record<Locale, string> = {
  fr: "fr-CA",
  en: "en-CA",
};

export function intlLocale(locale: Locale): string {
  return INTL_LOCALE[locale];
}

/**
 * `delivery_date` is a calendar date (`YYYY-MM-DD`), not a timestamp.
 *
 * Running it through `new Date("2026-08-17")` parses as UTC midnight and then
 * renders in the viewer's zone — which in Montreal is the previous evening, so
 * every delivery appears to shift a day. Everything below works on the plain
 * date parts and formats in UTC so the digits that come out are the digits that
 * went in.
 */
export type PlainDate = string;

const PLAIN_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function partsOf(date: PlainDate): [number, number, number] {
  const match = PLAIN_DATE.exec(date);
  if (!match) throw new Error(`Not a plain date: ${date}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function toUtc(date: PlainDate): Date {
  const [year, month, day] = partsOf(date);
  return new Date(Date.UTC(year, month - 1, day));
}

function fromUtc(value: Date): PlainDate {
  return value.toISOString().slice(0, 10);
}

/** Today in the pharmacy's own timezone, as a plain date. */
export function todayIn(timeZone: string): PlainDate {
  // `en-CA` yields `YYYY-MM-DD`, which is exactly the shape we want.
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

export function shiftDate(date: PlainDate, days: number): PlainDate {
  const value = toUtc(date);
  value.setUTCDate(value.getUTCDate() + days);
  return fromUtc(value);
}

export function formatPlainDate(
  date: PlainDate,
  locale: Locale,
  style: "full" | "long" | "medium" | "short" = "full",
): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: style,
    timeZone: "UTC",
  }).format(toUtc(date));
}

/** `"09:00"` → `"9 h"` (fr-CA) / `"9 a.m."` (en-CA). */
export function formatClockTime(time: string, locale: Locale): string {
  const [hours = "0", minutes = "0"] = time.split(":");
  const value = new Date(Date.UTC(2000, 0, 1, Number(hours), Number(minutes)));
  return new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "numeric",
    minute: Number(minutes) === 0 ? undefined : "2-digit",
    timeZone: "UTC",
  }).format(value);
}

/** Money is always CAD — the pharmacy and the patient are both in Canada. */
export function formatMoney(
  amount: number | null | undefined,
  locale: Locale,
  currency = "CAD",
): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency,
  }).format(amount ?? 0);
}

/** Timestamps are real instants and *do* get converted to the org's zone. */
export function formatTimestamp(
  isoTimestamp: string,
  locale: Locale,
  timeZone: string,
): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(isoTimestamp));
}

/** `"Marc Lavoie"` → `"Marc L."`; the board has no room for full surnames. */
export function shortName(first: string, last: string): string {
  const initial = last.trim().charAt(0);
  return initial ? `${first} ${initial}.` : first;
}

export function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

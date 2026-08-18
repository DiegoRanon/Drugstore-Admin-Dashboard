"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { isLocale, LOCALE_COOKIE, type Locale } from "./config";

/** Persist the user's language override. Falls back to the default if unknown. */
export async function setUserLocale(locale: Locale) {
  if (!isLocale(locale)) return;

  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    sameSite: "lax",
    httpOnly: false, // a display preference, not a credential
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
}

import { getRequestConfig } from "next-intl/server";

import en from "./messages/en.json";
import fr from "./messages/fr.json";
import type { Locale } from "./config";
import { getUserLocale } from "./locale";

/**
 * Catalogues are imported **statically**, not through
 * `await import(\`./messages/${locale}.json\`)`.
 *
 * A dynamic import with a template literal becomes a context module that the
 * dev server does not reliably invalidate when one of the JSON files changes:
 * adding a key leaves the running server serving the old catalogue, and the new
 * key renders as its own name (`nav.searchPatients`) until someone restarts.
 * Static imports are tracked in the module graph and hot-reload correctly.
 *
 * Both files are small and server-side, so bundling the pair costs nothing.
 */
const MESSAGES: Record<Locale, typeof fr> = { fr, en };

export default getRequestConfig(async () => {
  const locale = await getUserLocale();

  return {
    locale,
    messages: MESSAGES[locale],
    // Quebec formatting: `fr-CA` dates and numbers, `en-CA` for English.
    formats: {
      dateTime: {
        long: { dateStyle: "full" },
        time: { hour: "2-digit", minute: "2-digit" },
      },
    },
  };
});

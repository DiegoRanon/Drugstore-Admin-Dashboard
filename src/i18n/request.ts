import { getRequestConfig } from "next-intl/server";

import { getUserLocale } from "./locale";

export default getRequestConfig(async () => {
  const locale = await getUserLocale();

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
    // Quebec formatting: `fr-CA` dates and numbers, `en-CA` for English.
    formats: {
      dateTime: {
        long: { dateStyle: "full" },
        time: { hour: "2-digit", minute: "2-digit" },
      },
    },
  };
});

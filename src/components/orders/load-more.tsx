"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Advances the accumulated page count in the URL.
 *
 * Not next/prev, and deliberately not "Page 3 of 12": the API is keyset
 * paginated with no total count, so page numbers would be a lie (PRD 6.3).
 * `scroll: false` keeps the reader where they were as rows append below.
 */
export function LoadMore({ pages }: { pages: number }) {
  const t = useTranslations();
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function loadMore() {
    const next = new URLSearchParams(params.toString());
    next.set("pages", String(pages + 1));
    startTransition(() => router.push(`/orders?${next.toString()}`, { scroll: false }));
  }

  return (
    <Button variant="outline" onClick={loadMore} disabled={pending} className="gap-2">
      {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {t("common.loadMore")}
    </Button>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";

/**
 * Takes the operator to the patient directory with their term applied.
 *
 * Scoped to patients on purpose. The API has no cross-resource search endpoint,
 * and a box that appears to search everything while only matching one thing is
 * worse than one that says what it does — hence the placeholder naming the
 * scope.
 */
export function GlobalSearch() {
  const t = useTranslations();
  const router = useRouter();
  const [query, setQuery] = useState("");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = query.trim();
    router.push(term ? `/clients?q=${encodeURIComponent(term)}` : "/clients");
  }

  return (
    <form onSubmit={submit} role="search" className="relative max-w-sm flex-1">
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        name="q"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("nav.searchPatients")}
        aria-label={t("nav.searchPatients")}
        className="bg-background pl-9"
      />
    </form>
  );
}

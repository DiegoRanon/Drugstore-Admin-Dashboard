import { getTranslations } from "next-intl/server";
import { LogOut, Search } from "lucide-react";

import { LocaleToggle } from "@/components/shell/locale-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initials } from "@/lib/format";

export async function TopBar({
  firstName,
  lastName,
}: {
  firstName: string;
  lastName: string;
}) {
  const t = await getTranslations();

  return (
    <header className="no-print flex h-14 shrink-0 items-center gap-3 border-b bg-card px-6">
      <div className="relative max-w-sm flex-1">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          placeholder={t("nav.search")}
          aria-label={t("nav.search")}
          className="bg-background pl-9"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <LocaleToggle />
        <Button variant="ghost" size="sm" className="gap-2">
          <Avatar className="size-6">
            <AvatarFallback className="bg-accent text-[11px] text-accent-foreground">
              {initials(firstName, lastName)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden sm:inline">
            {firstName} {lastName}
          </span>
        </Button>
        <Button variant="ghost" size="icon" aria-label={t("nav.signOut")}>
          <LogOut className="size-4" />
        </Button>
      </div>
    </header>
  );
}

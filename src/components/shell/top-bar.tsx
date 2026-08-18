import { GlobalSearch } from "@/components/shell/global-search";
import { LocaleToggle } from "@/components/shell/locale-toggle";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { initials } from "@/lib/format";

export function TopBar({
  firstName,
  lastName,
}: {
  firstName: string;
  lastName: string;
}) {
  return (
    <header className="no-print flex h-14 shrink-0 items-center gap-3 border-b bg-card px-6">
      <GlobalSearch />

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
        <SignOutButton />
      </div>
    </header>
  );
}

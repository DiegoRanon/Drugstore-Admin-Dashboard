import { AppFooter } from "@/components/shell/app-footer";
import { IdleTimer } from "@/components/shell/idle-timer";
import { Sidebar } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { requireSession } from "@/lib/dal/session";

/**
 * Every route under this layout renders patient information, so none of it may
 * be prerendered or cached (PRD 8.2). Reading the session cookie forces this
 * anyway; declaring it keeps that true through refactors.
 */
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  // Authoritative check. Proxy already redirected an anonymous visitor, but a
  // layout must not assume proxy ran.
  const session = await requireSession();

  return (
    <div className="flex min-h-screen">
      <Sidebar orgName={session.organization.name} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          firstName={session.user.first_name}
          lastName={session.user.last_name}
        />
        <main className="flex-1 px-6 py-5">{children}</main>
        <AppFooter orgName={session.organization.name} />
      </div>
      <IdleTimer />
    </div>
  );
}

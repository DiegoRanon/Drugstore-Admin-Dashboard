import { AppFooter } from "@/components/shell/app-footer";
import { Sidebar } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { ADMIN, ORG } from "@/fixtures";

/**
 * Every route under this layout renders patient information, so none of it may
 * be prerendered or cached (PRD 8.2). Reading the session cookie will force
 * this anyway in Phase 2; declaring it keeps that true through refactors.
 */
export const dynamic = "force-dynamic";

export default function DashboardLayout({ children }: LayoutProps<"/">) {
  // Phase 2 replaces these fixtures with the sealed session cookie.
  return (
    <div className="flex min-h-screen">
      <Sidebar orgName={ORG.name} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar firstName={ADMIN.first_name} lastName={ADMIN.last_name} />
        <main className="flex-1 px-6 py-5">{children}</main>
        <AppFooter orgName={ORG.name} />
      </div>
    </div>
  );
}

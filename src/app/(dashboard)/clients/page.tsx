import { ClientsWorkspace } from "@/components/clients/clients-workspace";
import { CLIENTS } from "@/fixtures";

export default function ClientsPage() {
  // Phase 6 replaces this with `GET /v1/clients` through the DAL.
  return <ClientsWorkspace clients={CLIENTS} />;
}

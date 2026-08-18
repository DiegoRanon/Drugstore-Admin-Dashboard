/**
 * Phase 0 fixtures — static stand-ins so the screens can be designed and
 * reviewed before the session and API layers exist.
 *
 * Everything here is invented. No real patient data belongs in this file, and
 * the whole module disappears once the Data Access Layer is wired up.
 */
import type {
  Client,
  Driver,
  InviteCode,
  Order,
  OrderDetail,
  Organization,
  SessionUser,
} from "@/api/types";
import { todayIn } from "@/lib/format";

export const ORG: Organization = {
  id: "0a7f0e8c-2a11-4f0e-9c2a-111111111111",
  name: "Pharmacie Saint-Denis",
  phone: "514-555-0100",
  timezone: "America/Toronto",
  locale: "fr",
};

/** AM/PM clock bounds live on the organization, not on the enum. */
export const ORG_WINDOWS = {
  am_window_start: "09:00",
  am_window_end: "12:00",
  pm_window_start: "13:00",
  pm_window_end: "17:00",
};

export const ADMIN: SessionUser = {
  id: "0a7f0e8c-2a11-4f0e-9c2a-222222222222",
  email: "admin@pharmacie-saint-denis.test",
  role: "admin",
  first_name: "Sophie",
  last_name: "Delorme",
  organization_id: ORG.id,
};

export const TODAY = todayIn(ORG.timezone);

const stamp = (time: string) => `${TODAY}T${time}:00.000Z`;

export const DRIVERS: Driver[] = [
  {
    id: "d1000000-0000-4000-8000-000000000001",
    first_name: "Marc",
    last_name: "Lavoie",
    email: "marc.lavoie@example.test",
    phone: "514-555-0141",
    is_active: true,
    created_at: stamp("12:00"),
    updated_at: stamp("12:00"),
  },
  {
    id: "d1000000-0000-4000-8000-000000000002",
    first_name: "Luc",
    last_name: "Painchaud",
    email: "luc.painchaud@example.test",
    phone: "514-555-0177",
    is_active: true,
    created_at: stamp("12:00"),
    updated_at: stamp("12:00"),
  },
  {
    id: "d1000000-0000-4000-8000-000000000003",
    first_name: "Nadia",
    last_name: "Fortin",
    email: "nadia.fortin@example.test",
    phone: null,
    is_active: false,
    created_at: stamp("12:00"),
    updated_at: stamp("12:00"),
  },
];

export const CLIENTS: Client[] = [
  {
    id: "c1000000-0000-4000-8000-000000000001",
    name: "Jean Tremblay",
    address: "4412 rue Saint-Denis, Montréal, QC H2J 2L1",
    phone_number: "514-555-0199",
    notes: "Sonner au 2 — code d'entrée 4412.",
    is_active: true,
    created_at: stamp("08:00"),
    updated_at: stamp("08:00"),
    compliance_reminder:
      "Consignes de livraison seulement. Ne pas inscrire de renseignements médicaux.",
  },
  {
    id: "c1000000-0000-4000-8000-000000000002",
    name: "Marie Gagnon",
    address: "88 av. du Parc, Montréal, QC H2W 1X4",
    phone_number: "514-555-0122",
    notes: null,
    is_active: true,
    created_at: stamp("08:00"),
    updated_at: stamp("08:00"),
  },
  {
    id: "c1000000-0000-4000-8000-000000000003",
    name: "Lucie Boucher",
    address: "1200 boul. René-Lévesque, Montréal, QC H3B 4W8",
    phone_number: "514-555-9833",
    notes: "Laisser au concierge si absente.",
    is_active: true,
    created_at: stamp("08:00"),
    updated_at: stamp("08:00"),
  },
  {
    id: "c1000000-0000-4000-8000-000000000004",
    name: "Marc-André Bouchard",
    address: "1255 rue Peel, app. 4B, Montréal, QC H3B 2T9",
    phone_number: "514-555-0164",
    notes: null,
    is_active: true,
    created_at: stamp("08:00"),
    updated_at: stamp("08:00"),
  },
];

type OrderSeed = Partial<Order> & Pick<Order, "id" | "client_id">;

function order(seed: OrderSeed): Order {
  const client = CLIENTS.find((c) => c.id === seed.client_id);

  return {
    driver_id: null,
    patient_name: client?.name ?? "—",
    address: client?.address ?? "—",
    phone_number: client?.phone_number ?? "—",
    delivery_date: TODAY,
    delivery_window: "AM",
    status: "in_pharmacy",
    sequence_number: null,
    payment_status: "unpaid",
    payment_collected: false,
    payment_method: null,
    amount_due: null,
    amount_collected: null,
    requires_cooler_bag: false,
    cooler_bag_confirmed: null,
    picked_up_at: null,
    completed_at: null,
    returned_at: null,
    cancelled_at: null,
    created_at: stamp("08:30"),
    updated_at: stamp("08:30"),
    ...seed,
  };
}

export const ORDERS: Order[] = [
  order({
    id: "0a000000-0000-4000-8000-000000008821",
    client_id: CLIENTS[0]!.id,
    delivery_window: "AM",
    status: "in_pharmacy",
    payment_status: "unpaid",
    amount_due: 24.5,
    requires_cooler_bag: true,
    created_at: stamp("08:30"),
    updated_at: stamp("09:15"),
  }),
  order({
    id: "0a000000-0000-4000-8000-000000008822",
    client_id: CLIENTS[3]!.id,
    driver_id: DRIVERS[1]!.id,
    delivery_window: "AM",
    status: "picked_up",
    sequence_number: 1,
    payment_status: "paid",
    picked_up_at: stamp("09:40"),
    updated_at: stamp("09:40"),
  }),
  order({
    id: "0a000000-0000-4000-8000-000000008823",
    client_id: CLIENTS[2]!.id,
    driver_id: DRIVERS[0]!.id,
    delivery_window: "AM",
    status: "returned",
    sequence_number: 2,
    payment_status: "unpaid",
    amount_due: 18,
    picked_up_at: stamp("09:40"),
    returned_at: stamp("11:05"),
    updated_at: stamp("11:05"),
  }),
  order({
    id: "0a000000-0000-4000-8000-000000008824",
    client_id: CLIENTS[1]!.id,
    driver_id: DRIVERS[0]!.id,
    delivery_window: "PM",
    status: "completed",
    sequence_number: 1,
    payment_status: "paid",
    payment_collected: true,
    payment_method: "cash",
    amount_due: 32,
    amount_collected: 32,
    picked_up_at: stamp("13:10"),
    completed_at: stamp("13:55"),
    updated_at: stamp("13:55"),
  }),
  order({
    id: "0a000000-0000-4000-8000-000000008825",
    client_id: CLIENTS[0]!.id,
    driver_id: DRIVERS[1]!.id,
    delivery_window: "PM",
    status: "completed",
    sequence_number: 2,
    payment_status: "unpaid",
    amount_due: 40,
    requires_cooler_bag: true,
    cooler_bag_confirmed: null,
    picked_up_at: stamp("13:10"),
    completed_at: stamp("14:20"),
    updated_at: stamp("14:20"),
  }),
  order({
    id: "0a000000-0000-4000-8000-000000008826",
    client_id: CLIENTS[2]!.id,
    delivery_window: "PM",
    status: "in_pharmacy",
    payment_status: "unpaid",
    amount_due: 12.75,
  }),
];

export const ORDER_DETAIL: OrderDetail = {
  ...ORDERS[0]!,
  status_events: [
    {
      status: "in_pharmacy",
      changed_by_user_id: ADMIN.id,
      occurred_at: stamp("08:30"),
    },
  ],
  available_transitions: ["pickup", "cancel"],
};

export const INVITES: InviteCode[] = [
  {
    id: "e1000000-0000-4000-8000-000000000001",
    code: "K7RH4WQZ",
    is_active: true,
    expires_at: null,
    redeemed_at: null,
    created_at: stamp("08:00"),
  },
  {
    id: "e1000000-0000-4000-8000-000000000002",
    code: "M3XT9BFD",
    is_active: false,
    expires_at: null,
    redeemed_at: stamp("08:00"),
    created_at: stamp("08:00"),
  },
];

export function driverById(id: string | null): Driver | undefined {
  if (!id) return undefined;
  return DRIVERS.find((driver) => driver.id === id);
}

export function ordersForDate(date: string): Order[] {
  return ORDERS.filter((o) => o.delivery_date === date);
}

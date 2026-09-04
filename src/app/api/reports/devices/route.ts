import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { toCsv, csvResponse } from "@/lib/csv";
import { formatDate, humanizeLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Full device inventory across every client, from the last NinjaOne sync
 * of each — not a live re-fetch, so it's only as current as each client's
 * last "Sync NinjaOne" click. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Not signed in.", { status: 401 });
  if (!(await hasPermission(supabase, "view_team_wide"))) {
    return new Response("You don't have permission to do that.", { status: 403 });
  }

  const { data: devices } = await supabase
    .from("ninjaone_devices")
    .select(
      "system_name, node_class, is_offline, last_contact, device_created_at, manufacturer_fulfillment_date, os_name, os_version, manufacturer, model, clients(name)"
    )
    .order("system_name");

  type Row = {
    system_name: string;
    node_class: string | null;
    is_offline: boolean | null;
    last_contact: string | null;
    device_created_at: string | null;
    manufacturer_fulfillment_date: string | null;
    os_name: string | null;
    os_version: string | null;
    manufacturer: string | null;
    model: string | null;
    clients: { name: string } | null;
  };

  const csv = toCsv(
    [
      "Client",
      "Device",
      "Type",
      "Status",
      "OS",
      "OS version",
      "Manufacturer",
      "Model",
      "Manufactured / shipped",
      "First registered",
      "Last contact",
    ],
    ((devices ?? []) as unknown as Row[]).map((d) => [
      d.clients?.name ?? "Unmapped",
      d.system_name,
      d.node_class ? humanizeLabel(d.node_class.toLowerCase()) : null,
      d.is_offline == null ? null : d.is_offline ? "Offline" : "Online",
      d.os_name,
      d.os_version,
      d.manufacturer,
      d.model,
      d.manufacturer_fulfillment_date ? formatDate(d.manufacturer_fulfillment_date) : null,
      d.device_created_at ? formatDate(d.device_created_at) : null,
      d.last_contact ? formatDate(d.last_contact) : null,
    ])
  );

  return csvResponse("device-inventory.csv", csv);
}

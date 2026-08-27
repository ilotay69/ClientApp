import { ClientForm } from "@/components/client-form";
import { createClientRecord } from "../actions";

export default function NewClientPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">New client</h1>
      <ClientForm action={createClientRecord} submitLabel="Create client" />
    </div>
  );
}

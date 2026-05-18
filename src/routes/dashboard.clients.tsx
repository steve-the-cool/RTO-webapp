import { createFileRoute } from "@tanstack/react-router";
import { RecordTable } from "@/components/RecordTable";

export const Route = createFileRoute("/dashboard/clients")({
  component: () => (
    <RecordTable bucket="clients" title="Clients" description="Active client applications and renewals." />
  ),
});

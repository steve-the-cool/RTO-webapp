import { createFileRoute } from "@tanstack/react-router";
import { V2ClientList } from "@/components/V2ClientList";

export const Route = createFileRoute("/dashboard/clients")({
  component: () => (
    <V2ClientList
      type="client"
      title="Clients"
      description="Active client profiles, vehicle assets, and service pipelines."
    />
  ),
});

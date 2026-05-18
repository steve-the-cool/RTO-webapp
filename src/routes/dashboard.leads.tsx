import { createFileRoute } from "@tanstack/react-router";
import { RecordTable } from "@/components/RecordTable";

export const Route = createFileRoute("/dashboard/leads")({
  component: () => (
    <RecordTable bucket="leads" title="Leads" description="Incoming inquiries and prospects to follow up." />
  ),
});

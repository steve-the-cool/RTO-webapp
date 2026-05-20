import { createFileRoute } from "@tanstack/react-router";
import { RecordTable } from "@/components/RecordTable";

export const Route = createFileRoute("/dashboard/customers")({
  component: () => (
    <RecordTable bucket="customers" title="Customers" description="Full customer database." />
  ),
});

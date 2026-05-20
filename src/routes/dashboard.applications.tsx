import { createFileRoute } from "@tanstack/react-router";
import { RecordTable } from "@/components/RecordTable";

export const Route = createFileRoute("/dashboard/applications")({
  component: () => (
    <RecordTable bucket="applications" title="Applications" description="All RTO applications in progress." />
  ),
});

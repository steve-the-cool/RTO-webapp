import { createFileRoute } from "@tanstack/react-router";
import { ServiceDashboard } from "@/components/ServiceDashboard";
import { SERVICE_ROUTE_MAP, type ServiceType } from "@/lib/records";

export const Route = createFileRoute("/dashboard/service/$serviceType")({
  component: ServiceTypePage,
});

function ServiceTypePage() {
  const { serviceType } = Route.useParams();

  // Debug logging
  console.log("[ServiceTypePage] Route params received:", { rawParam: serviceType });

  // Map URL parameter to proper ServiceType using SERVICE_ROUTE_MAP
  // The route param will be lowercase (e.g., "insurance") or dash-separated (e.g., "gujarat-permit")
  const normalizedParam = serviceType.toLowerCase();
  const mappedService = SERVICE_ROUTE_MAP[normalizedParam];

  console.log("[ServiceTypePage] Service type mapping:", {
    rawParam: serviceType,
    normalizedParam,
    mappedService,
    allValidServices: Object.keys(SERVICE_ROUTE_MAP),
  });

  if (!mappedService) {
    console.error("[ServiceTypePage] Invalid service type:", {
      received: serviceType,
      normalized: normalizedParam,
      validOptions: Object.keys(SERVICE_ROUTE_MAP),
    });

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Invalid Service Type</h2>
          <p className="text-sm text-muted-foreground">
            The service type "{serviceType}" is not recognized.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Valid services: Insurance, Fitness, Permit, Gujarat Permit, National Permit, Tax, PUC,
            License New, License Renew, RC Transfer, HP Addition, HP Termination
          </p>
          <p className="text-xs text-muted-foreground mt-4">
            Valid URL parameters: {Object.keys(SERVICE_ROUTE_MAP).join(", ")}
          </p>
        </div>
      </div>
    );
  }

  console.log("[ServiceTypePage] Rendering ServiceDashboard:", {
    mappedServiceType: mappedService,
  });

  return <ServiceDashboard serviceType={mappedService} />;
}

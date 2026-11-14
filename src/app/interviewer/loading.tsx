import { AppShell } from "@frontend/components/AppShell";
import { MetricStripSkeleton, SectionSkeleton } from "@frontend/components/SurfaceStates";

export default function InterviewerRouteLoading() {
  return (
    <AppShell allowedRoles={["INTERVIEWER"]} sectionLabel="Interviewer Portal">
      <div className="space-y-6">
        <MetricStripSkeleton count={4} />
        <SectionSkeleton rows={5} />
      </div>
    </AppShell>
  );
}

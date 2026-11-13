import { Suspense } from "react";
import { SectionSkeleton } from "@frontend/components/SurfaceStates";
import { OperationsInterviewsView } from "@frontend/features/operations/OperationsInterviewsView";

export default function OperationsInterviewsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl p-8">
          <SectionSkeleton rows={6} />
        </div>
      }
    >
      <OperationsInterviewsView />
    </Suspense>
  );
}

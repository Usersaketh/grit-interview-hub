import { Suspense } from "react";
import { StudentBookingView } from "@frontend/features/student/StudentBookingView";

export default function StudentBookInterviewPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-[var(--text-secondary)]">
          Loading booking workspace...
        </div>
      }
    >
      <StudentBookingView />
    </Suspense>
  );
}

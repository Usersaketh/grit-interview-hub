import { Suspense } from "react";
import { AcceptInvitationView } from "@frontend/features/auth/AcceptInvitationView";

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={null}>
      <AcceptInvitationView />
    </Suspense>
  );
}

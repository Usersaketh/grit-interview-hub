import { OperationsCertificationDetailView } from "@frontend/features/operations/OperationsCertificationDetailView";

export default async function OperationsCertificationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OperationsCertificationDetailView awardId={id} />;
}

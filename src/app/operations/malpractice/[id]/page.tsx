import { OperationsMalpracticeDetailView } from "@frontend/features/operations/OperationsMalpracticeDetailView";

export default async function OperationsMalpracticeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OperationsMalpracticeDetailView reportId={id} />;
}

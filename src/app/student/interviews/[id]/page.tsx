import { StudentInterviewDetailView } from "@frontend/features/student/StudentInterviewDetailView";

export default async function StudentInterviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StudentInterviewDetailView interviewId={id} />;
}

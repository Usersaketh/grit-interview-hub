import { InterviewerEvaluationView } from "@frontend/features/interviewer/InterviewerEvaluationView";

export default async function InterviewerEvaluationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <InterviewerEvaluationView interviewId={id} />;
}

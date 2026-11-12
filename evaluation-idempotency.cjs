const { createServerClient } = require("@supabase/ssr");
const readline = require("node:readline/promises");

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const email = await rl.question("Interviewer email: ");
  const password = await rl.question("Interviewer password: ");
  rl.close();

  const cookieStore = new Map();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () =>
          [...cookieStore.entries()].map(([name, value]) => ({ name, value })),
        setAll: cookies =>
          cookies.forEach(({ name, value }) => cookieStore.set(name, value))
      }
    }
  );

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;

  const cookieHeader = [...cookieStore.entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");

  const interviewId = "98916766-5e34-4bfd-8b7a-bb5578279b52";
  const endpoint = `http://localhost:3000/api/v1/interviewer/interviews/${interviewId}/result`;
  const key = "6a2cc960-f150-4699-b8fb-2f66cb3279ca";

  async function submit(label, payload) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader
      },
      body: JSON.stringify(payload)
    });

    const body = await response.json();

    console.log(`\n===== ${label} =====`);
    console.log("HTTP:", response.status);
    console.log(JSON.stringify(body, null, 2));
  }

  // 1. Exact same payload and key: should replay original result.
  await submit("EXACT REPLAY", {
    outcome: "PASS",
    feedback: "Evaluation RPC smoke test",
    idempotencyKey: key
  });

  // 2. Same key, different payload: should be rejected.
  await submit("REUSED KEY WITH DIFFERENT PAYLOAD", {
    outcome: "PASS",
    feedback: "Modified feedback - should be rejected",
    idempotencyKey: key
  });

  // 3. Different key for an already evaluated interview: should conflict.
  await submit("NEW KEY FOR ALREADY EVALUATED INTERVIEW", {
    outcome: "PASS",
    feedback: "Second evaluation attempt",
    idempotencyKey: crypto.randomUUID()
  });
}

main().catch(error => {
  console.error("ERROR:", error.message);
  process.exitCode = 1;
});

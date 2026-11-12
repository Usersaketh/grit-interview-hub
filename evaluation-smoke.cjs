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
        getAll() {
          return [...cookieStore.entries()].map(([name, value]) => ({
            name,
            value
          }));
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            cookieStore.set(name, value);
          }
        }
      }
    }
  );

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) throw error;

  const cookieHeader = [...cookieStore.entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");

  const interviewId = "98916766-5e34-4bfd-8b7a-bb5578279b52";

  const payload = {
    outcome: "PASS",
    feedback: "Evaluation RPC smoke test",
    idempotencyKey: crypto.randomUUID()
  };

  const response = await fetch(
    `http://localhost:3000/api/v1/interviewer/interviews/${interviewId}/result`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cookie": cookieHeader
      },
      body: JSON.stringify(payload)
    }
  );

  console.log("HTTP:", response.status);
  console.log(JSON.stringify(await response.json(), null, 2));

  if (response.ok) {
    console.log("\nIDEMPOTENCY KEY:", payload.idempotencyKey);
  }
}

main().catch(error => {
  console.error("ERROR:", error.message);
  process.exitCode = 1;
});

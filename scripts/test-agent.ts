import { accountFromPrivateKey, createX402Fetch } from "@lucid-agents/payments";

const baseUrl = (() => {
  const raw = process.env.AGENT_URL ?? "http://localhost:8787";
  try {
    const url = new URL(raw);
    // 0.0.0.0 is only a bind address; use localhost for requests.
    if (url.hostname === "0.0.0.0") url.hostname = "localhost";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "http://localhost:8787";
  }
})();
const topic = process.env.TEST_TOPIC ?? "Test topic from script";
const manifestUrl = `${baseUrl}/.well-known/agent.json`;
const brainstormUrl = `${baseUrl}/entrypoints/brainstorm/invoke`;
const paymentKey =
  process.env.CLIENT_PRIVATE_KEY ?? process.env.PRIVATE_KEY ?? "";

if (!paymentKey.trim()) {
  console.error(
    "Set CLIENT_PRIVATE_KEY (or PRIVATE_KEY) to fund the paid brainstorm call."
  );
  process.exit(1);
}

const fetchWithPayment = createX402Fetch({
  account: accountFromPrivateKey(paymentKey as `0x${string}`),
});

async function waitForServer(): Promise<boolean> {
  for (let i = 0; i < 30; i += 1) {
    try {
      const res = await fetch(manifestUrl);
      if (res.ok) return true;
    } catch {
      // ignore and retry
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function readJson(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function main() {
  let server: ReturnType<typeof Bun.spawn> | undefined;

  const alreadyRunning = await waitForServer();
  if (!alreadyRunning) {
    console.log("Starting agent server...");
    server = Bun.spawn(["bun", "run", "start"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const ready = await waitForServer();
    if (!ready) {
      server.kill();
      throw new Error("Server did not become ready at /.well-known/agent.json");
    }
  }

  console.log("Fetching manifest for pricing...");
  const manifestRes = await fetch(manifestUrl);
  const manifest = await readJson(manifestRes);
  const price =
    manifest?.entrypoints?.brainstorm?.pricing?.invoke ??
    manifest?.entrypoints?.brainstorm?.pricing?.stream;
  console.log("Brainstorm price (manifest):", price ?? "unknown");

  console.log("Calling brainstorm (paid) entrypoint...");
  await fetchWithPayment.preconnect?.();
  const brainstormRes = await fetchWithPayment(brainstormUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: { topic } }),
  });
  console.log("Brainstorm status:", brainstormRes.status);
  console.log("Brainstorm body:", await readJson(brainstormRes));

  if (server) {
    server.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

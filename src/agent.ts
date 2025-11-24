import { z } from "zod";
import { Network, createAgent, createAxLLMClient } from "@lucid-agents/core";
import { http } from "@lucid-agents/http";
import { payments, paymentsFromEnv } from "@lucid-agents/payments";
import { createAgentApp } from "@lucid-agents/hono";
import { flow } from "@ax-llm/ax";

const PER_CALL_PRICE = "0.03";

const DEFAULT_FACILITATOR_URL = "https://facilitator.daydreams.systems";
const DEFAULT_PAY_TO = "0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429";
const DEFAULT_NETWORK = "base";

const sanitizedOpenAiKey = (() => {
  const value = (process.env.OPENAI_API_KEY ?? "").trim();
  return value && value !== "THIS-WILL-NOT-BE-USED" ? value : undefined;
})();

const payToAddress =
  (process.env.PAYMENTS_RECEIVABLE_ADDRESS as `0x${string}` | undefined) ??
  (process.env.PAY_TO as `0x${string}` | undefined) ??
  DEFAULT_PAY_TO;

const paymentsConfig = paymentsFromEnv({
  facilitatorUrl: (process.env.FACILITATOR_URL ??
    DEFAULT_FACILITATOR_URL) as `${string}://${string}`,
  payTo: payToAddress,
  network:
    (process.env.NETWORK as Network | undefined) ??
    (DEFAULT_NETWORK as Network),
});

const configOverrides = {
  payments: paymentsConfig,
};

const runtime = await createAgent({
  name: "ax-flow-agent",
  version: "0.0.1",
  description:
    "Demonstrates driving an AxFlow pipeline through createAxLLMClient.",
})
  .use(http())
  .use(payments())
  .build(configOverrides);

const { app, addEntrypoint } = await createAgentApp(runtime);

const axClient = createAxLLMClient({
  env: { ...process.env, OPENAI_API_KEY: sanitizedOpenAiKey },
  logger: {
    warn(message, error) {
      if (error) {
        console.warn(`[agent] ${message}`, error);
      } else {
        console.warn(`[agent] ${message}`);
      }
    },
  },
});

const brainstormingFlow = flow<{ topic: string }>()
  .node(
    "summarizer",
    'topic:string -> summary:string "Two concise sentences describing the topic."'
  )
  .node(
    "ideaGenerator",
    'summary:string -> ideas:string[] "Three short follow-up ideas."'
  )
  .execute("summarizer", (state) => ({
    topic: state.topic,
  }))
  .execute("ideaGenerator", (state) => ({
    summary: state.summarizerResult.summary as string,
  }))
  .returns((state) => ({
    summary: state.summarizerResult.summary as string,
    ideas: Array.isArray(state.ideaGeneratorResult.ideas)
      ? (state.ideaGeneratorResult.ideas as string[])
      : [],
  }));

const brainstormInput = z.object({
  topic: z
    .string()
    .min(1, { message: "Provide a topic to analyse." })
    .describe("High level topic to explore."),
});

const brainstormOutput = z.object({
  summary: z.string(),
  ideas: z.array(z.string()),
});

addEntrypoint({
  key: "brainstorm",
  description: "Strictly Vibe Coding",
  input: brainstormInput,
  price: PER_CALL_PRICE,
  output: brainstormOutput,
  async handler(ctx) {
    const input = ctx.input as z.infer<typeof brainstormInput>;
    const topic = String(input.topic ?? "").trim();
    if (!topic) {
      throw new Error("Topic cannot be empty.");
    }

    const llm = axClient.ax;
    if (!llm) {
      const fallbackSummary = `AxFlow is not configured. Pretend summary for "${topic}".`;
      return {
        output: {
          summary: fallbackSummary,
          ideas: [
            "Set OPENAI_API_KEY to enable the Ax integration.",
            "Provide a PRIVATE_KEY so x402 can sign requests.",
            "Re-run the request once credentials are configured.",
          ],
        },
        model: "axllm-fallback",
      };
    }

    const result = await brainstormingFlow.forward(llm, { topic });
    const usageEntry = brainstormingFlow.getUsage().at(-1);
    brainstormingFlow.resetUsage();

    return {
      output: {
        summary: result.summary ?? "",
        ideas: Array.isArray(result.ideas) ? result.ideas : [],
      },
      model: usageEntry?.model,
    };
  },
});

export { app };

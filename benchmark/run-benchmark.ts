/**
 * CelestinBench — Wine Knowledge Benchmark for LLMs
 *
 * Tests 6 models against 100 CMS-sourced wine questions.
 * Usage: npx tsx benchmark/run-benchmark.ts [--model <name>] [--limit <n>]
 *
 * Requires env vars: OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY
 * (reads from .env.local or environment)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Question {
  id: number;
  level: string;
  category: string;
  source: string;
  question: string;
  choices: Record<string, string>;
  answer: string;
}

interface QuestionFile {
  metadata: { name: string; total_questions: number };
  questions: Question[];
}

interface ModelResult {
  questionId: number;
  modelAnswer: string;
  correct: boolean;
  latencyMs: number;
  raw?: string;
}

interface ModelConfig {
  id: string;
  label: string;
  provider: "openai" | "anthropic" | "google";
  model: string;
}

const MODELS: ModelConfig[] = [
  {
    id: "gpt41-mini",
    label: "GPT-4.1 mini",
    provider: "openai",
    model: "gpt-4.1-mini",
  },
  {
    id: "gpt41",
    label: "GPT-4.1",
    provider: "openai",
    model: "gpt-4.1",
  },
  {
    id: "haiku",
    label: "Claude Haiku 4.5",
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
  },
  {
    id: "sonnet",
    label: "Claude Sonnet 4",
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
  },
  {
    id: "gemini-flash",
    label: "Gemini 2.5 Flash",
    provider: "google",
    model: "gemini-2.5-flash",
  },
  {
    id: "gemini-pro",
    label: "Gemini 2.5 Pro",
    provider: "google",
    model: "gemini-2.5-pro",
  },
];

const SYSTEM_PROMPT = `You are taking a wine knowledge exam. For each question, respond with ONLY the letter of the correct answer (a, b, c, or d). Do not explain your reasoning. Just the letter.`;

interface ProviderRequest {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  extractRaw: (data: unknown) => string;
  errorLabel: string;
}

type OpenAICompletionResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
};

type AnthropicMessageResponse = {
  content?: Array<{ text?: string | null }>;
};

type GeminiGenerateContentResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string | null }> } }>;
};

function buildProviderRequest(
  provider: "openai" | "anthropic" | "google",
  model: string,
  question: string,
  apiKey: string
): ProviderRequest {
  if (provider === "openai") {
    return {
      url: "https://api.openai.com/v1/chat/completions",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: {
        model,
        temperature: 0,
        max_tokens: 5,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: question },
        ],
      },
      extractRaw: (data: unknown) =>
        (data as OpenAICompletionResponse).choices?.[0]?.message?.content?.trim() ?? "",
      errorLabel: "OpenAI",
    };
  }
  if (provider === "anthropic") {
    return {
      url: "https://api.anthropic.com/v1/messages",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: {
        model,
        max_tokens: 10,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: question }],
      },
      extractRaw: (data: unknown) =>
        (data as AnthropicMessageResponse).content?.[0]?.text?.trim() ?? "",
      errorLabel: "Anthropic",
    };
  }
  // google
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    headers: { "Content-Type": "application/json" },
    body: {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ parts: [{ text: question }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 1024 },
    },
    extractRaw: (data: unknown) =>
      (data as GeminiGenerateContentResponse).candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "",
    errorLabel: "Google",
  };
}

async function callProvider(
  provider: "openai" | "anthropic" | "google",
  model: string,
  question: string,
  apiKey: string
): Promise<{ answer: string; raw: string }> {
  const req = buildProviderRequest(provider, model, question, apiKey);
  const res = await fetch(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify(req.body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`${req.errorLabel} ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const raw = req.extractRaw(data);
  return { answer: extractLetter(raw), raw };
}

function extractLetter(raw: string): string {
  const cleaned = raw.toLowerCase().trim();
  // Match first letter a-d, possibly followed by ) or .
  const match = cleaned.match(/^([a-d])/);
  return match ? match[1] : cleaned.charAt(0);
}

function formatQuestion(q: Question): string {
  const choiceLines = Object.entries(q.choices)
    .map(([letter, text]) => `${letter}) ${text}`)
    .join("\n");
  return `${q.question}\n\n${choiceLines}`;
}

const PROVIDER_KEY_MAP: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GEMINI_API_KEY",
};

async function runBenchmark(
  modelConfig: ModelConfig,
  questions: Question[],
  apiKeys: Record<string, string>
): Promise<ModelResult[]> {
  const results: ModelResult[] = [];
  const total = questions.length;
  const apiKey = apiKeys[PROVIDER_KEY_MAP[modelConfig.provider] as keyof typeof apiKeys];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const prompt = formatQuestion(q);
    const start = Date.now();

    try {
      const res = await callProvider(
        modelConfig.provider,
        modelConfig.model,
        prompt,
        apiKey
      );

      const latencyMs = Date.now() - start;
      const correct = res.answer === q.answer;
      results.push({
        questionId: q.id,
        modelAnswer: res.answer,
        correct,
        latencyMs,
        raw: res.raw,
      });

      const icon = correct ? "✓" : "✗";
      process.stdout.write(
        `\r  [${i + 1}/${total}] ${icon} Q${q.id}: ${res.answer} (expected ${q.answer}) ${latencyMs}ms`
      );
      if (!correct) {
        process.stdout.write(
          `  ← WRONG (raw: "${res.raw.slice(0, 30)}")`
        );
      }
      process.stdout.write("\n");
    } catch (err) {
      const latencyMs = Date.now() - start;
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`\n  ⚠ Q${q.id} ERROR: ${err.message.slice(0, 100)}`);
      results.push({
        questionId: q.id,
        modelAnswer: "ERROR",
        correct: false,
        latencyMs,
        raw: errorMessage,
      });
    }

    // Rate limiting: small delay between calls
    await new Promise((r) => setTimeout(r, 200));
  }

  return results;
}

interface ScoreBreakdown {
  total: number;
  correct: number;
  pct: number;
  byLevel: Record<string, { correct: number; total: number; pct: number }>;
  byCategory: Record<string, { correct: number; total: number; pct: number }>;
  avgLatencyMs: number;
  errors: number;
}

function computeScores(
  results: ModelResult[],
  questions: Question[]
): ScoreBreakdown {
  const qMap = new Map(questions.map((q) => [q.id, q]));
  const byLevel: Record<string, { correct: number; total: number }> = {};
  const byCategory: Record<string, { correct: number; total: number }> = {};
  let totalCorrect = 0;
  let totalLatency = 0;
  let errors = 0;

  for (const r of results) {
    const q = qMap.get(r.questionId)!;
    if (r.modelAnswer === "ERROR") {
      errors++;
      continue;
    }

    if (r.correct) totalCorrect++;
    totalLatency += r.latencyMs;

    // By level
    if (!byLevel[q.level]) byLevel[q.level] = { correct: 0, total: 0 };
    byLevel[q.level].total++;
    if (r.correct) byLevel[q.level].correct++;

    // By category
    if (!byCategory[q.category])
      byCategory[q.category] = { correct: 0, total: 0 };
    byCategory[q.category].total++;
    if (r.correct) byCategory[q.category].correct++;
  }

  const validResults = results.filter((r) => r.modelAnswer !== "ERROR");
  const addPct = (
    obj: Record<string, { correct: number; total: number }>
  ): Record<string, { correct: number; total: number; pct: number }> => {
    const out: Record<string, { correct: number; total: number; pct: number }> =
      {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = { ...v, pct: Math.round((v.correct / v.total) * 100) };
    }
    return out;
  };

  return {
    total: validResults.length,
    correct: totalCorrect,
    pct: Math.round((totalCorrect / validResults.length) * 100),
    byLevel: addPct(byLevel),
    byCategory: addPct(byCategory),
    avgLatencyMs: Math.round(totalLatency / validResults.length),
    errors,
  };
}

function printReport(
  allScores: { model: ModelConfig; scores: ScoreBreakdown }[]
) {
  console.log("\n\n" + "=".repeat(80));
  console.log("  CelestinBench — Wine Knowledge Benchmark Results");
  console.log("  " + new Date().toISOString());
  console.log("=".repeat(80));

  // Summary table
  console.log("\n## Overall Scores\n");
  console.log(
    "| Model                | Score  | Correct | Avg Latency | Errors |"
  );
  console.log(
    "|----------------------|--------|---------|-------------|--------|"
  );
  for (const { model, scores } of allScores) {
    console.log(
      `| ${model.label.padEnd(20)} | ${(scores.pct + "%").padStart(5)} | ${(scores.correct + "/" + scores.total).padStart(7)} | ${(scores.avgLatencyMs + "ms").padStart(11)} | ${String(scores.errors).padStart(6)} |`
    );
  }

  // By level
  console.log("\n## By Difficulty Level\n");
  const levels = ["introductory", "certified", "advanced"];
  const header =
    "| Level        | " +
    allScores.map((s) => s.model.label.padEnd(18)).join(" | ") +
    " |";
  const sep =
    "|--------------|" +
    allScores.map(() => "-".repeat(20)).join("|") +
    "|";
  console.log(header);
  console.log(sep);
  for (const level of levels) {
    const cells = allScores.map((s) => {
      const d = s.scores.byLevel[level];
      return d
        ? `${d.pct}% (${d.correct}/${d.total})`.padEnd(18)
        : "N/A".padEnd(18);
    });
    console.log(
      `| ${level.padEnd(12)} | ${cells.join(" | ")} |`
    );
  }

  // By category
  console.log("\n## By Category\n");
  const allCategories = new Set<string>();
  for (const { scores } of allScores) {
    for (const cat of Object.keys(scores.byCategory)) allCategories.add(cat);
  }
  const catHeader =
    "| Category      | " +
    allScores.map((s) => s.model.label.padEnd(18)).join(" | ") +
    " |";
  const catSep =
    "|---------------|" +
    allScores.map(() => "-".repeat(20)).join("|") +
    "|";
  console.log(catHeader);
  console.log(catSep);
  for (const cat of [...allCategories].sort()) {
    const cells = allScores.map((s) => {
      const d = s.scores.byCategory[cat];
      return d
        ? `${d.pct}% (${d.correct}/${d.total})`.padEnd(18)
        : "N/A".padEnd(18);
    });
    console.log(
      `| ${cat.padEnd(13)} | ${cells.join(" | ")} |`
    );
  }
}

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
  console.log(`Loaded env from: ${filePath}`);
}

async function main() {
  loadEnvFile(path.resolve(__dirname, ".env.benchmark"));
  loadEnvFile(path.resolve(process.cwd(), ".env.local"));

  const apiKeys = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
  };

  // Parse CLI args
  const args = process.argv.slice(2);
  let filterModel: string | null = null;
  let limit: number | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--model" && args[i + 1]) {
      filterModel = args[++i];
    }
    if (args[i] === "--limit" && args[i + 1]) {
      limit = parseInt(args[++i]);
    }
  }

  // Load questions
  const questionsFile = path.resolve(__dirname, "questions.json");
  const data: QuestionFile = JSON.parse(fs.readFileSync(questionsFile, "utf-8"));
  let questions = data.questions;
  if (limit) questions = questions.slice(0, limit);

  console.log(`\nCelestinBench — ${questions.length} questions loaded\n`);

  // Select models
  let models = MODELS;
  if (filterModel) {
    models = MODELS.filter(
      (m) =>
        m.id === filterModel ||
        m.label.toLowerCase().includes(filterModel!.toLowerCase())
    );
    if (models.length === 0) {
      console.error(
        `No model matching "${filterModel}". Available: ${MODELS.map((m) => m.id).join(", ")}`
      );
      process.exit(1);
    }
  }

  // Check API keys
  for (const m of models) {
    const keyName = PROVIDER_KEY_MAP[m.provider];
    if (!apiKeys[keyName as keyof typeof apiKeys]) {
      console.error(`Missing ${keyName} for ${m.label}. Skipping.`);
      models = models.filter((x) => x.id !== m.id);
    }
  }

  if (models.length === 0) {
    console.error("No models to test. Set API keys in .env.local");
    process.exit(1);
  }

  console.log(`Models to test: ${models.map((m) => m.label).join(", ")}\n`);

  // Run benchmarks
  const allResults: { model: ModelConfig; results: ModelResult[]; scores: ScoreBreakdown }[] = [];

  for (const modelConfig of models) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`Testing: ${modelConfig.label} (${modelConfig.model})`);
    console.log("─".repeat(60));

    const results = await runBenchmark(modelConfig, questions, apiKeys);
    const scores = computeScores(results, questions);

    console.log(`\n  → ${modelConfig.label}: ${scores.pct}% (${scores.correct}/${scores.total})`);

    allResults.push({ model: modelConfig, results, scores });
  }

  // Print consolidated report
  printReport(allResults.map((r) => ({ model: r.model, scores: r.scores })));

  // Save detailed results
  const outputPath = path.resolve(
    __dirname,
    `results-${new Date().toISOString().slice(0, 10)}.json`
  );
  const output = {
    date: new Date().toISOString(),
    questionsCount: questions.length,
    results: allResults.map((r) => ({
      model: r.model,
      scores: r.scores,
      details: r.results,
    })),
  };
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\nDetailed results saved to: ${outputPath}`);

  // Save markdown report
  const mdPath = path.resolve(
    __dirname,
    `results-${new Date().toISOString().slice(0, 10)}.md`
  );
  let md = `# CelestinBench Results — ${new Date().toISOString().slice(0, 10)}\n\n`;
  md += `**${questions.length} questions** | Sources: CMS Introductory, CMS Theory Level Comparison, Custom expert\n\n`;

  md += `## Overall Scores\n\n`;
  md += `| Model | Score | Correct | Avg Latency |\n`;
  md += `|-------|-------|---------|-------------|\n`;
  for (const r of allResults) {
    md += `| ${r.model.label} | **${r.scores.pct}%** | ${r.scores.correct}/${r.scores.total} | ${r.scores.avgLatencyMs}ms |\n`;
  }

  md += `\n## By Level\n\n`;
  md += `| Level | ${allResults.map((r) => r.model.label).join(" | ")} |\n`;
  md += `|-------|${allResults.map(() => "-------").join("|")}|\n`;
  for (const level of ["introductory", "certified", "advanced"]) {
    const cells = allResults.map((r) => {
      const d = r.scores.byLevel[level];
      return d ? `${d.pct}%` : "N/A";
    });
    md += `| ${level} | ${cells.join(" | ")} |\n`;
  }

  md += `\n## By Category\n\n`;
  const cats = new Set<string>();
  allResults.forEach((r) => Object.keys(r.scores.byCategory).forEach((c) => cats.add(c)));
  md += `| Category | ${allResults.map((r) => r.model.label).join(" | ")} |\n`;
  md += `|----------|${allResults.map(() => "-------").join("|")}|\n`;
  for (const cat of [...cats].sort()) {
    const cells = allResults.map((r) => {
      const d = r.scores.byCategory[cat];
      return d ? `${d.pct}%` : "N/A";
    });
    md += `| ${cat} | ${cells.join(" | ")} |\n`;
  }

  // Wrong answers per model
  md += `\n## Wrong Answers Detail\n\n`;
  const qMap = new Map(questions.map((q) => [q.id, q]));
  for (const r of allResults) {
    const wrongs = r.results.filter((d) => !d.correct && d.modelAnswer !== "ERROR");
    if (wrongs.length === 0) continue;
    md += `### ${r.model.label} (${wrongs.length} wrong)\n\n`;
    for (const w of wrongs) {
      const q = qMap.get(w.questionId)!;
      md += `- **Q${q.id}** [${q.level}/${q.category}]: "${q.question.slice(0, 80)}..." → answered **${w.modelAnswer}**, expected **${q.answer}** (${q.choices[q.answer]})\n`;
    }
    md += `\n`;
  }

  fs.writeFileSync(mdPath, md);
  console.log(`Markdown report saved to: ${mdPath}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

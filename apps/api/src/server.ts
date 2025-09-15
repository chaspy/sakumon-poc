import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { z } from "zod";
import { prisma } from "./db";
import { generateWorksheet } from "@sakumon/workflows/src/generate";
import { renderPdfToBuffer } from "@sakumon/pdf";
import { problemArraySchema } from "@sakumon/schemas";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

function ok(data: any, traceId?: string) {
  return { ok: true, data, meta: { traceId: traceId || randomId() } };
}
function err(code: string, message: string, traceId?: string) {
  return { ok: false, error: { code, message }, meta: { traceId: traceId || randomId() } };
}
function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

app.post("/api/generate", async (req, res) => {
  const schema = z.object({ subject: z.string(), unit: z.string(), range: z.string().optional(), ratio: z.object({ mcq: z.number(), free: z.number() }).optional(), keywords: z.array(z.string()).optional(), objectives: z.array(z.string()).optional() });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(err("BAD_REQUEST", p.error.message));
  try {
    const { items, issues } = await generateWorksheet(p.data);
    const ws = await prisma.worksheet.create({ data: { subject: p.data.subject, unit: p.data.unit, range: p.data.range || null } });
    await prisma.$transaction(
      items.map((it, i) =>
        prisma.problem.create({
          data: {
            worksheetId: ws.id,
            type: it.type,
            prompt: it.prompt,
            choices: it.choices ? JSON.stringify(it.choices) : null,
            answer: it.answer,
            explanation: it.explanation || null,
            difficulty: it.difficulty || null,
            objectives: it.objectives ? JSON.stringify(it.objectives) : null,
            rubric: it.rubric ? JSON.stringify(it.rubric) : null,
            position: i + 1,
          },
        })
      )
    );
    const saved = await prisma.problem.findMany({ where: { worksheetId: ws.id }, orderBy: { position: "asc" } });
    res.json(ok({ worksheetId: ws.id, items: saved.map(deserializeProblem), issues }));
  } catch (e: any) {
    res.status(500).json(err("GEN_ERROR", e.message || "generate failed"));
  }
});

app.get("/api/worksheets/:id", async (req, res) => {
  const id = req.params.id;
  const ws = await prisma.worksheet.findUnique({ where: { id } });
  if (!ws) return res.status(404).json(err("NOT_FOUND", "worksheet not found"));
  res.json(ok(ws));
});

app.get("/api/worksheets/:id/problems", async (req, res) => {
  const id = req.params.id;
  const items = await prisma.problem.findMany({ where: { worksheetId: id }, orderBy: { position: "asc" } });
  res.json(ok({ items: items.map(deserializeProblem) }));
});

app.post("/api/revise/:problemId", async (req, res) => {
  const schema = z.object({ scope: z.enum(["prompt", "choices", "explanation"]).default("prompt"), instruction: z.string().min(1) });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(err("BAD_REQUEST", p.error.message));
  const prob = await prisma.problem.findUnique({ where: { id: req.params.problemId } });
  if (!prob) return res.status(404).json(err("NOT_FOUND", "problem not found"));
  // LLM最小呼び出し（scope別改稿）
  const { getOpenAI, MODELS } = await import("@sakumon/workflows/src/openai");
  const openai = getOpenAI();
  const base = { type: prob.type, prompt: prob.prompt, choices: parseOrNull<string[]>(prob.choices), answer: prob.answer, explanation: prob.explanation };
  const prompt = `次の設問を、指示に従って${p.data.scope}のみを書き直してください。JSONのみ出力。
  problem: ${JSON.stringify(base)}
  instruction: ${p.data.instruction}`;
  try {
    const resp = await openai.responses.create({ model: MODELS.gen, temperature: 0.3, input: prompt, text: { format: { type: "json_object" } } } as any);
    const text = (resp as any).output_text || "{}";
    const revised = JSON.parse(text);
    const updated = await prisma.problem.update({ where: { id: prob.id }, data: { prompt: revised.prompt ?? prob.prompt, choices: revised.choices ? JSON.stringify(revised.choices) : prob.choices, explanation: revised.explanation ?? prob.explanation } });
    res.json(ok({ item: deserializeProblem(updated) }));
  } catch (e: any) {
    res.status(500).json(err("REVISE_ERROR", e.message || "revise failed"));
  }
});

app.post("/api/grade/mcq", async (req, res) => {
  const schema = z.object({ worksheetId: z.string(), answers: z.array(z.object({ problemId: z.string(), answer: z.string() })) });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(err("BAD_REQUEST", p.error.message));
  const problems = await prisma.problem.findMany({ where: { worksheetId: p.data.worksheetId } });
  const key = new Map(problems.map((pr) => [pr.id, pr]));
  let correct = 0;
  const details = p.data.answers.map((a) => {
    const pr = key.get(a.problemId);
    const ok = pr && pr.type === "mcq" && pr.answer === a.answer;
    if (ok) correct++;
    return { problemId: a.problemId, correct: !!ok, expected: pr?.answer };
  });
  res.json(ok({ score: correct, total: p.data.answers.length, details }));
});

app.post("/api/grade/free", async (req, res) => {
  const schema = z.object({ answer: z.string(), rubric: z.any() });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(err("BAD_REQUEST", p.error.message));
  try {
    const { gradeFree } = await import("@sakumon/workflows/src/grade");
    const result = await gradeFree(p.data.answer, p.data.rubric);
    res.json(ok(result));
  } catch (e: any) {
    res.status(500).json(err("GRADE_ERROR", e.message || "grade failed"));
  }
});

app.post("/api/bank/search", async (req, res) => {
  const schema = z.object({ subject: z.string(), unit: z.string(), tags: z.array(z.string()).optional(), limit: z.number().int().min(1).max(50).optional() })
  const p = schema.safeParse(req.body)
  if (!p.success) return res.status(400).json(err("BAD_REQUEST", p.error.message))
  const items = await prisma.bankItem.findMany({
    where: { subject: p.data.subject, unit: p.data.unit },
    take: p.data.limit || 10
  })
  res.json(ok({ items }))
})

app.post("/api/export/pdf", async (req, res) => {
  const schema = z.object({ worksheetId: z.string(), answerSheet: z.boolean().optional() });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(err("BAD_REQUEST", p.error.message));
  const ws = await prisma.worksheet.findUnique({ where: { id: p.data.worksheetId } });
  if (!ws) return res.status(404).json(err("NOT_FOUND", "worksheet not found"));
  const items = await prisma.problem.findMany({ where: { worksheetId: ws.id }, orderBy: { position: "asc" } });
  const buf = await renderPdfToBuffer(`${ws.subject}・${ws.unit}`, items.map(deserializeProblem) as any, { answerSheet: p.data.answerSheet });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename=worksheet-${ws.id}.pdf`);
  res.send(Buffer.from(buf));
});

app.post("/api/worksheets/:id/replace", async (req, res) => {
  const wId = req.params.id
  const schema = z.object({ problemId: z.string(), bankItemId: z.string() })
  const p = schema.safeParse(req.body)
  if (!p.success) return res.status(400).json(err("BAD_REQUEST", p.error.message))
  const problem = await prisma.problem.findFirst({ where: { id: p.data.problemId, worksheetId: wId } })
  if (!problem) return res.status(404).json(err("NOT_FOUND", "problem not found in worksheet"))
  const bank = await prisma.bankItem.findUnique({ where: { id: p.data.bankItemId } })
  if (!bank) return res.status(404).json(err("NOT_FOUND", "bank item not found"))
  const payload: any = parseOrNull(bank.payload)
  const updated = await prisma.problem.update({ where: { id: problem.id }, data: {
    type: payload.type,
    prompt: payload.prompt,
    choices: payload.choices ? JSON.stringify(payload.choices) : null,
    answer: payload.answer,
    explanation: payload.explanation ?? null,
    difficulty: payload.difficulty ?? null,
    objectives: payload.objectives ? JSON.stringify(payload.objectives) : null,
    rubric: payload.rubric ? JSON.stringify(payload.rubric) : null,
  }})
  res.json(ok({ item: deserializeProblem(updated) }))
})

function parseOrNull<T = any>(v: any): T | null {
  if (!v) return null;
  try {
    return JSON.parse(String(v)) as T;
  } catch {
    return null;
  }
}

function deserializeProblem(p: any) {
  return {
    ...p,
    choices: parseOrNull<string[]>(p.choices) || undefined,
    objectives: parseOrNull<string[]>(p.objectives) || undefined,
    rubric: parseOrNull(p.rubric) || undefined,
    meta: parseOrNull(p.meta) || undefined,
  };
}

const port = process.env.PORT || 3031;
app.listen(port, () => {
  console.log(`[api] listening on http://localhost:${port}`);
});

import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import morgan from "morgan";
import multer from "multer";
import { z } from "zod";
import { prisma } from "./db";
import { renderPdfToBuffer } from "@sakumon/pdf";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

// Multer setup for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

function ok(data: any, traceId?: string) {
  return { ok: true, data, meta: { traceId: traceId || randomId() } };
}
function err(code: string, message: string, traceId?: string) {
  return { ok: false, error: { code, message }, meta: { traceId: traceId || randomId() } };
}
function randomId() {
  return Math.random().toString(36).slice(2, 10);
}


app.get("/api/worksheets/:id", async (req: Request, res: Response) => {
  const id = req.params.id;
  const ws = await prisma.worksheet.findUnique({ where: { id } });
  if (!ws) return res.status(404).json(err("NOT_FOUND", "worksheet not found"));
  res.json(ok(ws));
});

app.get("/api/worksheets/:id/problems", async (req: Request, res: Response) => {
  const id = req.params.id;
  const items = await prisma.problem.findMany({ where: { worksheetId: id }, orderBy: { position: "asc" } });
  res.json(ok({ items: items.map(deserializeProblem) }));
});

app.post("/api/revise/:problemId", async (req: Request, res: Response) => {
  const schema = z.object({ scope: z.enum(["prompt", "choices", "explanation"]).default("prompt"), instruction: z.string().min(1) });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(err("BAD_REQUEST", p.error.message));
  const prob = await prisma.problem.findUnique({ where: { id: req.params.problemId } });
  if (!prob) return res.status(404).json(err("NOT_FOUND", "problem not found"));
  // LLM最小呼び出し（scope別改稿）
  const { getOpenAI, MODELS } = await import("@sakumon/workflows/src/openai");
  const openai = getOpenAI();
  const base = { type: prob.type, prompt: prob.prompt, choices: parseOrUndefined<string[]>(prob.choices), answer: prob.answer, explanation: prob.explanation };
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

app.post("/api/grade/mcq", async (req: Request, res: Response) => {
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

app.post("/api/grade/free", async (req: Request, res: Response) => {
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

app.post("/api/bank/search", async (req: Request, res: Response) => {
  const schema = z.object({ subject: z.string(), unit: z.string(), tags: z.array(z.string()).optional(), limit: z.number().int().min(1).max(50).optional() })
  const p = schema.safeParse(req.body)
  if (!p.success) return res.status(400).json(err("BAD_REQUEST", p.error.message))
  const items = await prisma.bankItem.findMany({
    where: { subject: p.data.subject, unit: p.data.unit },
    take: p.data.limit || 10
  })
  res.json(ok({ items }))
})

app.post("/api/export/pdf", async (req: Request, res: Response) => {
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

app.post("/api/worksheets/:id/replace", async (req: Request, res: Response) => {
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

app.post("/api/problems/:id/check-consistency", async (req: Request, res: Response) => {
  const schema = z.object({
    updatedField: z.enum(["prompt", "choices", "explanation"]).optional(),
    newValue: z.union([z.string(), z.array(z.string())]).optional()
  })
  const p = schema.safeParse(req.body)
  if (!p.success) return res.status(400).json(err("BAD_REQUEST", p.error.message))

  const prob = await prisma.problem.findUnique({ where: { id: req.params.id } })
  if (!prob) return res.status(404).json(err("NOT_FOUND", "problem not found"))

  // 現在の問題をProblem型に変換
  const currentProblem = {
    type: prob.type as "mcq" | "free",
    prompt: prob.prompt,
    choices: parseOrUndefined<string[]>(prob.choices),
    answer: prob.answer,
    explanation: prob.explanation || undefined,
    difficulty: prob.difficulty || undefined,
    objectives: parseOrUndefined<string[]>(prob.objectives),
    rubric: parseOrUndefined(prob.rubric),
    meta: parseOrUndefined(prob.meta) || {}
  }

  // 更新後の問題を作成
  let updatedProblem = { ...currentProblem }
  if (p.data.updatedField && p.data.newValue !== undefined) {
    if (p.data.updatedField === "choices" && Array.isArray(p.data.newValue)) {
      updatedProblem.choices = p.data.newValue
    } else if (p.data.updatedField === "prompt" && typeof p.data.newValue === "string") {
      updatedProblem.prompt = p.data.newValue
    } else if (p.data.updatedField === "explanation" && typeof p.data.newValue === "string") {
      updatedProblem.explanation = p.data.newValue
    }
  }

  try {
    const { checkConsistency } = await import("@sakumon/workflows/src/consistency")
    const result = await checkConsistency(
      updatedProblem,
      p.data.updatedField,
      currentProblem
    )
    res.json(ok(result))
  } catch (e: any) {
    res.status(500).json(err("CONSISTENCY_CHECK_ERROR", e.message || "consistency check failed"))
  }
})

app.post("/api/problems/:id/update", async (req: Request, res: Response) => {
  const schema = z.object({
    field: z.enum(["prompt", "choices", "answer", "explanation"]),
    value: z.union([z.string(), z.array(z.string())])
  })
  const p = schema.safeParse(req.body)
  if (!p.success) return res.status(400).json(err("BAD_REQUEST", p.error.message))

  const prob = await prisma.problem.findUnique({ where: { id: req.params.id } })
  if (!prob) return res.status(404).json(err("NOT_FOUND", "problem not found"))

  // 更新データを準備
  const updateData: any = {}
  if (p.data.field === "choices" && Array.isArray(p.data.value)) {
    updateData.choices = JSON.stringify(p.data.value)
  } else if (p.data.field === "answer" && typeof p.data.value === "string") {
    updateData.answer = p.data.value
  } else if (p.data.field === "prompt" && typeof p.data.value === "string") {
    updateData.prompt = p.data.value
  } else if (p.data.field === "explanation" && typeof p.data.value === "string") {
    updateData.explanation = p.data.value
  }

  try {
    // DBを更新
    const updated = await prisma.problem.update({
      where: { id: req.params.id },
      data: updateData
    })

    // 更新後の問題で整合性チェックを実行
    const currentProblem = {
      type: updated.type as "mcq" | "free",
      prompt: updated.prompt,
      choices: parseOrUndefined<string[]>(updated.choices),
      answer: updated.answer,
      explanation: updated.explanation || undefined,
      difficulty: updated.difficulty || undefined,
      objectives: parseOrUndefined<string[]>(updated.objectives),
      rubric: parseOrUndefined(updated.rubric),
      meta: parseOrUndefined(updated.meta) || {}
    }

    const { checkConsistency } = await import("@sakumon/workflows/src/consistency")
    const consistencyResult = await checkConsistency(currentProblem)

    res.json(ok({
      updated: deserializeProblem(updated),
      consistency: consistencyResult
    }))
  } catch (e: any) {
    res.status(500).json(err("UPDATE_ERROR", e.message || "update failed"))
  }
})

app.post("/api/agent/process", async (req: Request, res: Response) => {
  const schema = z.object({
    problemId: z.string(),
    instruction: z.string(),
    field: z.enum(["prompt", "choices", "explanation"]).optional(),
    autoFix: z.boolean().optional()
  })
  const p = schema.safeParse(req.body)
  if (!p.success) return res.status(400).json(err("BAD_REQUEST", p.error.message))

  const prob = await prisma.problem.findUnique({ where: { id: p.data.problemId } })
  if (!prob) return res.status(404).json(err("NOT_FOUND", "problem not found"))

  const currentProblem = {
    type: prob.type as "mcq" | "free",
    prompt: prob.prompt,
    choices: parseOrUndefined<string[]>(prob.choices),
    answer: prob.answer,
    explanation: prob.explanation || undefined,
    difficulty: prob.difficulty || undefined,
    objectives: parseOrUndefined<string[]>(prob.objectives),
    rubric: parseOrUndefined(prob.rubric),
    meta: parseOrUndefined(prob.meta) || {}
  }

  try {
    const { ProblemManagementAgent } = await import("@sakumon/workflows/src/agent")
    const agent = new ProblemManagementAgent()

    const result = await agent.process({
      problemId: p.data.problemId,
      problem: currentProblem,
      instruction: p.data.instruction,
      field: p.data.field,
      autoFix: p.data.autoFix
    })

    // 変更があった場合はDBを更新
    if (result.changes.length > 0) {
      await prisma.problem.update({
        where: { id: p.data.problemId },
        data: {
          prompt: result.problem.prompt,
          choices: result.problem.choices ? JSON.stringify(result.problem.choices) : null,
          explanation: result.problem.explanation || null,
        }
      })
    }

    res.json(ok(result))
  } catch (e: any) {
    res.status(500).json(err("AGENT_ERROR", e.message || "agent processing failed"))
  }
})

app.post("/api/problems/:id/auto-fix", async (req: Request, res: Response) => {
  const schema = z.object({
    issues: z.array(z.object({
      field: z.enum(["prompt", "choices", "explanation", "answer"]),
      issue: z.string(),
      severity: z.enum(["critical", "warning", "info"]),
      suggestion: z.string().optional()
    }))
  })
  const p = schema.safeParse(req.body)
  if (!p.success) return res.status(400).json(err("BAD_REQUEST", p.error.message))

  const prob = await prisma.problem.findUnique({ where: { id: req.params.id } })
  if (!prob) return res.status(404).json(err("NOT_FOUND", "problem not found"))

  const currentProblem = {
    type: prob.type as "mcq" | "free",
    prompt: prob.prompt,
    choices: parseOrUndefined<string[]>(prob.choices),
    answer: prob.answer,
    explanation: prob.explanation || undefined,
    difficulty: prob.difficulty || undefined,
    objectives: parseOrUndefined<string[]>(prob.objectives),
    rubric: parseOrUndefined(prob.rubric),
    meta: parseOrUndefined(prob.meta) || {}
  }

  try {
    const { autoFixProblem } = await import("@sakumon/workflows/src/consistency")
    const result = await autoFixProblem(currentProblem, p.data.issues)
    res.json(ok(result))
  } catch (e: any) {
    res.status(500).json(err("AUTO_FIX_ERROR", e.message || "auto fix failed"))
  }
})

app.get("/api/suggestions/:problemId", async (req: Request, res: Response) => {
  const prob = await prisma.problem.findUnique({ where: { id: req.params.problemId } })
  if (!prob) return res.status(404).json(err("NOT_FOUND", "problem not found"))

  const { getOpenAI, MODELS } = await import("@sakumon/workflows/src/openai")
  const openai = getOpenAI()

  const problemData = {
    type: prob.type,
    prompt: prob.prompt,
    choices: parseOrUndefined<string[]>(prob.choices),
    answer: prob.answer,
    explanation: prob.explanation
  }

  const prompt = `次の問題を詳しく分析し、実行可能で具体的な改善提案を生成してください。

問題: ${JSON.stringify(problemData, null, 2)}

各提案は、クリックしたらすぐ実行できる具体的な指示にしてください：

【問題文の改善提案】
- 現在の問題内容に即した具体的な変更や追加
- 明確な方向性（より簡単に/より難しく/より明確に）
- 20字以内で実行内容が分かる指示

【選択肢の改善提案】（MCQの場合のみ）
- 選択肢の具体的な改善方法
- 誤答の理由を明確にする方法
- 選択肢の並び順や表現の改善

【解説の改善提案】
- 解説の構造的な改善
- 不足している情報の追加
- より分かりやすくする具体的方法

出力形式（JSON）:
{
  "prompt": ["具体的な指示1（20字以内）", "具体的な指示2", "具体的な指示3", "具体的な指示4"],
  ${prob.type === 'mcq' ? '"choices": ["具体的な指示1", "具体的な指示2", "具体的な指示3", "具体的な指示4"],' : ''}
  "explanation": ["具体的な指示1", "具体的な指示2", "具体的な指示3", "具体的な指示4"]
}

重要:
- 曖昧な表現（「難易度を調整」「もっと良く」）は避ける
- 実行内容が明確な指示にする（「〜を〜に変更」「〜を追加」）
- 問題の実際の内容に即した提案にする
- それぞれ異なる観点からの提案にする`

  try {
    const resp = await openai.responses.create({
      model: MODELS.gen,
      temperature: 0.7,
      input: prompt,
      text: { format: { type: "json_object" } }
    } as any)
    const text = (resp as any).output_text || "{}"
    const suggestions = JSON.parse(text)
    res.json(ok(suggestions))
  } catch (e: any) {
    // フォールバックとして固定のサジェストを返す
    const fallback = {
      prompt: ["もっと簡単に", "より詳しく", "具体例を追加", "文章を短く"],
      choices: prob.type === 'mcq' ? ["より紛らわしく", "分かりやすく", "選択肢を詳しく", "具体的な数値に"] : undefined,
      explanation: ["100字以内で", "ステップ毎に", "理由を詳しく", "注意点を追加"]
    }
    res.json(ok(fallback))
  }
})

app.post("/api/ocr", upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json(err("BAD_REQUEST", "File is required"));
  }

  const traceId = randomId();
  const isPdf = req.file.mimetype === 'application/pdf';
  const isImage = req.file.mimetype.startsWith('image/');
  
  try {
    console.log(`[OCR] Processing ${isPdf ? 'PDF' : 'Image'}: ${req.file.originalname} (${req.file.size} bytes)`);
    
    let result;
    
    if (isPdf) {
      // 一時的にPDF処理を無効化
      throw new Error('PDF処理は現在メンテナンス中です。画像ファイル（PNG、JPG）をご利用ください。');
      
    } else if (isImage) {
      const { extractTextFromImage, postProcessOCRText } = await import("@sakumon/workflows/src/ocr");
      
      const structuredOutput = req.body.structuredOutput === 'true';
      const model = req.body.model || 'openai'; // デフォルトはOpenAI
      const ocrText = await extractTextFromImage(req.file.buffer, structuredOutput, model);
      const cleanedText = postProcessOCRText(ocrText);
      
      result = {
        text: cleanedText,
        processedPages: 1,
        confidence: 0.85,
        originalFileName: req.file.originalname,
        fileSize: req.file.size
      };
    } else {
      throw new Error('Unsupported file type');
    }
    
    console.log(`[OCR] Successfully processed ${result.processedPages} page(s)`);
    
    res.json(ok(result, traceId));
    
  } catch (error: any) {
    console.error(`[OCR] Processing failed:`, error);
    res.status(500).json(err("OCR_ERROR", error.message || "OCR processing failed", traceId));
  }
});

app.get("/api/ocr/models", async (req: Request, res: Response) => {
  try {
    const { getAvailableModels } = await import("@sakumon/workflows/src/ocr");
    const models = getAvailableModels();
    
    const modelsWithInfo = models.map(model => ({
      id: model,
      name: model === 'openai' ? 'OpenAI GPT-4o-mini' : 'Google Gemini 2.5 Pro',
      description: model === 'openai' ? 'OpenAI Vision API' : 'Google Gemini Vision API'
    }));
    
    res.json(ok({ models: modelsWithInfo }));
  } catch (error: any) {
    console.error(`[API] Failed to get available models:`, error);
    res.status(500).json(err("MODELS_ERROR", error.message || "Failed to get available models"));
  }
});

function parseOrNull<T = any>(v: any): T | null {
  if (!v) return null;
  try {
    return JSON.parse(String(v)) as T;
  } catch {
    return null;
  }
}

function parseOrUndefined<T = any>(v: any): T | undefined {
  if (!v) return undefined;
  try {
    return JSON.parse(String(v)) as T;
  } catch {
    return undefined;
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

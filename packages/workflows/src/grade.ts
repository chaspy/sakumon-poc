import { Problem } from "@sakumon/schemas";
import { getOpenAI, MODELS } from "./openai";

type GradeMark = "○" | "△" | "×";

export function gradeMcq(answers: { problemId: string; answer: string }[], problems: Problem[]) {
  const key = new Map(problems.map((p: any) => [p.id || "", p]));
  let correct = 0;
  const details = answers.map((a) => {
    const p = key.get(a.problemId);
    const ok = p && p.type === "mcq" && p.answer === a.answer;
    if (ok) correct++;
    return { problemId: a.problemId, correct: !!ok, expected: p?.answer };
  });
  return { score: correct, total: answers.length, details };
}

export async function gradeFree(
  answer: string,
  rubric: NonNullable<Problem["rubric"]>,
  expectedAnswer?: string
): Promise<{ mark: GradeMark; comment: string }> {
  const normalizedAnswer = normalize(answer);
  const normalizedExpected = expectedAnswer ? normalize(expectedAnswer) : "";

  if (!normalizedAnswer) {
    return { mark: "×", comment: "回答が入力されていません。" };
  }

  if (!normalizedExpected) {
    return {
      mark: "△",
      comment: "模範解答が未設定のため自動判定できません。目視確認してください。",
    };
  }

  if (normalizedAnswer === normalizedExpected) {
    return { mark: "○", comment: "模範解答と完全一致しました。" };
  }

  return {
    mark: "×",
    comment: "模範解答と一致しませんでした。",
  };
}

function normalize(v: string) {
  const trimmed = (v || "").trim();
  if (!trimmed) return "";
  const hankaku = trimmed.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) =>
    String.fromCharCode(s.charCodeAt(0) - 0xfee0)
  );
  return hankaku
    .replace(/[\s]+/g, "")
    .replace(/[−―‐－]/g, "-")
    .replace(/[〜～]/g, "~")
    .toLowerCase();
}

const FEEDBACK_TIMEOUT_MS = Number(process.env.OPENAI_FEEDBACK_TIMEOUT_MS ?? 8000);

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  if (timeoutMs <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });
  return Promise.race([
    promise.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    timeoutPromise,
  ]);
}

export async function generateIncorrectFeedback(
  problem: Problem,
  userAnswer: string
): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const openai = getOpenAI();
    const prompt = buildFeedbackPrompt(problem, userAnswer);
    const resp = await withTimeout(
      openai.responses.create({
        model: MODELS.gen,
        temperature: 0.3,
        input: prompt,
        text: { format: { type: "json_object" } },
      } as any),
      FEEDBACK_TIMEOUT_MS,
      "OpenAI feedback request timed out"
    );
    const text = (resp as any).output_text || "{}";
    const parsed = safeParseJson(text);
    const reason = typeof parsed.reason === "string" ? parsed.reason.trim() : null;
    const guidance = typeof parsed.guidance === "string" ? parsed.guidance.trim() : null;
    if (!reason && !guidance) return null;
    if (reason && guidance) return `間違いの理由: ${reason}\n改善アドバイス: ${guidance}`;
    if (reason) return `間違いの理由: ${reason}`;
    return `改善アドバイス: ${guidance}`;
  } catch (error) {
    console.warn("[grade/feedback] failed to generate feedback", {
      problemId: problem.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function buildFeedbackPrompt(problem: Problem, userAnswer: string) {
  const lines = [
    "あなたは高校向けテストの解答解説を作成する教師です。",
    "与えられた問題に対して受験者が誤答した理由と、正しく理解するための改善アドバイスを短く提示してください。",
    "出力は JSON 形式で { reason: string, guidance: string } に限定してください。",
    "日本語で 120 文字以内にまとめてください。",
    `問題タイプ: ${problem.type}`,
    `問題文: ${problem.prompt}`,
  ];
  if (problem.type === "mcq" && problem.choices) {
    lines.push(`選択肢: ${JSON.stringify(problem.choices)}`);
  }
  lines.push(`正答: ${problem.answer}`);
  if (problem.explanation) {
    lines.push(`公式解説: ${problem.explanation}`);
  }
  lines.push(`受験者の回答: ${userAnswer || "(未回答)"}`);
  return lines.join("\n");
}

function safeParseJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

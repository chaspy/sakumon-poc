import { problemArraySchema, jsonSchemaForProblemEnvelope, Problem } from "@sakumon/schemas";
import { MODELS, getOpenAI } from "./openai";
import { ensureMcqValidity, cosine, defaultRubric } from "./utils";

export type GenerateInput = {
  subject: string;
  unit: string;
  range?: string;
  ratio?: { mcq: number; free: number };
  keywords?: string[];
  objectives?: string[];
};

export async function generateWorksheet(input: GenerateInput): Promise<{ items: Problem[]; issues: string[] }> {
  const openai = getOpenAI();
  const ratio = input.ratio || { mcq: 7, free: 3 };

  const sysHeader = [
    "あなたは高校教員のための問題作成アシスタントです。",
    "次の制約を厳守して、有効なJSON配列のみを出力してください。",
    "- 言語: 日本語（高校生向け）。",
    "- 問題タイプ: mcq " + ratio.mcq + "問 / free " + ratio.free + "問。",
    "- 各問は次の全フィールドを必ず含む: type, prompt, choices, answer, explanation(120字以内), difficulty(1-5), objectives, rubric, meta。",
    "- free のとき choices は空配列 [] を入れる。mcq のとき rubric は {\"maxPoints\":0, \"criteria\":[]} を入れる。",
    "- meta は常に空オブジェクト {} を入れる。",
    "- 数学はLaTeX記法（例: `y=ax+b`）。",
  ].join("\n");

  const styleHints = `styleHints: 語調は丁寧。用語は教科書準拠。難易度は1-2:40% / 3:40% / 4-5:20%。`;

  const subjectHints: Record<string, string> = {
    数学: "重点: 傾きと切片, 直線の式, 交点計算。ダミー: 単位/符号/係数の取り違え。",
    理科: "重点: 化学式の表記・式量・係数合わせ。ダミー: 係数過不足・価数取り違え。",
    社会: "重点: 年代・出来事・用語・因果。ダミー: 年号シャッフル・誤因果。",
  };

  const userPrompt = [
    `subject: ${input.subject} / unit: ${input.unit}`,
    input.range ? `range: ${input.range}` : undefined,
    input.keywords?.length ? `keywords: ${input.keywords.join(", ")}` : undefined,
    input.objectives?.length ? `objectives: ${input.objectives.join(", ")}` : undefined,
    styleHints,
    subjectHints[input.subject] || "",
    "出力はJSON配列のみ。文字列の中に改行を含んでもよいが、配列外にテキストを出さないこと。",
  ]
    .filter(Boolean)
    .join("\n");

  const resp = await openai.responses.create({
    model: MODELS.gen,
    temperature: 0.3,
    input: [{ role: "system", content: sysHeader }, { role: "user", content: userPrompt }],
    text: {
      format: {
        type: "json_schema",
        name: "ProblemEnvelope",
        schema: jsonSchemaForProblemEnvelope as any,
        strict: true,
      },
    },
  } as any);

  const raw = (resp as any).output_text ?? (resp as any).choices?.[0]?.message?.content ?? "[]";

  let items: Problem[] = [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      items = problemArraySchema.parse(parsed);
    } else if (parsed && Array.isArray(parsed.items)) {
      items = problemArraySchema.parse(parsed.items);
    } else {
      items = [];
    }
  } catch (e) {
    // 失敗時は安全側で空配列
    items = [];
  }

  // MCQ検証・整形
  const { items: mcqChecked, issues: mcqIssues } = ensureMcqValidity(items);

  // ルーブリック補完（freeのみ）
  const withRubric = mcqChecked.map((p) => (p.type === "free" && !p.rubric ? { ...p, rubric: defaultRubric() } : p));

  // 重複除去（埋め込み類似 > 0.9）
  const prompts = withRubric.map((p) => p.prompt);
  const emb = await openai.embeddings.create({ model: MODELS.embed, input: prompts });
  const vectors = emb.data.map((d) => d.embedding as number[]);
  const kept: Problem[] = [];
  const keptVec: number[][] = [];
  const dupIssues: string[] = [];
  for (let i = 0; i < withRubric.length; i++) {
    const v = vectors[i];
    const isDup = keptVec.some((kv) => cosine(kv, v) > 0.9);
    if (isDup) {
      dupIssues.push(`重複疑い: Q${i + 1}`);
    } else {
      kept.push(withRubric[i]);
      keptVec.push(v);
    }
  }

  // 目標本数に満たない場合はシンプル補生成（ダミー）
  const target = (ratio.mcq || 7) + (ratio.free || 3);
  while (kept.length < target && kept.length < withRubric.length) {
    kept.push(withRubric[kept.length]);
  }

  return { items: kept.slice(0, target), issues: [...mcqIssues, ...dupIssues] };
}

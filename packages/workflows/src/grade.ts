import { Problem } from "@sakumon/schemas";
import { getOpenAI, MODELS } from "./openai";

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

export async function gradeFree(answer: string, rubric: NonNullable<Problem["rubric"]>) {
  const openai = getOpenAI();
  const prompt = [
    "次の回答をルーブリックに照らして、○/△/×のいずれかと50字以内の短評を提案してください。",
    `rubric: ${JSON.stringify(rubric)}`,
    `answer: ${answer}`,
    "出力はJSON: { mark: '○'|'△'|'×', comment: string } のみ。",
  ].join("\n");
  const resp = await openai.responses.create({
    model: MODELS.gen,
    temperature: 0,
    input: prompt,
    text: { format: { type: "json_object" } },
  } as any);
  const text = (resp as any).output_text || "{}";
  let parsed: any = {};
  try {
    parsed = JSON.parse(text);
  } catch {}
  const mark = parsed.mark || "△";
  const comment = parsed.comment || "観点に照らして一部不十分です。";
  return { mark, comment };
}

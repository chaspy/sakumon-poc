import { Problem } from "@sakumon/schemas";

export function ensureMcqValidity(items: Problem[]): { items: Problem[]; issues: string[] } {
  const issues: string[] = [];
  const fixed = items.map((p, idx) => {
    if (p.type === "mcq") {
      if (!p.choices || p.choices.length < 2) {
        issues.push(`Q${idx + 1}: choices が不足しています`);
        return p;
      }
      if (!p.choices.includes(p.answer)) {
        issues.push(`Q${idx + 1}: answer が choices に含まれていません`);
      }
      // choices 重複除去
      const seen = new Set<string>();
      const unique = p.choices.filter((c: string) => (seen.has(c) ? false : (seen.add(c), true)));
      if (unique.length !== p.choices.length) {
        issues.push(`Q${idx + 1}: choices に重複があります`);
      }
      return { ...p, choices: unique };
    }
    return p;
  });
  return { items: fixed, issues };
}

export function cosine(a: number[], b: number[]) {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

export function defaultRubric(): Problem["rubric"] {
  return {
    maxPoints: 5,
    criteria: [
      { name: "定義の適切さ", points: 2, desc: "用語・式の定義が正しい" },
      { name: "筋道・根拠", points: 2, desc: "導出や因果の説明が一貫" },
      { name: "最終表現", points: 1, desc: "記号・表記・年号などが正確" },
    ],
  };
}

import { Problem } from "@sakumon/schemas";
import { getOpenAI, MODELS } from "./openai";

export interface ConsistencyCheckResult {
  isConsistent: boolean;
  issues: Array<{
    field: "prompt" | "choices" | "explanation" | "answer";
    issue: string;
    severity: "critical" | "warning" | "info";
    suggestion?: string;
  }>;
  autoFixAvailable: boolean;
  confidence: number;
}

export interface AutoFixResult {
  fixes: {
    prompt?: string;
    choices?: string[];
    explanation?: string;
    answer?: string;
  };
  confidence: number;
  applied: string[];
}

/**
 * 問題の整合性をチェック
 */
export async function checkConsistency(
  problem: Problem,
  updatedField?: "prompt" | "choices" | "explanation",
  originalProblem?: Problem
): Promise<ConsistencyCheckResult> {
  const openai = getOpenAI();
  const issues: ConsistencyCheckResult["issues"] = [];

  // 基本的な規則ベースチェック
  if (problem.type === "mcq") {
    // MCQ固有のチェック
    if (!problem.choices || problem.choices.length < 2) {
      issues.push({
        field: "choices",
        issue: "選択肢が不足しています",
        severity: "critical",
        suggestion: "最低2つ以上の選択肢が必要です",
      });
    }

    if (problem.choices && !problem.choices.includes(problem.answer)) {
      issues.push({
        field: "answer",
        issue: "正解が選択肢に含まれていません",
        severity: "critical",
        suggestion: "選択肢の中から正解を選択してください",
      });
    }

    // 選択肢の重複チェック
    if (problem.choices) {
      const uniqueChoices = new Set(problem.choices);
      if (uniqueChoices.size !== problem.choices.length) {
        issues.push({
          field: "choices",
          issue: "重複した選択肢があります",
          severity: "warning",
          suggestion: "各選択肢は異なる内容にしてください",
        });
      }
    }
  }

  // AI による深い整合性チェック
  const aiCheckPrompt = `
次の問題の整合性を詳しくチェックしてください：

問題タイプ: ${problem.type}
問題文: ${problem.prompt}
${problem.choices ? `選択肢: ${JSON.stringify(problem.choices)}` : ""}
答え: ${problem.answer}
解説: ${problem.explanation || "なし"}

${
  updatedField && originalProblem
    ? `
最近編集されたフィールド: ${updatedField}
編集前の内容: ${JSON.stringify(
        originalProblem[updatedField as keyof Problem]
      )}
`
    : ""
}

以下の観点でチェックし、JSON形式で出力してください：

1. 問題文と答えの論理的整合性
2. 選択肢の妥当性（MCQの場合）
3. 解説の正確性と十分性
4. 教育的価値と適切性

出力形式:
{
  "overallConsistency": true/false,
  "confidenceScore": 0.0-1.0,
  "detectedIssues": [
    {
      "field": "prompt/choices/explanation/answer",
      "issue": "問題の説明",
      "severity": "critical/warning/info",
      "suggestion": "改善提案"
    }
  ],
  "autoFixPossible": true/false,
  "educationalValue": "high/medium/low",
  "additionalNotes": "その他のコメント"
}
`;

  try {
    const response = await openai.responses.create({
      model: MODELS.gen,
      temperature: 0.3,
      input: aiCheckPrompt,
      text: { format: { type: "json_object" } },
    } as any);

    const aiResult = JSON.parse((response as any).output_text || "{}");

    // AIの検出した問題を追加
    if (aiResult.detectedIssues) {
      issues.push(...aiResult.detectedIssues);
    }

    return {
      isConsistent: issues.filter((i) => i.severity === "critical").length === 0,
      issues,
      autoFixAvailable: aiResult.autoFixPossible || false,
      confidence: aiResult.confidenceScore || 0.5,
    };
  } catch (error) {
    console.error("AI consistency check failed:", error);
    // AIチェックが失敗した場合は規則ベースの結果のみ返す
    return {
      isConsistent: issues.filter((i) => i.severity === "critical").length === 0,
      issues,
      autoFixAvailable: false,
      confidence: 0.3,
    };
  }
}

/**
 * 検出された問題を自動修正
 */
export async function autoFixProblem(
  problem: Problem,
  issues: ConsistencyCheckResult["issues"]
): Promise<AutoFixResult> {
  const openai = getOpenAI();

  const criticalIssues = issues.filter((i) => i.severity === "critical");
  if (criticalIssues.length === 0) {
    return {
      fixes: {},
      confidence: 1.0,
      applied: [],
    };
  }

  const fixPrompt = `
次の問題に対して検出された整合性の問題を修正してください：

現在の問題:
${JSON.stringify(problem, null, 2)}

検出された問題:
${JSON.stringify(criticalIssues, null, 2)}

修正が必要なフィールドのみを含むJSONを出力してください。
修正しないフィールドは含めないでください。

出力形式:
{
  "fixes": {
    "prompt": "修正後の問題文（必要な場合のみ）",
    "choices": ["修正後の選択肢配列（必要な場合のみ）"],
    "answer": "修正後の答え（必要な場合のみ）",
    "explanation": "修正後の解説（必要な場合のみ）"
  },
  "confidence": 0.0-1.0,
  "appliedFixes": ["field1", "field2", ...]
}
`;

  try {
    const response = await openai.responses.create({
      model: MODELS.gen,
      temperature: 0.2,
      input: fixPrompt,
      text: { format: { type: "json_object" } },
    } as any);

    const result = JSON.parse((response as any).output_text || "{}");

    return {
      fixes: result.fixes || {},
      confidence: result.confidence || 0.5,
      applied: result.appliedFixes || [],
    };
  } catch (error) {
    console.error("Auto-fix failed:", error);
    return {
      fixes: {},
      confidence: 0,
      applied: [],
    };
  }
}

/**
 * バッチで複数問題の整合性をチェック
 */
export async function batchCheckConsistency(
  problems: Problem[]
): Promise<{
  results: Map<number, ConsistencyCheckResult>;
  overallScore: number;
}> {
  const results = new Map<number, ConsistencyCheckResult>();
  let totalScore = 0;

  // 並列処理で高速化（最大5並列）
  const batchSize = 5;
  for (let i = 0; i < problems.length; i += batchSize) {
    const batch = problems.slice(i, Math.min(i + batchSize, problems.length));
    const batchResults = await Promise.all(
      batch.map((p) => checkConsistency(p))
    );

    batchResults.forEach((result, idx) => {
      results.set(i + idx, result);
      totalScore += result.confidence;
    });
  }

  return {
    results,
    overallScore: totalScore / problems.length,
  };
}
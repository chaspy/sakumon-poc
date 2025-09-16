import { Problem } from "@sakumon/schemas";
import { getOpenAI, MODELS } from "./openai";
import { checkConsistency, autoFixProblem, ConsistencyCheckResult } from "./consistency";

// ==================== Tool Interfaces ====================

interface Tool {
  name: string;
  execute(params: any): Promise<any>;
}

interface EditorToolResult {
  original: any;
  edited: any;
  changes: string[];
}

interface SuggestionToolResult {
  prompt: string[];
  choices?: string[];
  explanation: string[];
}

interface QualityToolResult {
  overallScore: number;
  metrics: {
    clarity: number;
    difficulty: number;
    educationalValue: number;
    consistency: number;
  };
  recommendations: string[];
}

// ==================== Tool Implementations ====================

class EditorTool implements Tool {
  name = "Editor";

  async execute(params: {
    problem: Problem;
    field: "prompt" | "choices" | "explanation";
    instruction: string;
  }): Promise<EditorToolResult> {
    const openai = getOpenAI();
    const original = params.problem[params.field];

    const prompt = `
現在の${params.field}: ${JSON.stringify(original)}

指示: ${params.instruction}

上記の指示に従って${params.field}を編集してください。
変更点も明確に記載してください。

出力形式（JSON）:
{
  "edited": 編集後の内容,
  "changes": ["変更点1", "変更点2", ...]
}`;

    try {
      const response = await openai.responses.create({
        model: MODELS.gen,
        temperature: 0.5,
        input: prompt,
        text: { format: { type: "json_object" } },
      } as any);

      const result = JSON.parse((response as any).output_text || "{}");
      return {
        original,
        edited: result.edited,
        changes: result.changes || [],
      };
    } catch (error) {
      console.error("EditorTool failed:", error);
      return { original, edited: original, changes: [] };
    }
  }
}

class ConsistencyCheckerTool implements Tool {
  name = "ConsistencyChecker";

  async execute(params: { problem: Problem }): Promise<ConsistencyCheckResult> {
    return await checkConsistency(params.problem);
  }
}

class SuggestionGeneratorTool implements Tool {
  name = "SuggestionGenerator";

  async execute(params: { problem: Problem }): Promise<SuggestionToolResult> {
    const openai = getOpenAI();

    const prompt = `
次の問題を詳しく分析し、実行可能で具体的な改善提案を生成してください。

問題:
${JSON.stringify(params.problem, null, 2)}

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
  ${params.problem.type === "mcq" ? '"choices": ["具体的な指示1", "具体的な指示2", "具体的な指示3", "具体的な指示4"],' : ""}
  "explanation": ["具体的な指示1", "具体的な指示2", "具体的な指示3", "具体的な指示4"]
}

重要:
- 曖昧な表現（「難易度を調整」「もっと良く」）は避ける
- 実行内容が明確な指示にする（「〜を〜に変更」「〜を追加」）
- 問題の実際の内容に即した提案にする
- それぞれ異なる観点からの提案にする`;

    try {
      const response = await openai.responses.create({
        model: MODELS.gen,
        temperature: 0.7,
        input: prompt,
        text: { format: { type: "json_object" } },
      } as any);

      return JSON.parse((response as any).output_text || "{}");
    } catch (error) {
      console.error("SuggestionGeneratorTool failed:", error);
      return {
        prompt: ["もっと簡単に", "より詳しく", "具体例を追加", "文章を短く"],
        choices:
          params.problem.type === "mcq"
            ? ["より紛らわしく", "分かりやすく", "選択肢を詳しく", "具体的な数値に"]
            : undefined,
        explanation: ["100字以内で", "ステップ毎に", "理由を詳しく", "注意点を追加"],
      };
    }
  }
}

class AutoFixerTool implements Tool {
  name = "AutoFixer";

  async execute(params: {
    problem: Problem;
    issues: ConsistencyCheckResult["issues"];
  }): Promise<any> {
    return await autoFixProblem(params.problem, params.issues);
  }
}

class QualityScorerTool implements Tool {
  name = "QualityScorer";

  async execute(params: { problem: Problem }): Promise<QualityToolResult> {
    const openai = getOpenAI();

    const prompt = `
次の問題の品質を評価してください。

問題:
${JSON.stringify(params.problem, null, 2)}

評価基準:
- clarity: 問題文の明瞭さ（0-1）
- difficulty: 難易度の適切さ（0-1）
- educationalValue: 教育的価値（0-1）
- consistency: 内部整合性（0-1）

出力形式（JSON）:
{
  "overallScore": 0.0-1.0,
  "metrics": {
    "clarity": 0.0-1.0,
    "difficulty": 0.0-1.0,
    "educationalValue": 0.0-1.0,
    "consistency": 0.0-1.0
  },
  "recommendations": ["改善提案1", "改善提案2", ...]
}`;

    try {
      const response = await openai.responses.create({
        model: MODELS.gen,
        temperature: 0.3,
        input: prompt,
        text: { format: { type: "json_object" } },
      } as any);

      return JSON.parse((response as any).output_text || "{}");
    } catch (error) {
      console.error("QualityScorerTool failed:", error);
      return {
        overallScore: 0.5,
        metrics: {
          clarity: 0.5,
          difficulty: 0.5,
          educationalValue: 0.5,
          consistency: 0.5,
        },
        recommendations: [],
      };
    }
  }
}

// ==================== Agent Types ====================

export enum UserIntent {
  EDIT = "edit",
  IMPROVE = "improve",
  CHECK = "check",
  SUGGEST = "suggest",
  FIX = "fix",
  COMPREHENSIVE = "comprehensive",
}

export interface AgentRequest {
  problemId: string;
  problem: Problem;
  instruction: string;
  field?: "prompt" | "choices" | "explanation";
  autoFix?: boolean;
}

export interface AgentResponse {
  success: boolean;
  problem: Problem;
  changes: string[];
  suggestions?: SuggestionToolResult;
  consistencyReport?: ConsistencyCheckResult;
  qualityScore?: QualityToolResult;
  toolsUsed: string[];
  reasoning: string;
}

// ==================== Main Agent ====================

export class ProblemManagementAgent {
  private tools: Map<string, Tool>;

  constructor() {
    this.tools = new Map([
      ["Editor", new EditorTool()],
      ["ConsistencyChecker", new ConsistencyCheckerTool()],
      ["SuggestionGenerator", new SuggestionGeneratorTool()],
      ["AutoFixer", new AutoFixerTool()],
      ["QualityScorer", new QualityScorerTool()],
    ]);
  }

  async process(request: AgentRequest): Promise<AgentResponse> {
    const toolsUsed: string[] = [];
    const changes: string[] = [];
    let currentProblem = { ...request.problem };
    let reasoning = "";

    // 1. 意図を分析
    const intent = this.analyzeIntent(request.instruction);
    reasoning += `意図分析: ${intent}\n`;

    // 2. ツール選択と実行
    const toolPlan = this.selectTools(intent, request);
    reasoning += `実行ツール: ${toolPlan.join(", ")}\n`;

    let consistencyReport: ConsistencyCheckResult | undefined;
    let suggestions: SuggestionToolResult | undefined;
    let qualityScore: QualityToolResult | undefined;

    for (const toolName of toolPlan) {
      const tool = this.tools.get(toolName);
      if (!tool) continue;

      toolsUsed.push(toolName);

      switch (toolName) {
        case "Editor":
          if (request.field) {
            const result = await tool.execute({
              problem: currentProblem,
              field: request.field,
              instruction: request.instruction,
            });
            currentProblem = {
              ...currentProblem,
              [request.field]: result.edited,
            };
            changes.push(...result.changes);
            reasoning += `編集完了: ${result.changes.join(", ")}\n`;
          }
          break;

        case "ConsistencyChecker":
          consistencyReport = await tool.execute({ problem: currentProblem });
          reasoning += `整合性チェック: ${
            consistencyReport.isConsistent ? "OK" : "問題あり"
          }\n`;

          // 不整合があり、自動修正が有効な場合
          if (!consistencyReport.isConsistent && request.autoFix) {
            toolPlan.push("AutoFixer");
            reasoning += "不整合検出 → 自動修正を実行\n";
          }
          break;

        case "AutoFixer":
          if (consistencyReport && !consistencyReport.isConsistent) {
            const fixResult = await tool.execute({
              problem: currentProblem,
              issues: consistencyReport.issues,
            });
            if (fixResult.fixes) {
              currentProblem = { ...currentProblem, ...fixResult.fixes };
              changes.push(`自動修正適用: ${fixResult.applied.join(", ")}`);
              reasoning += `自動修正完了: 信頼度 ${fixResult.confidence}\n`;
            }
          }
          break;

        case "SuggestionGenerator":
          suggestions = await tool.execute({ problem: currentProblem });
          reasoning += "改善提案生成完了\n";
          break;

        case "QualityScorer":
          qualityScore = await tool.execute({ problem: currentProblem });
          reasoning += `品質スコア: ${qualityScore.overallScore.toFixed(2)}\n`;

          // 品質が低い場合、改善提案を生成
          if (qualityScore.overallScore < 0.7 && !suggestions) {
            toolPlan.push("SuggestionGenerator");
            reasoning += "品質スコア低 → 改善提案を生成\n";
          }
          break;
      }
    }

    // 3. 最終整合性チェック（編集があった場合）
    if (changes.length > 0 && !toolsUsed.includes("ConsistencyChecker")) {
      const finalCheck = await this.tools
        .get("ConsistencyChecker")!
        .execute({ problem: currentProblem });
      consistencyReport = finalCheck;
      toolsUsed.push("ConsistencyChecker");
      reasoning += `最終整合性チェック: ${
        finalCheck.isConsistent ? "OK" : "要確認"
      }\n`;
    }

    return {
      success: true,
      problem: currentProblem,
      changes,
      suggestions,
      consistencyReport,
      qualityScore,
      toolsUsed,
      reasoning,
    };
  }

  private analyzeIntent(instruction: string): UserIntent {
    const lowerInstruction = instruction.toLowerCase();

    if (lowerInstruction.includes("チェック") || lowerInstruction.includes("確認")) {
      return UserIntent.CHECK;
    }
    if (lowerInstruction.includes("提案") || lowerInstruction.includes("サジェスト")) {
      return UserIntent.SUGGEST;
    }
    if (lowerInstruction.includes("修正") || lowerInstruction.includes("直")) {
      return UserIntent.FIX;
    }
    if (lowerInstruction.includes("改善") || lowerInstruction.includes("良く")) {
      return UserIntent.IMPROVE;
    }
    if (lowerInstruction.includes("編集") || lowerInstruction.includes("変更")) {
      return UserIntent.EDIT;
    }
    return UserIntent.COMPREHENSIVE;
  }

  private selectTools(intent: UserIntent, request: AgentRequest): string[] {
    switch (intent) {
      case UserIntent.EDIT:
        return request.field
          ? ["Editor", "ConsistencyChecker"]
          : ["ConsistencyChecker"];

      case UserIntent.CHECK:
        return ["ConsistencyChecker", "QualityScorer"];

      case UserIntent.SUGGEST:
        return ["SuggestionGenerator", "QualityScorer"];

      case UserIntent.FIX:
        return ["ConsistencyChecker", "AutoFixer", "QualityScorer"];

      case UserIntent.IMPROVE:
        return [
          "QualityScorer",
          "SuggestionGenerator",
          "Editor",
          "ConsistencyChecker",
        ];

      case UserIntent.COMPREHENSIVE:
      default:
        return [
          "QualityScorer",
          "ConsistencyChecker",
          "SuggestionGenerator",
        ];
    }
  }
}
import { Problem } from "@sakumon/schemas";

// 簡単なID生成関数
function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export interface ParsedOCRResult {
  problems: Problem[];
  totalProblems: number;
  parseErrors: string[];
}

/**
 * OCRの構造化テキストをProblem配列に変換
 */
export function parseOCRText(ocrText: string): ParsedOCRResult {
  const problems: Problem[] = [];
  const parseErrors: string[] = [];
  
  // 問題ブロックを分割（"問題X:" で区切る）
  const problemBlocks = ocrText.split(/(?=問題\d+:)/g).filter(block => block.trim());
  
  // 問題番号でグループ化
  const problemGroups = new Map<string, Array<{block: string, order: number}>>();
  
  problemBlocks.forEach((block, index) => {
    try {
      const lines = block.split('\n').map(line => line.trim()).filter(line => line);
      let problemNumber = '';
      
      for (const line of lines) {
        if (line.startsWith('- 問題番号:')) {
          problemNumber = line.replace('- 問題番号:', '').trim();
          break;
        }
      }
      
      if (problemNumber) {
        if (!problemGroups.has(problemNumber)) {
          problemGroups.set(problemNumber, []);
        }
        problemGroups.get(problemNumber)!.push({ block, order: index });
      }
    } catch (error) {
      parseErrors.push(`ブロック前処理エラー: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  
  // 各グループを処理
  for (const [problemNumber, blocks] of problemGroups.entries()) {
    try {
      const groupProblems = parseProblemGroup(problemNumber, blocks);
      problems.push(...groupProblems);
    } catch (error) {
      parseErrors.push(`グループ解析エラー (問題${problemNumber}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  return {
    problems,
    totalProblems: problems.length,
    parseErrors
  };
}

/**
 * 問題番号でグループ化された問題群を解析
 */
function parseProblemGroup(problemNumber: string, blocks: Array<{block: string, order: number}>): Problem[] {
  const problems: Problem[] = [];
  
  // 順序でソート
  blocks.sort((a, b) => a.order - b.order);
  
  // 各ブロックから情報を抽出
  const subProblems: Array<{
    prompt: string;
    answer: string;
    scoreLabel: string;
    order: number;
  }> = [];
  
  for (const { block, order } of blocks) {
    const blockInfo = parseBlockInfo(block);
    if (blockInfo.prompt && blockInfo.answer) {
      subProblems.push({
        prompt: blockInfo.prompt,
        answer: blockInfo.answer,
        scoreLabel: blockInfo.scoreLabel,
        order
      });
    }
  }
  
  // 小問記号を検出してグループ化
  if (subProblems.length > 1) {
    const firstPrompt = subProblems[0].prompt;
    const hasCircledNumbers = /[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]/.test(firstPrompt);
    const hasNumberedParens = /\(\d+\)/.test(firstPrompt);
    
    if (hasCircledNumbers) {
      return createCircledProblems(subProblems, problemNumber);
    } else if (hasNumberedParens) {
      return createNumberedProblems(subProblems, problemNumber);
    }
  }
  
  // 小問記号が見つからない場合、個別問題として扱う
  subProblems.forEach((subProblem, index) => {
    problems.push({
      id: generateId(),
      type: "free" as const,
      prompt: subProblem.prompt,
      answer: subProblem.answer,
      explanation: `問題${problemNumber}-${index + 1}`,
      meta: {
        originalProblemNumber: problemNumber,
        scoreLabel: subProblem.scoreLabel,
        subProblemIndex: index + 1
      }
    });
  });
  
  return problems;
}

/**
 * 個別の問題ブロックを解析
 */
function parseBlockInfo(block: string): {prompt: string; answer: string; scoreLabel: string} {
  const lines = block.split('\n').map(line => line.trim()).filter(line => line);
  
  let prompt = '';
  let answer = '';
  let scoreLabel = '';
  
  for (const line of lines) {
    if (line.startsWith('- 問題:')) {
      prompt = line.replace('- 問題:', '').trim();
    } else if (line.startsWith('- 解答:')) {
      answer = line.replace('- 解答:', '').trim();
    } else if (line.startsWith('- 配点ラベル:')) {
      scoreLabel = line.replace('- 配点ラベル:', '').trim();
    }
  }
  
  return { prompt, answer, scoreLabel };
}

/**
 * ①②③形式の小問群を作成
 */
function createCircledProblems(subProblems: Array<{prompt: string; answer: string; scoreLabel: string; order: number}>, problemNumber: string): Problem[] {
  const problems: Problem[] = [];
  const circledNumbers = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳'];
  
  // 基本問題文を抽出（最初の問題から小問記号より前の部分）
  const firstPrompt = subProblems[0].prompt;
  const basePrompt = firstPrompt.split(/[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]/)[0].trim();
  
  subProblems.forEach((subProblem, index) => {
    const circledSymbol = circledNumbers[index];
    const symbolMatch = subProblem.prompt.match(new RegExp(`(${circledSymbol}[^①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]*)`));
    const subPromptText = symbolMatch ? symbolMatch[1] : subProblem.prompt;
    
    problems.push({
      id: generateId(),
      type: "free" as const,
      prompt: `${basePrompt} ${subPromptText}`,
      answer: subProblem.answer,
      explanation: `問題${problemNumber}-${circledSymbol}`,
      meta: {
        originalProblemNumber: problemNumber,
        scoreLabel: subProblem.scoreLabel,
        subProblemIndex: index + 1,
        subProblemSymbol: circledSymbol
      }
    });
  });
  
  return problems;
}

/**
 * (1)(2)(3)形式の小問群を作成
 */
function createNumberedProblems(subProblems: Array<{prompt: string; answer: string; scoreLabel: string; order: number}>, problemNumber: string): Problem[] {
  const problems: Problem[] = [];
  
  // 基本問題文を抽出（最初の問題から小問記号より前の部分）
  const firstPrompt = subProblems[0].prompt;
  const basePrompt = firstPrompt.split(/\(\d+\)/)[0].trim();
  
  subProblems.forEach((subProblem, index) => {
    const numberMatch = subProblem.prompt.match(/\((\d+)\)/);
    const subNumber = numberMatch ? numberMatch[1] : (index + 1).toString();
    const numberedSymbol = `(${subNumber})`;
    
    // 小問部分のテキストを抽出
    const symbolMatch = subProblem.prompt.match(/(\(\d+\)[^(]*)/);
    const subPromptText = symbolMatch ? symbolMatch[1] : subProblem.prompt;
    
    problems.push({
      id: generateId(),
      type: "free" as const,
      prompt: `${basePrompt} ${subPromptText}`,
      answer: subProblem.answer,
      explanation: `問題${problemNumber}-${numberedSymbol}`,
      meta: {
        originalProblemNumber: problemNumber,
        scoreLabel: subProblem.scoreLabel,
        subProblemIndex: parseInt(subNumber),
        subProblemSymbol: numberedSymbol
      }
    });
  });
  
  return problems;
}

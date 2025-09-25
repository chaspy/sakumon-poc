import { GoogleGenerativeAI } from "@google/generative-ai";

// Gemini APIキーの確認
const getGeminiApiKey = (): string => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error('GEMINI_API_KEY environment variable is not set or empty');
  }
  return apiKey.trim();
};

// Geminiクライアントの初期化
export const getGemini = () => {
  const apiKey = getGeminiApiKey();
  return new GoogleGenerativeAI(apiKey);
};

/**
 * Gemini Vision APIを使用して画像からテキストを抽出
 */
export async function extractTextFromImageWithGemini(
  imageBuffer: Buffer, 
  structuredOutput: boolean = false
): Promise<string> {
  const genAI = getGemini();
  
  // 画像形式を検出（簡易版）
  const getImageMimeType = (buffer: Buffer): string => {
    const signatures = {
      'image/png': [0x89, 0x50, 0x4E, 0x47],
      'image/jpeg': [0xFF, 0xD8, 0xFF],
      'image/gif': [0x47, 0x49, 0x46],
      'image/bmp': [0x42, 0x4D],
      'image/webp': [0x57, 0x45, 0x42, 0x50]
    };
    
    for (const [format, signature] of Object.entries(signatures)) {
      if (signature.every((byte, i) => buffer[i] === byte)) {
        return format;
      }
    }
    return 'image/png'; // デフォルト
  };

  const mimeType = getImageMimeType(imageBuffer);
  
  const basePrompt = structuredOutput 
    ? `画像を分析して、テスト問題を以下の形式で出力してください：

問題1:
- 問題番号: 1
- 問題: [問題文]
- 解答: [正答]
- 配点: [配点（見つからない場合は[不明]）]
- 配点ラベル: [配点に関する説明（見つからない場合は[不明]）]

問題2:
- 問題番号: 2
- 問題: [問題文]
- 解答: [正答]
- 配点: [配点（見つからない場合は[不明]）]
- 配点ラベル: [配点に関する説明（見つからない場合は[不明]）]

（問題が複数ある場合は続ける）

注意：
- 前置きや説明は一切不要です
- 上記の形式のみで回答してください
- 数式や記号も正確に転写してください`
    : `画像に含まれるすべてのテキストを文字起こししてください。

注意：
- 前置きや説明は一切不要です
- 画像の内容のみを出力してください
- レイアウトを可能な限り保持してください
- 数式や記号も正確に転写してください`;

  try {
    // デバッグ情報
    console.log(`[Gemini] Processing image: ${mimeType}, size: ${imageBuffer.length} bytes`);
    
    // Gemini 2.5 Proモデルを使用
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash-exp",
      generationConfig: {
        temperature: 0,
        topK: 1,
        topP: 1,
        maxOutputTokens: 8192,
      }
    });

    // 画像データを準備
    const imageParts = {
      inlineData: {
        data: imageBuffer.toString('base64'),
        mimeType: mimeType
      }
    };

    // Gemini APIを呼び出し
    const result = await model.generateContent([basePrompt, imageParts]);
    const response = await result.response;
    const text = response.text();

    console.log(`[Gemini] Response length: ${text.length} chars`);
    console.log(`[Gemini] Response preview: ${text.substring(0, 200)}...`);

    return text;

  } catch (error: any) {
    console.error("[Gemini] Vision API failed:", error);
    
    // 詳細なエラー情報をログ出力
    if (error.response) {
      console.error("[Gemini] Error response:", error.response.data);
    }
    
    throw new Error(`Gemini APIでの画像処理に失敗しました: ${error?.message || String(error)}`);
  }
}

/**
 * Gemini APIの利用可能性をチェック
 */
export function isGeminiAvailable(): boolean {
  const apiKey = process.env.GEMINI_API_KEY;
  return !!(apiKey && apiKey.trim().length > 0);
}

/**
 * 使用可能なモデル一覧を取得
 */
export function getAvailableModels(): string[] {
  const models = ['openai'];
  
  if (isGeminiAvailable()) {
    models.push('gemini');
  }
  
  return models;
}
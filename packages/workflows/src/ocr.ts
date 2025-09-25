import fs from "fs";
import path from "path";
import { promisify } from "util";
import sharp from "sharp";
import { getOpenAI, MODELS } from "./openai";
import { extractTextFromImageWithGemini, isGeminiAvailable, getAvailableModels } from "./gemini";

// 利用可能なモデル一覧をexport
export { getAvailableModels };

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const unlink = promisify(fs.unlink);

export interface OCRResult {
  text: string;
  confidence: number;
  processedPages: number;
}

export interface OCROptions {
  dpi?: number;
  maxPages?: number;
  quality?: number;
  structuredOutput?: boolean;
  model?: 'openai' | 'gemini';
}

/**
 * PDFをOCRして文字を抽出する（一時的に無効化）
 */
export async function extractTextFromPDF(
  pdfBuffer: Buffer,
  options: OCROptions = {}
): Promise<OCRResult> {
  throw new Error('PDF処理は現在メンテナンス中です。画像ファイル（PNG、JPG）をご利用ください。');
}

/**
 * 画像からテキストを抽出（モデル選択対応） - 外部呼び出し用
 */
export async function extractTextFromImage(
  imageBuffer: Buffer, 
  structuredOutput: boolean = false,
  model: 'openai' | 'gemini' = 'openai'
): Promise<string> {
  // モデル選択
  if (model === 'gemini' && isGeminiAvailable()) {
    return await extractTextFromImageWithGemini(imageBuffer, structuredOutput);
  } else {
    return await extractTextFromImageInternal(imageBuffer, structuredOutput);
  }
}

/**
 * 画像からテキストを抽出（内部関数）
 */
async function extractTextFromImageInternal(imageBuffer: Buffer, structuredOutput: boolean = false): Promise<string> {
  const openai = getOpenAI();
  const base64Image = imageBuffer.toString('base64');
  
  // 画像形式を検出（簡易版）
  const getImageMimeType = (buffer: Buffer): string => {
    const signatures = {
      'png': [0x89, 0x50, 0x4E, 0x47],
      'jpg': [0xFF, 0xD8, 0xFF],
      'jpeg': [0xFF, 0xD8, 0xFF], 
      'gif': [0x47, 0x49, 0x46],
      'bmp': [0x42, 0x4D],
      'webp': [0x57, 0x45, 0x42, 0x50]
    };
    
    for (const [format, signature] of Object.entries(signatures)) {
      if (signature.every((byte, i) => buffer[i] === byte)) {
        return format === 'jpg' ? 'jpeg' : format;
      }
    }
    return 'png'; // デフォルト
  };
  
  const imageFormat = getImageMimeType(imageBuffer);
  const dataUri = `data:image/${imageFormat};base64,${base64Image}`;
  
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
    console.log(`[OCR] Image format: ${imageFormat}, size: ${imageBuffer.length} bytes`);
    console.log(`[OCR] Base64 prefix: ${dataUri.substring(0, 50)}...`);
    
    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      temperature: 0,
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: basePrompt },
          { type: "input_image", image_url: dataUri }
        ]
      }]
    } as any);
    
    const result = (response as any).output_text || "";
    console.log(`[OCR] Response length: ${result.length} chars`);
    console.log(`[OCR] Response preview: ${result.substring(0, 200)}...`);
    
    return result;
    
  } catch (error) {
    console.error("[OCR] Vision API failed:", error);
    
    // フォールバック: より簡単なプロンプトで再試行
    try {
      const fallbackResponse = await openai.responses.create({
        model: "gpt-4o-mini",
        temperature: 0,
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: "画像内のテキストをすべて文字起こししてください。前置きや説明は不要です。" },
            { type: "input_image", image_url: dataUri }
          ]
        }]
      } as any);
      
      return (fallbackResponse as any).output_text || "";
    } catch (fallbackError) {
      console.error("[OCR] Fallback also failed:", fallbackError);
      throw new Error("画像からテキストを抽出できませんでした");
    }
  }
}

/**
 * OCR結果の後処理（ノイズ除去、整形等）
 */
export function postProcessOCRText(text: string): string {
  return text
    // 連続する空白行を1つに統合
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    // 行末の不要なスペースを除去
    .replace(/[ \t]+$/gm, '')
    // 先頭・末尾の空白を除去
    .trim();
}
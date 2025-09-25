import fs from "fs";
import path from "path";
import { promisify } from "util";
import * as pdfjsLib from "pdfjs-dist";
import { createCanvas } from "canvas";

const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);

// PDF.jsワーカーを無効化（Node.js環境）
pdfjsLib.GlobalWorkerOptions.workerSrc = '';

export interface PDFPageImage {
  pageNumber: number;
  imageBuffer: Buffer;
  width: number;
  height: number;
}

/**
 * PDFを画像配列に変換（PDF.js使用）
 */
export async function convertPdfToImages(
  pdfBuffer: Buffer,
  options: {
    maxPages?: number;
    scale?: number;
  } = {}
): Promise<PDFPageImage[]> {
  const { maxPages = 10, scale = 2.0 } = options;
  
  try {
    // PDFドキュメントを読み込み
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer),
      verbosity: 0 // ログを無効化
    });
    
    const pdfDoc = await loadingTask.promise;
    const numPages = Math.min(pdfDoc.numPages, maxPages);
    const pageImages: PDFPageImage[] = [];
    
    console.log(`[PDF] Converting ${numPages} pages to images (scale: ${scale})`);
    
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      try {
        const page = await pdfDoc.getPage(pageNum);
        
        // ページサイズを取得
        const viewport = page.getViewport({ scale });
        const { width, height } = viewport;
        
        // Canvasを作成
        const canvas = createCanvas(width, height);
        const context = canvas.getContext('2d');
        
        // PDFページをCanvasに描画
        const renderContext = {
          canvasContext: context as any,
          viewport: viewport,
          canvas: canvas as any,
        };
        
        await page.render(renderContext as any).promise;
        
        // CanvasをPNG Bufferに変換
        const imageBuffer = canvas.toBuffer('image/png');
        
        pageImages.push({
          pageNumber: pageNum,
          imageBuffer,
          width,
          height
        });
        
        console.log(`[PDF] Converted page ${pageNum}/${numPages} (${width}x${height})`);
        
        // メモリ解放
        page.cleanup();
        
      } catch (pageError) {
        console.warn(`[PDF] Failed to process page ${pageNum}:`, pageError);
      }
    }
    
    // PDFドキュメントを閉じる
    pdfDoc.destroy();
    
    return pageImages;
    
  } catch (error: any) {
    console.error("[PDF] PDF processing failed:", error);
    throw new Error(`PDF処理に失敗しました: ${error?.message || String(error)}`);
  }
}

/**
 * PDFの簡易情報を取得
 */
export async function getPdfInfo(pdfBuffer: Buffer): Promise<{
  numPages: number;
  title?: string;
  author?: string;
}> {
  try {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer),
      verbosity: 0
    });
    
    const pdfDoc = await loadingTask.promise;
    const metadata = await pdfDoc.getMetadata();
    
    const info = {
      numPages: pdfDoc.numPages,
      title: (metadata.info as any)?.Title,
      author: (metadata.info as any)?.Author
    };
    
    pdfDoc.destroy();
    return info;
    
  } catch (error) {
    console.error("[PDF] Failed to get PDF info:", error);
    throw new Error("PDF情報の取得に失敗しました");
  }
}
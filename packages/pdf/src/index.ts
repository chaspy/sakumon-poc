import puppeteer from "puppeteer";
import { buildHtml } from "./template";
import type { Problem } from "@sakumon/schemas";

export async function renderPdfToBuffer(title: string, items: Problem[], opts?: { answerSheet?: boolean; fontPath?: string }) {
  const html = buildHtml(title, new Date().toLocaleDateString("ja-JP"), items, { answerSheet: opts?.answerSheet });
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });
  // MathJax typeset待機
  try {
    await page.waitForFunction(() => (window as any).MathJax?.typesetPromise, { timeout: 3000 });
    await page.evaluate(async () => {
      // @ts-ignore
      if (window.MathJax && window.MathJax.typesetPromise) await window.MathJax.typesetPromise();
    });
  } catch {}
  const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "20mm", bottom: "20mm", left: "16mm", right: "16mm" } });
  await browser.close();
  return pdf;
}


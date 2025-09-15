import type { Problem } from "@sakumon/schemas";

export function buildHtml(title: string, dateStr: string, items: Problem[], opts?: { answerSheet?: boolean }) {
  const css = `
  * { box-sizing: border-box; }
  body { font-family: 'Noto Sans CJK JP', system-ui, -apple-system, BlinkMacSystemFont, 'Hiragino Kaku Gothic ProN', 'Yu Gothic', Meiryo, sans-serif; margin: 24px; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  h2 { font-size: 16px; margin: 16px 0 8px; }
  ol { padding-left: 20px; }
  .q { break-inside: avoid; margin-bottom: 12px; }
  .rubric { font-size: 12px; color: #444; margin-top: 6px; }
  .page-break { page-break-before: always; }
  .footer { position: fixed; bottom: 8px; width: 100%; text-align: center; font-size: 10px; color: #666; }
  `;

  const qHtml = items
    .map((p, i) => {
      if (!opts?.answerSheet) {
        const choicesHtml = p.type === "mcq" && p.choices ? '<ol type="A">' + p.choices.map((c: string) => '<li>' + escapeHtml(c) + '</li>').join('') + '</ol>' : '';
        return `<div class="q"><b>第${i + 1}問</b><div class="prompt">${escapeHtml(p.prompt)}</div>${choicesHtml}</div>`;
      }
      const rubricHtml = p.rubric ? `<div class="rubric">Rubric: ${escapeHtml(JSON.stringify(p.rubric))}</div>` : '';
      const ansLabel = (p.type === 'mcq' && (p as any).choices)
        ? (() => { const choices = (p as any).choices as string[]; const idx = choices.indexOf(p.answer as any); return idx >= 0 ? `（${String.fromCharCode(65 + idx)}）` : ''; })()
        : '';
      return `<div class="q"><b>第${i + 1}問 解答</b><div>答: ${ansLabel} ${escapeHtml(p.answer)}</div><div class="ex">${p.explanation ? escapeHtml(p.explanation) : ''}</div>${rubricHtml}</div>`;
    })
    .join("");

  return `<!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <style>${css}</style>
    <script>
      window.MathJax = { tex: { inlineMath: [['\\\(','\\\)'], ['$', '$']] }, svg: { fontCache: 'global' } };
    </script>
    <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js"></script>
  </head>
  <body>
    <h1>${escapeHtml(title)}</h1>
    <div>${escapeHtml(dateStr)}</div>
    <h2>${opts?.answerSheet ? '解答' : '問題'}</h2>
    ${qHtml}
    <div class="footer">sakumon-poc</div>
  </body>
  </html>`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

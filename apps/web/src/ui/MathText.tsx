import React, { useEffect, useRef } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

interface MathTextProps {
  text: string
  className?: string
  style?: React.CSSProperties
}

/**
 * LaTeX数式を含むテキストをレンダリングするコンポーネント
 * $...$ でインライン数式、$$...$$ でブロック数式をサポート
 */
export function MathText({ text, className, style }: MathTextProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current || !text) return

    // テキストを数式と通常テキストに分割
    const parts: Array<{ type: 'text' | 'math' | 'displayMath', content: string }> = []
    let remaining = text
    let lastIndex = 0

    // $$...$$ (display math) を先に処理
    const displayMathRegex = /\$\$(.*?)\$\$/gs
    const displayMatches = Array.from(text.matchAll(displayMathRegex))

    // $...$ (inline math) を処理
    const inlineMathRegex = /\$([^$]+)\$/g
    const inlineMatches = Array.from(text.matchAll(inlineMathRegex))

    // すべてのマッチを位置順にソート
    const allMatches = [
      ...displayMatches.map(m => ({ match: m, type: 'displayMath' as const })),
      ...inlineMatches.map(m => ({ match: m, type: 'math' as const }))
    ].sort((a, b) => (a.match.index || 0) - (b.match.index || 0))

    // 重複を除去（display mathが優先）
    const filteredMatches = allMatches.filter((m, i) => {
      if (m.type === 'displayMath') return true
      const index = m.match.index || 0
      const endIndex = index + m.match[0].length
      // このinline mathが他のdisplay mathと重複していないかチェック
      return !displayMatches.some(dm => {
        const dmIndex = dm.index || 0
        const dmEndIndex = dmIndex + dm[0].length
        return index >= dmIndex && endIndex <= dmEndIndex
      })
    })

    lastIndex = 0
    for (const { match, type } of filteredMatches) {
      const index = match.index || 0

      // マッチ前のテキスト
      if (index > lastIndex) {
        parts.push({ type: 'text', content: text.slice(lastIndex, index) })
      }

      // 数式部分
      parts.push({
        type: type,
        content: match[1]
      })

      lastIndex = index + match[0].length
    }

    // 残りのテキスト
    if (lastIndex < text.length) {
      parts.push({ type: 'text', content: text.slice(lastIndex) })
    }

    // DOMをクリアして再構築
    containerRef.current.innerHTML = ''

    parts.forEach(part => {
      if (part.type === 'text') {
        // 通常のテキストノード
        const textNode = document.createTextNode(part.content)
        containerRef.current!.appendChild(textNode)
      } else if (part.type === 'math') {
        // インライン数式
        const span = document.createElement('span')
        try {
          katex.render(part.content, span, {
            throwOnError: false,
            displayMode: false
          })
        } catch (e) {
          console.error('KaTeX render error:', e)
          span.textContent = `$${part.content}$`
        }
        containerRef.current!.appendChild(span)
      } else if (part.type === 'displayMath') {
        // ブロック数式
        const div = document.createElement('div')
        div.style.textAlign = 'center'
        div.style.margin = '1em 0'
        try {
          katex.render(part.content, div, {
            throwOnError: false,
            displayMode: true
          })
        } catch (e) {
          console.error('KaTeX render error:', e)
          div.textContent = `$$${part.content}$$`
        }
        containerRef.current!.appendChild(div)
      }
    })
  }, [text])

  return <div ref={containerRef} className={className} style={style} />
}

/**
 * 編集モード用の生テキスト表示コンポーネント
 */
export function RawMathText({ text, className, style }: MathTextProps) {
  return <div className={className} style={style}>{text}</div>
}
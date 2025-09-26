import React from 'react'
import { MathText } from './MathText'

type GradingResult = {
  totalScore: number
  maxScore: number
  percentage: number
  results: Array<{
    problemId: string
    type: 'mcq' | 'free'
    correct?: boolean
    expected?: string
    mark?: '○' | '△' | '×'
    comment?: string
    userAnswer: string
  }>
  summary: {
    totalProblems: number
    mcqProblems: number
    freeProblems: number
  }
}

type Problem = {
  id: string
  type: 'mcq' | 'free'
  prompt: string
  choices?: string[]
  answer: string
  explanation?: string
  meta?: {
    originalProblemNumber?: string
    subProblemIndex?: number
    subProblemSymbol?: string
    scoreLabel?: string
  }
}

interface ResultDisplayProps {
  result: GradingResult
  problems: Problem[]
  onBack: () => void
  onRetry: () => void
}

export function ResultDisplay({ result, problems, onBack, onRetry }: ResultDisplayProps) {
  const getScoreColor = (percentage: number) => {
    if (percentage >= 80) return '#28a745'  // 緑色
    if (percentage >= 60) return '#ffc107'  // 黄色
    return '#dc3545'  // 赤色
  }

  const getGradeText = (percentage: number) => {
    if (percentage >= 90) return '優秀'
    if (percentage >= 80) return '良好'
    if (percentage >= 70) return '普通'
    if (percentage >= 60) return '要復習'
    return '要再学習'
  }

  // 問題IDから問題オブジェクトを取得
  const getProblemById = (problemId: string) => {
    return problems.find(p => p.id === problemId)
  }

  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span>📊 採点結果</span>
          <span style={{
            padding: '4px 12px',
            borderRadius: '16px',
            fontSize: '0.85rem',
            fontWeight: '600',
            backgroundColor: getScoreColor(result.percentage),
            color: 'white'
          }}>
            {result.percentage}点 ({getGradeText(result.percentage)})
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn primary" onClick={onRetry} style={{ padding: '6px 16px' }}>
            🔄 再挑戦
          </button>
          <button className="btn ghost" onClick={onBack} style={{ padding: '6px 16px' }}>
            🏠 最初に戻る
          </button>
        </div>
      </div>

      <div className="card-body" style={{ padding: '24px' }}>
        {/* 総合結果サマリー */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '20px',
          marginBottom: '32px'
        }}>
          <div style={{
            padding: '20px',
            backgroundColor: '#f8f9fa',
            borderRadius: '12px',
            textAlign: 'center',
            border: `3px solid ${getScoreColor(result.percentage)}`
          }}>
            <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: getScoreColor(result.percentage), marginBottom: '8px' }}>
              {result.percentage}
            </div>
            <div style={{ fontSize: '1.2rem', fontWeight: '600', marginBottom: '4px' }}>
              得点率
            </div>
            <div style={{ fontSize: '0.9rem', color: '#6c757d' }}>
              {result.totalScore} / {result.maxScore} 点
            </div>
          </div>

          <div style={{ padding: '20px', backgroundColor: '#e3f2fd', borderRadius: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1976d2', marginBottom: '8px' }}>
              {result.summary.totalProblems}
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '4px' }}>
              総問題数
            </div>
            <div style={{ fontSize: '0.8rem', color: '#6c757d' }}>
              記述式: {result.summary.freeProblems}問<br />
              選択式: {result.summary.mcqProblems}問
            </div>
          </div>

          <div style={{ padding: '20px', backgroundColor: '#e8f5e8', borderRadius: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#2e7d32', marginBottom: '8px' }}>
              {result.results.filter(r => r.correct === true || r.mark === '○').length}
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '4px' }}>
              正解数
            </div>
            <div style={{ fontSize: '0.8rem', color: '#6c757d' }}>
              正答率: {Math.round((result.results.filter(r => r.correct === true || r.mark === '○').length / result.summary.totalProblems) * 100)}%
            </div>
          </div>
        </div>

        {/* 詳細結果 */}
        <div style={{
          border: '1px solid #dee2e6',
          borderRadius: '12px',
          overflow: 'hidden',
          backgroundColor: '#fff'
        }}>
          <div style={{
            padding: '16px',
            backgroundColor: '#f8f9fa',
            borderBottom: '1px solid #dee2e6',
            fontWeight: '600',
            fontSize: '1.1rem'
          }}>
            📝 問題別採点結果
          </div>

          <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
            {result.results.map((resultItem, index) => {
              const problem = getProblemById(resultItem.problemId)
              if (!problem) return null

              const isCorrect = resultItem.correct === true || resultItem.mark === '○'
              const isPartial = resultItem.mark === '△'
              const isIncorrect = resultItem.correct === false || resultItem.mark === '×'

              return (
                <div key={resultItem.problemId} style={{
                  padding: '20px',
                  borderBottom: index < result.results.length - 1 ? '1px solid #f0f0f0' : 'none',
                  backgroundColor: index % 2 === 0 ? '#fdfdfd' : '#fff'
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                    {/* 採点マーク */}
                    <div style={{
                      width: '50px',
                      height: '50px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.5rem',
                      fontWeight: 'bold',
                      backgroundColor: isCorrect ? '#d4edda' : isPartial ? '#fff3cd' : '#f8d7da',
                      color: isCorrect ? '#155724' : isPartial ? '#856404' : '#721c24',
                      flexShrink: 0
                    }}>
                      {resultItem.type === 'mcq' 
                        ? (isCorrect ? '○' : '×')
                        : (resultItem.mark || '×')
                      }
                    </div>

                    {/* 問題内容 */}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div style={{ fontWeight: '600', fontSize: '1.1rem' }}>
                          問題 {index + 1}
                          {problem.meta?.originalProblemNumber && (
                            <span style={{ marginLeft: '8px', color: '#6c757d', fontSize: '0.9rem' }}>
                              (大問{problem.meta.originalProblemNumber}
                              {problem.meta.subProblemSymbol && ` ${problem.meta.subProblemSymbol}`})
                            </span>
                          )}
                        </div>
                        {problem.meta?.scoreLabel && (
                          <span style={{
                            padding: '2px 8px',
                            backgroundColor: '#e3f2fd',
                            color: '#1565c0',
                            borderRadius: '12px',
                            fontSize: '0.8rem'
                          }}>
                            {problem.meta.scoreLabel}
                          </span>
                        )}
                      </div>

                      {/* 問題文 */}
                      <div style={{
                        padding: '12px',
                        backgroundColor: '#f8f9fa',
                        borderRadius: '8px',
                        marginBottom: '12px',
                        fontSize: '0.9rem'
                      }}>
                        <MathText text={problem.prompt} />
                      </div>

                      {/* 回答と正解の比較 */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '16px'
                      }}>
                        <div>
                          <div style={{ fontSize: '0.85rem', color: '#6c757d', marginBottom: '4px', fontWeight: '600' }}>
                            あなたの回答:
                          </div>
                          <div style={{
                            padding: '8px 12px',
                            backgroundColor: isCorrect ? '#d4edda' : isPartial ? '#fff3cd' : '#f8d7da',
                            borderRadius: '6px',
                            fontSize: '0.9rem'
                          }}>
                            {resultItem.userAnswer || <span style={{ color: '#999', fontStyle: 'italic' }}>未回答</span>}
                          </div>
                        </div>
                        
                        <div>
                          <div style={{ fontSize: '0.85rem', color: '#6c757d', marginBottom: '4px', fontWeight: '600' }}>
                            正解:
                          </div>
                          <div style={{
                            padding: '8px 12px',
                            backgroundColor: '#d4edda',
                            borderRadius: '6px',
                            fontSize: '0.9rem'
                          }}>
                            {resultItem.expected || problem.answer}
                          </div>
                        </div>
                      </div>

                      {/* コメント（Free問題の場合） */}
                      {resultItem.comment && (
                        <div style={{ marginTop: '12px' }}>
                          <div style={{ fontSize: '0.85rem', color: '#6c757d', marginBottom: '4px', fontWeight: '600' }}>
                            採点コメント:
                          </div>
                          <div style={{
                            padding: '8px 12px',
                            backgroundColor: '#e3f2fd',
                            borderRadius: '6px',
                            fontSize: '0.9rem',
                            color: '#1565c0',
                            whiteSpace: 'pre-line'
                          }}>
                            {resultItem.comment}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 学習アドバイス */}
        <div style={{
          marginTop: '24px',
          padding: '20px',
          backgroundColor: '#f8f9fa',
          borderRadius: '12px',
          border: '1px solid #dee2e6'
        }}>
          <div style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            💡 学習アドバイス
          </div>
          <div style={{ fontSize: '0.95rem', lineHeight: '1.6', color: '#495057' }}>
            {result.percentage >= 80 
              ? '素晴らしい結果です！この調子で学習を続けましょう。'
              : result.percentage >= 60 
                ? '良い結果です。間違えた問題を復習して理解を深めましょう。'
                : '基礎的な内容から復習することをお勧めします。諦めずに頑張りましょう！'
            }
            {result.summary.freeProblems > 0 && (
              <span>
                <br />記述式問題では部分点も考慮されています。解答プロセスも大切にしましょう。
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

import React, { useState } from 'react'
import { MathText } from './MathText'

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

interface ProblemSolverProps {
  problems: Problem[]
  imageData: string
  userAnswers: Record<string, string>
  onAnswerChange: (problemId: string, answer: string) => void
  onSubmit: () => void
  onBack: () => void
  submitting: boolean
  submitError: string | null
}

export function ProblemSolver({
  problems,
  imageData,
  userAnswers,
  onAnswerChange,
  onSubmit,
  onBack,
  submitting,
  submitError
}: ProblemSolverProps) {
  const [currentProblemIndex, setCurrentProblemIndex] = useState(0)
  
  const currentProblem = problems[currentProblemIndex]
  const isLastProblem = currentProblemIndex === problems.length - 1
  const isFirstProblem = currentProblemIndex === 0

  const nextProblem = () => {
    if (!isLastProblem) {
      setCurrentProblemIndex(prev => prev + 1)
    }
  }

  const prevProblem = () => {
    if (!isFirstProblem) {
      setCurrentProblemIndex(prev => prev - 1)
    }
  }

  const handleAnswerChange = (answer: string) => {
    onAnswerChange(currentProblem.id, answer)
  }

  // 回答済み問題数を計算
  const answeredCount = Object.keys(userAnswers).filter(key => userAnswers[key]?.trim()).length
  const progressPercentage = Math.round((answeredCount / problems.length) * 100)

  return (
    <div className="card" style={{ maxHeight: '90vh', overflow: 'hidden' }}>
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          問題を解く ({currentProblemIndex + 1} / {problems.length})
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ fontSize: '0.9rem', color: '#6c757d' }}>
            回答済み: {answeredCount} / {problems.length} ({progressPercentage}%)
          </div>
          <button className="btn ghost" onClick={onBack} style={{ padding: '6px 12px' }}>
            ← OCRに戻る
          </button>
        </div>
      </div>
      
      <div className="card-body" style={{ display: 'flex', height: 'calc(90vh - 80px)', gap: '20px', padding: '20px', overflowY: 'auto' }}>
        {/* 左側: 画像表示 */}
        <div style={{ flex: '1', minWidth: '300px' }}>
          <div style={{
            border: '1px solid #dee2e6',
            borderRadius: '8px',
            overflow: 'hidden',
            height: '100%',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{
              padding: '12px',
              backgroundColor: '#f8f9fa',
              borderBottom: '1px solid #dee2e6',
              fontWeight: '600',
              fontSize: '0.9rem'
            }}>
              元画像
            </div>
            <div style={{
              flex: 1,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '20px',
              backgroundColor: '#fff'
            }}>
              <img
                src={imageData}
                alt="アップロードされた問題画像"
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  border: '1px solid #dee2e6',
                  borderRadius: '4px'
                }}
              />
            </div>
          </div>
        </div>

        {/* 右側: 問題と回答フォーム */}
        <div style={{ flex: '1', minWidth: '400px', display: 'flex', flexDirection: 'column' }}>
          {/* 問題ナビゲーション */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
            padding: '12px',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px'
          }}>
            <button
              className="btn ghost"
              onClick={prevProblem}
              disabled={isFirstProblem}
              style={{ padding: '8px 16px' }}
            >
              ← 前の問題
            </button>
            <div style={{ fontWeight: '600' }}>
              {currentProblem.meta?.originalProblemNumber && (
                <span>大問{currentProblem.meta.originalProblemNumber} </span>
              )}
              {currentProblem.meta?.subProblemSymbol && (
                <span>{currentProblem.meta.subProblemSymbol}</span>
              )}
            </div>
            <button
              className="btn ghost"
              onClick={nextProblem}
              disabled={isLastProblem}
              style={{ padding: '8px 16px' }}
            >
              次の問題 →
            </button>
          </div>

          {/* 問題表示エリア */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {/* 問題文 */}
            <div style={{
              border: '1px solid #dee2e6',
              borderRadius: '8px',
              marginBottom: '16px',
              backgroundColor: '#fff'
            }}>
              <div style={{
                padding: '10px',
                backgroundColor: '#f8f9fa',
                borderBottom: '1px solid #dee2e6',
                fontWeight: '600',
                fontSize: '0.9rem'
              }}>
                問題文
              </div>
              <div style={{
                padding: '16px',
                lineHeight: '1.6'
              }}>
                <MathText text={currentProblem.prompt} />
              </div>
              {currentProblem.meta?.scoreLabel && (
                <div style={{
                  padding: '8px 16px',
                  backgroundColor: '#e3f2fd',
                  borderTop: '1px solid #dee2e6',
                  fontSize: '0.85rem',
                  color: '#1565c0'
                }}>
                  配点: {currentProblem.meta.scoreLabel}
                </div>
              )}
            </div>

            {/* 回答入力エリア */}
            <div style={{
              border: '1px solid #dee2e6',
              borderRadius: '8px',
              backgroundColor: '#fff',
              minHeight: '120px'
            }}>
              <div style={{
                padding: '12px',
                backgroundColor: '#f8f9fa',
                borderBottom: '1px solid #dee2e6',
                fontWeight: '600',
                fontSize: '0.9rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span>あなたの回答</span>
                {userAnswers[currentProblem.id] && (
                  <span style={{ color: '#28a745', fontSize: '0.8rem' }}>✓ 回答済み</span>
                )}
              </div>
              <div style={{ padding: '16px' }}>
                {currentProblem.type === 'mcq' ? (
                  // MCQ問題（今回のテストデータにはないが、将来用）
                  <div>
                    {currentProblem.choices?.map((choice, idx) => (
                      <label key={idx} style={{
                        display: 'block',
                        marginBottom: '12px',
                        cursor: 'pointer',
                        padding: '12px',
                        border: '1px solid #dee2e6',
                        borderRadius: '6px',
                        backgroundColor: userAnswers[currentProblem.id] === choice ? '#e3f2fd' : 'transparent'
                      }}>
                        <input
                          type="radio"
                          name={`problem_${currentProblem.id}`}
                          value={choice}
                          checked={userAnswers[currentProblem.id] === choice}
                          onChange={(e) => handleAnswerChange(e.target.value)}
                          style={{ marginRight: '8px' }}
                        />
                        <span style={{ fontWeight: 'bold', marginRight: '8px' }}>
                          {String.fromCharCode(65 + idx)}.
                        </span>
                        <MathText text={choice} style={{ display: 'inline' }} />
                      </label>
                    ))}
                  </div>
                ) : (
                  // Free問題（記述式）
                  <input
                    type="text"
                    value={userAnswers[currentProblem.id] || ''}
                    onChange={(e) => handleAnswerChange(e.target.value)}
                    placeholder="答えを入力（例: x = 5, <, 3x + 2）"
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #dee2e6',
                      borderRadius: '6px',
                      fontSize: '1.1rem',
                      lineHeight: '1.5',
                      outline: 'none',
                      backgroundColor: '#fff'
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* 提出ボタン */}
          <div style={{
            position: 'sticky',
            bottom: 0,
            marginTop: '16px',
            padding: '16px',
            backgroundColor: '#f8f9fa',
            borderRadius: '12px',
            textAlign: 'center',
            boxShadow: '0 -6px 18px rgba(0, 0, 0, 0.08)',
            zIndex: 1
          }}>
            <button
              className="btn primary"
              onClick={onSubmit}
              disabled={submitting}
              style={{
                padding: '12px 28px',
                fontSize: '1rem',
                fontWeight: 600,
                backgroundColor: '#007bff',
                borderColor: '#007bff',
                width: '100%',
                maxWidth: '320px'
              }}
            >
              {submitting ? '⏳ 採点中...' : `📝 回答する！ (${answeredCount}/${problems.length}問回答済み)`}
            </button>
            <div style={{
              marginTop: '8px',
              fontSize: '0.8rem',
              color: '#6c757d'
            }}>
              未回答の問題があっても採点できます
            </div>
            {submitError && (
              <div style={{
                marginTop: '12px',
                fontSize: '0.85rem',
                color: '#dc3545'
              }}>
                {submitError}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

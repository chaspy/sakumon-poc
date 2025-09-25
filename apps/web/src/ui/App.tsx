import React, { useMemo, useState, useEffect } from 'react'
import './auth-theme.css'
import { MathText } from './MathText'
import { OCRUpload } from './OCRUpload'

type Problem = {
  id?: string
  type: 'mcq' | 'free'
  prompt: string
  choices?: string[]
  answer: string
  explanation?: string
  rubric?: any
}

type ConsistencyIssue = {
  field: string
  issue: string
  severity: 'critical' | 'warning' | 'info'
  suggestion?: string
}

type Suggestions = {
  prompt?: string[]
  choices?: string[]
  explanation?: string[]
}

type AgentResult = {
  success: boolean
  problem: Problem
  changes: string[]
  suggestions?: Suggestions
  consistencyReport?: {
    isConsistent: boolean
    issues: ConsistencyIssue[]
    confidence: number
  }
  qualityScore?: {
    overallScore: number
    metrics: {
      clarity: number
      difficulty: number
      educationalValue: number
      consistency: number
    }
  }
  toolsUsed: string[]
  reasoning: string
}

export function App() {
  const [items, setItems] = useState<Problem[]>([])

  // 新しい状態
  const [suggestions, setSuggestions] = useState<Record<string, Suggestions>>({})
  const [loadingSuggestions, setLoadingSuggestions] = useState<Set<string>>(new Set())
  const [consistencyStatus, setConsistencyStatus] = useState<Record<string, any>>({})
  const [agentProcessing, setAgentProcessing] = useState<Set<string>>(new Set())
  const [expandedProblem, setExpandedProblem] = useState<string | null>(null)
  const [customPrompts, setCustomPrompts] = useState<Record<string, {prompt?: string, choices?: string, explanation?: string}>>({})
  const [showCustomInput, setShowCustomInput] = useState<Record<string, {prompt?: boolean, choices?: boolean, explanation?: boolean}>>({})
  const [editMode, setEditMode] = useState<Record<string, {prompt?: boolean, choices?: boolean, answer?: boolean, explanation?: boolean}>>({})
  const [editValues, setEditValues] = useState<Record<string, {prompt?: string, choices?: string[], answer?: string, explanation?: string}>>({})

  const apiBase = 'http://localhost:3031'


  const fetchSuggestions = async (problemId: string) => {
    if (loadingSuggestions.has(problemId) || suggestions[problemId]) return

    setLoadingSuggestions(prev => new Set([...prev, problemId]))
    try {
      const res = await fetch(`${apiBase}/api/suggestions/${problemId}`)
      const json = await res.json()
      if (json.ok) {
        setSuggestions(prev => ({ ...prev, [problemId]: json.data }))
      }
    } catch (e) {
      console.error('Failed to fetch suggestions:', e)
    } finally {
      setLoadingSuggestions(prev => {
        const next = new Set(prev)
        next.delete(problemId)
        return next
      })
    }
  }

  const checkConsistency = async (problemId: string) => {
    const problem = items.find(p => p.id === problemId)
    if (!problem) return

    try {
      const res = await fetch(`${apiBase}/api/problems/${problemId}/check-consistency`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({})
      })
      const json = await res.json()
      if (json.ok) {
        setConsistencyStatus(prev => ({ ...prev, [problemId]: json.data }))
      }
    } catch (e) {
      console.error('Consistency check failed:', e)
    }
  }

  const processWithAgent = async (
    problemId: string,
    instruction: string,
    field?: 'prompt' | 'choices' | 'explanation',
    autoFix: boolean = true
  ) => {
    setAgentProcessing(prev => new Set([...prev, problemId]))
    try {
      const res = await fetch(`${apiBase}/api/agent/process`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ problemId, instruction, field, autoFix })
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error?.message || 'Agent processing failed')

      const result: AgentResult = json.data

      // 問題を更新
      if (result.success && result.problem) {
        setItems(prev => prev.map(p => p.id === problemId ? { ...result.problem, id: problemId } : p))
      }

      // 整合性状態を更新
      if (result.consistencyReport) {
        setConsistencyStatus(prev => ({ ...prev, [problemId]: result.consistencyReport }))
      }

      // サジェストを更新
      if (result.suggestions) {
        setSuggestions(prev => ({ ...prev, [problemId]: result.suggestions! }))
      }

      // フィードバックを表示
      if (result.changes.length > 0) {
        console.log(`変更適用: ${result.changes.join(', ')}`)
      }

      return result
    } catch (e: any) {
      alert(e.message)
    } finally {
      setAgentProcessing(prev => {
        const next = new Set(prev)
        next.delete(problemId)
        return next
      })
    }
  }

  const revise = async (problemId: string, scope: 'prompt'|'choices'|'explanation', instruction: string) => {
    // エージェントを使用して編集と整合性チェックを同時に実行
    await processWithAgent(problemId, instruction, scope, true)
  }

  const directUpdate = async (problemId: string, field: 'prompt'|'choices'|'answer'|'explanation', value: string | string[]) => {
    try {
      const res = await fetch(`${apiBase}/api/problems/${problemId}/update`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ field, value })
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error?.message || 'Update failed')

      // 問題を更新
      setItems(prev => prev.map(p => {
        if (p.id === problemId) {
          if (field === 'choices' && Array.isArray(value)) {
            return { ...p, [field]: value }
          } else if (typeof value === 'string') {
            return { ...p, [field]: value }
          }
        }
        return p
      }))

      // 編集モードを解除
      setEditMode(prev => ({ ...prev, [problemId]: { ...prev[problemId], [field]: false } }))
      setEditValues(prev => ({ ...prev, [problemId]: { ...prev[problemId], [field]: undefined } }))

      // 自動で整合性チェックを実行
      setTimeout(() => checkConsistency(problemId), 500)
    } catch (e: any) {
      alert(e.message)
    }
  }

  const startEdit = (problemId: string, field: 'prompt'|'choices'|'answer'|'explanation', currentValue: any) => {
    setEditMode(prev => ({ ...prev, [problemId]: { ...prev[problemId], [field]: true } }))
    setEditValues(prev => ({ ...prev, [problemId]: { ...prev[problemId], [field]: currentValue } }))
  }

  const cancelEdit = (problemId: string, field: 'prompt'|'choices'|'answer'|'explanation') => {
    setEditMode(prev => ({ ...prev, [problemId]: { ...prev[problemId], [field]: false } }))
    setEditValues(prev => ({ ...prev, [problemId]: { ...prev[problemId], [field]: undefined } }))
  }


  const getConsistencyIcon = (problemId: string) => {
    const status = consistencyStatus[problemId]
    if (!status) return null
    if (status.isConsistent) return <span style={{color:'#28a745'}}>✅</span>
    const hasCritical = status.issues?.some((i: ConsistencyIssue) => i.severity === 'critical')
    if (hasCritical) return <span style={{color:'#dc3545'}}>❌</span>
    return <span style={{color:'#ffc107'}}>⚠️</span>
  }

  return (
    <div className="auth-shell">
      <div className="brand">
        <div className="brand-title">スタディサプリ問題管理</div>
        <div className="brand-badge">for TEACHERS</div>
      </div>
      <div className="center-lane">
        {/* OCR機能 */}
        <OCRUpload apiBase={apiBase} />
        
        <div className="card">
          <div className="card-header">問題一覧</div>
          <div className="card-body">
            <div className="card-grid">
              {items.map((p, i)=> {
                  const ansLabel = p.type==='mcq' && p.choices ? (()=>{ const idx = p.choices.findIndex(c=>c===p.answer); return idx>=0 ? String.fromCharCode(65+idx) : '' })() : ''
                  const isProcessing = Boolean(p.id && agentProcessing.has(p.id))
                  const isExpanded = p.id === expandedProblem

                  return (
                  <div className="qcard" key={p.id||i} style={{opacity: isProcessing ? 0.7 : 1}}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                      <h4>第{i+1}問</h4>
                      <div style={{display:'flex', gap:'8px', alignItems:'center'}}>
                        {p.id && getConsistencyIcon(p.id)}
                        {p.id && (
                          <button
                            className="btn-suggest"
                            onClick={() => checkConsistency(p.id!)}
                            disabled={isProcessing}
                          >
                            整合性チェック
                          </button>
                        )}
                        {p.id && (
                          <button
                            className="btn-suggest"
                            onClick={() => processWithAgent(p.id!, 'この問題を総合的に改善してください')}
                            disabled={isProcessing}
                          >
                            AI改善
                          </button>
                        )}
                      </div>
                    </div>

                    {isProcessing && (
                      <div style={{padding:'10px', background:'#e3f2fd', borderRadius:'8px', marginBottom:'10px'}}>
                        <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                          <div className="spinner" style={{width:'20px', height:'20px'}}/>
                          <span style={{fontSize:'0.9rem', color:'#1976d2'}}>AIエージェントが処理中...</span>
                        </div>
                      </div>
                    )}

                    {/* 整合性の問題表示 */}
                    {p.id && consistencyStatus[p.id] && !consistencyStatus[p.id].isConsistent && (
                      <div style={{padding:'10px', background:'#fff3cd', borderRadius:'8px', marginBottom:'10px'}}>
                        <div style={{fontSize:'0.9rem', color:'#856404', marginBottom:'5px'}}>
                          ⚠️ 整合性の問題が検出されました:
                        </div>
                        {consistencyStatus[p.id].issues.map((issue: ConsistencyIssue, idx: number) => (
                          <div key={idx} style={{fontSize:'0.85rem', marginLeft:'20px', marginBottom:'3px'}}>
                            • {issue.issue} {issue.suggestion && `(提案: ${issue.suggestion})`}
                          </div>
                        ))}
                        {p.id && (
                          <button
                            className="btn-suggest"
                            style={{marginTop:'8px'}}
                            onClick={() => processWithAgent(p.id!, '検出された整合性の問題を自動修正してください', undefined, true)}
                          >
                            自動修正
                          </button>
                        )}
                      </div>
                    )}

                    {/* 問題文セクション */}
                    <div className="qcard-section">
                      <div className="section-label" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                        <span>問題文</span>
                        {p.id && !editMode[p.id]?.prompt && (
                          <button
                            className="edit-btn"
                            onClick={() => startEdit(p.id!, 'prompt', p.prompt)}
                          >
                            編集
                          </button>
                        )}
                      </div>
                      {editMode[p.id!]?.prompt ? (
                        <div>
                          <textarea
                            className="edit-textarea"
                            value={editValues[p.id!]?.prompt || ''}
                            onChange={(e) => setEditValues(prev => ({...prev, [p.id!]: {...prev[p.id!], prompt: e.target.value}}))}
                            style={{minHeight: '100px'}}
                          />
                          <div className="edit-actions">
                            <button
                              className="edit-save-btn"
                              onClick={() => directUpdate(p.id!, 'prompt', editValues[p.id!]?.prompt || '')}
                            >
                              保存
                            </button>
                            <button
                              className="edit-cancel-btn"
                              onClick={() => cancelEdit(p.id!, 'prompt')}
                            >
                              キャンセル
                            </button>
                          </div>
                        </div>
                      ) : (
                        <MathText text={p.prompt} className="section-content" style={{whiteSpace:'pre-wrap'}} />
                      )}
                      {p.id && (
                        <>
                          <div className="suggest-buttons">
                            {loadingSuggestions.has(p.id) ? (
                              <div style={{fontSize:'0.85rem', color:'#999'}}>サジェスト読み込み中...</div>
                            ) : suggestions[p.id]?.prompt ? (
                              <>
                                {suggestions[p.id].prompt!.map((suggest, idx) => (
                                  <button
                                    key={idx}
                                    className="btn-suggest"
                                    onClick={() => revise(p.id!, 'prompt', suggest)}
                                    disabled={isProcessing}
                                  >
                                    {suggest}
                                  </button>
                                ))}
                                <button
                                  className="btn-suggest"
                                  style={{backgroundColor: '#f0f0f0', fontWeight: 'bold'}}
                                  onClick={() => setShowCustomInput(prev => ({...prev, [p.id!]: {...prev[p.id!], prompt: !prev[p.id!]?.prompt}}))}
                                  disabled={isProcessing}
                                >
                                  ＋ カスタム改善
                                </button>
                              </>
                            ) : (
                              <button className="btn-suggest" onClick={() => fetchSuggestions(p.id!)}>
                                サジェストを表示
                              </button>
                            )}
                          </div>
                          {showCustomInput[p.id]?.prompt && (
                            <div style={{marginTop: '10px', display: 'flex', gap: '8px', alignItems: 'center'}}>
                              <input
                                type="text"
                                placeholder="改善指示を入力（例：中学生向けに説明を簡単にして）"
                                style={{
                                  flex: 1,
                                  padding: '8px',
                                  border: '1px solid #dee2e6',
                                  borderRadius: '6px',
                                  fontSize: '0.9rem'
                                }}
                                value={p.id ? (customPrompts[p.id]?.prompt || '') : ''}
                                onChange={(e) => {
                                  if (p.id) {
                                    const problemId = p.id;
                                    setCustomPrompts(prev => ({...prev, [problemId]: {...prev[problemId], prompt: e.target.value}}))
                                  }
                                }}
                                onKeyPress={(e) => {
                                  if (e.key === 'Enter' && p.id && customPrompts[p.id]?.prompt) {
                                    const problemId = p.id;
                                    revise(problemId, 'prompt', customPrompts[problemId].prompt!)
                                    setCustomPrompts(prev => ({...prev, [problemId]: {...prev[problemId], prompt: ''}}))
                                  }
                                }}
                              />
                              <button
                                className="btn-suggest"
                                onClick={() => {
                                  if (p.id && customPrompts[p.id]?.prompt) {
                                    const problemId = p.id;
                                    revise(problemId, 'prompt', customPrompts[problemId].prompt!)
                                    setCustomPrompts(prev => ({...prev, [problemId]: {...prev[problemId], prompt: ''}}))
                                  }
                                }}
                                disabled={isProcessing || !p.id || !customPrompts[p.id]?.prompt}
                              >
                                実行
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* 選択肢セクション（MCQのみ） */}
                    {p.type==='mcq' && p.choices && (
                      <div className="qcard-section">
                        <div className="section-label" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                          <span>選択肢</span>
                          {p.id && !editMode[p.id]?.choices && (
                            <button
                              className="edit-btn"
                              onClick={() => startEdit(p.id!, 'choices', p.choices)}
                            >
                              編集
                            </button>
                          )}
                        </div>
                        {editMode[p.id!]?.choices ? (
                          <div>
                            {editValues[p.id!]?.choices?.map((choice, idx) => (
                              <div key={idx} style={{marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                                <span style={{fontWeight: 'bold', minWidth: '20px'}}>{String.fromCharCode(65 + idx)}.</span>
                                <input
                                  className="edit-input"
                                  type="text"
                                  value={choice}
                                  onChange={(e) => {
                                    const newChoices = [...(editValues[p.id!]?.choices || [])]
                                    newChoices[idx] = e.target.value
                                    setEditValues(prev => ({...prev, [p.id!]: {...prev[p.id!], choices: newChoices}}))
                                  }}
                                  style={{flex: 1}}
                                />
                              </div>
                            ))}
                            <div className="edit-actions">
                              <button
                                className="edit-save-btn"
                                onClick={() => directUpdate(p.id!, 'choices', editValues[p.id!]?.choices || [])}
                              >
                                保存
                              </button>
                              <button
                                className="edit-cancel-btn"
                                onClick={() => cancelEdit(p.id!, 'choices')}
                              >
                                キャンセル
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="section-content">
                            <ol type='A'>
                              {p.choices.map((c, idx)=> (
                                <li key={idx}>
                                  <MathText text={c} />
                                </li>
                              ))}
                            </ol>
                          </div>
                        )}
                        {p.id && (
                          <>
                            <div className="suggest-buttons">
                              {loadingSuggestions.has(p.id) ? (
                                <div style={{fontSize:'0.85rem', color:'#999'}}>サジェスト読み込み中...</div>
                              ) : suggestions[p.id]?.choices ? (
                                <>
                                  {suggestions[p.id].choices!.map((suggest, idx) => (
                                    <button
                                      key={idx}
                                      className="btn-suggest"
                                      onClick={() => revise(p.id!, 'choices', suggest)}
                                      disabled={isProcessing}
                                    >
                                      {suggest}
                                    </button>
                                  ))}
                                  <button
                                    className="btn-suggest"
                                    style={{backgroundColor: '#f0f0f0', fontWeight: 'bold'}}
                                    onClick={() => setShowCustomInput(prev => ({...prev, [p.id!]: {...prev[p.id!], choices: !prev[p.id!]?.choices}}))}
                                    disabled={isProcessing}
                                  >
                                    ＋ カスタム改善
                                  </button>
                                </>
                              ) : (
                                <button className="btn-suggest" onClick={() => fetchSuggestions(p.id!)}>
                                  サジェストを表示
                                </button>
                              )}
                            </div>
                            {showCustomInput[p.id]?.choices && (
                              <div style={{marginTop: '10px', display: 'flex', gap: '8px', alignItems: 'center'}}>
                                <input
                                  type="text"
                                  placeholder="改善指示を入力（例：より紛らわしい選択肢にして）"
                                  style={{
                                    flex: 1,
                                    padding: '8px',
                                    border: '1px solid #dee2e6',
                                    borderRadius: '6px',
                                    fontSize: '0.9rem'
                                  }}
                                  value={p.id ? (customPrompts[p.id]?.choices || '') : ''}
                                  onChange={(e) => {
                                    if (p.id) {
                                      const problemId = p.id;
                                      setCustomPrompts(prev => ({...prev, [problemId]: {...prev[problemId], choices: e.target.value}}))
                                    }
                                  }}
                                  onKeyPress={(e) => {
                                    if (e.key === 'Enter' && p.id && customPrompts[p.id]?.choices) {
                                      const problemId = p.id;
                                      revise(problemId, 'choices', customPrompts[problemId].choices!)
                                      setCustomPrompts(prev => ({...prev, [problemId]: {...prev[problemId], choices: ''}}))
                                    }
                                  }}
                                />
                                <button
                                  className="btn-suggest"
                                  onClick={() => {
                                    if (p.id && customPrompts[p.id]?.choices) {
                                      const problemId = p.id;
                                      revise(problemId, 'choices', customPrompts[problemId].choices!)
                                      setCustomPrompts(prev => ({...prev, [problemId]: {...prev[problemId], choices: ''}}))
                                    }
                                  }}
                                  disabled={isProcessing || !p.id || !customPrompts[p.id]?.choices}
                                >
                                  実行
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {/* 答えセクション */}
                    <div className="qcard-section answer-section">
                      <div className="section-label" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                        <span>答え</span>
                        {p.id && !editMode[p.id]?.answer && (
                          <button
                            className="edit-btn"
                            onClick={() => startEdit(p.id!, 'answer', p.answer)}
                            style={{borderColor: '#74c0fc', color: '#1864ab'}}
                          >
                            編集
                          </button>
                        )}
                      </div>
                      {editMode[p.id!]?.answer ? (
                        <div>
                          <input
                            className="edit-input"
                            type="text"
                            value={editValues[p.id!]?.answer || ''}
                            onChange={(e) => setEditValues(prev => ({...prev, [p.id!]: {...prev[p.id!], answer: e.target.value}}))}
                            style={{fontWeight: '600', color: '#1864ab'}}
                          />
                          <div className="edit-actions">
                            <button
                              className="edit-save-btn"
                              onClick={() => directUpdate(p.id!, 'answer', editValues[p.id!]?.answer || '')}
                            >
                              保存
                            </button>
                            <button
                              className="edit-cancel-btn"
                              onClick={() => cancelEdit(p.id!, 'answer')}
                            >
                              キャンセル
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="section-content answer-text">
                          {ansLabel && <span>{ansLabel}. </span>}
                          <MathText text={p.answer} style={{display: 'inline'}} />
                        </div>
                      )}
                    </div>

                    {/* 解説セクション */}
                    <div className="qcard-section">
                      <div className="section-label" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                        <span>解説</span>
                        {p.id && !editMode[p.id]?.explanation && (
                          <button
                            className="edit-btn"
                            onClick={() => startEdit(p.id!, 'explanation', p.explanation)}
                          >
                            編集
                          </button>
                        )}
                      </div>
                      {editMode[p.id!]?.explanation ? (
                        <div>
                          <textarea
                            className="edit-textarea"
                            value={editValues[p.id!]?.explanation || ''}
                            onChange={(e) => setEditValues(prev => ({...prev, [p.id!]: {...prev[p.id!], explanation: e.target.value}}))}
                            style={{minHeight: '80px'}}
                          />
                          <div className="edit-actions">
                            <button
                              className="edit-save-btn"
                              onClick={() => directUpdate(p.id!, 'explanation', editValues[p.id!]?.explanation || '')}
                            >
                              保存
                            </button>
                            <button
                              className="edit-cancel-btn"
                              onClick={() => cancelEdit(p.id!, 'explanation')}
                            >
                              キャンセル
                            </button>
                          </div>
                        </div>
                      ) : (
                        <MathText text={p.explanation || ''} className="section-content" />
                      )}
                      {p.id && (
                        <>
                          <div className="suggest-buttons">
                            {loadingSuggestions.has(p.id) ? (
                              <div style={{fontSize:'0.85rem', color:'#999'}}>サジェスト読み込み中...</div>
                            ) : suggestions[p.id]?.explanation ? (
                              <>
                                {suggestions[p.id].explanation!.map((suggest, idx) => (
                                  <button
                                    key={idx}
                                    className="btn-suggest"
                                    onClick={() => revise(p.id!, 'explanation', suggest)}
                                    disabled={isProcessing}
                                  >
                                    {suggest}
                                  </button>
                                ))}
                                <button
                                  className="btn-suggest"
                                  style={{backgroundColor: '#f0f0f0', fontWeight: 'bold'}}
                                  onClick={() => setShowCustomInput(prev => ({...prev, [p.id!]: {...prev[p.id!], explanation: !prev[p.id!]?.explanation}}))}
                                  disabled={isProcessing}
                                >
                                  ＋ カスタム改善
                                </button>
                              </>
                            ) : (
                              <button className="btn-suggest" onClick={() => fetchSuggestions(p.id!)}>
                                サジェストを表示
                              </button>
                            )}
                          </div>
                          {showCustomInput[p.id]?.explanation && (
                            <div style={{marginTop: '10px', display: 'flex', gap: '8px', alignItems: 'center'}}>
                              <input
                                type="text"
                                placeholder="改善指示を入力（例：計算過程を詳しく説明して）"
                                style={{
                                  flex: 1,
                                  padding: '8px',
                                  border: '1px solid #dee2e6',
                                  borderRadius: '6px',
                                  fontSize: '0.9rem'
                                }}
                                value={p.id ? (customPrompts[p.id]?.explanation || '') : ''}
                                onChange={(e) => {
                                  if (p.id) {
                                    const problemId = p.id;
                                    setCustomPrompts(prev => ({...prev, [problemId]: {...prev[problemId], explanation: e.target.value}}))
                                  }
                                }}
                                onKeyPress={(e) => {
                                  if (e.key === 'Enter' && p.id && customPrompts[p.id]?.explanation) {
                                    const problemId = p.id;
                                    revise(problemId, 'explanation', customPrompts[problemId].explanation!)
                                    setCustomPrompts(prev => ({...prev, [problemId]: {...prev[problemId], explanation: ''}}))
                                  }
                                }}
                              />
                              <button
                                className="btn-suggest"
                                onClick={() => {
                                  if (p.id && customPrompts[p.id]?.explanation) {
                                    const problemId = p.id;
                                    revise(problemId, 'explanation', customPrompts[problemId].explanation!)
                                    setCustomPrompts(prev => ({...prev, [problemId]: {...prev[problemId], explanation: ''}}))
                                  }
                                }}
                                disabled={isProcessing || !p.id || !customPrompts[p.id]?.explanation}
                              >
                                実行
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )})}
            </div>
          </div>
        </div>
      </div>
      <div className="footer">sakumon-poc</div>
    </div>
  )
}
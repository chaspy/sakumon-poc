import React, { useState } from 'react'
import './auth-theme.css'
import { OCRUpload } from './OCRUpload'
import { ProblemSolver } from './ProblemSolver'
import { ResultDisplay } from './ResultDisplay'

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

type IncomingProblem = Omit<Problem, 'id'> & { id?: string }

type Screen = 'ocr' | 'solve' | 'result';

type GradingResult = {
  totalScore: number;
  maxScore: number;
  percentage: number;
  results: Array<{
    problemId: string;
    type: 'mcq' | 'free';
    correct?: boolean;
    expected?: string;
    mark?: '○' | '△' | '×';
    comment?: string;
    userAnswer: string;
  }>;
  summary: {
    totalProblems: number;
    mcqProblems: number;
    freeProblems: number;
  };
};

export function App() {
  // 画面状態管理
  const [currentScreen, setCurrentScreen] = useState<Screen>('ocr')
  const [parsedProblems, setParsedProblems] = useState<Problem[]>([])
  const [uploadedImageData, setUploadedImageData] = useState<string | null>(null)
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({})
  const [gradingResult, setGradingResult] = useState<GradingResult | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const configuredApiBase = ((import.meta as any)?.env?.VITE_API_BASE as string | undefined)?.trim()
  const fallbackApiBase = (() => {
    if (typeof window === 'undefined') return ''
    const { protocol, hostname, port } = window.location
    // If the UI is already served from the API origin, no base prefix is required.
    if (port === '3031') return ''
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `${protocol}//${hostname}:3031`
    }
    return ''
  })()
  const apiBase = (configuredApiBase || fallbackApiBase || '').replace(/\/$/, '')

  const buildApiUrl = (path: string) => `${apiBase}${path}`

  const fetchJson = async <T = any>(path: string, init: RequestInit = {}, timeoutMs = 15000): Promise<{ response: Response; json: T }> => {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    const signal = controller?.signal
    const timer = controller && typeof window !== 'undefined' ? window.setTimeout(() => controller.abort(), timeoutMs) : undefined
    try {
      const response = await fetch(buildApiUrl(path), { ...init, signal })
      const text = await response.text()
      let json: T
      try {
        json = text ? (JSON.parse(text) as T) : ({} as T)
      } catch (parseError) {
        throw new Error('サーバーから不正な形式のレスポンスが返されました')
      }
      return { response, json }
    } finally {
      if (timer !== undefined && typeof window !== 'undefined') window.clearTimeout(timer)
    }
  }

  // OCR結果から問題解答画面への遷移
  const startSolvingProblems = async (ocrText: string, imageData: string) => {
    // OCRテキストから問題を抽出
    try {
      const { json } = await fetchJson<{ ok: boolean; data: any; error?: { message?: string } }>('/api/ocr/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: ocrText })
      })
      if (json.ok && json.data.problems) {
        const problemsWithIds = (json.data.problems as IncomingProblem[]).map((problem, index) => ({
          ...problem,
          id: problem.id || `temp-${index}`
        }))
        setParsedProblems(problemsWithIds)
        setUploadedImageData(imageData)
        setCurrentScreen('solve')
        setUserAnswers({}) // 回答をリセット
        setSubmitError(null)
      } else {
        alert('問題の解析に失敗しました: ' + (json.error?.message || 'Unknown error'))
      }
    } catch (error: any) {
      console.error('[ocr/parse] unexpected error', error)
      alert('問題の解析に失敗しました: ' + (error?.message || 'Unknown error'))
    }
  }

  // 回答を送信して採点
  const submitAnswers = async () => {
    if (isSubmitting) return
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const { response, json } = await fetchJson<{ ok: boolean; data?: GradingResult; error?: { message?: string } }>('/api/solve/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problems: parsedProblems,
          userAnswers: userAnswers
        })
      })
      if (json.ok && json.data) {
        setGradingResult(json.data)
        setCurrentScreen('result')
        setSubmitError(null)
      } else {
        console.error('[grading] failed response', {
          status: response.status,
          statusText: response.statusText,
          payload: json
        })
        setSubmitError(json.error?.message || `採点に失敗しました (status ${response.status})`)
      }
    } catch (error: any) {
      console.error('[grading] unexpected error', error)
      if (error?.name === 'AbortError') {
        setSubmitError('採点に時間がかかりすぎています。しばらくしてから再試行してください。')
      } else {
        setSubmitError(error?.message || '採点中にエラーが発生しました')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  // OCR画面に戻る
  const resetToOCR = () => {
    setCurrentScreen('ocr')
    setParsedProblems([])
    setUploadedImageData(null)
    setUserAnswers({})
    setGradingResult(null)
    setSubmitError(null)
    setIsSubmitting(false)
  }

  // 問題を解き直す
  const retryProblems = () => {
    setCurrentScreen('solve')
    setUserAnswers({})
    setGradingResult(null)
    setSubmitError(null)
    setIsSubmitting(false)
  }

  return (
    <div className="auth-shell">
      <div className="brand">
        <div className="brand-title">スタディサプリ問題管理</div>
        <div className="brand-badge">for TEACHERS</div>
      </div>
      <div className="center-lane">
        {currentScreen === 'ocr' && (
          <OCRUpload 
            apiBase={apiBase} 
            onSolveProblems={startSolvingProblems}
          />
        )}
        
        {currentScreen === 'solve' && uploadedImageData && (
          <ProblemSolver
            problems={parsedProblems}
            imageData={uploadedImageData}
            userAnswers={userAnswers}
            onAnswerChange={(problemId, answer) => {
              setUserAnswers(prev => ({ ...prev, [problemId]: answer }))
            }}
            onSubmit={submitAnswers}
            onBack={resetToOCR}
            submitting={isSubmitting}
            submitError={submitError}
          />
        )}

        {currentScreen === 'result' && gradingResult && (
          <ResultDisplay
            result={gradingResult}
            problems={parsedProblems}
            onBack={resetToOCR}
            onRetry={retryProblems}
          />
        )}
      </div>
      <div className="footer">sakumon-poc</div>
    </div>
  )
}

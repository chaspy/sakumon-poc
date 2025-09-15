import React, { useMemo, useState, useEffect } from 'react'

type GenReq = { subject: string; unit: string; range?: string }

type Problem = {
  id?: string
  type: 'mcq' | 'free'
  prompt: string
  choices?: string[]
  answer: string
  explanation?: string
  rubric?: any
}

export function App() {
  const [subject, setSubject] = useState('数学')
  const [unit, setUnit] = useState('一次関数')
  const [range, setRange] = useState('')
  const [loading, setLoading] = useState(false)
  const [worksheetId, setWorksheetId] = useState<string | null>(null)
  const [items, setItems] = useState<Problem[]>([])
  const [issues, setIssues] = useState<string[]>([])

  const canExport = useMemo(() => !!worksheetId && items.length > 0, [worksheetId, items])

  // 科目→単元のデフォルトを同期させる（科目変更時に前科目の単元が残る不具合を防止）
  useEffect(() => {
    const firstUnit = subject === '数学' ? '一次関数' : subject === '理科' ? '化学式' : '太平洋戦争'
    setUnit(firstUnit)
  }, [subject])

  const generate = async () => {
    setLoading(true)
    setIssues([])
    try {
      const res = await fetch('/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subject, unit, range }) })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error?.message || 'failed')
      setWorksheetId(json.data.worksheetId)
      setItems(json.data.items)
      setIssues(json.data.issues || [])
    } catch (e: any) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  const revise = async (problemId: string, scope: 'prompt'|'choices'|'explanation', instruction: string) => {
    const res = await fetch(`/api/revise/${problemId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scope, instruction }) })
    const json = await res.json()
    if (!json.ok) return alert(json.error?.message || 'revise failed')
    setItems((prev) => prev.map((p) => p.id === problemId ? json.data.item : p))
  }

  const exportPdf = async (answerSheet: boolean) => {
    if (!worksheetId) return
    const res = await fetch('/api/export/pdf', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ worksheetId, answerSheet }) })
    if (!res.ok) return alert('PDF出力に失敗しました')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `worksheet-${worksheetId}${answerSheet?'-answer':''}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="auth-shell">
      {loading && (
        <div className="loading-mask" role="status" aria-live="assertive" aria-label="生成中">
          <div>
            <div className="spinner" />
            <div style={{textAlign:'center', color:'#fff', marginTop:12, fontWeight:700}}>生成中… 少々お待ちください</div>
          </div>
        </div>
      )}
      <div className="brand">
        <div className="brand-title">スタディサプリ問題生成</div>
        <div className="brand-badge">for TEACHERS</div>
      </div>
      <div className="center-lane">
        <div className="card">
          <div className="card-header">生成パネル</div>
          <div className="card-body">
            <div className="row">
              <label>科目
                <select value={subject} onChange={e=>setSubject(e.target.value)}>
                  <option>数学</option>
                  <option>理科</option>
                  <option>社会</option>
                </select>
              </label>
              <label>単元
                <select value={unit} onChange={e=>setUnit(e.target.value)}>
                  {subject==='数学' ? (
                    <option>一次関数</option>
                  ) : subject==='理科' ? (
                    <option>化学式</option>
                  ) : (
                    <option>太平洋戦争</option>
                  )}
                </select>
              </label>
              <label style={{minWidth:260}}>範囲/キーワード
                <input value={range} onChange={e=>setRange(e.target.value)} placeholder="例: 直線の式・交点"/>
              </label>
            </div>
            <div className="actions">
              <button className="btn primary" onClick={generate} disabled={loading}>{loading?'生成中...':'10問生成'}</button>
              <button className="btn ghost" onClick={()=>exportPdf(false)} disabled={!canExport}>PDF(問題)</button>
              <button className="btn ghost" onClick={()=>exportPdf(true)} disabled={!canExport}>PDF(解答)</button>
            </div>
            {issues.length>0 && (
              <div className="note">検証指摘: {issues.join(' / ')}</div>
            )}
            <div style={{height:10}}/>
            <div className="card-grid">
              {loading && items.length === 0
                ? Array.from({length:10}).map((_,i)=> (
                    <div className="qcard skel" key={`skel-${i}`}>
                      <div className="skeleton skel-line" style={{width:'30%'}}/>
                      <div className="skeleton skel-line" style={{width:'92%'}}/>
                      <div className="skeleton skel-line" style={{width:'86%'}}/>
                      <div className="skeleton skel-line" style={{width:'70%'}}/>
                      <div className="skeleton skel-choice" style={{width:'60%'}}/>
                      <div className="skeleton skel-choice" style={{width:'65%'}}/>
                      <div className="skeleton skel-choice" style={{width:'55%'}}/>
                      <div className="skeleton skel-choice" style={{width:'50%'}}/>
                    </div>
                  ))
                : items.map((p, i)=> {
                  const ansLabel = p.type==='mcq' && p.choices ? (()=>{ const idx = p.choices.findIndex(c=>c===p.answer); return idx>=0 ? String.fromCharCode(65+idx) : '' })() : ''
                  return (
                  <div className="qcard" key={p.id||i}>
                    <h4>第{i+1}問</h4>
                    <div style={{whiteSpace:'pre-wrap'}}>{p.prompt}</div>
                    {p.type==='mcq' && p.choices && (
                      <ol type='A'>
                        {p.choices.map((c, idx)=> <li key={idx}>{c}</li>)}
                      </ol>
                    )}
                    <div className="meta">答: {ansLabel ? `${ansLabel} `: ''}{p.answer}</div>
                    <div className="meta">解説: {p.explanation}</div>
                    {p.id && (
                      <div className="actions" style={{marginTop:8}}>
                        <button className="btn ghost" onClick={()=>{
                          const ins = prompt('どのように直したいですか？(例: もう少し易しく)')
                          if (ins) revise(p.id!, 'prompt', ins)
                        }}>AI指示編集</button>
                        <button className="btn ghost" onClick={()=>{
                          const ins = prompt('選択肢の改善指示 (例: 紛らわしさ強化)')
                          if (ins) revise(p.id!, 'choices', ins)
                        }}>選択肢再生成</button>
                        <button className="btn ghost" onClick={()=>{
                          const ins = prompt('解説の改善指示 (例: 100字以内で要点)')
                          if (ins) revise(p.id!, 'explanation', ins)
                        }}>解説を改善</button>
                      </div>
                    )}
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

import React, { useState, useRef } from 'react'

interface OCRResult {
  text: string
  processedPages: number
  confidence: number
  originalFileName: string
  fileSize: number
}

interface OCRUploadProps {
  apiBase: string
}

interface ModelInfo {
  id: string
  name: string
  description: string
}

export function OCRUpload({ apiBase }: OCRUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [structuredOutput, setStructuredOutput] = useState(true)
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([])
  const [selectedModel, setSelectedModel] = useState('openai')
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // 利用可能なモデル一覧を取得
  React.useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await fetch(`${apiBase}/api/ocr/models`)
        const json = await response.json()
        if (json.ok && json.data.models) {
          setAvailableModels(json.data.models)
          // デフォルトモデルを設定（利用可能な場合）
          if (json.data.models.length > 0) {
            setSelectedModel(json.data.models[0].id)
          }
        }
      } catch (err) {
        console.error('Failed to fetch available models:', err)
        // フォールバック: OpenAIのみ
        setAvailableModels([{ id: 'openai', name: 'OpenAI GPT-4o-mini', description: 'OpenAI Vision API' }])
      }
    }
    
    fetchModels()
  }, [apiBase])

  const handleFileSelect = async (file: File) => {
    if (file.type.includes('pdf')) {
      setError('PDF処理は現在メンテナンス中です。画像ファイル（PNG、JPG等）をご利用ください。')
      return
    }
    
    const isValidFile = file.type.startsWith('image/')
    if (!isValidFile) {
      setError('画像ファイル（PNG、JPG等）のみ対応しています')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('ファイルサイズは10MB以下にしてください')
      return
    }

    setIsUploading(true)
    setError(null)
    setOcrResult(null)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('structuredOutput', structuredOutput.toString())
    formData.append('model', selectedModel)
    
    // オプション設定（必要に応じて調整）
    formData.append('dpi', '200')
    formData.append('maxPages', '10')
    formData.append('quality', '85')

    try {
      const response = await fetch(`${apiBase}/api/ocr`, {
        method: 'POST',
        body: formData
      })

      const json = await response.json()
      
      if (!json.ok) {
        throw new Error(json.error?.message || 'OCR処理に失敗しました')
      }

      setOcrResult(json.data)
    } catch (err: any) {
      console.error('OCR処理エラー:', err)
      setError(err.message || 'OCR処理中にエラーが発生しました')
    } finally {
      setIsUploading(false)
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    
    const files = Array.from(e.dataTransfer.files)
    const validFile = files.find(f => f.type.startsWith('image/'))
    
    if (validFile) {
      handleFileSelect(validFile)
    } else {
      setError('画像ファイルをドロップしてください')
    }
  }

  const handleClickUpload = () => {
    fileInputRef.current?.click()
  }

  const copyToClipboard = async () => {
    if (ocrResult?.text) {
      try {
        await navigator.clipboard.writeText(ocrResult.text)
        alert('テキストをクリップボードにコピーしました')
      } catch (err) {
        console.error('クリップボードへのコピーに失敗:', err)
      }
    }
  }

  const clearResult = () => {
    setOcrResult(null)
    setError(null)
  }

  return (
    <div className="card">
      <div className="card-header">画像 OCR - 文字起こし</div>
      <div className="card-body">
        
        {/* モデル選択 */}
        <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f8f9fa', borderRadius: '6px' }}>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '0.9rem', fontWeight: '600', marginBottom: '6px', display: 'block' }}>
              AIモデル選択
            </label>
            <select 
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              style={{ 
                width: '100%', 
                padding: '8px 12px', 
                border: '1px solid #dee2e6', 
                borderRadius: '6px',
                backgroundColor: 'white',
                fontSize: '0.9rem'
              }}
              disabled={isUploading}
            >
              {availableModels.map(model => (
                <option key={model.id} value={model.id}>
                  {model.name} - {model.description}
                </option>
              ))}
            </select>
          </div>
          
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={structuredOutput}
              onChange={(e) => setStructuredOutput(e.target.checked)}
              style={{ width: '16px', height: '16px' }}
              disabled={isUploading}
            />
            <span style={{ fontSize: '0.9rem', fontWeight: '600' }}>
              問題形式で構造化して抽出（問題番号・問題・解答・配点・配点ラベル）
            </span>
          </label>
          <div style={{ fontSize: '0.8rem', color: '#6c757d', marginTop: '4px', marginLeft: '24px' }}>
            チェックすると、テスト問題として整理された形式で出力されます
          </div>
        </div>
        
        {/* アップロードエリア */}
        {!isUploading && !ocrResult && (
          <div
            className={`ocr-upload-area ${dragOver ? 'drag-over' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleClickUpload}
            style={{
              border: `2px dashed ${dragOver ? '#007bff' : '#dee2e6'}`,
              borderRadius: '8px',
              padding: '40px 20px',
              textAlign: 'center' as const,
              cursor: 'pointer',
              backgroundColor: dragOver ? '#f8f9fa' : 'transparent',
              transition: 'all 0.2s ease'
            }}
          >
            <div style={{ fontSize: '48px', marginBottom: '16px', color: '#6c757d' }}>
              📄
            </div>
            <div style={{ fontSize: '1.1rem', marginBottom: '8px', fontWeight: '600' }}>
              画像をここにドロップ、またはクリックして選択
            </div>
            <div style={{ fontSize: '0.9rem', color: '#6c757d' }}>
              最大10MB対応（PNG、JPG、JPEG等）
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.gif,.bmp,.webp"
          onChange={handleFileInputChange}
          style={{ display: 'none' }}
        />

        {/* 処理中スピナー */}
        {isUploading && (
          <div style={{
            textAlign: 'center' as const,
            padding: '40px 20px'
          }}>
            <div style={{
              display: 'inline-block',
              width: '40px',
              height: '40px',
              border: '4px solid #f3f3f3',
              borderTop: '4px solid #007bff',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              marginBottom: '16px'
            }} />
            <div style={{ fontSize: '1.1rem', fontWeight: '600', color: '#007bff' }}>
              OCR処理中...
            </div>
            <div style={{ fontSize: '0.9rem', color: '#6c757d', marginTop: '8px' }}>
              AIが画像から文字を読み取っています
            </div>
          </div>
        )}

        {/* エラー表示 */}
        {error && (
          <div style={{
            padding: '12px',
            backgroundColor: '#f8d7da',
            color: '#721c24',
            border: '1px solid #f5c6cb',
            borderRadius: '6px',
            marginBottom: '16px'
          }}>
            ❌ {error}
          </div>
        )}

        {/* 結果表示 */}
        {ocrResult && (
          <div>
            {/* 結果サマリー */}
            <div style={{
              padding: '12px',
              backgroundColor: '#d4edda',
              color: '#155724',
              border: '1px solid #c3e6cb',
              borderRadius: '6px',
              marginBottom: '16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                ✅ OCR完了: {ocrResult.originalFileName} 
                ({ocrResult.processedPages}ページ処理, 
                信頼度: {Math.round(ocrResult.confidence * 100)}%)
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="btn primary"
                  onClick={copyToClipboard}
                  style={{ fontSize: '0.85rem', padding: '6px 12px' }}
                >
                  📋 コピー
                </button>
                <button
                  className="btn ghost"
                  onClick={clearResult}
                  style={{ fontSize: '0.85rem', padding: '6px 12px' }}
                >
                  🗑️ クリア
                </button>
              </div>
            </div>

            {/* テキスト結果 */}
            <div style={{
              border: '1px solid #dee2e6',
              borderRadius: '6px',
              backgroundColor: '#ffffff'
            }}>
              <div style={{
                padding: '12px',
                backgroundColor: '#f8f9fa',
                borderBottom: '1px solid #dee2e6',
                fontWeight: '600',
                fontSize: '0.9rem'
              }}>
                抽出されたテキスト ({ocrResult.text.length}文字)
              </div>
              <div style={{
                padding: '16px',
                maxHeight: '400px',
                overflowY: 'auto' as const,
                fontFamily: 'monospace',
                fontSize: '0.9rem',
                lineHeight: '1.5',
                whiteSpace: 'pre-wrap',
                backgroundColor: '#fff'
              }}>
                {ocrResult.text || '(テキストが検出されませんでした)'}
              </div>
            </div>
          </div>
        )}

      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .ocr-upload-area:hover {
          background-color: #f8f9fa !important;
          border-color: #007bff !important;
        }
      `}</style>
    </div>
  )
}
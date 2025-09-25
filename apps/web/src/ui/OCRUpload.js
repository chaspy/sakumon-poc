import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useState, useRef } from 'react';
export function OCRUpload({ apiBase }) {
    const [isUploading, setIsUploading] = useState(false);
    const [ocrResult, setOcrResult] = useState(null);
    const [error, setError] = useState(null);
    const [dragOver, setDragOver] = useState(false);
    const [structuredOutput, setStructuredOutput] = useState(true);
    const [availableModels, setAvailableModels] = useState([]);
    const [selectedModel, setSelectedModel] = useState('openai');
    const fileInputRef = useRef(null);
    // 利用可能なモデル一覧を取得
    React.useEffect(() => {
        const fetchModels = async () => {
            try {
                const response = await fetch(`${apiBase}/api/ocr/models`);
                const json = await response.json();
                if (json.ok && json.data.models) {
                    setAvailableModels(json.data.models);
                    // デフォルトモデルを設定（利用可能な場合）
                    if (json.data.models.length > 0) {
                        setSelectedModel(json.data.models[0].id);
                    }
                }
            }
            catch (err) {
                console.error('Failed to fetch available models:', err);
                // フォールバック: OpenAIのみ
                setAvailableModels([{ id: 'openai', name: 'OpenAI GPT-4o-mini', description: 'OpenAI Vision API' }]);
            }
        };
        fetchModels();
    }, [apiBase]);
    const handleFileSelect = async (file) => {
        if (file.type.includes('pdf')) {
            setError('PDF処理は現在メンテナンス中です。画像ファイル（PNG、JPG等）をご利用ください。');
            return;
        }
        const isValidFile = file.type.startsWith('image/');
        if (!isValidFile) {
            setError('画像ファイル（PNG、JPG等）のみ対応しています');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            setError('ファイルサイズは10MB以下にしてください');
            return;
        }
        setIsUploading(true);
        setError(null);
        setOcrResult(null);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('structuredOutput', structuredOutput.toString());
        formData.append('model', selectedModel);
        // オプション設定（必要に応じて調整）
        formData.append('dpi', '200');
        formData.append('maxPages', '10');
        formData.append('quality', '85');
        try {
            const response = await fetch(`${apiBase}/api/ocr`, {
                method: 'POST',
                body: formData
            });
            const json = await response.json();
            if (!json.ok) {
                throw new Error(json.error?.message || 'OCR処理に失敗しました');
            }
            setOcrResult(json.data);
        }
        catch (err) {
            console.error('OCR処理エラー:', err);
            setError(err.message || 'OCR処理中にエラーが発生しました');
        }
        finally {
            setIsUploading(false);
        }
    };
    const handleFileInputChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            handleFileSelect(file);
        }
    };
    const handleDragOver = (e) => {
        e.preventDefault();
        setDragOver(true);
    };
    const handleDragLeave = (e) => {
        e.preventDefault();
        setDragOver(false);
    };
    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        const files = Array.from(e.dataTransfer.files);
        const validFile = files.find(f => f.type.startsWith('image/'));
        if (validFile) {
            handleFileSelect(validFile);
        }
        else {
            setError('画像ファイルをドロップしてください');
        }
    };
    const handleClickUpload = () => {
        fileInputRef.current?.click();
    };
    const copyToClipboard = async () => {
        if (ocrResult?.text) {
            try {
                await navigator.clipboard.writeText(ocrResult.text);
                alert('テキストをクリップボードにコピーしました');
            }
            catch (err) {
                console.error('クリップボードへのコピーに失敗:', err);
            }
        }
    };
    const clearResult = () => {
        setOcrResult(null);
        setError(null);
    };
    return (_jsxs("div", { className: "card", children: [_jsx("div", { className: "card-header", children: "\u753B\u50CF OCR - \u6587\u5B57\u8D77\u3053\u3057" }), _jsxs("div", { className: "card-body", children: [_jsxs("div", { style: { marginBottom: '16px', padding: '12px', backgroundColor: '#f8f9fa', borderRadius: '6px' }, children: [_jsxs("div", { style: { marginBottom: '12px' }, children: [_jsx("label", { style: { fontSize: '0.9rem', fontWeight: '600', marginBottom: '6px', display: 'block' }, children: "AI\u30E2\u30C7\u30EB\u9078\u629E" }), _jsx("select", { value: selectedModel, onChange: (e) => setSelectedModel(e.target.value), style: {
                                            width: '100%',
                                            padding: '8px 12px',
                                            border: '1px solid #dee2e6',
                                            borderRadius: '6px',
                                            backgroundColor: 'white',
                                            fontSize: '0.9rem'
                                        }, disabled: isUploading, children: availableModels.map(model => (_jsxs("option", { value: model.id, children: [model.name, " - ", model.description] }, model.id))) })] }), _jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }, children: [_jsx("input", { type: "checkbox", checked: structuredOutput, onChange: (e) => setStructuredOutput(e.target.checked), style: { width: '16px', height: '16px' }, disabled: isUploading }), _jsx("span", { style: { fontSize: '0.9rem', fontWeight: '600' }, children: "\u554F\u984C\u5F62\u5F0F\u3067\u69CB\u9020\u5316\u3057\u3066\u62BD\u51FA\uFF08\u554F\u984C\u756A\u53F7\u30FB\u554F\u984C\u30FB\u89E3\u7B54\u30FB\u914D\u70B9\u30FB\u914D\u70B9\u30E9\u30D9\u30EB\uFF09" })] }), _jsx("div", { style: { fontSize: '0.8rem', color: '#6c757d', marginTop: '4px', marginLeft: '24px' }, children: "\u30C1\u30A7\u30C3\u30AF\u3059\u308B\u3068\u3001\u30C6\u30B9\u30C8\u554F\u984C\u3068\u3057\u3066\u6574\u7406\u3055\u308C\u305F\u5F62\u5F0F\u3067\u51FA\u529B\u3055\u308C\u307E\u3059" })] }), !isUploading && !ocrResult && (_jsxs("div", { className: `ocr-upload-area ${dragOver ? 'drag-over' : ''}`, onDragOver: handleDragOver, onDragLeave: handleDragLeave, onDrop: handleDrop, onClick: handleClickUpload, style: {
                            border: `2px dashed ${dragOver ? '#007bff' : '#dee2e6'}`,
                            borderRadius: '8px',
                            padding: '40px 20px',
                            textAlign: 'center',
                            cursor: 'pointer',
                            backgroundColor: dragOver ? '#f8f9fa' : 'transparent',
                            transition: 'all 0.2s ease'
                        }, children: [_jsx("div", { style: { fontSize: '48px', marginBottom: '16px', color: '#6c757d' }, children: "\uD83D\uDCC4" }), _jsx("div", { style: { fontSize: '1.1rem', marginBottom: '8px', fontWeight: '600' }, children: "\u753B\u50CF\u3092\u3053\u3053\u306B\u30C9\u30ED\u30C3\u30D7\u3001\u307E\u305F\u306F\u30AF\u30EA\u30C3\u30AF\u3057\u3066\u9078\u629E" }), _jsx("div", { style: { fontSize: '0.9rem', color: '#6c757d' }, children: "\u6700\u592710MB\u5BFE\u5FDC\uFF08PNG\u3001JPG\u3001JPEG\u7B49\uFF09" })] })), _jsx("input", { ref: fileInputRef, type: "file", accept: ".png,.jpg,.jpeg,.gif,.bmp,.webp", onChange: handleFileInputChange, style: { display: 'none' } }), isUploading && (_jsxs("div", { style: {
                            textAlign: 'center',
                            padding: '40px 20px'
                        }, children: [_jsx("div", { style: {
                                    display: 'inline-block',
                                    width: '40px',
                                    height: '40px',
                                    border: '4px solid #f3f3f3',
                                    borderTop: '4px solid #007bff',
                                    borderRadius: '50%',
                                    animation: 'spin 1s linear infinite',
                                    marginBottom: '16px'
                                } }), _jsx("div", { style: { fontSize: '1.1rem', fontWeight: '600', color: '#007bff' }, children: "OCR\u51E6\u7406\u4E2D..." }), _jsx("div", { style: { fontSize: '0.9rem', color: '#6c757d', marginTop: '8px' }, children: "AI\u304C\u753B\u50CF\u304B\u3089\u6587\u5B57\u3092\u8AAD\u307F\u53D6\u3063\u3066\u3044\u307E\u3059" })] })), error && (_jsxs("div", { style: {
                            padding: '12px',
                            backgroundColor: '#f8d7da',
                            color: '#721c24',
                            border: '1px solid #f5c6cb',
                            borderRadius: '6px',
                            marginBottom: '16px'
                        }, children: ["\u274C ", error] })), ocrResult && (_jsxs("div", { children: [_jsxs("div", { style: {
                                    padding: '12px',
                                    backgroundColor: '#d4edda',
                                    color: '#155724',
                                    border: '1px solid #c3e6cb',
                                    borderRadius: '6px',
                                    marginBottom: '16px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }, children: [_jsxs("div", { children: ["\u2705 OCR\u5B8C\u4E86: ", ocrResult.originalFileName, "(", ocrResult.processedPages, "\u30DA\u30FC\u30B8\u51E6\u7406, \u4FE1\u983C\u5EA6: ", Math.round(ocrResult.confidence * 100), "%)"] }), _jsxs("div", { style: { display: 'flex', gap: '8px' }, children: [_jsx("button", { className: "btn primary", onClick: copyToClipboard, style: { fontSize: '0.85rem', padding: '6px 12px' }, children: "\uD83D\uDCCB \u30B3\u30D4\u30FC" }), _jsx("button", { className: "btn ghost", onClick: clearResult, style: { fontSize: '0.85rem', padding: '6px 12px' }, children: "\uD83D\uDDD1\uFE0F \u30AF\u30EA\u30A2" })] })] }), _jsxs("div", { style: {
                                    border: '1px solid #dee2e6',
                                    borderRadius: '6px',
                                    backgroundColor: '#ffffff'
                                }, children: [_jsxs("div", { style: {
                                            padding: '12px',
                                            backgroundColor: '#f8f9fa',
                                            borderBottom: '1px solid #dee2e6',
                                            fontWeight: '600',
                                            fontSize: '0.9rem'
                                        }, children: ["\u62BD\u51FA\u3055\u308C\u305F\u30C6\u30AD\u30B9\u30C8 (", ocrResult.text.length, "\u6587\u5B57)"] }), _jsx("div", { style: {
                                            padding: '16px',
                                            maxHeight: '400px',
                                            overflowY: 'auto',
                                            fontFamily: 'monospace',
                                            fontSize: '0.9rem',
                                            lineHeight: '1.5',
                                            whiteSpace: 'pre-wrap',
                                            backgroundColor: '#fff'
                                        }, children: ocrResult.text || '(テキストが検出されませんでした)' })] })] }))] }), _jsx("style", { children: `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .ocr-upload-area:hover {
          background-color: #f8f9fa !important;
          border-color: #007bff !important;
        }
      ` })] }));
}

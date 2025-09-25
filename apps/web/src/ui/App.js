import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState, useEffect } from 'react';
import './auth-theme.css';
import { MathText } from './MathText';
import { OCRUpload } from './OCRUpload';
export function App() {
    const [subject, setSubject] = useState('数学');
    const [unit, setUnit] = useState('一次関数');
    const [range, setRange] = useState('');
    const [loading, setLoading] = useState(false);
    const [worksheetId, setWorksheetId] = useState(null);
    const [items, setItems] = useState([]);
    const [issues, setIssues] = useState([]);
    // 新しい状態
    const [suggestions, setSuggestions] = useState({});
    const [loadingSuggestions, setLoadingSuggestions] = useState(new Set());
    const [consistencyStatus, setConsistencyStatus] = useState({});
    const [agentProcessing, setAgentProcessing] = useState(new Set());
    const [expandedProblem, setExpandedProblem] = useState(null);
    const [customPrompts, setCustomPrompts] = useState({});
    const [showCustomInput, setShowCustomInput] = useState({});
    const [editMode, setEditMode] = useState({});
    const [editValues, setEditValues] = useState({});
    const canExport = useMemo(() => !!worksheetId && items.length > 0, [worksheetId, items]);
    useEffect(() => {
        const firstUnit = subject === '数学' ? '一次関数' : subject === '理科' ? '化学式' : '太平洋戦争';
        setUnit(firstUnit);
    }, [subject]);
    const apiBase = 'http://localhost:3031';
    const generate = async () => {
        setLoading(true);
        setIssues([]);
        setSuggestions({});
        setConsistencyStatus({});
        try {
            const res = await fetch(`${apiBase}/api/generate`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ subject, unit, range })
            });
            const json = await res.json();
            if (!json.ok)
                throw new Error(json.error?.message || 'failed');
            setWorksheetId(json.data.worksheetId);
            setItems(json.data.items);
            setIssues(json.data.issues || []);
            // 新規生成された問題のサジェストを自動取得
            json.data.items.forEach((item) => {
                if (item.id)
                    fetchSuggestions(item.id);
            });
        }
        catch (e) {
            alert(e.message);
        }
        finally {
            setLoading(false);
        }
    };
    const fetchSuggestions = async (problemId) => {
        if (loadingSuggestions.has(problemId) || suggestions[problemId])
            return;
        setLoadingSuggestions(prev => new Set([...prev, problemId]));
        try {
            const res = await fetch(`${apiBase}/api/suggestions/${problemId}`);
            const json = await res.json();
            if (json.ok) {
                setSuggestions(prev => ({ ...prev, [problemId]: json.data }));
            }
        }
        catch (e) {
            console.error('Failed to fetch suggestions:', e);
        }
        finally {
            setLoadingSuggestions(prev => {
                const next = new Set(prev);
                next.delete(problemId);
                return next;
            });
        }
    };
    const checkConsistency = async (problemId) => {
        const problem = items.find(p => p.id === problemId);
        if (!problem)
            return;
        try {
            const res = await fetch(`${apiBase}/api/problems/${problemId}/check-consistency`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({})
            });
            const json = await res.json();
            if (json.ok) {
                setConsistencyStatus(prev => ({ ...prev, [problemId]: json.data }));
            }
        }
        catch (e) {
            console.error('Consistency check failed:', e);
        }
    };
    const processWithAgent = async (problemId, instruction, field, autoFix = true) => {
        setAgentProcessing(prev => new Set([...prev, problemId]));
        try {
            const res = await fetch(`${apiBase}/api/agent/process`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ problemId, instruction, field, autoFix })
            });
            const json = await res.json();
            if (!json.ok)
                throw new Error(json.error?.message || 'Agent processing failed');
            const result = json.data;
            // 問題を更新
            if (result.success && result.problem) {
                setItems(prev => prev.map(p => p.id === problemId ? { ...result.problem, id: problemId } : p));
            }
            // 整合性状態を更新
            if (result.consistencyReport) {
                setConsistencyStatus(prev => ({ ...prev, [problemId]: result.consistencyReport }));
            }
            // サジェストを更新
            if (result.suggestions) {
                setSuggestions(prev => ({ ...prev, [problemId]: result.suggestions }));
            }
            // フィードバックを表示
            if (result.changes.length > 0) {
                console.log(`変更適用: ${result.changes.join(', ')}`);
            }
            return result;
        }
        catch (e) {
            alert(e.message);
        }
        finally {
            setAgentProcessing(prev => {
                const next = new Set(prev);
                next.delete(problemId);
                return next;
            });
        }
    };
    const revise = async (problemId, scope, instruction) => {
        // エージェントを使用して編集と整合性チェックを同時に実行
        await processWithAgent(problemId, instruction, scope, true);
    };
    const directUpdate = async (problemId, field, value) => {
        try {
            const res = await fetch(`${apiBase}/api/problems/${problemId}/update`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ field, value })
            });
            const json = await res.json();
            if (!json.ok)
                throw new Error(json.error?.message || 'Update failed');
            // 問題を更新
            setItems(prev => prev.map(p => {
                if (p.id === problemId) {
                    if (field === 'choices' && Array.isArray(value)) {
                        return { ...p, [field]: value };
                    }
                    else if (typeof value === 'string') {
                        return { ...p, [field]: value };
                    }
                }
                return p;
            }));
            // 編集モードを解除
            setEditMode(prev => ({ ...prev, [problemId]: { ...prev[problemId], [field]: false } }));
            setEditValues(prev => ({ ...prev, [problemId]: { ...prev[problemId], [field]: undefined } }));
            // 自動で整合性チェックを実行
            setTimeout(() => checkConsistency(problemId), 500);
        }
        catch (e) {
            alert(e.message);
        }
    };
    const startEdit = (problemId, field, currentValue) => {
        setEditMode(prev => ({ ...prev, [problemId]: { ...prev[problemId], [field]: true } }));
        setEditValues(prev => ({ ...prev, [problemId]: { ...prev[problemId], [field]: currentValue } }));
    };
    const cancelEdit = (problemId, field) => {
        setEditMode(prev => ({ ...prev, [problemId]: { ...prev[problemId], [field]: false } }));
        setEditValues(prev => ({ ...prev, [problemId]: { ...prev[problemId], [field]: undefined } }));
    };
    const exportPdf = async (answerSheet) => {
        if (!worksheetId)
            return;
        const res = await fetch(`${apiBase}/api/export/pdf`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ worksheetId, answerSheet })
        });
        if (!res.ok)
            return alert('PDF出力に失敗しました');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `worksheet-${worksheetId}${answerSheet ? '-answer' : ''}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
    };
    const getConsistencyIcon = (problemId) => {
        const status = consistencyStatus[problemId];
        if (!status)
            return null;
        if (status.isConsistent)
            return _jsx("span", { style: { color: '#28a745' }, children: "\u2705" });
        const hasCritical = status.issues?.some((i) => i.severity === 'critical');
        if (hasCritical)
            return _jsx("span", { style: { color: '#dc3545' }, children: "\u274C" });
        return _jsx("span", { style: { color: '#ffc107' }, children: "\u26A0\uFE0F" });
    };
    return (_jsxs("div", { className: "auth-shell", children: [loading && (_jsx("div", { className: "loading-mask", role: "status", "aria-live": "assertive", "aria-label": "\u751F\u6210\u4E2D", children: _jsxs("div", { children: [_jsx("div", { className: "spinner" }), _jsx("div", { style: { textAlign: 'center', color: '#fff', marginTop: 12, fontWeight: 700 }, children: "\u751F\u6210\u4E2D\u2026 \u5C11\u3005\u304A\u5F85\u3061\u304F\u3060\u3055\u3044" })] }) })), _jsxs("div", { className: "brand", children: [_jsx("div", { className: "brand-title", children: "\u30B9\u30BF\u30C7\u30A3\u30B5\u30D7\u30EA\u554F\u984C\u751F\u6210" }), _jsx("div", { className: "brand-badge", children: "for TEACHERS" })] }), _jsxs("div", { className: "center-lane", children: [_jsx(OCRUpload, { apiBase: apiBase }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "card-header", children: "\u751F\u6210\u30D1\u30CD\u30EB" }), _jsxs("div", { className: "card-body", children: [_jsxs("div", { className: "row", children: [_jsxs("label", { children: ["\u79D1\u76EE", _jsxs("select", { value: subject, onChange: e => setSubject(e.target.value), children: [_jsx("option", { children: "\u6570\u5B66" }), _jsx("option", { children: "\u7406\u79D1" }), _jsx("option", { children: "\u793E\u4F1A" })] })] }), _jsxs("label", { children: ["\u5358\u5143", _jsx("select", { value: unit, onChange: e => setUnit(e.target.value), children: subject === '数学' ? (_jsx("option", { children: "\u4E00\u6B21\u95A2\u6570" })) : subject === '理科' ? (_jsx("option", { children: "\u5316\u5B66\u5F0F" })) : (_jsx("option", { children: "\u592A\u5E73\u6D0B\u6226\u4E89" })) })] }), _jsxs("label", { style: { minWidth: 260 }, children: ["\u7BC4\u56F2/\u30AD\u30FC\u30EF\u30FC\u30C9", _jsx("input", { value: range, onChange: e => setRange(e.target.value), placeholder: "\u4F8B: \u76F4\u7DDA\u306E\u5F0F\u30FB\u4EA4\u70B9" })] })] }), _jsxs("div", { className: "actions", children: [_jsx("button", { className: "btn primary", onClick: generate, disabled: loading, children: loading ? '生成中...' : '10問生成' }), _jsx("button", { className: "btn ghost", onClick: () => exportPdf(false), disabled: !canExport, children: "PDF(\u554F\u984C)" }), _jsx("button", { className: "btn ghost", onClick: () => exportPdf(true), disabled: !canExport, children: "PDF(\u89E3\u7B54)" })] }), issues.length > 0 && (_jsxs("div", { className: "note", children: ["\u691C\u8A3C\u6307\u6458: ", issues.join(' / ')] })), _jsx("div", { style: { height: 10 } }), _jsx("div", { className: "card-grid", children: loading && items.length === 0
                                            ? Array.from({ length: 10 }).map((_, i) => (_jsxs("div", { className: "qcard skel", children: [_jsx("div", { className: "skeleton skel-line", style: { width: '30%' } }), _jsx("div", { className: "skeleton skel-line", style: { width: '92%' } }), _jsx("div", { className: "skeleton skel-line", style: { width: '86%' } }), _jsx("div", { className: "skeleton skel-line", style: { width: '70%' } }), _jsx("div", { className: "skeleton skel-choice", style: { width: '60%' } }), _jsx("div", { className: "skeleton skel-choice", style: { width: '65%' } }), _jsx("div", { className: "skeleton skel-choice", style: { width: '55%' } }), _jsx("div", { className: "skeleton skel-choice", style: { width: '50%' } })] }, `skel-${i}`)))
                                            : items.map((p, i) => {
                                                const ansLabel = p.type === 'mcq' && p.choices ? (() => { const idx = p.choices.findIndex(c => c === p.answer); return idx >= 0 ? String.fromCharCode(65 + idx) : ''; })() : '';
                                                const isProcessing = Boolean(p.id && agentProcessing.has(p.id));
                                                const isExpanded = p.id === expandedProblem;
                                                return (_jsxs("div", { className: "qcard", style: { opacity: isProcessing ? 0.7 : 1 }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, children: [_jsxs("h4", { children: ["\u7B2C", i + 1, "\u554F"] }), _jsxs("div", { style: { display: 'flex', gap: '8px', alignItems: 'center' }, children: [p.id && getConsistencyIcon(p.id), p.id && (_jsx("button", { className: "btn-suggest", onClick: () => checkConsistency(p.id), disabled: isProcessing, children: "\u6574\u5408\u6027\u30C1\u30A7\u30C3\u30AF" })), p.id && (_jsx("button", { className: "btn-suggest", onClick: () => processWithAgent(p.id, 'この問題を総合的に改善してください'), disabled: isProcessing, children: "AI\u6539\u5584" }))] })] }), isProcessing && (_jsx("div", { style: { padding: '10px', background: '#e3f2fd', borderRadius: '8px', marginBottom: '10px' }, children: _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '8px' }, children: [_jsx("div", { className: "spinner", style: { width: '20px', height: '20px' } }), _jsx("span", { style: { fontSize: '0.9rem', color: '#1976d2' }, children: "AI\u30A8\u30FC\u30B8\u30A7\u30F3\u30C8\u304C\u51E6\u7406\u4E2D..." })] }) })), p.id && consistencyStatus[p.id] && !consistencyStatus[p.id].isConsistent && (_jsxs("div", { style: { padding: '10px', background: '#fff3cd', borderRadius: '8px', marginBottom: '10px' }, children: [_jsx("div", { style: { fontSize: '0.9rem', color: '#856404', marginBottom: '5px' }, children: "\u26A0\uFE0F \u6574\u5408\u6027\u306E\u554F\u984C\u304C\u691C\u51FA\u3055\u308C\u307E\u3057\u305F:" }), consistencyStatus[p.id].issues.map((issue, idx) => (_jsxs("div", { style: { fontSize: '0.85rem', marginLeft: '20px', marginBottom: '3px' }, children: ["\u2022 ", issue.issue, " ", issue.suggestion && `(提案: ${issue.suggestion})`] }, idx))), p.id && (_jsx("button", { className: "btn-suggest", style: { marginTop: '8px' }, onClick: () => processWithAgent(p.id, '検出された整合性の問題を自動修正してください', undefined, true), children: "\u81EA\u52D5\u4FEE\u6B63" }))] })), _jsxs("div", { className: "qcard-section", children: [_jsxs("div", { className: "section-label", style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, children: [_jsx("span", { children: "\u554F\u984C\u6587" }), p.id && !editMode[p.id]?.prompt && (_jsx("button", { className: "edit-btn", onClick: () => startEdit(p.id, 'prompt', p.prompt), children: "\u7DE8\u96C6" }))] }), editMode[p.id]?.prompt ? (_jsxs("div", { children: [_jsx("textarea", { className: "edit-textarea", value: editValues[p.id]?.prompt || '', onChange: (e) => setEditValues(prev => ({ ...prev, [p.id]: { ...prev[p.id], prompt: e.target.value } })), style: { minHeight: '100px' } }), _jsxs("div", { className: "edit-actions", children: [_jsx("button", { className: "edit-save-btn", onClick: () => directUpdate(p.id, 'prompt', editValues[p.id]?.prompt || ''), children: "\u4FDD\u5B58" }), _jsx("button", { className: "edit-cancel-btn", onClick: () => cancelEdit(p.id, 'prompt'), children: "\u30AD\u30E3\u30F3\u30BB\u30EB" })] })] })) : (_jsx(MathText, { text: p.prompt, className: "section-content", style: { whiteSpace: 'pre-wrap' } })), p.id && (_jsxs(_Fragment, { children: [_jsx("div", { className: "suggest-buttons", children: loadingSuggestions.has(p.id) ? (_jsx("div", { style: { fontSize: '0.85rem', color: '#999' }, children: "\u30B5\u30B8\u30A7\u30B9\u30C8\u8AAD\u307F\u8FBC\u307F\u4E2D..." })) : suggestions[p.id]?.prompt ? (_jsxs(_Fragment, { children: [suggestions[p.id].prompt.map((suggest, idx) => (_jsx("button", { className: "btn-suggest", onClick: () => revise(p.id, 'prompt', suggest), disabled: isProcessing, children: suggest }, idx))), _jsx("button", { className: "btn-suggest", style: { backgroundColor: '#f0f0f0', fontWeight: 'bold' }, onClick: () => setShowCustomInput(prev => ({ ...prev, [p.id]: { ...prev[p.id], prompt: !prev[p.id]?.prompt } })), disabled: isProcessing, children: "\uFF0B \u30AB\u30B9\u30BF\u30E0\u6539\u5584" })] })) : (_jsx("button", { className: "btn-suggest", onClick: () => fetchSuggestions(p.id), children: "\u30B5\u30B8\u30A7\u30B9\u30C8\u3092\u8868\u793A" })) }), showCustomInput[p.id]?.prompt && (_jsxs("div", { style: { marginTop: '10px', display: 'flex', gap: '8px', alignItems: 'center' }, children: [_jsx("input", { type: "text", placeholder: "\u6539\u5584\u6307\u793A\u3092\u5165\u529B\uFF08\u4F8B\uFF1A\u4E2D\u5B66\u751F\u5411\u3051\u306B\u8AAC\u660E\u3092\u7C21\u5358\u306B\u3057\u3066\uFF09", style: {
                                                                                        flex: 1,
                                                                                        padding: '8px',
                                                                                        border: '1px solid #dee2e6',
                                                                                        borderRadius: '6px',
                                                                                        fontSize: '0.9rem'
                                                                                    }, value: p.id ? (customPrompts[p.id]?.prompt || '') : '', onChange: (e) => {
                                                                                        if (p.id) {
                                                                                            const problemId = p.id;
                                                                                            setCustomPrompts(prev => ({ ...prev, [problemId]: { ...prev[problemId], prompt: e.target.value } }));
                                                                                        }
                                                                                    }, onKeyPress: (e) => {
                                                                                        if (e.key === 'Enter' && p.id && customPrompts[p.id]?.prompt) {
                                                                                            const problemId = p.id;
                                                                                            revise(problemId, 'prompt', customPrompts[problemId].prompt);
                                                                                            setCustomPrompts(prev => ({ ...prev, [problemId]: { ...prev[problemId], prompt: '' } }));
                                                                                        }
                                                                                    } }), _jsx("button", { className: "btn-suggest", onClick: () => {
                                                                                        if (p.id && customPrompts[p.id]?.prompt) {
                                                                                            const problemId = p.id;
                                                                                            revise(problemId, 'prompt', customPrompts[problemId].prompt);
                                                                                            setCustomPrompts(prev => ({ ...prev, [problemId]: { ...prev[problemId], prompt: '' } }));
                                                                                        }
                                                                                    }, disabled: isProcessing || !p.id || !customPrompts[p.id]?.prompt, children: "\u5B9F\u884C" })] }))] }))] }), p.type === 'mcq' && p.choices && (_jsxs("div", { className: "qcard-section", children: [_jsxs("div", { className: "section-label", style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, children: [_jsx("span", { children: "\u9078\u629E\u80A2" }), p.id && !editMode[p.id]?.choices && (_jsx("button", { className: "edit-btn", onClick: () => startEdit(p.id, 'choices', p.choices), children: "\u7DE8\u96C6" }))] }), editMode[p.id]?.choices ? (_jsxs("div", { children: [editValues[p.id]?.choices?.map((choice, idx) => (_jsxs("div", { style: { marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }, children: [_jsxs("span", { style: { fontWeight: 'bold', minWidth: '20px' }, children: [String.fromCharCode(65 + idx), "."] }), _jsx("input", { className: "edit-input", type: "text", value: choice, onChange: (e) => {
                                                                                        const newChoices = [...(editValues[p.id]?.choices || [])];
                                                                                        newChoices[idx] = e.target.value;
                                                                                        setEditValues(prev => ({ ...prev, [p.id]: { ...prev[p.id], choices: newChoices } }));
                                                                                    }, style: { flex: 1 } })] }, idx))), _jsxs("div", { className: "edit-actions", children: [_jsx("button", { className: "edit-save-btn", onClick: () => directUpdate(p.id, 'choices', editValues[p.id]?.choices || []), children: "\u4FDD\u5B58" }), _jsx("button", { className: "edit-cancel-btn", onClick: () => cancelEdit(p.id, 'choices'), children: "\u30AD\u30E3\u30F3\u30BB\u30EB" })] })] })) : (_jsx("div", { className: "section-content", children: _jsx("ol", { type: 'A', children: p.choices.map((c, idx) => (_jsx("li", { children: _jsx(MathText, { text: c }) }, idx))) }) })), p.id && (_jsxs(_Fragment, { children: [_jsx("div", { className: "suggest-buttons", children: loadingSuggestions.has(p.id) ? (_jsx("div", { style: { fontSize: '0.85rem', color: '#999' }, children: "\u30B5\u30B8\u30A7\u30B9\u30C8\u8AAD\u307F\u8FBC\u307F\u4E2D..." })) : suggestions[p.id]?.choices ? (_jsxs(_Fragment, { children: [suggestions[p.id].choices.map((suggest, idx) => (_jsx("button", { className: "btn-suggest", onClick: () => revise(p.id, 'choices', suggest), disabled: isProcessing, children: suggest }, idx))), _jsx("button", { className: "btn-suggest", style: { backgroundColor: '#f0f0f0', fontWeight: 'bold' }, onClick: () => setShowCustomInput(prev => ({ ...prev, [p.id]: { ...prev[p.id], choices: !prev[p.id]?.choices } })), disabled: isProcessing, children: "\uFF0B \u30AB\u30B9\u30BF\u30E0\u6539\u5584" })] })) : (_jsx("button", { className: "btn-suggest", onClick: () => fetchSuggestions(p.id), children: "\u30B5\u30B8\u30A7\u30B9\u30C8\u3092\u8868\u793A" })) }), showCustomInput[p.id]?.choices && (_jsxs("div", { style: { marginTop: '10px', display: 'flex', gap: '8px', alignItems: 'center' }, children: [_jsx("input", { type: "text", placeholder: "\u6539\u5584\u6307\u793A\u3092\u5165\u529B\uFF08\u4F8B\uFF1A\u3088\u308A\u7D1B\u3089\u308F\u3057\u3044\u9078\u629E\u80A2\u306B\u3057\u3066\uFF09", style: {
                                                                                        flex: 1,
                                                                                        padding: '8px',
                                                                                        border: '1px solid #dee2e6',
                                                                                        borderRadius: '6px',
                                                                                        fontSize: '0.9rem'
                                                                                    }, value: p.id ? (customPrompts[p.id]?.choices || '') : '', onChange: (e) => {
                                                                                        if (p.id) {
                                                                                            const problemId = p.id;
                                                                                            setCustomPrompts(prev => ({ ...prev, [problemId]: { ...prev[problemId], choices: e.target.value } }));
                                                                                        }
                                                                                    }, onKeyPress: (e) => {
                                                                                        if (e.key === 'Enter' && p.id && customPrompts[p.id]?.choices) {
                                                                                            const problemId = p.id;
                                                                                            revise(problemId, 'choices', customPrompts[problemId].choices);
                                                                                            setCustomPrompts(prev => ({ ...prev, [problemId]: { ...prev[problemId], choices: '' } }));
                                                                                        }
                                                                                    } }), _jsx("button", { className: "btn-suggest", onClick: () => {
                                                                                        if (p.id && customPrompts[p.id]?.choices) {
                                                                                            const problemId = p.id;
                                                                                            revise(problemId, 'choices', customPrompts[problemId].choices);
                                                                                            setCustomPrompts(prev => ({ ...prev, [problemId]: { ...prev[problemId], choices: '' } }));
                                                                                        }
                                                                                    }, disabled: isProcessing || !p.id || !customPrompts[p.id]?.choices, children: "\u5B9F\u884C" })] }))] }))] })), _jsxs("div", { className: "qcard-section answer-section", children: [_jsxs("div", { className: "section-label", style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, children: [_jsx("span", { children: "\u7B54\u3048" }), p.id && !editMode[p.id]?.answer && (_jsx("button", { className: "edit-btn", onClick: () => startEdit(p.id, 'answer', p.answer), style: { borderColor: '#74c0fc', color: '#1864ab' }, children: "\u7DE8\u96C6" }))] }), editMode[p.id]?.answer ? (_jsxs("div", { children: [_jsx("input", { className: "edit-input", type: "text", value: editValues[p.id]?.answer || '', onChange: (e) => setEditValues(prev => ({ ...prev, [p.id]: { ...prev[p.id], answer: e.target.value } })), style: { fontWeight: '600', color: '#1864ab' } }), _jsxs("div", { className: "edit-actions", children: [_jsx("button", { className: "edit-save-btn", onClick: () => directUpdate(p.id, 'answer', editValues[p.id]?.answer || ''), children: "\u4FDD\u5B58" }), _jsx("button", { className: "edit-cancel-btn", onClick: () => cancelEdit(p.id, 'answer'), children: "\u30AD\u30E3\u30F3\u30BB\u30EB" })] })] })) : (_jsxs("div", { className: "section-content answer-text", children: [ansLabel && _jsxs("span", { children: [ansLabel, ". "] }), _jsx(MathText, { text: p.answer, style: { display: 'inline' } })] }))] }), _jsxs("div", { className: "qcard-section", children: [_jsxs("div", { className: "section-label", style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, children: [_jsx("span", { children: "\u89E3\u8AAC" }), p.id && !editMode[p.id]?.explanation && (_jsx("button", { className: "edit-btn", onClick: () => startEdit(p.id, 'explanation', p.explanation), children: "\u7DE8\u96C6" }))] }), editMode[p.id]?.explanation ? (_jsxs("div", { children: [_jsx("textarea", { className: "edit-textarea", value: editValues[p.id]?.explanation || '', onChange: (e) => setEditValues(prev => ({ ...prev, [p.id]: { ...prev[p.id], explanation: e.target.value } })), style: { minHeight: '80px' } }), _jsxs("div", { className: "edit-actions", children: [_jsx("button", { className: "edit-save-btn", onClick: () => directUpdate(p.id, 'explanation', editValues[p.id]?.explanation || ''), children: "\u4FDD\u5B58" }), _jsx("button", { className: "edit-cancel-btn", onClick: () => cancelEdit(p.id, 'explanation'), children: "\u30AD\u30E3\u30F3\u30BB\u30EB" })] })] })) : (_jsx(MathText, { text: p.explanation || '', className: "section-content" })), p.id && (_jsxs(_Fragment, { children: [_jsx("div", { className: "suggest-buttons", children: loadingSuggestions.has(p.id) ? (_jsx("div", { style: { fontSize: '0.85rem', color: '#999' }, children: "\u30B5\u30B8\u30A7\u30B9\u30C8\u8AAD\u307F\u8FBC\u307F\u4E2D..." })) : suggestions[p.id]?.explanation ? (_jsxs(_Fragment, { children: [suggestions[p.id].explanation.map((suggest, idx) => (_jsx("button", { className: "btn-suggest", onClick: () => revise(p.id, 'explanation', suggest), disabled: isProcessing, children: suggest }, idx))), _jsx("button", { className: "btn-suggest", style: { backgroundColor: '#f0f0f0', fontWeight: 'bold' }, onClick: () => setShowCustomInput(prev => ({ ...prev, [p.id]: { ...prev[p.id], explanation: !prev[p.id]?.explanation } })), disabled: isProcessing, children: "\uFF0B \u30AB\u30B9\u30BF\u30E0\u6539\u5584" })] })) : (_jsx("button", { className: "btn-suggest", onClick: () => fetchSuggestions(p.id), children: "\u30B5\u30B8\u30A7\u30B9\u30C8\u3092\u8868\u793A" })) }), showCustomInput[p.id]?.explanation && (_jsxs("div", { style: { marginTop: '10px', display: 'flex', gap: '8px', alignItems: 'center' }, children: [_jsx("input", { type: "text", placeholder: "\u6539\u5584\u6307\u793A\u3092\u5165\u529B\uFF08\u4F8B\uFF1A\u8A08\u7B97\u904E\u7A0B\u3092\u8A73\u3057\u304F\u8AAC\u660E\u3057\u3066\uFF09", style: {
                                                                                        flex: 1,
                                                                                        padding: '8px',
                                                                                        border: '1px solid #dee2e6',
                                                                                        borderRadius: '6px',
                                                                                        fontSize: '0.9rem'
                                                                                    }, value: p.id ? (customPrompts[p.id]?.explanation || '') : '', onChange: (e) => {
                                                                                        if (p.id) {
                                                                                            const problemId = p.id;
                                                                                            setCustomPrompts(prev => ({ ...prev, [problemId]: { ...prev[problemId], explanation: e.target.value } }));
                                                                                        }
                                                                                    }, onKeyPress: (e) => {
                                                                                        if (e.key === 'Enter' && p.id && customPrompts[p.id]?.explanation) {
                                                                                            const problemId = p.id;
                                                                                            revise(problemId, 'explanation', customPrompts[problemId].explanation);
                                                                                            setCustomPrompts(prev => ({ ...prev, [problemId]: { ...prev[problemId], explanation: '' } }));
                                                                                        }
                                                                                    } }), _jsx("button", { className: "btn-suggest", onClick: () => {
                                                                                        if (p.id && customPrompts[p.id]?.explanation) {
                                                                                            const problemId = p.id;
                                                                                            revise(problemId, 'explanation', customPrompts[problemId].explanation);
                                                                                            setCustomPrompts(prev => ({ ...prev, [problemId]: { ...prev[problemId], explanation: '' } }));
                                                                                        }
                                                                                    }, disabled: isProcessing || !p.id || !customPrompts[p.id]?.explanation, children: "\u5B9F\u884C" })] }))] }))] })] }, p.id || i));
                                            }) })] })] })] }), _jsx("div", { className: "footer", children: "sakumon-poc" })] }));
}

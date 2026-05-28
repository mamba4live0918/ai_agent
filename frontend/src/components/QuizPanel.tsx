import { useState, useEffect, useCallback } from 'react';
import { generateQuiz, submitQuizAnswer, getQuizSessions, getQuizSession, deleteQuizSession } from '../services/api';
import type { QuizSessionDetail, QuizQuestion, QuizAnswer, Category, Document } from '../types';

type Mode = 'generate' | 'answering' | 'results';

interface Props {
  documents: Document[];
  categories: Category[];
}

export default function QuizPanel({ documents, categories }: Props) {
  const [mode, setMode] = useState<Mode>('generate');
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [docSearch, setDocSearch] = useState('');
  const [choiceCount, setChoiceCount] = useState(4);
  const [shortAnswerCount, setShortAnswerCount] = useState(1);
  const questionCount = choiceCount + shortAnswerCount;
  const questionTypes = [
    ...(choiceCount > 0 ? ['choice' as const] : []),
    ...(shortAnswerCount > 0 ? ['short_answer' as const] : []),
  ];
  const [loading, setLoading] = useState(false);

  const setCounts = (choice: number, short: number) => {
    if (choice < 0 || short < 0) return;
    const total = choice + short;
    if (total < 1 || total > 20) return;
    setChoiceCount(choice);
    setShortAnswerCount(short);
  };
  const [error, setError] = useState('');

  // Active session
  const [session, setSession] = useState<QuizSessionDetail | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [localAnswers, setLocalAnswers] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Record<string, QuizAnswer>>({});
  const [submitting, setSubmitting] = useState(false);

  // History
  const [sessions, setSessions] = useState<QuizSession[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const loadSessions = useCallback(async () => {
    try { setSessions(await getQuizSessions(1, 50)); } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // Filter documents by selected category + search text (client-side)
  const filteredDocs = (selectedCat
    ? documents.filter(d => d.category_ids.includes(selectedCat))
    : documents
  ).filter(d => {
    if (!docSearch.trim()) return true;
    const q = docSearch.toLowerCase();
    return d.title.toLowerCase().includes(q) || d.file_type.toLowerCase().includes(q);
  });

  const handleCategoryChange = (catId: string | null) => {
    setSelectedCat(catId);
    setSelectedDocIds([]);
    setDocSearch('');
  };

  const toggleDoc = (docId: string) => {
    setSelectedDocIds(prev =>
      prev.includes(docId) ? prev.filter(d => d !== docId) : [...prev, docId]
    );
  };

  const currentQuestion: QuizQuestion | null =
    session && currentIdx < session.questions.length ? session.questions[currentIdx] : null;

  const allAnswered = session
    ? session.questions.every(q => localAnswers[q.id] || answers[q.id] || q.answer)
    : false;

  const handleGenerate = async () => {
    setError('');
    setLoading(true);
    try {
      const s = await generateQuiz(
        selectedCat,
        selectedDocIds.length > 0 ? selectedDocIds : null,
        questionCount,
        questionTypes,
        { choice: choiceCount, short_answer: shortAnswerCount },
      );
      setSession(s);
      setCurrentIdx(0);
      setLocalAnswers({});
      setAnswers({});
      setUserAnswer('');
      setMode('answering');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '生成失败');
    } finally {
      setLoading(false);
    }
  };

  const saveLocalAnswer = () => {
    if (!currentQuestion) return;
    setLocalAnswers(prev => ({ ...prev, [currentQuestion.id]: userAnswer }));
  };

  const handleFinishExam = async () => {
    if (!session) return;
    // Save the current answer before submitting
    if (currentQuestion && userAnswer) {
      setLocalAnswers(prev => ({ ...prev, [currentQuestion.id]: userAnswer }));
    }

    setSubmitting(true);
    setError('');
    try {
      // Build the final merged map (localAnswers + current unsaved)
      const allLocal: Record<string, string> = { ...localAnswers };
      if (currentQuestion && userAnswer) {
        allLocal[currentQuestion.id] = userAnswer;
      }

      // Submit all answers to backend
      const results: Record<string, QuizAnswer> = {};
      for (const q of session.questions) {
        const ans = allLocal[q.id] || '';
        if (ans.trim()) {
          const result = await submitQuizAnswer(session.id, q.id, ans.trim());
          results[q.id] = result;
        }
      }
      setAnswers(results);

      // Load completed session
      const updated = await getQuizSession(session.id);
      setSession(updated);
      setMode('results');
      loadSessions();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewHistory = async (id: string) => {
    setLoading(true);
    setError('');
    try {
      const s = await getQuizSession(id);
      setSession(s);
      const ansMap: Record<string, QuizAnswer> = {};
      if (s.questions) {
        for (const q of s.questions) {
          if (q.answer) ansMap[q.id] = q.answer;
        }
      }
      setAnswers(ansMap);
      setLocalAnswers({});
      if (s.status === 'completed') {
        setMode('results');
      } else {
        const firstUnanswered = s.questions.findIndex(q => !q.answer);
        setCurrentIdx(firstUnanswered >= 0 ? firstUnanswered : 0);
        setUserAnswer('');
        setMode('answering');
      }
    } catch {
      setError('加载失败');
    } finally {
      setLoading(false);
      setShowHistory(false);
    }
  };

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const confirmDelete = async (id: string) => {
    try {
      await deleteQuizSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
      if (session?.id === id) {
        setSession(null);
        setMode('generate');
      }
    } catch { /* ignore */ }
    setDeletingId(null);
  };

  const handleNewQuiz = () => {
    setSession(null);
    setLocalAnswers({});
    setAnswers({});
    setUserAnswer('');
    setCurrentIdx(0);
    setMode('generate');
  };

  const goToQuestion = (idx: number) => {
    if (idx < 0 || !session || idx >= session.questions.length) return;
    // Save current answer before navigating
    if (currentQuestion && userAnswer) {
      setLocalAnswers(prev => ({ ...prev, [currentQuestion.id]: userAnswer }));
    }
    setCurrentIdx(idx);
    const local = localAnswers[session.questions[idx].id];
    const backend = answers[session.questions[idx].id];
    setUserAnswer(local || (backend ? backend.user_answer : '') || '');
  };

  const distributeTotal = (total: number) => {
    const hasChoice = choiceCount > 0 || shortAnswerCount === 0;
    const hasShort = shortAnswerCount > 0 || choiceCount === 0;
    if (hasChoice && hasShort) {
      const c = Math.round(total * 0.7);
      setCounts(c, total - c);
    } else if (hasChoice) {
      setCounts(total, 0);
    } else if (hasShort) {
      setCounts(0, total);
    }
  };

  const currentlyAnswered = currentQuestion
    ? !!(localAnswers[currentQuestion.id] || answers[currentQuestion.id])
    : false;
  const lastAnswer = currentQuestion ? answers[currentQuestion.id] : null;

  // ─── Render: Generate ───
  if (mode === 'generate') {
    return (
      <>
        <div className="flex items-center justify-between mb-5">
          <button
            onClick={() => { setShowHistory(!showHistory); loadSessions(); }}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              showHistory
                ? 'border-[var(--accent-blue)] text-[var(--accent-blue)] bg-[var(--btn-blue)]/10'
                : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            历史记录
          </button>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 bg-[var(--btn-danger)]/10 border border-[var(--btn-danger)]/30 rounded-xl text-xs text-[var(--accent-red)]">
            {error}
          </div>
        )}

        {showHistory && (
          <div className="mb-5 border border-[var(--border-subtle)] rounded-xl overflow-hidden max-h-64 overflow-y-auto">
            {sessions.length === 0 ? (
              <p className="px-4 py-6 text-xs text-[var(--text-placeholder)] text-center">暂无练习记录</p>
            ) : (
              sessions.map(s => (
                <div
                  key={s.id}
                  onClick={() => handleViewHistory(s.id)}
                  className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)] last:border-b-0 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      s.status === 'completed'
                        ? 'bg-[var(--btn-primary)]/20 text-[var(--accent-green)]'
                        : 'bg-[var(--accent-orange)]/20 text-[var(--accent-orange)]'
                    }`}>
                      {s.status === 'completed' ? '已完成' : '进行中'}
                    </span>
                    <span className="text-xs text-[var(--text-primary)]">
                      {s.question_count} 题
                      {s.score !== null && <span className="text-[var(--accent-blue)] ml-1">{s.score}分</span>}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 relative">
                    <span className="text-[10px] text-[var(--text-placeholder)]">
                      {new Date(s.created_at).toLocaleDateString('zh-CN')}
                    </span>
                    <span
                      onClick={(e) => { e.stopPropagation(); setDeletingId(deletingId === s.id ? null : s.id); }}
                      className="text-[var(--text-placeholder)] hover:text-[var(--accent-red)] text-xs cursor-pointer px-1"
                    >
                      ✕
                    </span>
                    {deletingId === s.id && (
                      <div className="absolute right-0 top-full mt-1.5 z-30 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl shadow-lg p-3 min-w-[200px] text-center">
                        <div className="absolute -top-1.5 right-3 w-3 h-3 rotate-45 bg-[var(--bg-primary)] border-l border-t border-[var(--border-subtle)]" />
                        <p className="text-xs text-[var(--text-primary)] mb-2.5">确定删除这条练习记录？</p>
                        <p className="text-[10px] text-[var(--text-placeholder)] mb-3">删除后无法恢复</p>
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); confirmDelete(s.id); }}
                            className="px-3 py-1 text-[11px] rounded-full bg-[var(--accent-red)] text-white hover:opacity-90 transition-opacity"
                          >
                            确认删除
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeletingId(null); }}
                            className="px-3 py-1 text-[11px] rounded-full border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        <div className="space-y-4">
          {/* Category selector */}
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">知识分类（可选）</label>
            <select
              value={selectedCat || ''}
              onChange={e => handleCategoryChange(e.target.value || null)}
              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm px-3 py-2 focus:outline-none focus:border-[var(--accent-blue)] transition-colors"
            >
              <option value="">全部分类</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Document selector */}
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">
              指定文档出题（可选，可多选）
              {selectedDocIds.length > 0 && (
                <span className="text-[var(--accent-blue)] ml-1">已选 {selectedDocIds.length} 篇</span>
              )}
            </label>
            {/* Search + select all */}
            <div className="flex items-center gap-2 mb-1.5">
              <div className="relative flex-1">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--text-placeholder)]" viewBox="0 0 16 16" fill="currentColor">
                  <path fillRule="evenodd" d="M10.5 6.5a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm-1.237 3.106a5.5 5.5 0 1 1 1.059-1.058l2.79 2.79a.75.75 0 1 1-1.061 1.06l-2.788-2.792Z" clipRule="evenodd"/>
                </svg>
                <input
                  type="text"
                  value={docSearch}
                  onChange={e => setDocSearch(e.target.value)}
                  placeholder="搜索文档..."
                  className="w-full pl-7 pr-3 py-1.5 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)] transition-colors"
                />
              </div>
              <button
                onClick={() => {
                  if (selectedDocIds.length === filteredDocs.length && filteredDocs.length > 0) {
                    setSelectedDocIds([]);
                  } else {
                    setSelectedDocIds(filteredDocs.map(d => d.id));
                  }
                }}
                className="text-[10px] px-2 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-placeholder)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors flex-shrink-0"
              >
                {selectedDocIds.length === filteredDocs.length && filteredDocs.length > 0 ? '取消' : '全选'}
              </button>
            </div>
            {/* Document list with scroll */}
            <div
              className="border border-[var(--border-subtle)] rounded-xl overflow-y-auto"
              style={{ maxHeight: '220px', scrollbarWidth: 'thin', scrollbarColor: 'var(--border-default) transparent' }}
            >
              {filteredDocs.length === 0 ? (
                <p className="px-3 py-4 text-xs text-[var(--text-placeholder)] text-center">
                  {docSearch.trim() ? '无匹配文档' : selectedCat ? '该分类下暂无文档' : '暂无文档，请先在知识库中上传文档'}
                </p>
              ) : (
                filteredDocs.map(d => (
                  <button
                    key={d.id}
                    onClick={() => toggleDoc(d.id)}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--bg-secondary)] ${
                      selectedDocIds.includes(d.id) ? 'bg-[var(--btn-blue)]/10' : ''
                    }`}
                  >
                    <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 text-[10px] ${
                      selectedDocIds.includes(d.id)
                        ? 'bg-[var(--accent-blue)] border-[var(--accent-blue)] text-white'
                        : 'border-[var(--border-default)] text-transparent'
                    }`}>
                      ✓
                    </span>
                    <span className="text-[var(--text-primary)] truncate flex-1">{d.title}</span>
                    <span className="text-[10px] text-[var(--text-placeholder)] flex-shrink-0">{d.file_type.toUpperCase()}</span>
                  </button>
                ))
              )}
            </div>
            {filteredDocs.length > 0 && (
              <p className="text-[10px] text-[var(--text-placeholder)] mt-1">
                共 {filteredDocs.length} 篇文档
              </p>
            )}
          </div>

          {/* Question count */}
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">题目数量</label>
            <div className="flex gap-2 items-center">
              {[3, 5, 10, 15].map(n => (
                <button
                  key={n}
                  onClick={() => distributeTotal(n)}
                  className={`px-4 py-1.5 text-xs rounded-full border transition-colors ${
                    questionCount === n
                      ? 'border-[var(--accent-blue)] bg-[var(--btn-blue)]/10 text-[var(--accent-blue)]'
                      : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {n} 题
                </button>
              ))}
              <input
                type="number"
                min={1}
                max={20}
                value={[3, 5, 10, 15].includes(questionCount) ? '' : questionCount}
                onChange={e => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v) && v >= 1 && v <= 20) distributeTotal(v);
                }}
                placeholder="自定义"
                className="w-[68px] px-2 py-1.5 text-xs text-center rounded-full border border-dashed border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)] transition-colors"
              />
            </div>
          </div>

          {/* Question types with per-type counts */}
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">题目类型</label>
            <div className="flex gap-3">
              <label className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors ${
                choiceCount > 0
                  ? 'border-[var(--accent-blue)]/40 bg-[var(--btn-blue)]/5'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-secondary)]'
              }`}>
                <input
                  type="checkbox"
                  checked={choiceCount > 0}
                  onChange={e => {
                    if (e.target.checked) {
                      const c = Math.max(1, Math.round(questionCount * 0.7));
                      setCounts(c, questionCount - c);
                    } else {
                      setCounts(0, questionCount);
                    }
                  }}
                  className="w-3 h-3 rounded accent-[var(--accent-blue)]"
                />
                <span className="text-xs text-[var(--text-primary)]">选择题</span>
                <button
                  onClick={() => { if (choiceCount > 0) setCounts(choiceCount - 1, shortAnswerCount + 1); }}
                  disabled={choiceCount <= 0}
                  className="w-5 h-5 inline-flex items-center justify-center rounded-full text-[10px] text-[var(--text-placeholder)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-20 transition-colors"
                >−</button>
                <span className="text-xs font-semibold text-[var(--text-primary)] tabular-nums min-w-[16px] text-center">{choiceCount}</span>
                <button
                  onClick={() => { if (shortAnswerCount > 0) setCounts(choiceCount + 1, shortAnswerCount - 1); }}
                  disabled={shortAnswerCount <= 0}
                  className="w-5 h-5 inline-flex items-center justify-center rounded-full text-[10px] text-[var(--text-placeholder)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-20 transition-colors"
                >+</button>
                <span className="text-[10px] text-[var(--text-placeholder)]">题</span>
              </label>
              <label className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors ${
                shortAnswerCount > 0
                  ? 'border-[var(--accent-blue)]/40 bg-[var(--btn-blue)]/5'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-secondary)]'
              }`}>
                <input
                  type="checkbox"
                  checked={shortAnswerCount > 0}
                  onChange={e => {
                    if (e.target.checked) {
                      const c = Math.max(1, Math.round(questionCount * 0.3));
                      setCounts(questionCount - c, c);
                    } else {
                      setCounts(questionCount, 0);
                    }
                  }}
                  className="w-3 h-3 rounded accent-[var(--accent-blue)]"
                />
                <span className="text-xs text-[var(--text-primary)]">简答题</span>
                <button
                  onClick={() => { if (shortAnswerCount > 0) setCounts(choiceCount + 1, shortAnswerCount - 1); }}
                  disabled={shortAnswerCount <= 0}
                  className="w-5 h-5 inline-flex items-center justify-center rounded-full text-[10px] text-[var(--text-placeholder)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-20 transition-colors"
                >−</button>
                <span className="text-xs font-semibold text-[var(--text-primary)] tabular-nums min-w-[16px] text-center">{shortAnswerCount}</span>
                <button
                  onClick={() => { if (choiceCount > 0) setCounts(choiceCount - 1, shortAnswerCount + 1); }}
                  disabled={choiceCount <= 0}
                  className="w-5 h-5 inline-flex items-center justify-center rounded-full text-[10px] text-[var(--text-placeholder)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-20 transition-colors"
                >+</button>
                <span className="text-[10px] text-[var(--text-placeholder)]">题</span>
              </label>
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={loading || questionCount === 0}
            className="w-full mt-2 px-4 py-2.5 bg-[var(--btn-primary)] text-white text-sm rounded-full hover:bg-[var(--btn-primary-hover)] disabled:opacity-50 transition-colors"
          >
            {loading ? '正在生成题目...' : '开始练习'}
          </button>
        </div>
      </>
    );
  }

  // ─── Render: Answering ───
  if (mode === 'answering' && session && currentQuestion) {
    const answeredCount = session.questions.filter(q => answers[q.id] || q.answer).length;
    const progress = (answeredCount / session.questions.length) * 100;
    const isLast = currentIdx + 1 >= session.questions.length;

    return (
      <>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={handleNewQuiz}
              className="text-xs text-[var(--text-placeholder)] hover:text-[var(--text-secondary)] transition-colors"
            >
              退出
            </button>
            <span className="text-xs text-[var(--text-secondary)]">
              第 {currentIdx + 1} / {session.questions.length} 题
              <span className="text-[var(--text-placeholder)] ml-1">（已答 {answeredCount} 题）</span>
            </span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
            {currentQuestion.question_type === 'choice' ? '选择题' : '简答题'}
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1 bg-[var(--bg-tertiary)] rounded-full mb-5 overflow-hidden">
          <div
            className="h-full bg-[var(--accent-blue)] rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 bg-[var(--btn-danger)]/10 border border-[var(--btn-danger)]/30 rounded-xl text-xs text-[var(--accent-red)]">
            {error}
          </div>
        )}

        {/* Question stem */}
        <div className="mb-5">
          <p className="text-sm text-[var(--text-primary)] leading-relaxed">{currentQuestion.stem}</p>
          {currentQuestion.kb_reference && (
            <div className="mt-2 px-3 py-1.5 bg-[var(--bg-secondary)] rounded-lg text-[10px] text-[var(--text-placeholder)]">
              来源：{(currentQuestion.kb_reference as Record<string, string>).title || '知识库'}
            </div>
          )}
        </div>

        {/* Answer area — always visible, no grading until final submit */}
        {currentQuestion.question_type === 'choice' && currentQuestion.options ? (
          <div className="space-y-2 mb-4">
            {Object.entries(currentQuestion.options).map(([key, val]) => (
              <button
                key={key}
                onClick={() => { setUserAnswer(key); setLocalAnswers(prev => ({ ...prev, [currentQuestion.id]: key })); }}
                className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors ${
                  userAnswer === key
                    ? 'border-[var(--accent-blue)] bg-[var(--btn-blue)]/10 text-[var(--accent-blue)]'
                    : 'border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--border-default)] hover:bg-[var(--bg-secondary)]'
                }`}
              >
                <span className="font-medium mr-2">{key}.</span>
                {val as string}
              </button>
            ))}
          </div>
        ) : (
          <textarea
            value={userAnswer}
            onChange={e => { setUserAnswer(e.target.value); setLocalAnswers(prev => ({ ...prev, [currentQuestion.id]: e.target.value })); }}
            placeholder="输入你的答案..."
            rows={4}
            className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm px-4 py-3 focus:outline-none focus:border-[var(--accent-blue)] transition-colors resize-none mb-4"
          />
        )}

        {/* Navigation bar */}
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => goToQuestion(currentIdx - 1)}
            disabled={currentIdx === 0}
            className="px-3 py-2 text-xs rounded-full border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ← 上一题
          </button>

          <span className="flex-1 text-center text-[10px] text-[var(--text-placeholder)]">
            {currentIdx + 1} / {session.questions.length}
          </span>

          {isLast ? (
            <button
              onClick={handleFinishExam}
              disabled={submitting || !allAnswered}
              className="px-4 py-2 text-xs rounded-full bg-[var(--btn-primary)] text-white hover:bg-[var(--btn-primary-hover)] disabled:opacity-50 transition-colors"
            >
              {submitting ? '提交中...' : '提交考试'}
            </button>
          ) : (
            <button
              onClick={() => goToQuestion(currentIdx + 1)}
              className="px-3 py-2 text-xs rounded-full border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
            >
              下一题 →
            </button>
          )}
        </div>
      </>
    );
  }

  // ─── Render: Results ───
  if (mode === 'results' && session) {
    return (
      <>
        {/* Score hero */}
        <div className="text-center mb-6">
          <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-3 ${
            (session.score || 0) >= 80 ? 'bg-[var(--accent-green)]/10 border-2 border-[var(--accent-green)]/40' :
            (session.score || 0) >= 60 ? 'bg-[var(--accent-orange)]/10 border-2 border-[var(--accent-orange)]/40' :
            'bg-[var(--accent-red)]/10 border-2 border-[var(--accent-red)]/40'
          }`}>
            <span className={`text-2xl font-bold ${
              (session.score || 0) >= 80 ? 'text-[var(--accent-green)]' :
              (session.score || 0) >= 60 ? 'text-[var(--accent-orange)]' :
              'text-[var(--accent-red)]'
            }`}>{session.score ?? '—'}</span>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">总分</p>
        </div>

        {/* Per-question review */}
        <div className="space-y-3 mb-5">
          {session.questions.map((q, i) => {
            const a = answers[q.id] || q.answer;
            const skipped = a?.feedback === '未作答。';
            return (
              <div key={q.id} className={`p-4 rounded-xl border ${
                skipped ? 'border-[var(--border-subtle)] bg-[var(--bg-secondary)] opacity-70' :
                a?.is_correct
                  ? 'border-[var(--accent-green)]/30 bg-[var(--accent-green)]/5'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-secondary)]'
              }`}>
                <div className="flex items-start gap-2 mb-2">
                  <span className={`text-xs font-bold mt-0.5 ${
                    skipped ? 'text-[var(--text-placeholder)]' :
                    a?.is_correct ? 'text-[var(--accent-green)]' : 'text-[var(--accent-orange)]'
                  }`}>
                    {skipped ? '⊘' : a?.is_correct ? '✓' : '✗'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--text-primary)] leading-relaxed">
                      <span className="text-[var(--text-placeholder)] mr-1">{i + 1}.</span>
                      {q.stem}
                    </p>
                    {q.question_type === 'choice' && q.options && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {Object.entries(q.options).map(([key, val]) => (
                          <span key={key} className={`text-[10px] px-2 py-0.5 rounded-full ${
                            key === q.correct_answer
                              ? 'bg-[var(--accent-green)]/20 text-[var(--accent-green)]'
                              : key === a?.user_answer && !a?.is_correct
                                ? 'bg-[var(--accent-red)]/20 text-[var(--accent-red)]'
                                : 'bg-[var(--bg-tertiary)] text-[var(--text-placeholder)]'
                          }`}>
                            {key}. {val as string}
                          </span>
                        ))}
                      </div>
                    )}
                    {q.question_type === 'short_answer' && (
                      <div className="mt-1.5 text-xs">
                        {a?.user_answer ? (
                          <span className="text-[var(--text-secondary)]">你的回答：{a.user_answer}</span>
                        ) : (
                          <span className="text-[var(--text-placeholder)] italic">未作答</span>
                        )}
                        {q.correct_answer && (
                          <details className="mt-1">
                            <summary className="text-[var(--accent-blue)] cursor-pointer">查看参考答案</summary>
                            <p className="text-[var(--text-secondary)] mt-0.5">{q.correct_answer}</p>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {a?.feedback && !skipped && (
                  <p className="text-xs text-[var(--text-secondary)] ml-5 leading-relaxed mb-2">{a.feedback}</p>
                )}
                {/* Correct answer — from answer object */}
                {a?.correct_answer && !skipped && !a.is_correct && (
                  <div className="ml-5 mb-2">
                    <p className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-0.5">正确答案</p>
                    {q.question_type === 'choice' ? (
                      <span className="text-xs font-medium text-[var(--accent-green)]">
                        {a.correct_answer}{q.options ? ` — ${(q.options as Record<string, string>)[a.correct_answer] || ''}` : ''}
                      </span>
                    ) : (
                      <p className="text-xs text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">{a.correct_answer}</p>
                    )}
                  </div>
                )}
                {/* Explanation — from answer object, always visible */}
                {a?.explanation && !skipped && (
                  <div className="ml-5">
                    <p className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-0.5">详细解析</p>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{a.explanation}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleNewQuiz}
            className="flex-1 px-4 py-2.5 bg-[var(--btn-primary)] text-white text-sm rounded-full hover:bg-[var(--btn-primary-hover)] transition-colors"
          >
            再来一次
          </button>
          <button
            onClick={() => { setMode('generate'); setSession(null); }}
            className="px-4 py-2.5 border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm rounded-full hover:bg-[var(--bg-secondary)] transition-colors"
          >
            返回
          </button>
        </div>
      </>
    );
  }

  return null;
}

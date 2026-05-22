import { useState } from 'react';
import type { EmotionAnalysis, IntentDetection, TalkingPointSuggestions } from '../types';

interface Props {
  analysis: {
    emotion_analysis?: EmotionAnalysis;
    intent_detection?: IntentDetection;
    suggestions?: TalkingPointSuggestions;
  };
}

type Tab = 'emotion' | 'intent' | 'suggestions';

const TAB_DEFS: { key: Tab; label: string }[] = [
  { key: 'emotion', label: '情感分析' },
  { key: 'intent', label: '客户意图' },
  { key: 'suggestions', label: '销售建议' },
];

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    positive: { bg: 'bg-[#238636]/10 border-[#238636]/40', text: 'text-[#3fb950]', label: '正面' },
    neutral: { bg: 'bg-[#d29922]/10 border-[#d29922]/40', text: 'text-[#d29922]', label: '中性' },
    negative: { bg: 'bg-[#f85149]/10 border-[#f85149]/40', text: 'text-[#f85149]', label: '负面' },
  };
  const s = map[sentiment] || map.neutral;
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium border ${s.bg} ${s.text}`}>{s.label}</span>;
}

function EmotionTab({ data }: { data: EmotionAnalysis }) {
  return (
    <div className="space-y-4 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-[#8b949e]">整体情感倾向</span>
        <SentimentBadge sentiment={data.overall_sentiment} />
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[#8b949e]">销售能量</span>
        <div className="flex gap-1.5">
          {['start', 'middle', 'end'].map((stage) => (
            <span key={stage} className="text-[10px] text-[#484f58]">{stage === 'start' ? '开' : stage === 'middle' ? '中' : '尾'}:
              <span className="text-[#e6edf3] ml-0.5">{data.salesperson_energy?.[stage] || '-'}</span>
            </span>
          ))}
        </div>
      </div>
      {data.customer_emotions?.length > 0 && (
        <div>
          <p className="text-[#8b949e] mb-1.5">客户情绪变化</p>
          <div className="space-y-1.5">
            {data.customer_emotions.map((e, i) => (
              <div key={i} className="bg-[#0d1117] border border-[#21262d] rounded p-2">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[#e6edf3] font-medium">{e.emotion}</span>
                  <span className="text-[10px] text-[#484f58]">{e.time_range}</span>
                </div>
                <p className="text-[#8b949e]">{e.trigger}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {data.summary && <p className="text-[#8b949e] leading-relaxed">{data.summary}</p>}
    </div>
  );
}

function IntentTab({ data }: { data: IntentDetection }) {
  return (
    <div className="space-y-4 text-xs">
      {data.buying_signals?.length > 0 && (
        <div>
          <p className="text-[#3fb950] font-medium mb-1.5">购买信号</p>
          <ul className="space-y-1">
            {data.buying_signals.map((s, i) => <li key={i} className="flex items-start gap-1.5 text-[#e6edf3]"><span className="text-[#3fb950] mt-0.5">✓</span> {s}</li>)}
          </ul>
        </div>
      )}
      {data.risk_signals?.length > 0 && (
        <div>
          <p className="text-[#f85149] font-medium mb-1.5">风险预警</p>
          <ul className="space-y-1">
            {data.risk_signals.map((s, i) => <li key={i} className="flex items-start gap-1.5 text-[#e6edf3]"><span className="text-[#f85149] mt-0.5">⚠</span> {s}</li>)}
          </ul>
        </div>
      )}
      {data.customer_intents?.length > 0 && (
        <div>
          <p className="text-[#8b949e] mb-1.5">客户意图</p>
          <div className="space-y-1.5">
            {data.customer_intents.map((it, i) => (
              <div key={i} className="bg-[#0d1117] border border-[#21262d] rounded p-2">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[#e6edf3] font-medium">{it.intent}</span>
                  <span className="text-[10px] text-[#484f58]">{Math.round(it.confidence * 100)}%</span>
                </div>
                <p className="text-[#8b949e] text-[11px] line-clamp-1">{it.evidence}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {data.summary && <p className="text-[#8b949e] leading-relaxed">{data.summary}</p>}
    </div>
  );
}

function SuggestionsTab({ data }: { data: TalkingPointSuggestions }) {
  return (
    <div className="space-y-4 text-xs">
      {data.follow_up_actions?.length > 0 && (
        <div>
          <p className="text-[#8b949e] mb-1.5">后续行动</p>
          <div className="space-y-1.5">
            {data.follow_up_actions.sort((a, b) => a.priority - b.priority).map((a, i) => (
              <div key={i} className="bg-[#0d1117] border border-[#21262d] rounded p-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1f6feb]/15 text-[#58a6ff]">P{a.priority}</span>
                  <span className="text-[#e6edf3] font-medium">{a.action}</span>
                </div>
                <p className="text-[#8b949e] text-[11px]">{a.reason}</p>
                {a.suggested_script && <p className="text-[#e6edf3] text-[11px] mt-1 p-1.5 bg-[#161b22] rounded border-l-2 border-[#1f6feb]">{a.suggested_script}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
      {data.key_talking_points?.length > 0 && (
        <div>
          <p className="text-[#8b949e] mb-1.5">话术要点</p>
          <ul className="space-y-1">
            {data.key_talking_points.map((s, i) => <li key={i} className="flex items-start gap-1.5 text-[#e6edf3]"><span className="text-[#a371f7] mt-0.5">♦</span> {s}</li>)}
          </ul>
        </div>
      )}
      {data.summary && <p className="text-[#8b949e] leading-relaxed">{data.summary}</p>}
    </div>
  );
}

export default function AnalysisPanel({ analysis }: Props) {
  const [tab, setTab] = useState<Tab>('emotion');

  return (
    <div className="h-full flex flex-col">
      <div className="flex border-b border-[#21262d]">
        {TAB_DEFS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 py-2 text-[11px] font-medium transition-colors ${
              tab === t.key
                ? 'text-[#e6edf3] border-b-2 border-[#1f6feb] bg-[#161b22]/50'
                : 'text-[#8b949e] hover:text-[#e6edf3]'
            }`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {tab === 'emotion' && analysis.emotion_analysis && <EmotionTab data={analysis.emotion_analysis} />}
        {tab === 'emotion' && !analysis.emotion_analysis && <p className="text-xs text-[#484f58] text-center py-6">无情感分析数据</p>}
        {tab === 'intent' && analysis.intent_detection && <IntentTab data={analysis.intent_detection} />}
        {tab === 'intent' && !analysis.intent_detection && <p className="text-xs text-[#484f58] text-center py-6">无意图分析数据</p>}
        {tab === 'suggestions' && analysis.suggestions && <SuggestionsTab data={analysis.suggestions} />}
        {tab === 'suggestions' && !analysis.suggestions && <p className="text-xs text-[#484f58] text-center py-6">无销售建议数据</p>}
      </div>
    </div>
  );
}

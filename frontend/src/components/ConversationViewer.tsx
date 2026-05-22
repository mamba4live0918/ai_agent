import AnalysisPanel from './AnalysisPanel';
import type { SalesConversationDetail } from '../types';

interface Props {
  detail: SalesConversationDetail;
}

export default function ConversationViewer({ detail }: Props) {
  const isProcessing = detail.status === 'processing';
  const isFailed = detail.status === 'failed';

  return (
    <div className="flex h-full">
      {/* Transcript */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-4 py-3 border-b border-[#21262d] flex items-center gap-3 flex-shrink-0">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
            detail.status === 'completed' ? 'bg-[#3fb950]' : isProcessing ? 'bg-[#d29922] animate-pulse' : isFailed ? 'bg-[#f85149]' : 'bg-[#484f58]'
          }`} />
          <span className="text-sm font-medium text-[#e6edf3] truncate">
            {detail.customer_name || '未关联客户'}
          </span>
          <span className="text-[11px] text-[#484f58]">
            {detail.duration_seconds ? `${Math.floor(detail.duration_seconds / 60)}分${Math.floor(detail.duration_seconds % 60)}秒` : ''}
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
            detail.status === 'completed' ? 'bg-[#238636]/10 text-[#3fb950]' : isProcessing ? 'bg-[#d29922]/10 text-[#d29922]' : isFailed ? 'bg-[#f85149]/10 text-[#f85149]' : 'bg-[#484f58]/10 text-[#484f58]'
          }`}>
            {isProcessing ? '分析中' : isFailed ? '失败' : detail.status === 'completed' ? '已完成' : '已上传'}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isProcessing && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-[#8b949e]">
              <div className="w-10 h-10 border-2 border-[#d29922] border-t-transparent rounded-full animate-spin" />
              <p className="text-sm">正在分析对话...</p>
              <p className="text-xs text-[#484f58]">说话人识别 → 语音转文字 → AI 分析</p>
            </div>
          )}

          {isFailed && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="w-12 h-12 rounded-full bg-[#f85149]/10 border border-[#f85149]/40 flex items-center justify-center">
                <svg className="w-6 h-6 text-[#f85149]" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14Zm1.78-4.78a.75.75 0 0 1-1.06 1.06L8 9.06l-.72.72a.75.75 0 1 1-1.06-1.06L6.94 8l-.72-.72a.75.75 0 0 1 1.06-1.06L8 6.94l.72-.72a.75.75 0 1 1 1.06 1.06L9.06 8l.72.72Z"/></svg>
              </div>
              <p className="text-sm text-[#f85149]">处理失败</p>
              {detail.error_message && <p className="text-xs text-[#8b949e] max-w-md text-center">{detail.error_message}</p>}
            </div>
          )}

          {detail.status === 'uploaded' && !isProcessing && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-[#8b949e]">
              <svg className="w-12 h-12 text-[#484f58]" viewBox="0 0 16 16" fill="currentColor"><path d="M3.5 6.5A.5.5 0 0 1 4 7v1a4 4 0 0 0 8 0V7a.5.5 0 0 1 1 0v1a5 5 0 0 1-4.5 4.975V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 .5-.5Z"/><path d="M10 8a2 2 0 1 1-4 0V3a2 2 0 1 1 4 0v5Z"/></svg>
              <p className="text-sm">录音已上传，等待处理</p>
            </div>
          )}

          {detail.status === 'completed' && detail.messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.speaker === '销售' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-lg px-3.5 py-2.5 ${
                msg.speaker === '销售'
                  ? 'bg-[#0d419d] border border-[#1f6feb]/40 text-[#e6edf3]'
                  : 'bg-[#161b22] border border-[#30363d] text-[#e6edf3]'
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-medium ${msg.speaker === '销售' ? 'text-[#58a6ff]' : 'text-[#8b949e]'}`}>
                    {msg.speaker}
                  </span>
                  <span className="text-[10px] text-[#484f58]">
                    {Math.floor(msg.start_time / 60)}:{(Math.floor(msg.start_time) % 60).toString().padStart(2, '0')}
                  </span>
                </div>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Analysis Panel Sidebar */}
      <div className="w-[280px] flex-shrink-0 border-l border-[#21262d] bg-[#0d1117] overflow-y-auto">
        <div className="px-3 py-3 border-b border-[#21262d]">
          <p className="text-xs font-medium text-[#e6edf3]">AI 分析</p>
        </div>
        {detail.analysis_results ? (
          <AnalysisPanel analysis={detail.analysis_results} />
        ) : (
          <div className="p-6 text-center text-xs text-[#484f58]">
            {isProcessing ? '分析进行中...' : isFailed ? '分析未能生成' : '上传后点击处理以生成分析'}
          </div>
        )}
      </div>
    </div>
  );
}

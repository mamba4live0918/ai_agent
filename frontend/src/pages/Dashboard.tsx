import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCategories, getCustomers, getProducts } from '../services/api';

export default function Dashboard() {
  const [docCount, setDocCount] = useState(0);
  const [customerCount, setCustomerCount] = useState(0);
  const [productCount, setProductCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getCategories().then(cats => setDocCount(cats.reduce((s, c) => s + c.document_count, 0))),
      getCustomers().then(res => setCustomerCount(res.total)),
      getProducts(undefined, undefined, undefined, 1, 1).then(res => setProductCount(res.total)),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
      {/* Header */}
      <div className="mb-10 animate-in" style={{ animationDelay: '0ms' }}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#238636] to-[#2ea043] flex items-center justify-center shadow-glow-green">
            <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-[#e6edf3]">销售辅助平台</h2>
            <p className="text-sm text-[#8b949e] mt-0.5">AI 驱动的销售全流程辅助与客户分析系统</p>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 animate-in" style={{ animationDelay: '80ms' }}>
        <div className="card p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-[#8b949e] uppercase tracking-wider">知识库文档</span>
            <svg className="w-4 h-4 text-[#484f58]" viewBox="0 0 16 16" fill="currentColor">
              <path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v3.5A1.75 1.75 0 0 1 14.25 7H8.828l-3.063 2.757A.75.75 0 0 1 4.5 9.25V7h-.25A1.75 1.75 0 0 1 2.5 5.25v-3.5Z"/>
            </svg>
          </div>
          <p className="text-3xl font-bold text-[#58a6ff] font-mono tabular-nums">
            {loading ? '--' : docCount}
          </p>
          <p className="text-xs text-[#6e7681] mt-1">已索引的销售辅助文档</p>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-[#8b949e] uppercase tracking-wider">客户档案</span>
            <svg className="w-4 h-4 text-[#484f58]" viewBox="0 0 16 16" fill="currentColor">
              <path d="M10.561 8.073a6.005 6.005 0 0 1 3.432 5.07.75.75 0 0 1-1.497.108 4.505 4.505 0 0 0-8.992 0 .75.75 0 0 1-1.497-.108 6.004 6.004 0 0 1 3.431-5.07 4 4 0 1 1 5.123 0ZM12 4.5a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z"/>
            </svg>
          </div>
          <p className="text-3xl font-bold text-[#3fb950] font-mono tabular-nums">
            {loading ? '--' : customerCount}
          </p>
          <p className="text-xs text-[#6e7681] mt-1">AI 画像分析的客户</p>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-[#8b949e] uppercase tracking-wider">金融产品</span>
            <svg className="w-4 h-4 text-[#484f58]" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1.5 1.75a.75.75 0 0 0-1.5 0v12.5c0 .414.336.75.75.75h14.5a.75.75 0 0 0 0-1.5H1.5V1.75Zm14.28 2.53a.75.75 0 0 0-1.06-1.06L10 7.94 7.53 5.47a.75.75 0 0 0-1.06 0L3.22 8.72a.75.75 0 0 0 1.06 1.06L7 7.06l2.47 2.47a.75.75 0 0 0 1.06 0l5.25-5.25Z"/>
            </svg>
          </div>
          <p className="text-3xl font-bold text-[#d29922] font-mono tabular-nums">
            {loading ? '--' : productCount}
          </p>
          <p className="text-xs text-[#6e7681] mt-1">基金/保险/信托/理财产品</p>
        </div>
      </div>

      {/* Module cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-in" style={{ animationDelay: '150ms' }}>
        <Link to="/knowledge" className="card card-hover p-6 group transition-colors duration-150">
          <div className="flex items-start justify-between mb-3">
            <div className="w-9 h-9 rounded-lg bg-[#1f2937] border border-[#30363d] flex items-center justify-center group-hover:border-[#58a6ff]/40 transition-colors">
              <svg className="w-5 h-5 text-[#58a6ff]" viewBox="0 0 16 16" fill="currentColor">
                <path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v3.5A1.75 1.75 0 0 1 14.25 7H8.828l-3.063 2.757A.75.75 0 0 1 4.5 9.25V7h-.25A1.75 1.75 0 0 1 2.5 5.25v-3.5Z"/>
              </svg>
            </div>
            <svg className="w-4 h-4 text-[#484f58] opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-0.5" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M8.22 2.97a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06l2.97-2.97H3.75a.75.75 0 0 1 0-1.5h7.19L8.22 4.03a.75.75 0 0 1 0-1.06Z"/>
            </svg>
          </div>
          <h3 className="text-base font-semibold text-[#e6edf3] mb-2">知识库</h3>
          <p className="text-sm text-[#8b949e] mb-4 leading-relaxed">上传文档自动索引，RAG 智能问答，AI 生成优先参考知识库</p>
          <div className="flex items-center gap-2">
            <span className="badge">{docCount} 篇文档</span>
            <span className="badge badge-green">RAG</span>
          </div>
        </Link>

        <Link to="/customers" className="card card-hover p-6 group transition-colors duration-150">
          <div className="flex items-start justify-between mb-3">
            <div className="w-9 h-9 rounded-lg bg-[#1f2937] border border-[#30363d] flex items-center justify-center group-hover:border-[#3fb950]/40 transition-colors">
              <svg className="w-5 h-5 text-[#3fb950]" viewBox="0 0 16 16" fill="currentColor">
                <path d="M10.561 8.073a6.005 6.005 0 0 1 3.432 5.07.75.75 0 0 1-1.497.108 4.505 4.505 0 0 0-8.992 0 .75.75 0 0 1-1.497-.108 6.004 6.004 0 0 1 3.431-5.07 4 4 0 1 1 5.123 0ZM12 4.5a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z"/>
              </svg>
            </div>
            <svg className="w-4 h-4 text-[#484f58] opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-0.5" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M8.22 2.97a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06l2.97-2.97H3.75a.75.75 0 0 1 0-1.5h7.19L8.22 4.03a.75.75 0 0 1 0-1.06Z"/>
            </svg>
          </div>
          <h3 className="text-base font-semibold text-[#e6edf3] mb-2">客户分析</h3>
          <p className="text-sm text-[#8b949e] mb-4 leading-relaxed">AI 6 维画像评分、售前准备报告、资产配置方案、PDF 导出</p>
          <div className="flex items-center gap-2">
            <span className="badge">{customerCount} 位客户</span>
            <span className="badge badge-green">AI 画像</span>
          </div>
        </Link>

        <Link to="/products" className="card card-hover p-6 group transition-colors duration-150">
          <div className="flex items-start justify-between mb-3">
            <div className="w-9 h-9 rounded-lg bg-[#1f2937] border border-[#30363d] flex items-center justify-center group-hover:border-[#d29922]/40 transition-colors">
              <svg className="w-5 h-5 text-[#d29922]" viewBox="0 0 16 16" fill="currentColor">
                <path d="M1.5 1.75a.75.75 0 0 0-1.5 0v12.5c0 .414.336.75.75.75h14.5a.75.75 0 0 0 0-1.5H1.5V1.75Zm14.28 2.53a.75.75 0 0 0-1.06-1.06L10 7.94 7.53 5.47a.75.75 0 0 0-1.06 0L3.22 8.72a.75.75 0 0 0 1.06 1.06L7 7.06l2.47 2.47a.75.75 0 0 0 1.06 0l5.25-5.25Z"/>
              </svg>
            </div>
            <svg className="w-4 h-4 text-[#484f58] opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-0.5" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M8.22 2.97a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06l2.97-2.97H3.75a.75.75 0 0 1 0-1.5h7.19L8.22 4.03a.75.75 0 0 1 0-1.06Z"/>
            </svg>
          </div>
          <h3 className="text-base font-semibold text-[#e6edf3] mb-2">产品库</h3>
          <p className="text-sm text-[#8b949e] mb-4 leading-relaxed">管理金融产品，基金自动拉取东方财富真实净值，每 4 小时刷新</p>
          <div className="flex items-center gap-2">
            <span className="badge">{productCount} 款产品</span>
            <span className="badge badge-yellow">真实净值</span>
          </div>
        </Link>
      </div>

    </div>
  );
}

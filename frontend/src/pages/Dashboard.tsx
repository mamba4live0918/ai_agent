import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDocuments, getCustomers, getProducts, getTrainingSessions, getRealtimeSessions, getPostSalesSessions } from '../services/api';
import type { TrainingSession, RealtimeSessionSummary, PostSalesSession } from '../types';

export default function Dashboard() {
  const [docCount, setDocCount] = useState(0);
  const [customerCount, setCustomerCount] = useState(0);
  const [productCount, setProductCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [rtSessions, setRtSessions] = useState<RealtimeSessionSummary[]>([]);
  const [psSessions, setPsSessions] = useState<PostSalesSession[]>([]);

  useEffect(() => {
    getDocuments(undefined, undefined, 1, 1).then(res => setDocCount(res.total)).catch(() => {});
    getCustomers().then(res => setCustomerCount(res.total)).catch(() => {});
    getProducts(undefined, undefined, undefined, 1, 1).then(res => setProductCount(res.total)).catch(() => {});
    getTrainingSessions(undefined, undefined, 1, 100).then(res => setSessions(res.items)).catch(() => {});
    getRealtimeSessions(1, 100).then(res => setRtSessions(res.items)).catch(() => {});
    getPostSalesSessions(undefined, undefined, 1, 100).then(res => setPsSessions(res.items)).catch(() => {});
    setLoading(false);
  }, []);

  // Training stats
  const completedSessions = sessions.filter(s => s.status === 'completed').length;
  const activeSessions = sessions.filter(s => s.status === 'active').length;
  const pendingSessions = sessions.filter(s => s.status === 'pending').length;
  const totalSessions = sessions.length;
  const completionRate = totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0;
  const reviewedSessions = sessions.filter(s => s.has_review).length;

  // Real-time voice stats
  const rtCompleted = rtSessions.filter(s => s.status === 'completed').length;
  const rtActive = rtSessions.filter(s => s.status === 'active').length;
  const rtAbandoned = rtSessions.filter(s => s.status === 'abandoned').length;
  const rtTotal = rtSessions.length;

  // Post-sales stats
  const psCompleted = psSessions.filter(s => s.status === 'completed').length;
  const psRecording = psSessions.filter(s => s.status === 'recording').length;
  const psProcessing = psSessions.filter(s => s.status === 'processing').length;
  const psTotal = psSessions.length;

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-8 py-4 sm:py-10">
      {/* Header */}
      <div className="mb-6 sm:mb-10 animate-in" style={{ animationDelay: '0ms' }}>
        <div className="flex items-center gap-2.5 sm:gap-3 mb-2 sm:mb-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-[var(--btn-primary)] to-[var(--btn-primary-hover)] flex items-center justify-center shrink-0 shadow-md">
            <svg className="w-4 h-4 sm:w-6 sm:h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="min-w-0">
            <h2 className="text-lg sm:text-2xl font-bold text-[var(--text-primary)] truncate">销售辅助平台</h2>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-0.5">AI 驱动的销售全流程辅助与客户分析系统</p>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 sm:gap-4 mb-5 sm:mb-8 animate-in" style={{ animationDelay: '80ms' }}>
        {/* Knowledge docs */}
        <div className="card p-4 rounded-xl sm:rounded-2xl transition-all duration-200 hover:-translate-y-0.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-medium text-[var(--text-secondary)] uppercase tracking-wider">文档</span>
            <svg className="w-3.5 h-3.5 text-[var(--accent-blue)]" viewBox="0 0 16 16" fill="currentColor">
              <path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v3.5A1.75 1.75 0 0 1 14.25 7H8.828l-3.063 2.757A.75.75 0 0 1 4.5 9.25V7h-.25A1.75 1.75 0 0 1 2.5 5.25v-3.5Z"/>
            </svg>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-[var(--accent-blue)] font-mono tabular-nums">
            {loading ? '--' : docCount}
          </p>
        </div>

        {/* Customers */}
        <div className="card p-4 rounded-xl sm:rounded-2xl transition-all duration-200 hover:-translate-y-0.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-medium text-[var(--text-secondary)] uppercase tracking-wider">客户</span>
            <svg className="w-3.5 h-3.5 text-[var(--accent-green)]" viewBox="0 0 16 16" fill="currentColor">
              <path d="M10.561 8.073a6.005 6.005 0 0 1 3.432 5.07.75.75 0 0 1-1.497.108 4.505 4.505 0 0 0-8.992 0 .75.75 0 0 1-1.497-.108 6.004 6.004 0 0 1 3.431-5.07 4 4 0 1 1 5.123 0ZM12 4.5a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z"/>
            </svg>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-[var(--accent-green)] font-mono tabular-nums">
            {loading ? '--' : customerCount}
          </p>
        </div>

        {/* Products */}
        <div className="card p-4 rounded-xl sm:rounded-2xl transition-all duration-200 hover:-translate-y-0.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-medium text-[var(--text-secondary)] uppercase tracking-wider">产品</span>
            <svg className="w-3.5 h-3.5 text-[var(--accent-orange)]" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1.5 1.75a.75.75 0 0 0-1.5 0v12.5c0 .414.336.75.75.75h14.5a.75.75 0 0 0 0-1.5H1.5V1.75Zm14.28 2.53a.75.75 0 0 0-1.06-1.06L10 7.94 7.53 5.47a.75.75 0 0 0-1.06 0L3.22 8.72a.75.75 0 0 0 1.06 1.06L7 7.06l2.47 2.47a.75.75 0 0 0 1.06 0l5.25-5.25Z"/>
            </svg>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-[var(--accent-orange)] font-mono tabular-nums">
            {loading ? '--' : productCount}
          </p>
        </div>

        {/* Training sessions */}
        <div className="card p-4 rounded-xl sm:rounded-2xl transition-all duration-200 hover:-translate-y-0.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-medium text-[var(--text-secondary)] uppercase tracking-wider">训练</span>
            <svg className="w-3.5 h-3.5 text-[var(--accent-purple)]" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0a8 8 0 1 0 8 8A8.009 8.009 0 0 0 8 0Zm0 14.5A6.5 6.5 0 1 1 14.5 8 6.508 6.508 0 0 1 8 14.5Zm2.558-9.692L7.432 6.433 6.3 3.983a.5.5 0 0 0-.912.254l-.005.02L6.623 8.5h.005l1.453 4.02a.5.5 0 0 0 .934-.02l.005-.02 1.68-5.23a.5.5 0 0 0-.134-.51l-.005-.004a.495.495 0 0 0-.502-.134Z"/>
            </svg>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-[var(--accent-purple)] font-mono tabular-nums">
            {loading ? '--' : totalSessions}
          </p>
        </div>

        {/* Completion rate */}
        <div className="card p-4 rounded-xl sm:rounded-2xl transition-all duration-200 hover:-translate-y-0.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-medium text-[var(--text-secondary)] uppercase tracking-wider">完成率</span>
            <svg className="w-3.5 h-3.5 text-[var(--accent-green)]" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/>
            </svg>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-[var(--accent-green)] font-mono tabular-nums">
            {loading ? '--' : `${completionRate}%`}
          </p>
        </div>

        {/* Real-time voice */}
        <div className="card p-4 rounded-xl sm:rounded-2xl transition-all duration-200 hover:-translate-y-0.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-medium text-[var(--text-secondary)] uppercase tracking-wider">实时语音</span>
            <svg className="w-3.5 h-3.5 text-[var(--accent-purple)]" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1a3 3 0 0 0-3 3v4a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z"/><path d="M3.5 6.5A.75.75 0 0 1 4.25 7 3.75 3.75 0 0 0 11.75 7 .75.75 0 0 1 13.25 7 5.251 5.251 0 0 1 8.75 11.172V13h1.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5h1.5v-1.828A5.251 5.251 0 0 1 2.75 7a.75.75 0 0 1 .75-.5Z"/>
            </svg>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-[var(--accent-purple)] font-mono tabular-nums">
            {loading ? '--' : rtTotal}
          </p>
        </div>

        {/* Post-sales */}
        <div className="card p-4 rounded-xl sm:rounded-2xl transition-all duration-200 hover:-translate-y-0.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-medium text-[var(--text-secondary)] uppercase tracking-wider">售后分析</span>
            <svg className="w-3.5 h-3.5 text-[var(--accent-orange)]" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8.75.75a.75.75 0 0 0-1.5 0v3.5a.75.75 0 0 0 1.5 0v-3.5ZM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0Zm4.72-1.888a.75.75 0 0 0-1.06 1.06l.72.72H5.22a.75.75 0 0 0 0 1.5h3.92l-.97.97a.75.75 0 1 0 1.06 1.06l1.5-1.5a.75.75 0 0 0 .22-.53.75.75 0 0 0-.22-.53l-1.5-1.5a.674.674 0 0 0-.08-.07ZM1.25 6.25a.75.75 0 0 1 1.5 0v2a.75.75 0 0 1-1.5 0v-2Zm12 0a.75.75 0 0 1 1.5 0v2a.75.75 0 0 1-1.5 0v-2Z"/>
            </svg>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-[var(--accent-orange)] font-mono tabular-nums">
            {loading ? '--' : psTotal}
          </p>
        </div>
      </div>

      {/* Section cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 mb-5 sm:mb-8 animate-in" style={{ animationDelay: '150ms' }}>
        {/* Training */}
        <div className="card p-4 sm:p-5 rounded-xl sm:rounded-2xl">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-[var(--accent-purple)]" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0a8 8 0 1 0 8 8A8.009 8.009 0 0 0 8 0Zm0 14.5A6.5 6.5 0 1 1 14.5 8 6.508 6.508 0 0 1 8 14.5Zm2.558-9.692L7.432 6.433 6.3 3.983a.5.5 0 0 0-.912.254l-.005.02L6.623 8.5h.005l1.453 4.02a.5.5 0 0 0 .934-.02l.005-.02 1.68-5.23a.5.5 0 0 0-.134-.51l-.005-.004a.495.495 0 0 0-.502-.134Z"/>
            </svg>
            仿真培训
          </h3>
          {totalSessions > 0 ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-secondary)]">总次数</span>
                <span className="text-sm font-semibold tabular-nums">{totalSessions}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-secondary)]">已完成</span>
                <span className="text-sm font-semibold text-[var(--accent-green)] tabular-nums">{completedSessions}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-secondary)]">进行中</span>
                <span className="text-sm font-semibold text-[var(--accent-blue)] tabular-nums">{activeSessions}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-secondary)]">未开始</span>
                <span className="text-sm font-semibold text-[var(--text-placeholder)] tabular-nums">{pendingSessions}</span>
              </div>
              <hr className="border-[var(--border-subtle)]" />
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-secondary)]">已复盘</span>
                <span className="text-sm font-semibold tabular-nums">{reviewedSessions}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-secondary)]">完成率</span>
                <span className="text-sm font-semibold text-[var(--accent-green)] tabular-nums">{completionRate}%</span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-[var(--text-placeholder)] py-4 text-center">
              {loading ? '加载中...' : '暂无数据'}
            </div>
          )}
        </div>

        {/* Real-time Voice */}
        <div className="card p-4 sm:p-5 rounded-xl sm:rounded-2xl">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-[var(--accent-purple)]" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1a3 3 0 0 0-3 3v4a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z"/><path d="M3.5 6.5A.75.75 0 0 1 4.25 7 3.75 3.75 0 0 0 11.75 7 .75.75 0 0 1 13.25 7 5.251 5.251 0 0 1 8.75 11.172V13h1.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5h1.5v-1.828A5.251 5.251 0 0 1 2.75 7a.75.75 0 0 1 .75-.5Z"/>
            </svg>
            实时语音
          </h3>
          {rtTotal > 0 ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-secondary)]">总次数</span>
                <span className="text-sm font-semibold tabular-nums">{rtTotal}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-secondary)]">已完成</span>
                <span className="text-sm font-semibold text-[var(--accent-green)] tabular-nums">{rtCompleted}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-secondary)]">进行中</span>
                <span className="text-sm font-semibold text-[var(--accent-blue)] tabular-nums">{rtActive}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-secondary)]">已放弃</span>
                <span className="text-sm font-semibold text-[var(--text-placeholder)] tabular-nums">{rtAbandoned}</span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-[var(--text-placeholder)] py-4 text-center">
              {loading ? '加载中...' : '暂无数据'}
            </div>
          )}
        </div>

        {/* Post-sales */}
        <div className="card p-4 sm:p-5 rounded-xl sm:rounded-2xl">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-[var(--accent-orange)]" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8.75.75a.75.75 0 0 0-1.5 0v3.5a.75.75 0 0 0 1.5 0v-3.5ZM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0Zm4.72-1.888a.75.75 0 0 0-1.06 1.06l.72.72H5.22a.75.75 0 0 0 0 1.5h3.92l-.97.97a.75.75 0 1 0 1.06 1.06l1.5-1.5a.75.75 0 0 0 .22-.53.75.75 0 0 0-.22-.53l-1.5-1.5a.674.674 0 0 0-.08-.07ZM1.25 6.25a.75.75 0 0 1 1.5 0v2a.75.75 0 0 1-1.5 0v-2Zm12 0a.75.75 0 0 1 1.5 0v2a.75.75 0 0 1-1.5 0v-2Z"/>
            </svg>
            售后分析
          </h3>
          {psTotal > 0 ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-secondary)]">总次数</span>
                <span className="text-sm font-semibold tabular-nums">{psTotal}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-secondary)]">已完成</span>
                <span className="text-sm font-semibold text-[var(--accent-green)] tabular-nums">{psCompleted}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-secondary)]">录制中</span>
                <span className="text-sm font-semibold text-[var(--accent-blue)] tabular-nums">{psRecording}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-secondary)]">处理中</span>
                <span className="text-sm font-semibold text-[var(--text-placeholder)] tabular-nums">{psProcessing}</span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-[var(--text-placeholder)] py-4 text-center">
              {loading ? '加载中...' : '暂无数据'}
            </div>
          )}
        </div>
      </div>

      {/* Module cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 animate-in" style={{ animationDelay: '220ms' }}>
        <Link to="/knowledge" className="card card-hover p-4 sm:p-6 rounded-xl group transition-all duration-200">
          <div className="flex items-start justify-between mb-2 sm:mb-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-[var(--bg-tertiary)] flex items-center justify-center group-hover:bg-[var(--accent-blue)]/10 transition-all duration-200">
              <svg className="w-4 h-4 sm:w-5 sm:h-5 text-[var(--accent-blue)]" viewBox="0 0 16 16" fill="currentColor">
                <path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v3.5A1.75 1.75 0 0 1 14.25 7H8.828l-3.063 2.757A.75.75 0 0 1 4.5 9.25V7h-.25A1.75 1.75 0 0 1 2.5 5.25v-3.5Z"/>
              </svg>
            </div>
            <svg className="w-4 h-4 text-[var(--text-placeholder)] opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-0.5" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M8.22 2.97a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06l2.97-2.97H3.75a.75.75 0 0 1 0-1.5h7.19L8.22 4.03a.75.75 0 0 1 0-1.06Z"/>
            </svg>
          </div>
          <h3 className="text-sm sm:text-base font-semibold text-[var(--text-primary)] mb-1.5 sm:mb-2">知识库</h3>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] mb-3 sm:mb-4 leading-relaxed">上传文档自动索引，RAG 智能问答，AI 生成优先参考知识库</p>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <span className="badge">{docCount} 篇文档</span>
            <span className="badge badge-green">RAG</span>
          </div>
        </Link>

        <Link to="/customers" className="card card-hover p-4 sm:p-6 rounded-xl group transition-all duration-200">
          <div className="flex items-start justify-between mb-2 sm:mb-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-[var(--bg-tertiary)] flex items-center justify-center group-hover:bg-[var(--accent-green)]/10 transition-all duration-200">
              <svg className="w-4 h-4 sm:w-5 sm:h-5 text-[var(--accent-green)]" viewBox="0 0 16 16" fill="currentColor">
                <path d="M10.561 8.073a6.005 6.005 0 0 1 3.432 5.07.75.75 0 0 1-1.497.108 4.505 4.505 0 0 0-8.992 0 .75.75 0 0 1-1.497-.108 6.004 6.004 0 0 1 3.431-5.07 4 4 0 1 1 5.123 0ZM12 4.5a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z"/>
              </svg>
            </div>
            <svg className="w-4 h-4 text-[var(--text-placeholder)] opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-0.5" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M8.22 2.97a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06l2.97-2.97H3.75a.75.75 0 0 1 0-1.5h7.19L8.22 4.03a.75.75 0 0 1 0-1.06Z"/>
            </svg>
          </div>
          <h3 className="text-sm sm:text-base font-semibold text-[var(--text-primary)] mb-1.5 sm:mb-2">客户分析</h3>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] mb-3 sm:mb-4 leading-relaxed">AI 6 维画像评分、售前准备报告、资产配置方案、PDF 导出</p>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <span className="badge">{customerCount} 位客户</span>
            <span className="badge badge-green">AI 画像</span>
          </div>
        </Link>

        <Link to="/products" className="card card-hover p-4 sm:p-6 rounded-xl group transition-all duration-200">
          <div className="flex items-start justify-between mb-2 sm:mb-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-[var(--bg-tertiary)] flex items-center justify-center group-hover:bg-[var(--accent-orange)]/10 transition-all duration-200">
              <svg className="w-4 h-4 sm:w-5 sm:h-5 text-[var(--accent-orange)]" viewBox="0 0 16 16" fill="currentColor">
                <path d="M1.5 1.75a.75.75 0 0 0-1.5 0v12.5c0 .414.336.75.75.75h14.5a.75.75 0 0 0 0-1.5H1.5V1.75Zm14.28 2.53a.75.75 0 0 0-1.06-1.06L10 7.94 7.53 5.47a.75.75 0 0 0-1.06 0L3.22 8.72a.75.75 0 0 0 1.06 1.06L7 7.06l2.47 2.47a.75.75 0 0 0 1.06 0l5.25-5.25Z"/>
              </svg>
            </div>
            <svg className="w-4 h-4 text-[var(--text-placeholder)] opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-0.5" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M8.22 2.97a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06l2.97-2.97H3.75a.75.75 0 0 1 0-1.5h7.19L8.22 4.03a.75.75 0 0 1 0-1.06Z"/>
            </svg>
          </div>
          <h3 className="text-sm sm:text-base font-semibold text-[var(--text-primary)] mb-1.5 sm:mb-2">产品库</h3>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] mb-3 sm:mb-4 leading-relaxed">管理金融产品，基金自动拉取东方财富真实净值，每 4 小时刷新</p>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <span className="badge">{productCount} 款产品</span>
            <span className="badge badge-yellow">真实净值</span>
          </div>
        </Link>
      </div>
    </div>
  );
}

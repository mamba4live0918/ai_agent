import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const { register, user } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) navigate('/', { replace: true });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }
    if (password.length < 6) {
      setError('密码至少6位');
      return;
    }

    setSubmitting(true);
    try {
      await register({ username, email, password });
      navigate('/', { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
      <div className="w-full max-w-sm">
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-lg p-8">
          <div className="text-center mb-6">
            <div className="w-10 h-10 rounded-lg bg-[var(--btn-primary)] flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold text-[var(--text-primary)]">创建账户</h1>
            <p className="text-xs text-[var(--text-secondary)] mt-1">注册 AI 销售助手</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1.5">用户名</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-md px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-placeholder)] focus:outline-none focus:border-[var(--accent-blue)]"
                placeholder="输入用户名"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1.5">邮箱</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-md px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-placeholder)] focus:outline-none focus:border-[var(--accent-blue)]"
                placeholder="输入邮箱"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1.5">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-md px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-placeholder)] focus:outline-none focus:border-[var(--accent-blue)]"
                placeholder="至少6位"
                required
                minLength={6}
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1.5">确认密码</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-md px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-placeholder)] focus:outline-none focus:border-[var(--accent-blue)]"
                placeholder="再次输入密码"
                required
              />
            </div>

            {error && (
              <div className="bg-[#490202]/20 border border-[var(--accent-red)] rounded-md px-3 py-2 text-xs text-[var(--accent-red)]">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] disabled:opacity-50 text-white text-sm font-medium py-2 rounded-md transition-colors"
            >
              {submitting ? '注册中...' : '注册'}
            </button>
          </form>

          <p className="text-xs text-[var(--text-secondary)] text-center mt-4">
            已有账户？{' '}
            <Link to="/login" className="text-[var(--accent-blue)] hover:underline">
              登录
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

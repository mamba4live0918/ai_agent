import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) navigate('/', { replace: true });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login({ username, password });
      navigate('/', { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0d1117]">
      <div className="w-full max-w-sm">
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-8">
          <div className="text-center mb-6">
            <div className="w-10 h-10 rounded-lg bg-[#238636] flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold text-[#e6edf3]">AI 销售助手</h1>
            <p className="text-xs text-[#8b949e] mt-1">登录您的账户</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-[#8b949e] mb-1.5">用户名</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]"
                placeholder="输入用户名"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs text-[#8b949e] mb-1.5">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]"
                placeholder="输入密码"
                required
              />
            </div>

            {error && (
              <div className="bg-[#490202]/20 border border-[#f85149]/30 rounded-md px-3 py-2 text-xs text-[#f85149]">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 text-white text-sm font-medium py-2 rounded-md transition-colors"
            >
              {submitting ? '登录中...' : '登录'}
            </button>
          </form>

          <p className="text-xs text-[#8b949e] text-center mt-4">
            还没有账户？{' '}
            <Link to="/register" className="text-[#58a6ff] hover:underline">
              注册
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

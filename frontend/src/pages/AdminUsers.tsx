import { useState, useEffect } from 'react';
import { getAllUsers, updateUserRole, deleteUser, createUser } from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { User } from '../types';

const ROLES = ['admin', 'instructor', 'salesperson'] as const;
const ROLE_LABELS: Record<string, string> = { admin: '管理员', instructor: '讲师', salesperson: '销售' };

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ username: '', email: '', password: '' });
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);
  const pageSize = 20;

  const load = () => {
    setLoading(true);
    getAllUsers(page, pageSize)
      .then((res) => { setUsers(res.items); setTotal(res.total); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [page]);

  const handleRoleChange = async (userId: string, role: string) => {
    await updateUserRole(userId, role);
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: role as User['role'] } : u)));
  };

  const handleDelete = async (userId: string) => {
    await deleteUser(userId);
    setConfirmDelete(null);
    setUsers((prev) => prev.filter((u) => u.id !== userId));
    setTotal((t) => t - 1);
  };

  const handleAdd = async () => {
    if (!addForm.username || !addForm.email || !addForm.password) {
      setAddError('请填写所有字段');
      return;
    }
    setAdding(true);
    setAddError('');
    try {
      const newUser = await createUser(addForm);
      setUsers((prev) => [{ ...newUser, created_at: newUser.created_at || new Date().toISOString() }, ...prev]);
      setTotal((t) => t + 1);
      setShowAdd(false);
      setAddForm({ username: '', email: '', password: '' });
    } catch (e: unknown) {
      setAddError(e instanceof Error ? e.message : '创建失败');
    } finally {
      setAdding(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
        <p className="text-sm text-[#8b949e]">加载中...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#e6edf3] mb-1">用户管理</h2>
          <p className="text-sm text-[#8b949e]">管理平台用户与角色分配</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 text-sm font-medium rounded-md bg-[#238636] text-white hover:bg-[#2ea043] transition-colors"
        >
          添加用户
        </button>
      </div>

      {/* Add user modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowAdd(false)}>
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-[#e6edf3] mb-4">添加新用户</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[#8b949e] mb-1">用户名</label>
                <input
                  type="text"
                  value={addForm.username}
                  onChange={(e) => setAddForm((f) => ({ ...f, username: e.target.value }))}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-[#e6edf3] focus:outline-none focus:border-[#58a6ff]"
                  placeholder="输入用户名"
                />
              </div>
              <div>
                <label className="block text-xs text-[#8b949e] mb-1">邮箱</label>
                <input
                  type="email"
                  value={addForm.email}
                  onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-[#e6edf3] focus:outline-none focus:border-[#58a6ff]"
                  placeholder="输入邮箱"
                />
              </div>
              <div>
                <label className="block text-xs text-[#8b949e] mb-1">密码</label>
                <input
                  type="password"
                  value={addForm.password}
                  onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-[#e6edf3] focus:outline-none focus:border-[#58a6ff]"
                  placeholder="输入密码"
                />
              </div>
              {addError && <p className="text-sm text-[#f85149]">{addError}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                onClick={() => { setShowAdd(false); setAddError(''); }}
                className="px-3 py-1.5 text-sm rounded-md border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleAdd}
                disabled={adding}
                className="px-4 py-1.5 text-sm font-medium rounded-md bg-[#238636] text-white hover:bg-[#2ea043] disabled:opacity-50 transition-colors"
              >
                {adding ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#21262d] text-[#8b949e] text-left">
                <th className="px-4 py-3 font-medium">用户名</th>
                <th className="px-4 py-3 font-medium">邮箱</th>
                <th className="px-4 py-3 font-medium">角色</th>
                <th className="px-4 py-3 font-medium">注册时间</th>
                <th className="px-4 py-3 font-medium w-20">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === me?.id;
                const isAdmin = u.role === 'admin';
                return (
                  <tr key={u.id} className="border-b border-[#21262d] hover:bg-[#161b22] transition-colors">
                    <td className="px-4 py-3 text-[#e6edf3] font-medium">
                      {u.username}
                      {isSelf && <span className="ml-2 text-[10px] text-[#58a6ff]">(你)</span>}
                    </td>
                    <td className="px-4 py-3 text-[#8b949e]">{u.email}</td>
                    <td className="px-4 py-3">
                      {isSelf ? (
                        <span className="text-[#8b949e]">{ROLE_LABELS[u.role]}</span>
                      ) : (
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.id, e.target.value)}
                          className="bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-[#e6edf3] text-xs focus:outline-none focus:border-[#58a6ff]"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#484f58] text-xs">
                      {new Date(u.created_at).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="px-4 py-3">
                      {!isSelf && !isAdmin && (
                        confirmDelete === u.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(u.id)}
                              className="px-2 py-0.5 text-xs rounded bg-[#da3633] text-white hover:bg-[#f85149]"
                            >
                              确认
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="px-2 py-0.5 text-xs rounded border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3]"
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(u.id)}
                            className="px-2 py-0.5 text-xs rounded border border-[#30363d] text-[#f85149] hover:bg-[#da3633]/20 transition-colors"
                          >
                            删除
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#21262d]">
            <span className="text-xs text-[#484f58]">共 {total} 个用户</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-2 py-1 text-xs rounded border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] disabled:opacity-40"
              >
                上一页
              </button>
              <span className="text-xs text-[#8b949e] px-2">{page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-2 py-1 text-xs rounded border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] disabled:opacity-40"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

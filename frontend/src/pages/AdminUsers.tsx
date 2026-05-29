import { useState, useEffect } from 'react';
import { getAllUsers, updateUserRole, deleteUser, createUser, getGroups, createGroup, updateGroup, deleteGroup, addGroupMember, removeGroupMember } from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { User, Group } from '../types';

const ROLES = ['admin', 'instructor', 'salesperson'] as const;
const ROLE_LABELS: Record<string, string> = { admin: '管理员', instructor: '讲师', salesperson: '销售' };

export default function AdminUsers() {
  const { user: me } = useAuth();
  const isSuperAdmin = me?.role === 'admin' && !me?.group_id;
  const [tab, setTab] = useState<'users' | 'groups'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ username: '', email: '', password: '' });
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);
  const [groupMap, setGroupMap] = useState<Record<string, string>>({});
  const pageSize = 20;

  // Group management state
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupLoading, setGroupLoading] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupDesc, setEditGroupDesc] = useState('');
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  const [memberUserId, setMemberUserId] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [groupError, setGroupError] = useState('');

  const loadGroups = async () => {
    setGroupLoading(true);
    try {
      const res = await getGroups(1, 200);
      setGroups(res.items);
    } catch { /* ignore */ }
    setGroupLoading(false);
  };

  useEffect(() => { if (tab === 'groups') loadGroups(); }, [tab]);

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    setCreatingGroup(true);
    setGroupError('');
    try {
      await createGroup({ name: newGroupName.trim(), description: newGroupDesc.trim() || undefined });
      setNewGroupName('');
      setNewGroupDesc('');
      loadGroups();
    } catch (e: unknown) { setGroupError(e instanceof Error ? e.message : '创建失败'); }
    setCreatingGroup(false);
  };

  const handleUpdateGroup = async (id: string) => {
    if (!editGroupName.trim()) return;
    try {
      await updateGroup(id, { name: editGroupName.trim(), description: editGroupDesc.trim() || undefined });
      setEditingGroupId(null);
      loadGroups();
    } catch (e: unknown) { setGroupError(e instanceof Error ? e.message : '更新失败'); }
  };

  const handleDeleteGroup = async (id: string) => {
    try {
      await deleteGroup(id);
      setDeletingGroupId(null);
      loadGroups();
    } catch { /* ignore */ }
  };

  const handleAddMember = async (groupId: string) => {
    if (!memberUserId.trim()) return;
    setAddingMember(true);
    setGroupError('');
    try {
      await addGroupMember(groupId, memberUserId.trim());
      setMemberUserId('');
      loadGroups();
    } catch (e: unknown) { setGroupError(e instanceof Error ? e.message : '添加成员失败'); }
    setAddingMember(false);
  };

  const handleRemoveMember = async (groupId: string, userId: string) => {
    try {
      await removeGroupMember(groupId, userId);
      loadGroups();
    } catch { /* ignore */ }
  };

  const load = () => {
    setLoading(true);
    Promise.all([
      getAllUsers(page, pageSize),
      getGroups(1, 200),
    ])
      .then(([userRes, groupRes]) => {
        setUsers(userRes.items);
        setTotal(userRes.total);
        const map: Record<string, string> = {};
        groupRes.items.forEach((g: Group) => { map[g.id] = g.name; });
        setGroupMap(map);
      })
      .catch((err: unknown) => {
        console.error('Failed to load users/groups:', err);
      })
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

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
      <div className="mb-6 sm:mb-8">
        <h2 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] mb-1">用户管理</h2>
        <p className="text-xs sm:text-sm text-[var(--text-secondary)] mb-3">管理平台用户、角色与分组</p>
        <div className="tab-underline">
          {[{ key: 'users', label: '用户列表' }, { key: 'groups', label: '分组管理' }].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as typeof tab)} className={`transition-all duration-200 ${tab === t.key ? 'active' : ''}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'users' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs text-[var(--text-placeholder)]">{total} 个用户</span>
            {isSuperAdmin && (
              <button onClick={() => setShowAdd(true)} className="px-3 py-1.5 text-xs font-medium rounded-full bg-[var(--btn-primary)] text-white hover:bg-[var(--btn-primary-hover)] transition-all duration-200">
                添加用户
              </button>
            )}
          </div>

      {/* Add user modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowAdd(false)}>
          <div className="bg-[var(--bg-secondary)] rounded-2xl w-full max-w-md mx-4 p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">添加新用户</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">用户名</label>
                <input
                  type="text"
                  value={addForm.username}
                  onChange={(e) => setAddForm((f) => ({ ...f, username: e.target.value }))}
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-full px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)] transition-all duration-200"
                  placeholder="输入用户名"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">邮箱</label>
                <input
                  type="email"
                  value={addForm.email}
                  onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-full px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)] transition-all duration-200"
                  placeholder="输入邮箱"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">密码</label>
                <input
                  type="password"
                  value={addForm.password}
                  onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))}
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-full px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)] transition-all duration-200"
                  placeholder="输入密码"
                />
              </div>
              {addError && <p className="text-sm text-[var(--accent-red)]">{addError}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                onClick={() => { setShowAdd(false); setAddError(''); }}
                className="px-3 py-1.5 text-sm rounded-full border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all duration-200"
              >
                取消
              </button>
              <button
                onClick={handleAdd}
                disabled={adding}
                className="px-4 py-1.5 text-sm font-medium rounded-full bg-[var(--btn-primary)] text-white hover:bg-[var(--btn-primary-hover)] disabled:opacity-50 transition-all duration-200"
              >
                {adding ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ MOBILE: Card layout (sm:hidden) ============ */}
      <div className="sm:hidden space-y-3">
        {users.map((u) => {
          const isSelf = u.id === me?.id;
          const isAdmin = u.role === 'admin';
          return (
            <div key={u.id} className="card p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    {u.username}
                    {isSelf && <span className="ml-1.5 text-[10px] text-[var(--accent-blue)]">(你)</span>}
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">{u.email}</p>
                </div>
                <div className="ml-2 shrink-0">
                  {isSuperAdmin && !isSelf && !isAdmin && (
                    confirmDelete === u.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDelete(u.id)}
                          className="px-2 py-0.5 text-[11px] rounded-full bg-[var(--btn-danger)] text-white hover:bg-[var(--accent-red)] transition-all duration-200"
                        >
                          确认
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="px-2 py-0.5 text-[11px] rounded-full border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all duration-200"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(u.id)}
                        className="px-2 py-0.5 text-[11px] rounded-full border border-[var(--border-default)] text-[var(--accent-red)] hover:bg-[var(--btn-danger)]/20 transition-all duration-200"
                      >
                        删除
                      </button>
                    )
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {u.group_id && groupMap[u.group_id] ? (
                  <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-[var(--btn-blue)]/20 text-[var(--accent-blue)]">
                    {groupMap[u.group_id]}
                  </span>
                ) : (
                  <span className="text-[11px] text-[var(--text-placeholder)]">未分组</span>
                )}
                {isSelf || !isSuperAdmin ? (
                  <span className="text-xs text-[var(--text-secondary)]">{ROLE_LABELS[u.role]}</span>
                ) : (
                  <select
                    value={u.role}
                    onChange={(e) => handleRoleChange(u.id, e.target.value)}
                    className="bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-full px-2 py-1 text-[var(--text-primary)] text-xs focus:outline-none focus:border-[var(--accent-blue)] transition-all duration-200"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="text-[11px] text-[var(--text-placeholder)]">
                {new Date(u.created_at).toLocaleDateString('zh-CN')}
              </div>
            </div>
          );
        })}
        {users.length === 0 && (
          <div className="card p-8 text-center text-sm text-[var(--text-placeholder)]">暂无用户</div>
        )}
      </div>

      {/* ============ DESKTOP: Table layout (hidden sm:block) ============ */}
      <div className="hidden sm:block card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)] text-left">
                <th className="px-4 py-3 font-medium">用户名</th>
                <th className="px-4 py-3 font-medium">邮箱</th>
                <th className="px-4 py-3 font-medium">所属分组</th>
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
                  <tr key={u.id} className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-secondary)] transition-colors">
                    <td className="px-4 py-3 text-[var(--text-primary)] font-medium">
                      {u.username}
                      {isSelf && <span className="ml-2 text-[10px] text-[var(--accent-blue)]">(你)</span>}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">{u.email}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)] text-xs">
                      {u.group_id && groupMap[u.group_id] ? (
                        <span className="px-1.5 py-0.5 rounded-full bg-[var(--btn-blue)]/20 text-[var(--accent-blue)]">{groupMap[u.group_id]}</span>
                      ) : (
                        <span className="text-[var(--text-placeholder)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isSelf || !isSuperAdmin ? (
                        <span className="text-[var(--text-secondary)]">{ROLE_LABELS[u.role]}</span>
                      ) : (
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.id, e.target.value)}
                          className="bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-full px-2 py-1 text-[var(--text-primary)] text-xs focus:outline-none focus:border-[var(--accent-blue)] transition-all duration-200"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-placeholder)] text-xs">
                      {new Date(u.created_at).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="px-4 py-3">
                      {isSuperAdmin && !isSelf && !isAdmin && (
                        confirmDelete === u.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(u.id)}
                              className="px-2 py-0.5 text-xs rounded-full bg-[var(--btn-danger)] text-white hover:bg-[var(--accent-red)] transition-all duration-200"
                            >
                              确认
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="px-2 py-0.5 text-xs rounded-full border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all duration-200"
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(u.id)}
                            className="px-2 py-0.5 text-xs rounded-full border border-[var(--border-default)] text-[var(--accent-red)] hover:bg-[var(--btn-danger)]/20 transition-all duration-200"
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
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-subtle)]">
            <span className="text-xs text-[var(--text-placeholder)]">共 {total} 个用户</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-2 py-1 text-xs rounded-full border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 transition-all duration-200"
              >
                上一页
              </button>
              <span className="text-xs text-[var(--text-secondary)] px-2">{page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-2 py-1 text-xs rounded-full border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 transition-all duration-200"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Mobile pagination */}
      {totalPages > 1 && (
        <div className="sm:hidden flex items-center justify-between mt-3 px-1">
          <span className="text-xs text-[var(--text-placeholder)]">共 {total} 个用户</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2 py-1 text-xs rounded-full border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 transition-all duration-200"
            >
              上一页
            </button>
            <span className="text-xs text-[var(--text-secondary)] px-2">{page} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-2 py-1 text-xs rounded-full border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 transition-all duration-200"
            >
              下一页
            </button>
          </div>
        </div>
      )}
        </>

      {/* Group Management Tab */}
      {tab === 'groups' && (
        <div className="space-y-4">
          {isSuperAdmin && (
            <div className="flex gap-2">
              <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="分组名称" className="flex-1 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-full px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-blue)] outline-none" />
              <input value={newGroupDesc} onChange={e => setNewGroupDesc(e.target.value)} placeholder="描述（可选）" className="flex-1 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-full px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-blue)] outline-none" />
              <button onClick={handleCreateGroup} disabled={creatingGroup || !newGroupName.trim()} className="px-4 py-1.5 text-xs rounded-full bg-[var(--btn-primary)] text-white hover:bg-[var(--btn-primary-hover)] disabled:opacity-50 transition-colors">
                {creatingGroup ? '...' : '创建分组'}
              </button>
            </div>
          )}
          {groupError && <p className="text-[11px] text-[var(--accent-red)]">{groupError}</p>}
          {groupLoading ? <p className="text-xs text-[var(--text-placeholder)]">加载中...</p> : groups.length === 0 ? <p className="text-xs text-[var(--text-placeholder)] text-center py-8">暂无分组</p> : (
            <div className="space-y-3">
              {groups.map(g => (
                <div key={g.id} className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-subtle)] p-4">
                  {editingGroupId === g.id ? (
                    <div className="flex gap-2 mb-3">
                      <input value={editGroupName} onChange={e => setEditGroupName(e.target.value)} className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-full px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-blue)] outline-none" />
                      <input value={editGroupDesc} onChange={e => setEditGroupDesc(e.target.value)} className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-full px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-blue)] outline-none" />
                      <button onClick={() => handleUpdateGroup(g.id)} className="px-3 py-1.5 text-xs rounded-full bg-[var(--btn-primary)] text-white">保存</button>
                      <button onClick={() => setEditingGroupId(null)} className="px-3 py-1.5 text-xs rounded-full border border-[var(--border-default)] text-[var(--text-secondary)]">取消</button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="text-sm font-semibold text-[var(--text-primary)]">{g.name}</h4>
                        {g.description && <p className="text-[11px] text-[var(--text-placeholder)]">{g.description}</p>}
                      </div>
                      {isSuperAdmin && (
                        <div className="flex gap-1">
                          <button onClick={() => { setEditingGroupId(g.id); setEditGroupName(g.name); setEditGroupDesc(g.description || ''); }} className="text-[10px] px-2 py-0.5 rounded-full border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]">编辑</button>
                          {deletingGroupId === g.id ? (
                            <><button onClick={() => handleDeleteGroup(g.id)} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent-red)] text-white">确认删除</button>
                            <button onClick={() => setDeletingGroupId(null)} className="text-[10px] px-2 py-0.5 rounded-full border border-[var(--border-default)] text-[var(--text-secondary)]">取消</button></>
                          ) : (
                            <button onClick={() => setDeletingGroupId(g.id)} className="text-[10px] px-2 py-0.5 rounded-full border border-[var(--border-default)] text-[var(--accent-red)]">删除</button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5">成员</p>
                    {g.members && g.members.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {g.members.map((m: { id: string; username: string }) => (
                          <span key={m.id} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                            {m.username}
                            {isSuperAdmin && (<button onClick={() => handleRemoveMember(g.id, m.id)} className="text-[var(--text-placeholder)] hover:text-[var(--accent-red)] ml-0.5">×</button>)}
                          </span>
                        ))}
                      </div>
                    ) : <p className="text-[10px] text-[var(--text-placeholder)] mb-2">暂无成员</p>}
                    {isSuperAdmin && (
                      <div className="flex gap-1.5">
                        <input value={memberUserId} onChange={e => setMemberUserId(e.target.value)} placeholder="输入用户 ID 添加成员" className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-full px-2.5 py-1 text-[10px] text-[var(--text-primary)] focus:border-[var(--accent-blue)] outline-none" />
                        <button onClick={() => handleAddMember(g.id)} disabled={addingMember || !memberUserId.trim()} className="px-3 py-1 text-[10px] rounded-full bg-[var(--btn-primary)] text-white hover:bg-[var(--btn-primary-hover)] disabled:opacity-50 transition-colors">添加</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

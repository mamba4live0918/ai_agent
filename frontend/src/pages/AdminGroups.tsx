import { useState, useEffect } from 'react';
import {
  getGroups, createGroup, updateGroup, deleteGroup,
  getGroupMembers, addGroupMember, removeGroupMember,
  getAllUsers,
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { Group, GroupMember, User } from '../types';

export default function AdminGroups() {
  const { user: me } = useAuth();
  const isSuperAdmin = me?.role === 'admin' && !me?.group_id;

  const [groups, setGroups] = useState<Group[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Create / Edit modal
  const [showForm, setShowForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '', admin_id: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Members panel
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // Add member
  const [showAddMember, setShowAddMember] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [addMemberError, setAddMemberError] = useState('');

  const pageSize = 20;

  const loadGroups = () => {
    setLoading(true);
    getGroups(page, pageSize)
      .then((res) => { setGroups(res.items); setTotal(res.total); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadGroups(); }, [page]);

  const loadMembers = (groupId: string) => {
    setMembersLoading(true);
    getGroupMembers(groupId)
      .then(setMembers)
      .finally(() => setMembersLoading(false));
  };

  const openCreate = () => {
    setEditingGroup(null);
    setFormData({ name: '', description: '', admin_id: '' });
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (g: Group) => {
    setEditingGroup(g);
    setFormData({ name: g.name, description: g.description || '', admin_id: g.admin_id || '' });
    setFormError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setFormError('请输入组名');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      if (editingGroup) {
        const data: Record<string, string> = {};
        if (formData.name !== editingGroup.name) data.name = formData.name;
        if (formData.description !== (editingGroup.description || '')) data.description = formData.description;
        if (isSuperAdmin && formData.admin_id !== (editingGroup.admin_id || '')) data.admin_id = formData.admin_id;
        if (Object.keys(data).length === 0) {
          setShowForm(false);
          return;
        }
        const updated = await updateGroup(editingGroup.id, data);
        setGroups((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
      } else {
        const created = await createGroup({
          name: formData.name,
          description: formData.description || undefined,
          admin_id: formData.admin_id || undefined,
        });
        setGroups((prev) => [created, ...prev]);
        setTotal((t) => t + 1);
      }
      setShowForm(false);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (groupId: string) => {
    await deleteGroup(groupId);
    setConfirmDelete(null);
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
    setTotal((t) => t - 1);
    if (expandedGroup === groupId) setExpandedGroup(null);
  };

  const toggleExpand = (groupId: string) => {
    if (expandedGroup === groupId) {
      setExpandedGroup(null);
      setMembers([]);
    } else {
      setExpandedGroup(groupId);
      loadMembers(groupId);
    }
  };

  const openAddMember = async () => {
    setShowAddMember(true);
    setAddMemberError('');
    setUsersLoading(true);
    try {
      const res = await getAllUsers(1, 200);
      // Filter out users already in the group and super admins
      const memberIds = new Set(members.map((m) => m.id));
      setAllUsers(res.items.filter((u) => !memberIds.has(u.id) && !(u.role === 'admin' && u.group_id === null)));
    } finally {
      setUsersLoading(false);
    }
  };

  const handleAddMember = async (userId: string) => {
    if (!expandedGroup) return;
    try {
      const member = await addGroupMember(expandedGroup, userId);
      setMembers((prev) => [...prev, member]);
      setAllUsers((prev) => prev.filter((u) => u.id !== userId));
      // Update member count in group list
      setGroups((prev) => prev.map((g) => g.id === expandedGroup ? { ...g, member_count: g.member_count + 1 } : g));
      setAddMemberError('');
    } catch (e: unknown) {
      setAddMemberError(e instanceof Error ? e.message : '添加失败');
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!expandedGroup) return;
    await removeGroupMember(expandedGroup, userId);
    setMembers((prev) => prev.filter((m) => m.id !== userId));
    setGroups((prev) => prev.map((g) => g.id === expandedGroup ? { ...g, member_count: Math.max(0, g.member_count - 1) } : g));
  };

  const totalPages = Math.ceil(total / pageSize);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
        <p className="text-sm text-[var(--text-secondary)]">加载中...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-1">分组管理</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            {isSuperAdmin ? '管理所有分组与分组管理员' : '管理您的分组'}
          </p>
        </div>
        {isSuperAdmin && (
          <button
            onClick={openCreate}
            className="px-4 py-2 text-sm font-medium rounded-md bg-[var(--btn-primary)] text-white hover:bg-[var(--btn-primary-hover)] transition-colors"
          >
            创建分组
          </button>
        )}
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowForm(false)}>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-lg w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
              {editingGroup ? '编辑分组' : '创建分组'}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">组名</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-md px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                  placeholder="输入组名"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">描述</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-md px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)] resize-none"
                  rows={2}
                  placeholder="输入描述（可选）"
                />
              </div>
              {isSuperAdmin && (
                <div>
                  <label className="block text-xs text-[var(--text-secondary)] mb-1">分组管理员</label>
                  <input
                    type="text"
                    value={formData.admin_id}
                    onChange={(e) => setFormData((f) => ({ ...f, admin_id: e.target.value }))}
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-md px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                    placeholder="输入管理员用户 ID（可选）"
                  />
                </div>
              )}
              {formError && <p className="text-sm text-[var(--accent-red)]">{formError}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                onClick={() => setShowForm(false)}
                className="px-3 py-1.5 text-sm rounded-md border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-1.5 text-sm font-medium rounded-md bg-[var(--btn-primary)] text-white hover:bg-[var(--btn-primary-hover)] disabled:opacity-50 transition-colors"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Group list */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)] text-left">
                <th className="px-4 py-3 font-medium">组名</th>
                <th className="px-4 py-3 font-medium">描述</th>
                <th className="px-4 py-3 font-medium">管理员</th>
                <th className="px-4 py-3 font-medium">成员数</th>
                <th className="px-4 py-3 font-medium">创建时间</th>
                <th className="px-4 py-3 font-medium w-28">操作</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <>
                  <tr key={g.id} className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-secondary)] transition-colors">
                    <td className="px-4 py-3 text-[var(--text-primary)] font-medium">{g.name}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)] max-w-[200px] truncate">
                      {g.description || '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {g.admin_name || (g.admin_id ? g.admin_id.slice(0, 8) + '...' : '—')}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleExpand(g.id)}
                        className="text-[var(--accent-blue)] hover:text-[var(--accent-blue)] text-xs font-mono transition-colors"
                      >
                        {g.member_count} 人
                      </button>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-placeholder)] text-xs">
                      {new Date(g.created_at).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEdit(g)}
                          className="px-2 py-0.5 text-xs rounded border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                        >
                          编辑
                        </button>
                        {isSuperAdmin && (
                          confirmDelete === g.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleDelete(g.id)}
                                className="px-2 py-0.5 text-xs rounded bg-[var(--btn-danger)] text-white hover:bg-[var(--accent-red)]"
                              >
                                确认
                              </button>
                              <button
                                onClick={() => setConfirmDelete(null)}
                                className="px-2 py-0.5 text-xs rounded border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                              >
                                取消
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDelete(g.id)}
                              className="px-2 py-0.5 text-xs rounded border border-[var(--border-default)] text-[var(--accent-red)] hover:bg-[var(--btn-danger)]/20 transition-colors"
                            >
                              删除
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                  {/* Expanded members row */}
                  {expandedGroup === g.id && (
                    <tr key={`${g.id}-members`}>
                      <td colSpan={6} className="px-4 py-3 bg-[var(--bg-primary)] border-b border-[var(--border-subtle)]">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-semibold text-[var(--text-secondary)]">组成员</p>
                          <button
                            onClick={openAddMember}
                            className="px-2 py-0.5 text-xs rounded bg-[var(--btn-primary)] text-white hover:bg-[var(--btn-primary-hover)] transition-colors"
                          >
                            添加成员
                          </button>
                        </div>
                        {membersLoading ? (
                          <p className="text-xs text-[var(--text-placeholder)]">加载中...</p>
                        ) : members.length === 0 ? (
                          <p className="text-xs text-[var(--text-placeholder)]">暂无成员</p>
                        ) : (
                          <div className="space-y-1">
                            {members.map((m) => (
                              <div key={m.id} className="flex items-center justify-between py-1 px-2 rounded hover:bg-[var(--bg-secondary)]">
                                <div className="flex items-center gap-3">
                                  <span className="text-xs text-[var(--text-primary)]">{m.username}</span>
                                  <span className="text-[10px] text-[var(--text-placeholder)]">{m.email}</span>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                    m.role === 'admin' ? 'bg-[var(--btn-blue)]/20 text-[var(--accent-blue)]' :
                                    m.role === 'instructor' ? 'bg-[var(--accent-purple)]/20 text-[var(--accent-purple)]' :
                                    'bg-[var(--accent-green)]/20 text-[var(--accent-green)]'
                                  }`}>
                                    {m.role === 'admin' ? '管理员' : m.role === 'instructor' ? '讲师' : '销售'}
                                  </span>
                                </div>
                                <button
                                  onClick={() => handleRemoveMember(m.id)}
                                  className="px-2 py-0.5 text-xs rounded border border-[var(--border-default)] text-[var(--accent-red)] hover:bg-[var(--btn-danger)]/20 transition-colors"
                                >
                                  移除
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {groups.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-[var(--text-placeholder)]">
                    暂无分组
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-subtle)]">
            <span className="text-xs text-[var(--text-placeholder)]">共 {total} 个分组</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-2 py-1 text-xs rounded border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40"
              >
                上一页
              </button>
              <span className="text-xs text-[var(--text-secondary)] px-2">{page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-2 py-1 text-xs rounded border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add member modal */}
      {showAddMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => { setShowAddMember(false); setAddMemberError(''); }}>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-lg w-full max-w-md mx-4 p-6 max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">添加成员</h3>
            {addMemberError && <p className="text-sm text-[var(--accent-red)] mb-2">{addMemberError}</p>}
            {usersLoading ? (
              <p className="text-sm text-[var(--text-secondary)]">加载用户列表...</p>
            ) : allUsers.length === 0 ? (
              <p className="text-sm text-[var(--text-placeholder)]">没有可添加的用户</p>
            ) : (
              <div className="overflow-y-auto flex-1 space-y-1">
                {allUsers.map((u) => (
                  <div key={u.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-[var(--bg-primary)]">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--text-primary)]">{u.username}</span>
                      <span className="text-[10px] text-[var(--text-placeholder)]">{u.email}</span>
                    </div>
                    <button
                      onClick={() => handleAddMember(u.id)}
                      className="px-2 py-0.5 text-xs rounded bg-[var(--btn-primary)] text-white hover:bg-[var(--btn-primary-hover)] transition-colors"
                    >
                      添加
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end mt-4 pt-3 border-t border-[var(--border-subtle)]">
              <button
                onClick={() => { setShowAddMember(false); setAddMemberError(''); }}
                className="px-3 py-1.5 text-sm rounded-md border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

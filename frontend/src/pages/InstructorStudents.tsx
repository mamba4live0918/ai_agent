import { useState, useEffect, useCallback } from 'react';
import { getAllUsers, getGroups, createGroup, updateGroup, deleteGroup, addGroupMember, removeGroupMember, claimStudent, releaseStudent, getUserDetail } from '../services/api';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { User, Group } from '../types';

const ROLE_LABELS: Record<string, string> = { admin: '管理员', instructor: '讲师', salesperson: '销售' };

export default function InstructorStudents() {
  const { user: me } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'students' | 'groups'>('students');
  const [selectedUser, setSelectedUser] = useState<{ id: string; username: string; email: string; role: string; group_id: string | null; created_at: string | null; administered_groups: { id: string; name: string; description: string | null; member_count: number }[] } | null>(null);

  // Student list
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [claimGroupId, setClaimGroupId] = useState<Record<string, string>>({});

  // Groups
  const [groups, setGroups] = useState<Group[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupDesc, setEditGroupDesc] = useState('');
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  const [memberUserId, setMemberUserId] = useState('');
  const [memberGroupId, setMemberGroupId] = useState<string | null>(null);
  const [addingMember, setAddingMember] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAllUsers(1, 200);
      setUsers(res.items);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const loadGroups = useCallback(async () => {
    try {
      const res = await getGroups(1, 200);
      setGroups(res.items);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadUsers(); loadGroups(); }, [loadUsers, loadGroups]);

  const handleClaim = async (userId: string, groupId: string) => {
    if (!groupId) return;
    setClaiming(userId);
    try { await claimStudent(userId, groupId); loadUsers(); loadGroups(); } catch { /* ignore */ }
    setClaiming(null);
  };

  const handleRelease = async (userId: string) => {
    setClaiming(userId);
    try { await releaseStudent(userId); loadUsers(); } catch { /* ignore */ }
    setClaiming(null);
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    setCreatingGroup(true);
    try { await createGroup({ name: newGroupName.trim(), description: newGroupDesc.trim() || undefined }); setNewGroupName(''); setNewGroupDesc(''); loadGroups(); }
    catch { /* ignore */ }
    setCreatingGroup(false);
  };

  const handleUpdateGroup = async (id: string) => {
    if (!editGroupName.trim()) return;
    try { await updateGroup(id, { name: editGroupName.trim(), description: editGroupDesc.trim() || undefined }); setEditingGroupId(null); loadGroups(); }
    catch { /* ignore */ }
  };

  const handleDeleteGroup = async (id: string) => {
    try { await deleteGroup(id); setDeletingGroupId(null); setSelectedGroup(null); loadGroups(); }
    catch { /* ignore */ }
  };

  const handleAddMember = async (groupId: string) => {
    if (!memberUserId) return;
    setAddingMember(true);
    try { await addGroupMember(groupId, memberUserId); setMemberGroupId(null); setMemberUserId(''); loadGroups(); }
    catch { /* ignore */ }
    setAddingMember(false);
  };

  const handleRemoveMember = async (groupId: string, userId: string) => {
    try { await removeGroupMember(groupId, userId); loadGroups(); }
    catch { /* ignore */ }
  };

  if (loading) return <div className="max-w-5xl mx-auto px-4 py-8"><p className="text-sm text-[var(--text-secondary)]">加载中...</p></div>;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-[var(--text-primary)]">学员管理</h2>
        <p className="text-xs text-[var(--text-secondary)] mt-1">管理你的学员和学员小组</p>
        <div className="tab-underline mt-3">
          {[{ key: 'students', label: '学员列表' }, { key: 'groups', label: '学员小组' }].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as typeof tab)} className={`transition-all duration-200 ${tab === t.key ? 'active' : ''}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'students' && (
        <div>
          {users.length === 0 ? (
            <p className="text-sm text-[var(--text-placeholder)] text-center py-12">暂无可认领的学员</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[var(--border-subtle)]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[var(--bg-tertiary)]/50">
                    <th className="px-3 py-2.5 text-left font-medium text-[var(--text-secondary)]">用户名</th>
                    <th className="px-3 py-2.5 text-left font-medium text-[var(--text-secondary)] hidden sm:table-cell">邮箱</th>
                    <th className="px-3 py-2.5 text-left font-medium text-[var(--text-secondary)] hidden sm:table-cell">角色</th>
                    <th className="px-3 py-2.5 text-left font-medium text-[var(--text-secondary)]">状态</th>
                    <th className="px-3 py-2.5 text-right font-medium text-[var(--text-secondary)]">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => {
                    // Student is mine if their group_id matches one of my administered groups
                    const myGroupIds = groups.map(g => g.id);
                    const isMyStudent = u.group_id != null && myGroupIds.includes(u.group_id);
                    return (
                      <tr key={u.id} className="border-t border-[var(--border-subtle)] hover:bg-[var(--bg-primary)]">
                        <td className="px-3 py-2.5 font-medium text-[var(--accent-blue)] cursor-pointer hover:underline" onClick={async () => { try { const d = await getUserDetail(u.id); setSelectedUser(d); } catch { /* ignore */ } }}>{u.username}</td>
                        <td className="px-3 py-2.5 text-[var(--text-placeholder)] hidden sm:table-cell">{u.email || '—'}</td>
                        <td className="px-3 py-2.5 text-[var(--text-secondary)] hidden sm:table-cell">{ROLE_LABELS[u.role] || u.role}</td>
                        <td className="px-3 py-2.5">
                          {isMyStudent ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent-green)]/20 text-[var(--accent-green)]">我的学员</span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-placeholder)]">学员</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {isMyStudent ? (
                            <button onClick={() => handleRelease(u.id)} disabled={claiming === u.id}
                              className="text-[10px] px-2 py-0.5 rounded-full border border-[var(--accent-red)]/40 text-[var(--accent-red)] hover:bg-[var(--accent-red)]/10 disabled:opacity-50 transition-colors">
                              {claiming === u.id ? '...' : '移出'}
                            </button>
                          ) : groups.length > 0 ? (
                            <div className="flex items-center gap-1 justify-end">
                              <select
                                value={claimGroupId[u.id] || ''}
                                onChange={e => setClaimGroupId(prev => ({ ...prev, [u.id]: e.target.value }))}
                                className="bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-full px-2 py-0.5 text-[10px] text-[var(--text-primary)] focus:border-[var(--accent-blue)] outline-none w-20"
                              >
                                <option value="">选小组</option>
                                {groups.map(g => (
                                  <option key={g.id} value={g.id}>{g.name}</option>
                                ))}
                              </select>
                              <button
                                onClick={() => { const gid = claimGroupId[u.id]; if (gid) { handleClaim(u.id, gid); setClaimGroupId(prev => ({ ...prev, [u.id]: '' })); } }}
                                disabled={claiming === u.id || !claimGroupId[u.id]}
                                className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--btn-primary)] text-white hover:bg-[var(--btn-primary-hover)] disabled:opacity-50 transition-colors"
                              >
                                {claiming === u.id ? '...' : '加入'}
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-[var(--text-placeholder)]">先去「学员小组」创建小组</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'groups' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="小组名称" className="sm:flex-1 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-full px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-blue)] outline-none" />
            <input value={newGroupDesc} onChange={e => setNewGroupDesc(e.target.value)} placeholder="描述（可选）" className="sm:flex-1 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-full px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-blue)] outline-none" />
            <button onClick={handleCreateGroup} disabled={creatingGroup || !newGroupName.trim()} className="px-4 py-1.5 text-xs rounded-full bg-[var(--btn-primary)] text-white hover:bg-[var(--btn-primary-hover)] disabled:opacity-50 transition-colors">
              {creatingGroup ? '...' : '创建小组'}
            </button>
          </div>
          {groups.length === 0 ? (
            <p className="text-sm text-[var(--text-placeholder)] text-center py-8">暂无学员小组，创建一个吧</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {groups.map(g => (
                <div key={g.id} onClick={() => setSelectedGroup(g)} className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-subtle)] p-3.5 cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors">
                  <h4 className="text-sm font-semibold text-[var(--text-primary)]">{g.name}</h4>
                  <span className="text-[11px] text-[var(--text-placeholder)] mt-1.5">{g.members?.length || 0} 人</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Group Detail Modal */}
      {selectedGroup && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" onClick={() => setSelectedGroup(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none p-4">
            <div className="pointer-events-auto w-full max-w-3xl h-[72vh] bg-[var(--bg-secondary)] rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.16)] border border-[var(--border-subtle)] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-subtle)] flex-shrink-0">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">{selectedGroup.name}</h3>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setEditingGroupId(selectedGroup.id); setEditGroupName(selectedGroup.name); setEditGroupDesc(selectedGroup.description || ''); }} className="text-[10px] px-2 py-0.5 rounded-full border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]">编辑</button>
                  {deletingGroupId === selectedGroup.id ? (
                    <><button onClick={() => handleDeleteGroup(selectedGroup.id)} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent-red)] text-white">确认</button>
                    <button onClick={() => setDeletingGroupId(null)} className="text-[10px] px-2 py-0.5 rounded-full border border-[var(--border-default)] text-[var(--text-secondary)]">取消</button></>
                  ) : (
                    <button onClick={() => setDeletingGroupId(selectedGroup.id)} className="text-[10px] px-2 py-0.5 rounded-full border border-[var(--border-default)] text-[var(--accent-red)]">删除</button>
                  )}
                  <button onClick={() => setSelectedGroup(null)} className="w-7 h-7 flex items-center justify-center rounded-full text-[var(--text-placeholder)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors">
                    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/></svg>
                  </button>
                </div>
              </div>
              {editingGroupId === selectedGroup.id && (
                <div className="px-5 py-3 border-b border-[var(--border-subtle)] flex gap-2">
                  <input value={editGroupName} onChange={e => setEditGroupName(e.target.value)} className="flex-1 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-full px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-blue)] outline-none" />
                  <button onClick={() => { handleUpdateGroup(selectedGroup.id); setEditingGroupId(null); }} className="px-3 py-1 text-[10px] rounded-full bg-[var(--btn-primary)] text-white">保存</button>
                  <button onClick={() => setEditingGroupId(null)} className="px-3 py-1 text-[10px] rounded-full border border-[var(--border-default)] text-[var(--text-secondary)]">取消</button>
                </div>
              )}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div>
                  <p className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-2">成员 ({selectedGroup.members?.length || 0})</p>
                  {selectedGroup.members && selectedGroup.members.length > 0 ? (
                    <div className="overflow-hidden rounded-xl border border-[var(--border-subtle)] mb-3">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-[var(--bg-tertiary)]/50">
                            <th className="px-2 py-2 text-left text-[10px] font-medium text-[var(--text-secondary)]">用户名</th>
                            <th className="px-2 py-2 text-left text-[10px] font-medium text-[var(--text-secondary)]">角色</th>
                            <th className="px-2 py-2 text-left text-[10px] font-medium text-[var(--text-secondary)]">操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedGroup.members.map((m, idx) => (
                            <tr key={m.id} className={`border-t border-[var(--border-subtle)] ${idx % 2 === 0 ? 'bg-[var(--bg-primary)]' : 'bg-[var(--bg-secondary)]/50'}`}>
                              <td className="px-2 py-2 text-[var(--text-primary)] font-medium text-[10px]">{m.username}</td>
                              <td className="px-2 py-2 text-[var(--text-secondary)] text-[10px]">{ROLE_LABELS[m.role] || m.role}</td>
                              <td className="px-2 py-2">
                                <button onClick={() => handleRemoveMember(selectedGroup.id, m.id)} className="text-[var(--text-placeholder)] hover:text-[var(--accent-red)] text-[10px]">移除</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <p className="text-[10px] text-[var(--text-placeholder)] mb-3">暂无成员</p>}
                  {memberGroupId === selectedGroup.id ? (
                    <div className="flex gap-1.5">
                      <select value={memberUserId} onChange={e => setMemberUserId(e.target.value)} className="flex-1 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-full px-2.5 py-1 text-[10px] text-[var(--text-primary)] focus:border-[var(--accent-blue)] outline-none">
                        <option value="">选择学员...</option>
                        {users.filter(u => u.group_id !== selectedGroup.id).slice(0, 50).map(u => (
                          <option key={u.id} value={u.id}>{u.username}</option>
                        ))}
                      </select>
                      <button onClick={() => { handleAddMember(selectedGroup.id); }} disabled={addingMember || !memberUserId} className="px-3 py-1 text-[10px] rounded-full bg-[var(--btn-primary)] text-white hover:bg-[var(--btn-primary-hover)] disabled:opacity-50">确认</button>
                      <button onClick={() => setMemberGroupId(null)} className="px-2 py-1 text-[10px] rounded-full border border-[var(--border-default)] text-[var(--text-secondary)]">取消</button>
                    </div>
                  ) : (
                    <button onClick={() => { setMemberGroupId(selectedGroup.id); setMemberUserId(''); }} className="text-[10px] px-3 py-1 rounded-full bg-[var(--btn-primary)] text-white hover:bg-[var(--btn-primary-hover)] transition-colors">+ 添加成员</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* User Detail Modal */}
      {selectedUser && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" onClick={() => setSelectedUser(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none p-4">
            <div className="pointer-events-auto w-full max-w-md max-h-[80vh] bg-[var(--bg-secondary)] rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.16)] border border-[var(--border-subtle)] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-subtle)] flex-shrink-0">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">{selectedUser.username}</h3>
                <button onClick={() => setSelectedUser(null)} className="w-7 h-7 flex items-center justify-center rounded-full text-[var(--text-placeholder)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors">
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/></svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div><span className="text-[var(--text-tertiary)]">用户名</span><p className="text-[var(--text-primary)] font-medium">{selectedUser.username}</p></div>
                  <div><span className="text-[var(--text-tertiary)]">角色</span><p className="text-[var(--text-primary)]">{selectedUser.role === 'instructor' ? '讲师' : selectedUser.role === 'admin' ? '管理员' : '销售'}</p></div>
                  <div className="col-span-2"><span className="text-[var(--text-tertiary)]">邮箱</span><p className="text-[var(--text-primary)]">{selectedUser.email || '—'}</p></div>
                  <div><span className="text-[var(--text-tertiary)]">注册时间</span><p className="text-[var(--text-primary)]">{selectedUser.created_at ? new Date(selectedUser.created_at).toLocaleDateString('zh-CN') : '—'}</p></div>
                  <div><span className="text-[var(--text-tertiary)]">所属小组</span><p className="text-[var(--text-primary)]">{selectedUser.group_id ? '已归属' : '未分组'}</p></div>
                </div>
                {selectedUser.administered_groups && selectedUser.administered_groups.length > 0 && (
                  <div>
                    <p className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-2">管理的小组</p>
                    <div className="space-y-1.5">
                      {selectedUser.administered_groups.map(g => (
                        <div key={g.id} className="flex items-center justify-between bg-[var(--bg-primary)] rounded-lg px-3 py-2 text-xs">
                          <span className="text-[var(--text-primary)] font-medium">{g.name}</span>
                          <span className="text-[var(--text-placeholder)]">{g.member_count} 人</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {(selectedUser.role === 'instructor' || selectedUser.role === 'admin') && (
                  <button onClick={() => { setSelectedUser(null); navigate('/instructor'); }}
                    className="w-full text-xs px-3 py-2 rounded-full bg-[var(--btn-primary)] text-white hover:bg-[var(--btn-primary-hover)] transition-colors">
                    查看讲师端口 →
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

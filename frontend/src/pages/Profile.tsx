import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { updateProfile, getUserDetail, getGroups } from '../services/api';

export default function Profile() {
  const { userId } = useParams<{ userId?: string }>();
  const navigate = useNavigate();
  const isOwnProfile = !userId;
  const { user, setUser } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [viewUser, setViewUser] = useState<{ id: string; username: string; email: string; role: string; bio?: string; avatar?: string; status?: string; created_at?: string | null } | null>(null);
  const [username, setUsername] = useState(user?.username || '');
  const [email, setEmail] = useState(user?.email || '');
  const [bio, setBio] = useState((user as Record<string, unknown> | null)?.bio as string || '');
  const [avatar, setAvatar] = useState((user as Record<string, unknown> | null)?.avatar as string || '');
  const [status, setStatus] = useState((user as Record<string, unknown> | null)?.status as string || '');
  const [showStatusPicker, setShowStatusPicker] = useState(false);

  const handleQuickStatusChange = async (newStatus: string) => {
    setStatus(newStatus);
    setShowStatusPicker(false);
    try {
      const updated = await updateProfile({ status: newStatus }) as { status?: string };
      setUser({ ...user!, status: updated.status } as typeof user);
    } catch { /* ignore */ }
  };

  const STATUS_OPTIONS = [
    { key: '', icon: '🟢', label: '在线' },
    { key: 'busy', icon: '⏳', label: '忙' },
    { key: 'study', icon: '📚', label: '学习中' },
    { key: 'fish', icon: '🎣', label: '摸鱼' },
    { key: 'meeting', icon: '💼', label: '会议中' },
    { key: 'away', icon: '☕', label: '休息' },
    { key: 'travel', icon: '✈️', label: '出差' },
    { key: 'leave', icon: '🏖️', label: '休假' },
  ];

  const currentStatus = STATUS_OPTIONS.find(s => s.key === (isOwnProfile ? status : (viewUser?.status || ''))) || STATUS_OPTIONS[0];

  const [adminGroups, setAdminGroups] = useState<{ id: string; name: string; member_count: number }[]>([]);
  const [selectedGroupDetail, setSelectedGroupDetail] = useState<{ id: string; name: string; members: { id: string; username: string; role: string; email?: string; created_at?: string | null }[] } | null>(null);
  const [selectedMemberDetail, setSelectedMemberDetail] = useState<{ id: string; username: string; email: string; role: string; created_at: string | null } | null>(null);
  useEffect(() => {
    if (userId) {
      getUserDetail(userId).then(d => {
        setViewUser(d as unknown as typeof viewUser);
      }).catch(() => {});
    }
  }, [userId]);

  useEffect(() => {
    if (user?.role === 'instructor' || user?.role === 'admin') {
      getUserDetail(isOwnProfile ? user.id : (userId || user.id)).then(d => setAdminGroups(d.administered_groups || [])).catch(() => {});
    }
  }, [user?.id, user?.role, userId, isOwnProfile]);

  const displayUser = isOwnProfile ? user : viewUser;
  const displayName = isOwnProfile ? username : (viewUser?.username || '');
  const displayEmail = isOwnProfile ? email : (viewUser?.email || '');
  const displayRole = isOwnProfile ? user?.role : (viewUser?.role || '');
  const displayBio = isOwnProfile ? bio : (viewUser?.bio || '');
  const displayAvatar = isOwnProfile ? avatar : (viewUser?.avatar || '');
  const displayStatus = isOwnProfile ? status : (viewUser?.status || '');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 200 * 1024) { setError('头像文件不能超过200KB'); return; }
    const reader = new FileReader();
    reader.onload = () => { setAvatar(reader.result as string); setError(''); };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!username.trim()) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      const data: Record<string, string> = { username: username.trim(), email: email.trim(), bio: bio.trim().slice(0, 100), avatar, status };
      if (password.trim()) data.password = password.trim();
      const updated = await updateProfile(data) as { username: string; email: string; bio?: string; avatar?: string; status?: string };
      setUser({ ...user!, username: updated.username, email: updated.email, bio: updated.bio, avatar: updated.avatar, status: updated.status } as typeof user);
      setEditing(false); setPassword(''); setSuccess('保存成功');
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    }
    setSaving(false);
  };

  if (!displayUser) return <div className="max-w-lg mx-auto px-4 py-8"><p className="text-sm text-[var(--text-secondary)]">加载中...</p></div>;

  return (
    <div className="max-w-lg mx-auto px-4 sm:px-8 py-6 sm:py-10">
      <div className="flex items-center gap-3 mb-6">
        {!isOwnProfile && (
          <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-full border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><path fillRule="evenodd" d="M10.354 3.646a.5.5 0 0 1 0 .708L7.707 8l2.647 2.646a.5.5 0 0 1-.708.708l-3-3a.5.5 0 0 1 0-.708l3-3a.5.5 0 0 1 .708 0Z"/></svg>
          </button>
        )}
        <h2 className="text-xl font-bold text-[var(--text-primary)]">{isOwnProfile ? '个人资料' : `${displayName} 的主页`}</h2>
      </div>

      <div className="bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border-subtle)] p-6 space-y-5">
        {/* Avatar section */}
        <div className="flex items-center gap-4">
          <div className="relative group">
            {editing ? (
              <button onClick={() => fileRef.current?.click()} className="w-16 h-16 rounded-full overflow-hidden ring-2 ring-[var(--border-default)] hover:ring-[var(--accent-blue)] transition-all cursor-pointer flex items-center justify-center bg-[var(--bg-tertiary)]">
                {avatar || displayAvatar ? (
                  <img src={avatar || displayAvatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl font-semibold text-white bg-[var(--btn-blue)] w-full h-full flex items-center justify-center">
                    {displayName.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <svg className="w-5 h-5 text-white" viewBox="0 0 16 16" fill="currentColor"><path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10Z"/></svg>
                </div>
              </button>
            ) : (
              <div className="w-16 h-16 rounded-full overflow-hidden ring-2 ring-[var(--border-default)] bg-[var(--btn-blue)] flex items-center justify-center">
                {displayAvatar ? (
                  <img src={displayAvatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl font-semibold text-white">{displayName.charAt(0).toUpperCase()}</span>
                )}
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">{displayName}</h3>
              <span className="text-xs">{currentStatus.icon}</span>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">{displayRole === 'admin' ? '管理员' : displayRole === 'instructor' ? '讲师' : '销售'} · {currentStatus.label}</p>
          </div>
        </div>

        {/* Bio + contact info */}
        {!editing && (
          <>
            <p className="text-sm text-[var(--text-secondary)]">{displayBio || '这个人很懒，什么都没写...'}</p>
            {/* Clickable status */}
            <div className="relative">
              <button
                onClick={() => setShowStatusPicker(!showStatusPicker)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-[var(--border-default)] hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer"
              >
                <span>{currentStatus.icon}</span>
                <span className="text-[var(--text-secondary)]">{currentStatus.label}</span>
                <svg className="w-3 h-3 text-[var(--text-placeholder)]" viewBox="0 0 16 16" fill="currentColor"><path d="M8 11.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"/></svg>
              </button>
              {showStatusPicker && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowStatusPicker(false)} />
                  <div className="absolute top-full left-0 mt-1 z-20 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-xl shadow-lg p-2 flex flex-wrap gap-1 w-56">
                    {STATUS_OPTIONS.map(s => (
                      <button key={s.key} onClick={() => handleQuickStatusChange(s.key)}
                        className={`text-xs px-2.5 py-1.5 rounded-lg transition-colors hover:bg-[var(--bg-secondary)] ${status === s.key ? 'bg-[var(--accent-blue)]/10 text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                        {s.icon} {s.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
              <svg className="w-3.5 h-3.5 text-[var(--text-placeholder)]" viewBox="0 0 16 16" fill="currentColor"><path d="M0 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V4Zm2-1a1 1 0 0 0-1 1v.217l7 4.2 7-4.2V4a1 1 0 0 0-1-1H2Zm13 2.383-4.708 2.825L15 11.105V5.383Zm-.034 6.876-5.285-2.83L8 8.583l-1.681-.86-5.285 2.83A1 1 0 0 0 2 13h12a1 1 0 0 0 .966-.741ZM1 11.105l4.708-2.897L1 5.383v5.722Z"/></svg>
              <span>{displayEmail || '未设置邮箱'}</span>
            </div>
          </>
        )}

        {editing ? (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">用户名</label>
              <input value={username} onChange={e => setUsername(e.target.value)}
                className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-full px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent-blue)] outline-none transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">邮箱</label>
              <input value={email} onChange={e => setEmail(e.target.value)}
                className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-full px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent-blue)] outline-none transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">个性签名（{bio.length}/100）</label>
              <textarea value={bio} onChange={e => setBio(e.target.value)} maxLength={100} rows={2}
                className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent-blue)] outline-none transition-colors resize-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">新密码（留空不修改）</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-full px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent-blue)] outline-none transition-colors" />
            </div>
            {error && <p className="text-xs text-[var(--accent-red)]">{error}</p>}
            {success && <p className="text-xs text-[var(--accent-green)]">{success}</p>}
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving || !username.trim()}
                className="px-4 py-2 text-sm rounded-full bg-[var(--btn-primary)] text-white hover:bg-[var(--btn-primary-hover)] disabled:opacity-50 transition-colors">
                {saving ? '保存中...' : '保存'}
              </button>
              <button onClick={() => { setEditing(false); setPassword(''); setError(''); }}
                className="px-4 py-2 text-sm rounded-full border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                取消
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setEditing(true)}
            className="px-4 py-2 text-sm rounded-full bg-[var(--btn-primary)] text-white hover:bg-[var(--btn-primary-hover)] transition-colors">
            编辑资料
          </button>
        )}

        {/* Administered groups as cards */}
        {!editing && adminGroups.length > 0 && (
          <div>
            <p className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-2">学员小组</p>
            <div className="grid grid-cols-2 gap-2">
              {adminGroups.map(g => (
                <button key={g.id} onClick={async () => {
                  try { const res = await getGroups(1, 200); const found = res.items.find((x: { id: string }) => x.id === g.id); if (found) setSelectedGroupDetail(found as unknown as { id: string; name: string; members: { id: string; username: string; role: string }[] }); } catch { /* ignore */ }
                }}
                  className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-subtle)] p-3 text-left hover:bg-[var(--bg-secondary)] transition-colors cursor-pointer">
                  <span className="text-xs font-medium text-[var(--text-primary)]">{g.name}</span>
                  <span className="text-[11px] text-[var(--text-placeholder)] ml-2">{g.member_count} 人</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {/* Member Detail Modal (nested) */}
      {selectedMemberDetail && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px]" onClick={() => setSelectedMemberDetail(null)} />
          <div className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none p-4">
            <div className="pointer-events-auto w-full max-w-xs bg-[var(--bg-secondary)] rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.16)] border border-[var(--border-subtle)] overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-subtle)]">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">{selectedMemberDetail.username}</h3>
                <button onClick={() => setSelectedMemberDetail(null)} className="w-7 h-7 flex items-center justify-center rounded-full text-[var(--text-placeholder)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors">
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/></svg>
                </button>
              </div>
              <div className="p-5 space-y-2 text-xs">
                <div><span className="text-[var(--text-tertiary)]">角色</span><p className="text-[var(--text-primary)]">{selectedMemberDetail.role === 'instructor' ? '讲师' : selectedMemberDetail.role === 'admin' ? '管理员' : '销售'}</p></div>
                <div><span className="text-[var(--text-tertiary)]">邮箱</span><p className="text-[var(--text-primary)]">{selectedMemberDetail.email || '—'}</p></div>
                <div><span className="text-[var(--text-tertiary)]">注册时间</span><p className="text-[var(--text-primary)]">{selectedMemberDetail.created_at ? new Date(selectedMemberDetail.created_at).toLocaleDateString('zh-CN') : '—'}</p></div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Group Detail Modal */}
      {selectedGroupDetail && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" onClick={() => setSelectedGroupDetail(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none p-4">
            <div className="pointer-events-auto w-full max-w-md max-h-[65vh] bg-[var(--bg-secondary)] rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.16)] border border-[var(--border-subtle)] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-subtle)] flex-shrink-0">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">{selectedGroupDetail.name} · {selectedGroupDetail.members?.length || 0} 人</h3>
                <button onClick={() => setSelectedGroupDetail(null)} className="w-7 h-7 flex items-center justify-center rounded-full text-[var(--text-placeholder)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors">
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/></svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                {selectedGroupDetail.members && selectedGroupDetail.members.length > 0 ? (
                  <div className="overflow-hidden rounded-xl border border-[var(--border-subtle)]">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-[var(--bg-tertiary)]/50">
                          <th className="px-3 py-2 text-left text-[10px] font-medium text-[var(--text-secondary)]">用户名</th>
                          <th className="px-3 py-2 text-left text-[10px] font-medium text-[var(--text-secondary)]">角色</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedGroupDetail.members.map(m => (
                          <tr key={m.id} className="border-t border-[var(--border-subtle)]">
                            <td className="px-3 py-2 font-medium text-[10px] text-[var(--accent-blue)] cursor-pointer hover:underline" onClick={() => { setSelectedGroupDetail(null); navigate(`/profile/${m.id}`); }}>{m.username}</td>
                            <td className="px-3 py-2 text-[var(--text-secondary)] text-[10px]">{m.role === 'instructor' ? '讲师' : m.role === 'admin' ? '管理员' : '销售'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-[var(--text-placeholder)] text-center py-8">暂无成员</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

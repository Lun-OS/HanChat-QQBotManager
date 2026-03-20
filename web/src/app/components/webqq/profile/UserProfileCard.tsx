import { memo, useEffect, useState } from 'react'
import { Loader2, UserMinus, MessageCircle, Crown } from 'lucide-react'
import type { UserProfile } from '../../../services/webqqApi'
import { deleteFriend } from '../../../services/webqqApi'
import { showToast } from '../../common/Toast'
import { useWebQQStore } from '../../../stores/webqqStore'

interface UserProfileCardProps {
  profile: UserProfile | null
  loading: boolean
  position: { x: number; y: number }
  onClose: () => void
  isFriend?: boolean
  onFriendDeleted?: (uid: string) => void
}

export const UserProfileCard = memo<UserProfileCardProps>(({ profile, loading, position, onClose, isFriend, onFriendDeleted }) => {
  const [deleting, setDeleting] = useState(false)

  const handleDeleteFriend = async () => {
    if (!profile) return
    const confirmed = confirm(`确定要删除好友 ${profile.nickname} 吗？`)
    if (!confirmed) return

    setDeleting(true)
    try {
      await deleteFriend(profile.uid)
      showToast('已删除', 'success')
      onFriendDeleted?.(profile.uid)
    } catch (e: any) {
      showToast(e.message || '删除失败', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const handleSendMessage = () => {
    const { setCurrentChat } = useWebQQStore.getState()
    if (!profile) return
    setCurrentChat({
      chatType: 1,
      peerId: profile.uin,
      peerName: profile.remark || profile.nickname,
      peerAvatar: profile.avatar
    })
    onClose()
  }

  const handleOpenQQ = () => {
    if (!profile?.uin) return
    window.open(`https://wpa.qq.com/msgrd?v=3&uin=${profile.uin}&site=qq&menu=yes`, '_blank')
  }

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.profile-card')) return
      onClose()
    }
    setTimeout(() => document.addEventListener('click', handleClickOutside), 0)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [onClose])

  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(position.x, window.innerWidth - 300),
    top: Math.min(position.y, window.innerHeight - 400),
    zIndex: 100
  }

  const getSexText = (sex: number) => {
    if (sex === 1) return '女'
    if (sex === 2) return '男'
    return '未知'
  }

  return (
    <div style={style} className="profile-card w-72 bg-white/95 dark:bg-neutral-800/95 backdrop-blur-xl border border-theme-divider rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 size={24} className="animate-spin text-pink-500" />
        </div>
      ) : profile ? (
        <>
          <div className="relative h-24 bg-gradient-to-r from-pink-500 to-rose-500" />
          <div className="px-4 pb-4 -mt-10">
            <div className="flex items-end gap-3">
              <img
                src={profile.avatar}
                alt={profile.nickname}
                className="w-16 h-16 rounded-xl border-4 border-white dark:border-neutral-800 object-cover"
              />
              <div className="flex-1 min-w-0 mb-1">
                <div className="flex items-center gap-1">
                  <span className="text-base font-semibold text-theme truncate">{profile.remark || profile.nickname}</span>
                  {profile.groupRole === 'owner' && <Crown size={14} className="text-yellow-500 flex-shrink-0" />}
                </div>
                {profile.remark && profile.remark !== profile.nickname && (
                  <div className="text-xs text-theme-muted truncate">{profile.nickname}</div>
                )}
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {profile.signature && (
                <div className="text-sm text-theme-muted px-3 py-2 bg-theme-item rounded-lg">
                  {profile.signature}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-theme-secondary">
                  <span className="text-theme-hint">QQ号：</span>
                  <span className="text-theme">{profile.uin}</span>
                </div>
                {profile.qid && profile.qid !== 'NULL' && (
                  <div className="text-theme-secondary">
                    <span className="text-theme-hint">QID：</span>
                    <span className="text-theme">{profile.qid}</span>
                  </div>
                )}
                <div className="text-theme-secondary">
                  <span className="text-theme-hint">性别：</span>
                  <span className="text-theme">{getSexText(profile.sex)}</span>
                </div>
                {profile.birthday && (
                  <div className="text-theme-secondary">
                    <span className="text-theme-hint">生日：</span>
                    <span className="text-theme">{profile.birthday}</span>
                  </div>
                )}
                {profile.level > 0 && (
                  <div className="text-theme-secondary">
                    <span className="text-theme-hint">等级：</span>
                    <span className="text-theme">{profile.level}级</span>
                  </div>
                )}
                {profile.groupLevel !== undefined && profile.groupLevel > 0 && (
                  <div className="text-theme-secondary">
                    <span className="text-theme-hint">群等级：</span>
                    <span className="text-theme">{profile.groupLevel}级</span>
                  </div>
                )}
                {profile.groupTitle && (
                  <div className="col-span-2 text-theme-secondary">
                    <span className="text-theme-hint">头衔：</span>
                    <span className="text-theme">{profile.groupTitle}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={handleSendMessage}
                className="flex-1 py-2 text-sm text-white bg-pink-500 rounded-xl hover:bg-pink-600 transition-colors flex items-center justify-center gap-1"
              >
                <MessageCircle size={16} />
                发消息
              </button>
              <button
                onClick={handleOpenQQ}
                className="px-4 py-2 text-sm text-theme border border-theme-divider rounded-xl hover:bg-theme-item transition-colors"
              >
                QQ
              </button>
              {isFriend && (
                <button
                  onClick={handleDeleteFriend}
                  disabled={deleting}
                  className="px-4 py-2 text-sm text-red-500 border border-red-500/50 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center justify-center gap-1"
                >
                  {deleting ? <Loader2 size={14} className="animate-spin" /> : <UserMinus size={14} />}
                  删除
                </button>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="p-4 text-center text-theme-muted text-sm">无法获取资料</div>
      )}
    </div>
  )
})

interface GroupProfileCardProps {
  profile: {
    groupCode: string
    groupName: string
    remarkName?: string
    avatar: string
    memberCount: number
    maxMemberCount?: number
    ownerUin?: string
    ownerName?: string
    createTime?: number
    description?: string
    announcement?: string
  } | null
  loading: boolean
  position: { x: number; y: number }
  onClose: () => void
  onQuitGroup?: (groupCode: string, isOwner: boolean) => void
}

export const GroupProfileCard = memo<GroupProfileCardProps>(({ profile, loading, position, onClose, onQuitGroup }) => {
  const selfUid = useWebQQStore(state => {
    const categories = state.friendCategories
    return ''
  })

  const handleQuitGroup = () => {
    if (!profile) return
    const isOwner = false
    onQuitGroup?.(profile.groupCode, isOwner)
  }

  const handleOpenQQ = () => {
    if (!profile?.groupCode) return
    window.open(`https://qm.qq.com/cgi-bin/qm/qr?k=${profile.groupCode}&jump_from=webapi`, '_blank')
  }

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.profile-card')) return
      onClose()
    }
    setTimeout(() => document.addEventListener('click', handleClickOutside), 0)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [onClose])

  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(position.x, window.innerWidth - 300),
    top: Math.min(position.y, window.innerHeight - 400),
    zIndex: 100
  }

  return (
    <div style={style} className="profile-card w-72 bg-white/95 dark:bg-neutral-800/95 backdrop-blur-xl border border-theme-divider rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 size={24} className="animate-spin text-pink-500" />
        </div>
      ) : profile ? (
        <>
          <div className="relative h-24 bg-gradient-to-r from-blue-500 to-cyan-500" />
          <div className="px-4 pb-4 -mt-10">
            <div className="flex items-end gap-3">
              <img
                src={profile.avatar}
                alt={profile.groupName}
                className="w-16 h-16 rounded-xl border-4 border-white dark:border-neutral-800 object-cover"
              />
              <div className="flex-1 min-w-0 mb-1">
                <div className="text-base font-semibold text-theme truncate">{profile.groupName}</div>
                {profile.remarkName && profile.remarkName !== profile.groupName && (
                  <div className="text-xs text-theme-muted truncate">{profile.remarkName}</div>
                )}
              </div>
            </div>

            <div className="mt-4 space-y-2 text-sm">
              <div className="text-theme-secondary">
                <span className="text-theme-hint">群号：</span>
                <span className="text-theme">{profile.groupCode}</span>
              </div>
              <div className="text-theme-secondary">
                <span className="text-theme-hint">群主：</span>
                <span className="text-theme">{profile.ownerName || profile.ownerUin || '未知'}</span>
              </div>
              <div className="text-theme-secondary">
                <span className="text-theme-hint">成员：</span>
                <span className="text-theme">
                  {profile.memberCount}{profile.maxMemberCount ? `/${profile.maxMemberCount}` : ''} 人
                </span>
              </div>
              {profile.description && (
                <div className="text-theme-secondary">
                  <span className="text-theme-hint">简介：</span>
                  <span className="text-theme">{profile.description}</span>
                </div>
              )}
              {profile.announcement && (
                <div className="text-theme-secondary">
                  <span className="text-theme-hint">公告：</span>
                  <span className="text-theme">{profile.announcement}</span>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={handleOpenQQ}
                className="flex-1 py-2 text-sm text-theme border border-theme-divider rounded-xl hover:bg-theme-item transition-colors"
              >
                在QQ中打开
              </button>
              <button
                onClick={handleQuitGroup}
                className="px-4 py-2 text-sm text-red-500 border border-red-500/50 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                退出群聊
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="p-4 text-center text-theme-muted text-sm">无法获取资料</div>
      )}
    </div>
  )
})
import { useState, useEffect, useMemo, useRef } from 'react'
import { Search, Loader2, Crown, Shield, ChevronDown, ChevronRight } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { GroupMemberItem } from '../../../types/webqq'
import { filterMembers } from '../../../services/webqqApi'
import { useWebQQStore } from '../../../stores/webqqStore'

interface GroupMemberPanelProps {
  groupCode: string
  onClose?: () => void
  onAtMember?: (member: { uid: string; uin: string; name: string }) => void
}

export function GroupMemberPanel({ groupCode, onClose, onAtMember }: GroupMemberPanelProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'owner' | 'admin' | 'member'>('all')
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set(['owner', 'admin', 'member']))
  const { membersCache, fetchGroupMembers } = useWebQQStore()
  const parentRef = useRef<HTMLDivElement>(null)

  const cachedMembers = membersCache[groupCode]?.members

  useEffect(() => {
    if (!cachedMembers || cachedMembers.length === 0) {
      fetchGroupMembers(groupCode, true)
    }
  }, [groupCode, cachedMembers, fetchGroupMembers])

  const members = cachedMembers || []

  const filteredMembers = useMemo(() => {
    let result = members

    if (searchQuery.trim()) {
      result = filterMembers(members, searchQuery)
    }

    if (roleFilter !== 'all') {
      result = result.filter(m => m.role === roleFilter)
    }

    return result.sort((a, b) => {
      if (a.role === 'owner' && b.role !== 'owner') return -1
      if (a.role !== 'owner' && b.role === 'owner') return 1
      if (a.role === 'admin' && b.role === 'admin') return 0
      if (a.role === 'admin') return -1
      if (b.role === 'admin') return 1
      return 0
    })
  }, [members, searchQuery, roleFilter])

  const groupedMembers = useMemo(() => {
    const groups: { owner: GroupMemberItem[]; admin: GroupMemberItem[]; member: GroupMemberItem[] } = {
      owner: [],
      admin: [],
      member: []
    }

    filteredMembers.forEach(m => {
      if (m.role === 'owner') groups.owner.push(m)
      else if (m.role === 'admin') groups.admin.push(m)
      else groups.member.push(m)
    })

    return groups
  }, [filteredMembers])

  const virtualizer = useVirtualizer({
    count: filteredMembers.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 5,
  })

  const toggleRole = (role: string) => {
    setExpandedRoles(prev => {
      const next = new Set(prev)
      if (next.has(role)) next.delete(role)
      else next.add(role)
      return next
    })
  }

  const getRoleIcon = (role: string) => {
    if (role === 'owner') return <Crown size={12} className="text-yellow-500" />
    if (role === 'admin') return <Shield size={12} className="text-green-500" />
    return null
  }

  const getRoleName = (role: string) => {
    if (role === 'owner') return '群主'
    if (role === 'admin') return '管理员'
    return '群成员'
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-neutral-900">
      <div className="flex items-center justify-between px-4 py-3 border-b border-theme-divider">
        <h3 className="text-base font-medium text-theme">群成员</h3>
        <span className="text-sm text-theme-hint">{members.length}</span>
      </div>

      <div className="px-3 py-2">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-hint" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索成员..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-theme-input border border-theme-input rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500/50 text-theme placeholder:text-theme-hint"
          />
        </div>

        <div className="flex gap-1 mt-2">
          {(['all', 'owner', 'admin', 'member'] as const).map(role => (
            <button
              key={role}
              onClick={() => setRoleFilter(role)}
              className={`px-2 py-1 text-xs rounded-lg transition-colors ${
                roleFilter === role
                  ? 'bg-pink-500 text-white'
                  : 'bg-theme-item text-theme-secondary hover:bg-theme-item-hover'
              }`}
            >
              {role === 'all' ? '全部' : getRoleName(role)}
            </button>
          ))}
        </div>
      </div>

      <div ref={parentRef} className="flex-1 overflow-y-auto">
        {!cachedMembers ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={24} className="animate-spin text-pink-500" />
          </div>
        ) : searchQuery ? (
          <div className="p-2">
            {filteredMembers.length === 0 ? (
              <div className="flex items-center justify-center h-20 text-sm text-theme-hint">
                无匹配成员
              </div>
            ) : (
              virtualizer.getVirtualItems().map(virtualRow => {
                const member = filteredMembers[virtualRow.index]
                return (
                  <div
                    key={member.uid}
                    style={{ height: `${virtualRow.size}px` }}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-theme-item-hover cursor-pointer"
                    onClick={() => onAtMember?.({ uid: member.uid, uin: member.uin, name: member.card || member.nickname })}
                  >
                    <div className="relative">
                      <img
                        src={member.avatar || `https://q1.qlogo.cn/g?b=qq&nk=${member.uin}&s=40`}
                        alt={member.nickname}
                        className="w-10 h-10 rounded-full object-cover"
                        loading="lazy"
                      />
                      {getRoleIcon(member.role) && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-white dark:bg-neutral-800 rounded-full flex items-center justify-center">
                          {getRoleIcon(member.role)}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-theme truncate">
                        {member.card || member.nickname}
                      </div>
                      {member.card && member.card !== member.nickname && (
                        <div className="text-xs text-theme-hint truncate">{member.nickname}</div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        ) : (
          <div className="p-2">
            {['owner', 'admin', 'member'].map(role => {
              const roleMembers = groupedMembers[role as keyof typeof groupedMembers]
              if (roleMembers.length === 0) return null

              const isExpanded = expandedRoles.has(role)

              return (
                <div key={role}>
                  <div
                    className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-theme-item-hover text-theme-secondary"
                    onClick={() => toggleRole(role)}
                  >
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span className="text-xs font-medium">{getRoleName(role)}</span>
                    <span className="text-xs text-theme-hint">({roleMembers.length})</span>
                  </div>
                  {isExpanded && roleMembers.map(member => (
                    <div
                      key={member.uid}
                      className="flex items-center gap-3 px-3 py-2 pl-8 hover:bg-theme-item-hover cursor-pointer"
                      onClick={() => onAtMember?.({ uid: member.uid, uin: member.uin, name: member.card || member.nickname })}
                    >
                      <img
                        src={member.avatar || `https://q1.qlogo.cn/g?b=qq&nk=${member.uin}&s=40`}
                        alt={member.nickname}
                        className="w-9 h-9 rounded-full object-cover"
                        loading="lazy"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-theme truncate">
                          {member.card || member.nickname}
                        </div>
                        {member.card && member.card !== member.nickname && (
                          <div className="text-xs text-theme-hint truncate">{member.nickname}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default GroupMemberPanel
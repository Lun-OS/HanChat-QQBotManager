/**
 * URL 安全验证工具 - 符合 REACT-URL-001 安全规范
 *
 * 提供统一的图片/资源 URL 安全校验功能：
 * - 仅允许 http/https 协议
 * - 阻止 javascript:, data:, vbscript: 等危险协议
 * - 验证 URL 格式合法性
 * - 防止 XSS 和协议注入攻击
 */

/** 默认头像路径 */
export const DEFAULT_AVATAR_URL = '/default-avatar.png'

/**
 * 安全校验图片 URL
 * @param url - 待验证的 URL 字符串
 * @param fallback - 验证失败时的回退值，默认为 DEFAULT_AVATAR_URL
 * @returns 安全的 URL 或回退值
 *
 * @example
 * // 安全的 https URL
 * validateImageUrl('https://q1.qlogo.cn/g?b=qq&nk=12345') // => 'https://...'
 *
 * // 危险的 javascript: 协议
 * validateImageUrl('javascript:alert(1)') // => '/default-avatar.png'
 *
 * // 空/undefined 值
 * validateImageUrl(undefined) // => '/default-avatar.png'
 */
export function validateImageUrl(url: string | null | undefined, fallback: string = DEFAULT_AVATAR_URL): string {
  if (!url || typeof url !== 'string') return fallback

  const trimmed = url.trim()

  // 协议白名单校验 - 只允许 http 和 https
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return trimmed
    }
    // 其他协议（javascript:, data:, vbscript: 等）均视为不安全
    console.warn('[Security] Blocked unsafe URL protocol:', parsed.protocol)
    return fallback
  } catch {
    // URL 构造失败说明格式不合法
    console.warn('[Security] Invalid URL format:', trimmed)
    return fallback
  }
}

/**
 * 安全校验并构建 QQ 头像 URL
 * @param qqNumber - QQ 号码
 * @param size - 头像尺寸 (40/100/140/200/400/640)
 * @returns 安全的 QQ 头像 URL 或默认头像
 *
 * @example
 * getSafeQQAvatarUrl('123456789') // => 'https://q1.qlogo.cn/g?b=qq&nk=123456789&s=640'
 * getSafeQQAvatarUrl('') // => '/default-avatar.png'
 * getSafeQQAvatarUrl('abc<script>') // => '/default-avatar.png'
 */
export function getSafeQQAvatarUrl(qqNumber: string | number | null | undefined, size: number = 640): string {
  if (!qqNumber && qqNumber !== 0) return DEFAULT_AVATAR_URL

  const str = String(qqNumber).trim()

  // 验证是否为纯数字（QQ 号码格式）
  if (!/^\d+$/.test(str)) {
    console.warn('[Security] Invalid QQ number format for avatar:', str)
    return DEFAULT_AVATAR_URL
  }

  // 尺寸白名单校验
  const validSizes = [40, 64, 100, 140, 168, 200, 240, 300, 400, 480, 560, 640]
  if (!validSizes.includes(size)) {
    size = 640
  }

  return `https://q1.qlogo.cn/g?b=qq&nk=${str}&s=${size}`
}

/**
 * 安全校验并构建 QQ 群头像 URL
 * @param groupId - QQ 群号
 * @returns 安全的群头像 URL 或默认头像
 *
 * @example
 * getSafeGroupAvatarUrl('123456789') // => 'https://p.qlogo.cn/gh/123456789/123456789/640/'
 */
export function getSafeGroupAvatarUrl(groupId: string | number | null | undefined): string {
  if (!groupId && groupId !== 0) return DEFAULT_AVATAR_URL

  const str = String(groupId).trim()

  // 验证是否为纯数字（群号格式）
  if (!/^\d+$/.test(str)) {
    console.warn('[Security] Invalid group ID format for avatar:', str)
    return DEFAULT_AVATAR_URL
  }

  return `https://p.qlogo.cn/gh/${str}/${str}/640/`
}

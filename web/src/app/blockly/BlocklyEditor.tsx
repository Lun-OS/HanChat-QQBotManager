import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as Blockly from 'blockly';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Play,
  Save,
  FolderOpen,
  Plus,
  Trash2,
  Download,
  Eye,
  EyeOff,
  FileCode,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronRight as ChevronRightIcon,
  Edit3,
  X,
  Check,
  AlertTriangle,
  ArrowLeft,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Layers,
  PanelLeftClose,
  PanelLeft,
  Upload,
  Fullscreen,
  Copy,
  Clipboard
} from 'lucide-react';
import { defineCustomBlocks, getToolboxCategories } from './blocks';
import { initLuaGenerator, generateLuaCode, getLuaGenerator } from './generator';
import { initChineseLocale } from './locale';
import { getBlocklyTheme } from './theme';
import {
  listBlocklyProjects,
  createBlocklyProject,
  loadBlocklyProject,
  saveBlocklyProject,
  deleteBlocklyProject,
  renameBlocklyProject,
  exportPlugin,
  importBlocklyProject,
  exportBlocklyProject
} from './projectManager';
import { BlocklyProject, BlocklyProjectFile, PluginMetadata } from './types';
import { pluginManagerApi, AccountInfo } from '../services/api';
import Editor from '@monaco-editor/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { multilineEditorBridge } from './multilineEditorBridge';

initChineseLocale();
defineCustomBlocks();
initLuaGenerator();

interface BlocklyEditorProps {
  onExport?: () => void;
  onUnsavedChange?: (hasUnsaved: boolean) => void;
  onModeSwitch?: () => void;
}

export const BlocklyEditor: React.FC<BlocklyEditorProps> = ({ onExport, onUnsavedChange, onModeSwitch }) => {
  const navigate = useNavigate();
  const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [projects, setProjects] = useState<BlocklyProjectFile[]>([]);
  const [currentProject, setCurrentProject] = useState<BlocklyProject | null>(null);
  const [generatedCode, setGeneratedCode] = useState<string>('');
  const [showCodePreview, setShowCodePreview] = useState(false);
  const [codePreviewWidth, setCodePreviewWidth] = useState(400);
  const [loading, setLoading] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  const [showProjectDialog, setShowProjectDialog] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmStep, setDeleteConfirmStep] = useState(1);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showOverwriteDialog, setShowOverwriteDialog] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [projectToDelete, setProjectToDelete] = useState<BlocklyProjectFile | null>(null);
  const [projectToRename, setProjectToRename] = useState<BlocklyProjectFile | null>(null);
  const [renameValue, setRenameValue] = useState('');
  
  // 帮助弹窗状态
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [helpContent, setHelpContent] = useState<string>('');
  const [helpTitle, setHelpTitle] = useState<string>('帮助文档');

  // 剪贴板状态
  const [blockClipboard, setBlockClipboard] = useState<string | null>(null);
  const blockClipboardRef = useRef<string | null>(null);

  // 多行编辑器状态
  const [showMultilineEditor, setShowMultilineEditor] = useState(false);
  const [multilineEditorValue, setMultilineEditorValue] = useState('');
  const [multilineEditorLanguage, setMultilineEditorLanguage] = useState('lua');
  const multilineEditorFieldRef = useRef<Blockly.Field | null>(null);

  // 剪贴板大小限制（防止内存溢出）
  const CLIPBOARD_MAX_SIZE = 1024 * 1024; // 1MB

  // 安全地设置剪贴板内容
  const setClipboardContent = (content: string | null) => {
    // 如果内容过大，进行截断或清理
    if (content && content.length > CLIPBOARD_MAX_SIZE) {
      console.warn('剪贴板内容过大，已截断');
      content = content.substring(0, CLIPBOARD_MAX_SIZE);
    }
    setBlockClipboard(content);
    blockClipboardRef.current = content;
  };

  // 清理剪贴板
  const clearClipboard = () => {
    setClipboardContent(null);
  };

  // 是否有选中的积木（用于控制复制按钮）
  const [hasSelectedBlocks, setHasSelectedBlocks] = useState(false);

  // 是否正在删除积木（用于阻止bump行为）
  const isDeletingRef = useRef(false);

  // 长按拖拽工作区相关 refs
  const isDraggingWorkspaceRef = useRef(false);
  const dragWorkspaceStartRef = useRef({ x: 0, y: 0 });
  const workspaceScrollStartRef = useRef({ x: 0, y: 0 });
  const mouseMoveHandlerRef = useRef<((e: MouseEvent) => void) | null>(null);
  const mouseUpHandlerRef = useRef<((e: MouseEvent) => void) | null>(null);
  const mouseDownHandlerRef = useRef<((e: MouseEvent) => void) | null>(null);

  // 帮助文档内容 - 零基础新手版
  const helpDocumentation = `
# 📚 Blockly 积木编程完全指南（零基础版）

> 本文档专为没有任何编程基础的用户编写，用最通俗的语言解释每一个概念。

---

## 📖 目录
1. [编程基础概念](#一编程基础概念)
2. [积木类型详解](#二积木类型详解)
3. [数据类型说明](#三数据类型说明)
4. [积木分类详解](#四积木分类详解)
5. [实战示例](#五实战示例)
6. [常见问题](#六常见问题)

---

## 一、编程基础概念

### 🎯 什么是编程？
**编程**就是给计算机下指令，告诉它要做什么。

想象你在指挥一个机器人：
- 你说"向前走" → 机器人向前走
- 你说"看到人就打招呼" → 机器人看到人就打招呼

积木编程就是把指令做成积木块，你只需要拖拽拼接，不需要写复杂的代码。

### 🧩 什么是积木？
**积木**就是预先做好的功能块，每个积木完成一个特定的任务。

就像乐高积木一样：
- 有的积木是轮子（让车能动）
- 有的积木是窗户（让房子有光）
- 有的积木是门（让人能进出）

在Blockly中：
- 有的积木发送消息
- 有的积木做判断
- 有的积木处理数据

### 📦 什么是变量？
**变量**就是一个"盒子"，用来存放数据。

想象你有几个盒子：
- 盒子A贴上标签"用户名"，里面放"小明"
- 盒子B贴上标签"年龄"，里面放"18"

在编程中：
- 变量名就是标签（如：user_name, age）
- 变量的值就是盒子里的内容
- 你可以随时更换盒子里的内容

**为什么要用变量？**
\`\`\`
不用变量：
  发送消息给 123456 "你好"
  发送消息给 123456 "今天天气不错"
  
用变量：
  设置 user = 123456
  发送消息给 user "你好"
  发送消息给 user "今天天气不错"
\`\`\`
如果QQ号变了，只需要改一处！

### 🔀 什么是条件判断？
**条件判断**就是"如果...就...否则..."的逻辑。

生活中的例子：
- 如果 下雨 → 带伞
- 否则 → 不带伞

编程中的例子：
- 如果 消息内容是"你好" → 回复"你好呀"
- 否则 → 回复"我不明白"

### 🔄 什么是循环？
**循环**就是重复做某件事情。

生活中的例子：
- 每天刷牙（重复）
- 每周上课（重复）

编程中的例子：
- 重复10次 → 发送消息（连发10条）
- 对列表中的每个人 → 发送问候（群发）

---

## 二、积木类型详解

Blockly有三种基本形状的积木，每种形状有不同的用途：

### 1️⃣ 事件积木（帽子形状 🎩）

**外观特征：**
- 顶部是圆弧形的，像帽子
- 底部有凹槽，可以连接其他积木

**作用：**
- 程序的入口点，就像大门一样
- 当某个事件发生时，从这里开始执行

**常见的事件积木：**

| 积木名称 | 什么时候触发 | 生成的代码 |
|---------|------------|-----------|
| 当收到消息时 | 有人给机器人发消息 | \`on_message(function(event) ... end)\` |
| 当收到通知时 | 系统发送通知（如有人进群） | \`on_notice(function(event) ... end)\` |
| 当收到请求时 | 有人申请加好友/加群 | \`on_request(function(event) ... end)\` |
| 插件初始化时 | 插件启动时 | \`function on_init() ... end\` |
| 插件卸载时 | 插件停止时 | \`function on_destroy() ... end\` |

**使用示例：**
\`\`\`
当收到消息时 存储到变量 [msg]
  ↓
  获取消息内容
  ↓
  发送回复
\`\`\`

### 2️⃣ 语句积木（拼图形状 🧩）

**外观特征：**
- 上下都有凸起和凹槽，像拼图
- 可以一个接一个地连接

**作用：**
- 执行具体的动作
- 按顺序从上到下执行

**常见的语句积木：**

#### 📤 消息发送类

| 积木名称 | 功能说明 | 需要的参数 | 生成的代码示例 |
|---------|---------|-----------|--------------|
| 发送群消息 | 在群里发消息 | 群号、消息内容 | \`message.send_group(群号, "内容")\` |
| 发送私聊消息 | 给某个人发消息 | QQ号、消息内容 | \`message.send_private(QQ号, "内容")\` |
| 回复群消息 | 回复群里的某条消息 | 群号、引用消息ID、内容 | \`message.reply_group(群号, 消息ID, "内容")\` |
| 回复私聊消息 | 回复私聊的某条消息 | QQ号、引用消息ID、内容 | \`message.reply_private(QQ号, 消息ID, "内容")\` |

**参数说明：**
- **群号/QQ号**：数字，如 123456789
- **消息内容**：文字，如 "你好"
- **引用消息ID**：要回复的那条消息的编号（可选，填0表示不引用）

#### 📝 日志输出类

| 积木名称 | 功能 | 输出级别 | 用途 |
|---------|------|---------|------|
| 日志输出 | 输出信息 | 普通/异常/警告/调试 | 记录程序运行状态 |
| 日志 (普通) | 输出普通信息 | info | 一般信息 |
| 日志 (异常) | 输出错误 | error | 出错时记录 |
| 日志 (警告) | 输出警告 | warn | 需要注意的情况 |
| 日志 (调试) | 输出调试信息 | debug | 开发时调试用 |

**为什么要用日志？**
- 就像写日记一样，记录程序做了什么
- 出问题时可以查看日志找原因
- 调试时可以看到变量的值

#### ⚙️ 群管理类

| 积木名称 | 功能 | 参数 | 注意事项 |
|---------|------|------|---------|
| 设置群全员禁言 | 开启/关闭全员禁言 | 群号、开启/关闭 | 需要管理员权限 |
| 设置群管理员 | 设置/取消管理员 | 群号、QQ号、是/否 | 需要群主权限 |
| 设置群成员名片 | 修改群名片 | 群号、QQ号、新名片 | 需要管理员权限 |
| 踢出群成员 | 把某人踢出群 | 群号、QQ号、是否拒绝再加 | 需要管理员权限 |
| 禁言群成员 | 禁言某人 | 群号、QQ号、时长(秒) | 0秒表示取消禁言 |
| 设置群名称 | 修改群名 | 群号、新名称 | 需要管理员权限 |
| 群戳一戳 | 戳某人 | 群号、QQ号 | 互动功能 |

#### 👤 好友管理类

| 积木名称 | 功能 | 返回值 |
|---------|------|-------|
| 获取好友列表 | 获取所有好友 | 好友列表（数组） |
| 设置好友备注 | 修改好友备注名 | 无 |
| 戳一戳好友 | 双击头像戳一戳 | 无 |

### 3️⃣ 值积木（椭圆形状 🔵）

**外观特征：**
- 左右有圆形接口
- 可以嵌入到其他积木的输入框中

**作用：**
- 返回一个值（数据）
- 可以被其他积木使用

**常见的值积木：**

#### 📨 消息获取类

| 积木名称 | 返回类型 | 说明 | 示例值 |
|---------|---------|------|-------|
| 当前消息 | 消息对象 | 获取当前收到的完整消息 | {user_id: 123, ...} |
| 获取消息的 [字段] | 根据字段不同 | 获取消息的某个字段 | "你好" / 123456 |
| 获取消息的发送者ID | 数字 | 发消息的人的QQ号 | 123456789 |
| 获取消息的群ID | 数字 | 群号（群消息才有） | 987654321 |
| 获取消息的消息ID | 数字/字符串 | 消息的唯一编号 | 1234567890 |
| 获取消息的纯文本内容 | 字符串 | 去掉特殊代码的文字 | "你好" |
| 获取消息的发送者昵称 | 字符串 | 发送者的名字 | "小明" |
| 获取消息的时间戳 | 数字 | 发送时间 | 1678886400 |

#### ✅ 判断类（返回是/否）

| 积木名称 | 返回类型 | 说明 |
|---------|---------|------|
| 消息是群消息 | 布尔值(true/false) | 判断是否是群消息 |
| 消息是私聊消息 | 布尔值 | 判断是否是私聊 |
| 消息包含图片 | 布尔值 | 检查是否有图片 |
| 消息包含语音 | 布尔值 | 检查是否有语音 |
| 消息@了机器人 | 布尔值 | 检查是否@了机器人 |
| 消息包含文字 | 布尔值 | 检查是否包含某文字 |

#### 🔢 基础数据类

| 积木名称 | 返回类型 | 说明 | 示例 |
|---------|---------|------|------|
| 文本 | 字符串 | 输入的文字 | "你好" |
| 数字 | 数字 | 输入的数字 | 123 |
| 真/假 | 布尔值 | 逻辑值 | true / false |
| 空值 | 空 | 表示没有值 | nil |

---

## 三、数据类型说明

### 📊 什么是数据类型？

数据类型就是数据的"种类"。就像超市里的商品分类：
- 水果区：苹果、香蕉
- 蔬菜区：白菜、萝卜
- 日用品区：牙膏、毛巾

编程中的数据也有类型：

### 🔤 字符串（String）

**是什么：** 文字、文本

**写法：** 用引号括起来
\`\`\`
"你好"
"Hello World"
"123"  ← 注意：带引号的123是字符串，不是数字！
\`\`\`

**用途：**
- 消息内容
- 昵称、备注
- 文件路径

**常见操作：**
- 连接："你好" + "世界" = "你好世界"
- 获取长度："你好".length = 2
- 截取："Hello"[0:2] = "He"

### 🔢 数字（Number）

**是什么：** 数值，可以进行数学计算

**写法：** 直接写数字
\`\`\`
123
3.14
-50
\`\`\`

**用途：**
- QQ号、群号
- 时间戳
- 计数、计算

**常见操作：**
- 加减乘除：1 + 2 = 3
- 比较：5 > 3 = true
- 取余：10 % 3 = 1

### ✅ 布尔值（Boolean）

**是什么：** 只有两种值：真(true) 或 假(false)

**写法：**
\`\`\`
true   ← 真、是、对
false  ← 假、否、错
\`\`\`

**用途：**
- 条件判断的结果
- 开关状态
- 是否满足某条件

**常见操作：**
- 与：true AND false = false
- 或：true OR false = true
- 非：NOT true = false

### 📦 表/对象（Object/Table）

**是什么：** 一个容器，里面可以装很多数据，每个数据有名字

**想象：** 就像一个书包：
- 书包.name = "我的书包"
- 书包.color = "红色"
- 书包.books = ["语文书", "数学书"]

**写法（在Lua中）：**
\`\`\`lua
{
  user_id = 123456,
  nickname = "小明",
  age = 18
}
\`\`\`

**用途：**
- 存储消息的所有信息
- 存储用户信息
- 存储配置数据

**如何获取表中的数据：**
\`\`\`
表.字段名

例如：
msg.user_id      → 获取msg的user_id
msg.sender.name  → 获取msg的sender的name
\`\`\`

### 📋 数组（Array）

**是什么：** 一个列表，里面按顺序装了很多数据

**想象：** 就像排队的人群：
- 第1个：张三
- 第2个：李四
- 第3个：王五

**写法：**
\`\`\`lua
{ "张三", "李四", "王五" }
{ 1, 2, 3, 4, 5 }
\`\`\`

**用途：**
- 好友列表
- 群成员列表
- 多条消息

**如何获取数组中的数据：**
\`\`\`
数组[位置]  ← 注意：编程中通常从1开始计数

例如：
list[1]  → 第1个元素
list[3]  → 第3个元素
#list    → 数组的长度（有几个元素）
\`\`\`

### 🔄 类型转换

**为什么要转换类型？**

因为不同的积木需要不同类型的数据！

**错误示例：**
\`\`\`
日志输出需要字符串，但你给了它一个表：
  日志 (信息, msg)  ← ❌ 输出空白或错误
\`\`\`

**正确做法：**
\`\`\`
先把表转成字符串：
  日志 (信息, 将表[msg]转为JSON字符串)  ← ✅ 正常显示
\`\`\`

**常用类型转换积木：**

| 积木名称 | 输入 | 输出 | 使用场景 |
|---------|------|------|---------|
| 将表转为JSON字符串 | 表/对象 | 字符串 | 日志输出、保存到文件 |
| 转为字符串 | 任意类型 | 字符串 | 拼接文本 |
| 转为数字 | 字符串 | 数字 | 数学计算 |
| 解析JSON | 字符串 | 表/对象 | 处理网络返回的数据 |

---

## 四、积木分类详解

### 📂 1. 事件分类（浅绿色）

这些积木是程序的入口，当特定事情发生时自动执行。

#### 当收到消息时
- **形状：** 帽子形状（顶部圆弧）
- **参数：** 变量名（默认event）
- **作用：** 有人发消息给机器人时触发
- **变量里有什么：** 完整的消息对象

**生成的Lua代码：**
\`\`\`lua
on_message(function(event)
  -- 你拼接的积木会生成在这里
end)
\`\`\`

#### 当收到通知时
- **触发时机：** 系统通知，如有人进群、退群、被禁言等
- **变量内容：** 通知的详细信息

#### 当收到请求时
- **触发时机：** 有人申请加好友或加群
- **用途：** 自动处理好友/加群申请

#### 插件初始化时
- **触发时机：** 插件启动时执行一次
- **用途：** 初始化设置、加载数据

#### 插件卸载时
- **触发时机：** 插件停止时执行一次
- **用途：** 保存数据、清理资源

---

### 📂 2. 消息分类（蓝色）

处理消息相关的操作。

#### 发送消息类

**发送群消息**
\`\`\`
积木：发送群消息 群号：[   ] 内容：[   ]
代码：message.send_group(群号, "内容")
\`\`\`

**发送私聊消息**
\`\`\`
积木：发送私聊消息 用户：[   ] 内容：[   ]
代码：message.send_private(QQ号, "内容")
\`\`\`

**回复消息（带引用）**
\`\`\`
积木：回复群消息 群：[   ] 引用消息ID：[   ] 内容：[   ]
代码：message.reply_group(群号, 消息ID, "内容")
\`\`\`

#### 获取消息信息类

**获取消息字段**
\`\`\`
积木：获取消息 [msg] 的 [消息类型]
返回：字符串（"private"或"group"）
代码：msg.message_type
\`\`\`

可选字段：
- 消息类型 → message_type
- 发送者ID → user_id
- 群ID → group_id
- 消息ID → message_id
- 原始消息内容 → raw_message
- 发送者昵称 → sender.nickname
- 发送者群名片 → sender.card
- 发送者角色 → sender.role
- 消息时间 → time

**获取纯文本内容**
\`\`\`
积木：获取消息 [msg] 的纯文本内容
返回：字符串（去掉特殊代码的文字）
代码：msg.get_plain_text(msg)
\`\`\`

#### 消息判断类

**是否包含某文字**
\`\`\`
积木：消息 [msg] 包含文字 ["你好"]
返回：true 或 false
代码：msg.contains_keyword(msg, "你好")
\`\`\`

**消息类型判断**
\`\`\`
积木：消息 [msg] 是群消息
返回：true 或 false
代码：msg.is_group_message(msg)
\`\`\`

---

### 📂 3. 逻辑分类（黄色）

控制程序的流程。

#### 如果-否则
\`\`\`
积木：如果 [条件] 则 [执行A] 否则 [执行B]
代码：
if 条件 then
  执行A
else
  执行B
end
\`\`\`

**执行逻辑：**
- 如果条件为 true → 执行A
- 如果条件为 false → 执行B

#### 比较运算
\`\`\`
积木： [A] = [B]    → 等于
积木： [A] ≠ [B]    → 不等于
积木： [A] < [B]    → 小于
积木： [A] ≤ [B]    → 小于等于
积木： [A] > [B]    → 大于
积木： [A] ≥ [B]    → 大于等于
\`\`\`

#### 逻辑运算
\`\`\`
积木： [A] 与 [B]   → 两个都为true才为true
积木： [A] 或 [B]   → 有一个为true就为true
积木： 非 [A]       → 取反
\`\`\`

**真值表：**
| A | B | A与B | A或B | 非A |
|---|---|------|------|-----|
| true | true | true | true | false |
| true | false | false | true | false |
| false | true | false | true | true |
| false | false | false | false | true |

---

### 📂 4. 变量分类（红色）

存储和读取数据。

#### 设置变量
\`\`\`
积木：设置 [变量名] 为 [值]
代码：变量名 = 值
\`\`\`

**示例：**
\`\`\`
设置 [用户名] 为 ["小明"]
→ 用户名 = "小明"

设置 [计数] 为 [0]
→ 计数 = 0
\`\`\`

#### 获取变量
\`\`\`
积木：[变量名]
返回：变量中存储的值
代码：变量名
\`\`\`

**变量命名规则：**
- 只能用字母、数字、下划线
- 不能以数字开头
- 区分大小写（Name和name是不同的）

**好的变量名：**
- user_name（用户名）
- group_id（群号）
- message_count（消息计数）

**不好的变量名：**
- x（不知道是什么）
- 123（不能数字开头）
- user-name（不能用减号）

---

### 📂 5. 文本分类（青色）

处理文字相关的操作。

#### 连接文本
\`\`\`
积木：连接文本 ["你好"] 和 ["世界"]
返回："你好世界"
代码："你好" .. "世界"
\`\`\`

#### 文本长度
\`\`\`
积木：文本 ["Hello"] 的长度
返回：5
代码：#"Hello"
\`\`\`

#### 截取文本
\`\`\`
积木：截取文本 ["Hello World"] 从 [7] 到 [11]
返回："World"
代码：string.sub("Hello World", 7, 11)
\`\`\`

#### 替换文本
\`\`\`
积木：替换文本 ["Hello"] 中的 ["l"] 为 ["x"]
返回："Hexxo"
代码：string.gsub("Hello", "l", "x")
\`\`\`

#### 查找文本
\`\`\`
积木：在 ["Hello World"] 中查找 ["World"]
返回：7（位置）
代码：string.find("Hello World", "World")
\`\`\`

#### 转换大小写
\`\`\`
积木：将 ["hello"] 转为大写
返回："HELLO"
代码：string.upper("hello")
\`\`\`

#### 去除空白
\`\`\`
积木：去除 ["  hello  "] 的空白
返回："hello"
代码：blockly_text_utils.trim("  hello  ")
\`\`\`

#### 分割文本
\`\`\`
积木：用 [","] 分割 ["a,b,c"]
返回：["a", "b", "c"]（数组）
代码：blockly_text_utils.split("a,b,c", ",")
\`\`\`

---

### 📂 6. 数学分类（深蓝色）

进行数学计算。

#### 基础运算
\`\`\`
积木：[A] + [B]    → 加法
积木：[A] - [B]    → 减法
积木：[A] × [B]    → 乘法
积木：[A] ÷ [B]    → 除法
积木：[A] 的 [B] 次方 → 幂运算
\`\`\`

#### 常用数学函数
\`\`\`
积木：随机数 从 [1] 到 [100]
返回：1到100之间的随机整数
代码：math.random(1, 100)

积木：[3.7] 向下取整
返回：3
代码：math.floor(3.7)

积木：[3.2] 向上取整
返回：4
代码：math.ceil(3.2)

积木：[3.5] 四舍五入
返回：4
代码：math.floor(3.5 + 0.5)

积木：[A] 和 [B] 的最大值
返回：较大的那个
代码：math.max(A, B)

积木：[A] 和 [B] 的最小值
返回：较小的那个
代码：math.min(A, B)

积木：[-5] 的绝对值
返回：5
代码：math.abs(-5)
\`\`\`

---

### 📂 7. 存储分类（紫色）

在本地保存数据，即使重启插件数据也不会丢失。

#### 保存数据
\`\`\`
积木：保存到存储 键：["用户名"] 值：["小明"]
代码：storage.set("用户名", "小明")
\`\`\`

#### 读取数据
\`\`\`
积木：从存储读取 ["用户名"] 默认值：["未知"]
返回：保存的值，如果没有则返回默认值
代码：storage.get("用户名", "未知")
\`\`\`

#### 删除数据
\`\`\`
积木：从存储删除 ["用户名"]
代码：storage.delete("用户名")
\`\`\`

**使用场景：**
- 记录用户积分
- 保存配置信息
- 记录上次执行时间

---

### 📂 8. HTTP分类（金黄色）

与网络服务器通信。

#### GET请求（获取数据）
\`\`\`
积木：HTTP GET请求 ["https://api.example.com/data"]
返回：服务器返回的数据（表对象）
代码：http.request("GET", "https://api.example.com/data")
\`\`\`

#### POST请求（提交数据）
\`\`\`
积木：HTTP POST请求 ["https://api.example.com/submit"] 内容：["name=小明"]
返回：服务器返回的数据
代码：http.request("POST", "https://api.example.com/submit", nil, "name=小明")
\`\`\`

#### 带变量的请求
\`\`\`
积木：HTTP [GET] 请求 [URL] 内容：[Body] 返回值存入 [result]
代码：
local __http_response = http.request("GET", URL, nil, Body)
result = __http_response and __http_response.body or ""
\`\`\`

**使用场景：**
- 调用天气API
- 查询数据库
- 发送数据到服务器

---

### 📂 9. 工具分类（绿色）

各种实用工具。

#### URL编码/解码
\`\`\`
积木：URL编码 ["hello world"]
返回："hello%20world"
代码：utils.url_encode("hello world")

积木：URL解码 ["hello%20world"]
返回："hello world"
代码：utils.url_decode("hello%20world")
\`\`\`

#### Base64编码/解码
\`\`\`
积木：Base64编码 ["hello"]
返回："aGVsbG8="
代码：utils.base64_encode("hello")

积木：Base64解码 ["aGVsbG8="]
返回："hello"
代码：utils.base64_decode("aGVsbG8=")
\`\`\`

#### HTML转义
\`\`\`
积木：HTML转义 ["<div>"]
返回："&lt;div&gt;"
代码：utils.html_escape("<div>")
\`\`\`

#### JSON处理
\`\`\`
积木：将 [表] 编码为JSON
返回：JSON字符串
代码：blockly_json.encode(表)

积木：解析JSON ["{\\"name\\":\\"小明\\"}"]
返回：表对象
代码：blockly_json.decode("{\\"name\\":\\"小明\\"}")
\`\`\`

---

### 📂 10. 群管理分类（蓝色）

管理QQ群的各种功能。

#### 全员禁言
\`\`\`
积木：设置群 [群号] 全员禁言 [开启]
代码：group.set_whole_ban(群号, true)
\`\`\`

#### 设置管理员
\`\`\`
积木：设置群 [群号] 用户 [QQ号] 为管理员 [是]
代码：group.set_admin(群号, QQ号, true)
\`\`\`

#### 设置名片
\`\`\`
积木：设置群 [群号] 用户 [QQ号] 的名片为 ["学习委员"]
代码：group.set_card(群号, QQ号, "学习委员")
\`\`\`

#### 踢人
\`\`\`
积木：将群 [群号] 的用户 [QQ号] 踢出群 [并拒绝再次加群]
代码：group.kick(群号, QQ号, true)
\`\`\`

#### 禁言
\`\`\`
积木：禁言群 [群号] 的用户 [QQ号] 时长 [3600] 秒
代码：group.set_ban(群号, QQ号, 3600)

注意：时长为0表示取消禁言
\`\`\`

#### 获取群列表
\`\`\`
积木：获取群列表
返回：群列表数组
代码：group.get_list()
\`\`\`

#### 获取群成员
\`\`\`
积木：获取群 [群号] 的成员列表
返回：成员列表数组
代码：group.get_members(群号)
\`\`\`

---

### 📂 11. 文件分类（橙色）

文件操作相关。

#### 读取文件
\`\`\`
积木：读取文件 ["data.txt"]
返回：文件内容（字符串）
代码：file.read("data.txt")
\`\`\`

#### 写入文件
\`\`\`
积木：写入内容 ["Hello"] 到文件 ["data.txt"]
代码：file.write("data.txt", "Hello")
\`\`\`

#### 删除文件
\`\`\`
积木：删除文件 ["data.txt"]
代码：file.delete("data.txt")
\`\`\`

#### 检查文件存在
\`\`\`
积木：文件 ["data.txt"] 存在
返回：true 或 false
代码：file.exists("data.txt")
\`\`\`

#### 创建目录
\`\`\`
积木：创建目录 ["images"]
代码：file.mkdir("images")
\`\`\`

---

### 📂 12. 系统分类（粉色）

获取系统信息和状态。

#### 获取时间戳
\`\`\`
积木：获取当前时间戳(秒)
返回：从1970年1月1日开始的秒数
代码：system.get_timestamp_seconds()

积木：获取当前时间戳(毫秒)
返回：毫秒数
代码：system.get_timestamp_milliseconds()
\`\`\`

#### 获取时间
\`\`\`
积木：获取当前时间
返回：包含年月日时分秒的对象
代码：system.now()
\`\`\`

#### 获取系统状态
\`\`\`
积木：获取系统状态
返回：系统和机器人状态信息
代码：system.status()
\`\`\`

---

## 五、实战示例

### 示例1：最简单的自动回复机器人

**功能：** 收到"你好"就回复"你好呀！"

\`\`\`
当收到消息时 存储到变量 [msg]
  ↓
  如果 获取消息 [msg] 的纯文本内容 = "你好"
    ↓
    发送私聊消息 用户：获取消息 [msg] 的发送者ID 内容："你好呀！"
\`\`\`

**生成的Lua代码：**
\`\`\`lua
on_message(function(msg)
  if msg.get_plain_text(msg) == "你好" then
    message.send_private(msg.get_sender_id(msg), "你好呀！")
  end
end)
\`\`\`

---

### 示例2：群管机器人（关键词禁言）

**功能：** 群里有人说脏话就禁言10分钟

\`\`\`
当收到消息时 存储到变量 [msg]
  ↓
  如果 消息 [msg] 是群消息
    ↓
    如果 消息 [msg] 包含文字 "脏话"
      ↓
      禁言群 获取消息 [msg] 的群ID 的用户 获取消息 [msg] 的发送者ID 时长 600 秒
      发送群消息 群：获取消息 [msg] 的群ID 内容："检测到违规内容，已禁言10分钟"
\`\`\`

**生成的Lua代码：**
\`\`\`lua
on_message(function(msg)
  if msg.is_group_message(msg) then
    if msg.contains_keyword(msg, "脏话") then
      group.set_ban(msg.get_group_id(msg), msg.get_sender_id(msg), 600)
      message.send_group(msg.get_group_id(msg), "检测到违规内容，已禁言10分钟")
    end
  end
end)
\`\`\`

---

### 示例3：积分系统

**功能：** 记录用户发言次数

\`\`\`
当收到消息时 存储到变量 [msg]
  ↓
  设置变量 [user_id] 为 获取消息 [msg] 的发送者ID
  设置变量 [key] 为 连接文本 "user_" 和 [user_id]
  设置变量 [count] 为 从存储读取 [key] 默认值：0
  设置变量 [new_count] 为 [count] + 1
  保存到存储 键：[key] 值：[new_count]
  ↓
  如果 [new_count] = 100
    发送消息 "恭喜！你的发言次数达到100次！"
\`\`\`

**生成的Lua代码：**
\`\`\`lua
on_message(function(msg)
  local user_id = msg.get_sender_id(msg)
  local key = "user_" .. user_id
  local count = storage.get(key, 0)
  local new_count = count + 1
  storage.set(key, new_count)
  
  if new_count == 100 then
    message.send_private(user_id, "恭喜！你的发言次数达到100次！")
  end
end)
\`\`\`

---

### 示例4：天气查询机器人

**功能：** 发送"天气 北京"查询北京天气

\`\`\`
当收到消息时 存储到变量 [msg]
  ↓
  设置变量 [text] 为 获取消息 [msg] 的纯文本内容
  ↓
  如果 消息 [msg] 包含文字 "天气 "
    ↓
    设置变量 [city] 为 截取文本 [text] 从 [4] 到 [文本 [text] 的长度]
    设置变量 [url] 为 连接文本 "https://api.weather.com/v1/current?city=" 和 [city]
    设置变量 [result] 为 HTTP GET请求 [url]
    ↓
    发送私聊消息 用户：获取消息 [msg] 的发送者ID 内容：连接文本 "当前温度：" 和 result.temperature
\`\`\`

---

### 示例5：图片识别机器人

**功能：** 收到图片后识别文字

\`\`\`
当收到消息时 存储到变量 [msg]
  ↓
  如果 消息 [msg] 包含图片
    ↓
    设置变量 [images] 为 获取消息 [msg] 中的所有图片
    设置变量 [first_image] 为 获取数组 [images] 的第 [1] 个
    设置变量 [ocr_result] 为 图片OCR [first_image]
    ↓
    发送私聊消息 用户：获取消息 [msg] 的发送者ID 内容：连接文本 "图片中的文字：" 和 [ocr_result]
\`\`\`

---

## 六、常见问题

### ❓ Q1: 为什么我的积木连不上？

**A:** 检查积木的形状是否匹配：
- 帽子积木只能放在最上面
- 拼图积木上下要对应
- 椭圆积木要放进对应的输入框

**形状对应表：**
| 形状 | 可以连接的位置 |
|------|--------------|
| 帽子（上圆弧） | 只能作为开头 |
| 拼图（上下凹凸） | 可以接在帽子下面，或另一个拼图下面 |
| 椭圆（左右圆口） | 要放进输入框里 |

---

### ❓ Q2: 日志输出为什么是空白的？

**A:** 你可能直接输出了表对象。需要先用"将表转为JSON字符串"转换。

**错误：**
\`\`\`
日志 (信息, msg)  ← 输出空白
\`\`\`

**正确：**
\`\`\`
日志 (信息, 将表 [msg] 转为JSON字符串)  ← 正常显示
\`\`\`

---

### ❓ Q3: 如何判断是群消息还是私聊？

**A:** 有三种方法：

**方法1（推荐）：**
\`\`\`
如果 消息 [msg] 是群消息
  ...
\`\`\`

**方法2：**
\`\`\`
如果 获取消息 [msg] 的 [消息类型] = "group"
  ...
\`\`\`

**方法3：**
\`\`\`
如果 获取消息 [msg] 的群ID ≠ 0
  ...  ← 是群消息
\`\`\`

---

### ❓ Q4: 如何获取发送者的昵称？

**A:**
\`\`\`
获取消息 [msg] 的 [发送者昵称]
\`\`\`

或者使用路径获取：
\`\`\`
从消息 [msg] 中获取路径 ["sender.nickname"]
\`\`\`

---

### ❓ Q5: 回复消息时引用消息ID有什么用？

**A:** 引用消息ID可以让回复显示为"回复某条消息"的样式。

- 填消息ID → 显示为回复样式
- 填 0 或不填 → 直接发送新消息

**获取消息ID：**
\`\`\`
获取消息 [msg] 的 [消息ID]
\`\`\`

---

### ❓ Q6: 变量名有什么要求？

**A:** 
- ✅ 可以用：字母、数字、下划线
- ✅ 示例：user_name, count1, _temp
- ❌ 不能用：数字开头、特殊符号、空格
- ❌ 错误：1user, user-name, user name

---

### ❓ Q7: 为什么我的数学计算结果不对？

**A:** 检查数据类型：
- "123"（字符串）不能参与数学运算
- 123（数字）才能参与数学运算

**转换方法：**
\`\`\`
设置变量 [num] 为 将 ["123"] 转为数字
→ num = 123
\`\`\`

---

### ❓ Q8: 如何保存数据，重启后还在？

**A:** 使用存储积木：

\`\`\`
保存数据：
  保存到存储 键：["mydata"] 值：["Hello"]

读取数据：
  从存储读取 ["mydata"] 默认值：["默认值"]
\`\`\`

---

### ❓ Q9: 如何调试程序，看哪里出错了？

**A:** 使用日志积木输出中间结果：

\`\`\`
当收到消息时 存储到变量 [msg]
  日志 (调试, 连接文本 "收到消息：" 和 将表 [msg] 转为JSON字符串)
  
  设置变量 [text] 为 获取消息 [msg] 的纯文本内容
  日志 (调试, 连接文本 "消息内容：" 和 [text])
  
  ...其他代码...
\`\`\`

---

### ❓ Q10: 如何获取数组的第N个元素？

**A:** 使用安全获取积木：

\`\`\`
安全获取 [数组] 的 ["3"] 默认值：["不存在"]
→ 获取第3个元素，如果没有则返回"不存在"
\`\`\`

或者直接访问：
\`\`\`
数组[3]  → 获取第3个元素
\`\`\`

**注意：** 数组从1开始计数，不是从0开始！

---

## 七、最佳实践

### ✅ 建议做法

1. **使用有意义的变量名**
   \`\`\`
   ✅ user_name, group_id, message_count
   ❌ x, y, z, a, b, c
   \`\`\`

2. **输出日志时使用JSON转换**
   \`\`\`
   ✅ 日志 (信息, 将表 [msg] 转为JSON字符串)
   ❌ 日志 (信息, msg)
   \`\`\`

3. **使用安全获取处理可能不存在的字段**
   \`\`\`
   ✅ 安全获取 [msg] 的 ["optional_field"] 默认值：[""]
   ❌ msg.optional_field  ← 可能报错
   \`\`\`

4. **添加注释说明程序逻辑**
   \`\`\`
   -- 这里是处理私聊消息的逻辑
   如果 消息 [msg] 是私聊消息
     ...
   \`\`\`

5. **使用常量代替魔法数字**
   \`\`\`
   ✅ 设置 [BAN_DURATION] 为 600  -- 禁言10分钟
   禁言群 [群号] 的用户 [QQ号] 时长 [BAN_DURATION] 秒
   
   ❌ 禁言群 [群号] 的用户 [QQ号] 时长 600 秒
   \`\`\`

### ❌ 避免做法

1. **直接输出表对象到日志**
   \`\`\`
   ❌ 日志 (信息, msg)  ← 输出空白
   \`\`\`

2. **不检查字段是否存在就直接使用**
   \`\`\`
   ❌ 直接使用 msg.group_id  ← 私聊消息没有这个字段
   \`\`\`

3. **混淆字符串和数字类型**
   \`\`\`
   ❌ "123" + 456  ← 错误！
   ✅ 将 ["123"] 转为数字 + 456  ← 正确：579
   \`\`\`

4. **使用过长的积木链**
   \`\`\`
   ❌ 一行里嵌套太多积木，难以阅读
   ✅ 使用变量拆分，每一步都清晰
   \`\`\`

5. **不处理错误情况**
   \`\`\`
   ❌ 直接发送HTTP请求，不管是否成功
   ✅ 使用带结果处理的HTTP积木，处理成功和失败情况
   \`\`\`

---

## 八、快捷键

| 快捷键 | 功能 |
|-------|------|
| Ctrl + S | 保存项目 |
| Ctrl + Z | 撤销 |
| Ctrl + Y | 重做 |
| Ctrl + Shift + Z | 重做 |
| Delete | 删除选中的积木 |
| 鼠标滚轮 | 缩放工作区 |
| 拖拽空白处 | 移动工作区 |

---

## 九、更多资源

- 💡 **提示**：右键点击积木可以查看该积木的详细说明
- 📖 积木上的颜色代表不同的分类
- 🔍 使用搜索功能快速找到需要的积木
- 💾 定期保存项目，避免丢失工作

---

**祝你编程愉快！有任何问题可以查看日志输出进行调试。**
`;

  // 打开帮助弹窗 - 使用 useCallback 确保引用稳定
  const openHelpDialog = useCallback(() => {
    setHelpTitle('Blockly 帮助文档');
    setHelpContent(helpDocumentation);
    setShowHelpDialog(true);
  }, [helpDocumentation]);

  // 显示积木帮助 - 使用 useCallback 确保引用稳定
  const showBlockHelp = useCallback((blockType: string) => {
    const blockHelpMap: Record<string, string> = {
      'current_message': '获取当前消息对象\n\n输出类型: Message\n\n包含所有消息字段，可用"获取消息字段"或"从消息获取路径"积木提取具体值',
      'msg_get_field': '获取消息对象的指定字段\n\n输入:\n- 消息: Message 类型\n- 字段: 下拉选择\n\n输出: 对应字段的值（可能是字符串、数字或表）',
      'msg_parse_path': '使用点号路径获取消息中的嵌套值\n\n输入:\n- 消息: Message 类型\n- 路径: 字符串，如 "sender.nickname"\n\n输出: 路径对应的值',
      'msg_reply_private': '回复私聊消息\n\n参数:\n- 用户ID: 对方QQ号\n- 引用消息ID: 原消息ID（可选，用于引用回复）\n- 内容: 回复的文本内容',
      'msg_reply_group': '回复群消息\n\n参数:\n- 群ID: 群号\n- 引用消息ID: 原消息ID（可选，用于引用回复）\n- 内容: 回复的文本内容',
      'table_to_json': '将表（包括消息对象）转为JSON字符串\n\n输入: Object 类型\n输出: String 类型\n\n用途: 日志输出、网络传输',
      'convert_to_string': '将任意值转为字符串\n\n输入: 任意类型\n输出: String\n\n用途: 类型转换、字符串拼接',
      'convert_to_number': '将字符串转为数字\n\n输入: String\n输出: Number\n\n注意: 转换失败返回0',
      'event_on_message': '消息事件处理器\n\n当收到任何消息时触发\n\n变量: 存储消息对象的变量名，默认为"event"\n\n内部可用此变量访问消息字段',
    };

    const help = blockHelpMap[blockType] || ('积木类型: ' + blockType + '\n\n暂无详细说明，请查看帮助文档了解通用用法。');
    setHelpTitle('积木帮助: ' + blockType);
    setHelpContent(help);
    setShowHelpDialog(true);
  }, []);
  
  const [availableAccounts, setAvailableAccounts] = useState<AccountInfo[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  
  // 防抖定时器
  const codeGenerationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const [exportMetadata, setExportMetadata] = useState<PluginMetadata>({
    name: '',
    version: '1.0.0',
    description: ''
  });
  
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  // 预览模式拖拽 refs
  const isPreviewDraggingRef = useRef(false);
  const previewDragStartRef = useRef({ x: 0, y: 0 });
  const previewScrollStartRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    loadProjects();
    loadAvailableAccounts();
  }, []);

  // 设置多行编辑器回调
  useEffect(() => {
    multilineEditorBridge.setCallbacks({
      openEditor: (value: string, field: Blockly.Field, language: string) => {
        setMultilineEditorValue(value);
        setMultilineEditorLanguage(language);
        multilineEditorFieldRef.current = field;
        setShowMultilineEditor(true);
      },
    });
  }, []);

  // 保存多行编辑器内容
  const handleSaveMultilineEditor = useCallback(() => {
    if (multilineEditorFieldRef.current) {
      multilineEditorFieldRef.current.setValue(multilineEditorValue);
    }
    setShowMultilineEditor(false);
  }, [multilineEditorValue]);

  // 取消多行编辑器
  const handleCancelMultilineEditor = useCallback(() => {
    setShowMultilineEditor(false);
    multilineEditorFieldRef.current = null;
  }, []);

  useEffect(() => {
    if (containerRef.current && !workspaceRef.current) {
      initWorkspace();
    }
    return () => {
      if (workspaceRef.current) {
        const ws = workspaceRef.current as any;
        const blocklySvg = containerRef.current?.querySelector('.blocklySvg');
        if (blocklySvg && ws.workspaceDragMouseDownHandler) {
          blocklySvg.removeEventListener('mousedown', ws.workspaceDragMouseDownHandler);
          blocklySvg.removeEventListener('contextmenu', ws.workspaceDragContextMenuHandler);
        }
        if (ws.workspaceDragMouseMoveHandler) {
          document.removeEventListener('mousemove', ws.workspaceDragMouseMoveHandler);
        }
        if (ws.workspaceDragMouseUpHandler) {
          document.removeEventListener('mouseup', ws.workspaceDragMouseUpHandler);
        }
        workspaceRef.current.dispose();
        workspaceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const workspace = workspaceRef.current;
    if (!container || !workspace) return;
    
    const resizeObserver = new ResizeObserver(() => {
      Blockly.svgResize(workspaceRef.current!);
    });
    
    resizeObserver.observe(container);
    
    return () => {
      resizeObserver.disconnect();
    };
  }, [workspaceRef.current]);

  useEffect(() => {
    if (!workspaceRef.current) return;
    const ws = workspaceRef.current as Blockly.WorkspaceSvg;
    if (previewMode) {
      document.body.style.cursor = 'grab';
    } else {
      document.body.style.cursor = '';
    }
  }, [previewMode]);

  useEffect(() => {
    if (currentProject) {
      setExportMetadata({
        name: currentProject.name,
        version: currentProject.version,
        description: currentProject.description
      });
    }
  }, [currentProject]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '您有未保存的更改，确定要离开吗？';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    onUnsavedChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onUnsavedChange]);

  const loadAvailableAccounts = async () => {
    try {
      const res = await pluginManagerApi.getAvailableAccounts();
      if (res.success && res.data.length > 0) {
        setAvailableAccounts(res.data);
        setSelectedAccountId(res.data[0].self_id);
      }
    } catch (error) {
      console.error('Failed to load accounts:', error);
    }
  };

  const initWorkspace = () => {
    if (!containerRef.current) return;

    const workspace = Blockly.inject(containerRef.current, {
      toolbox: getToolboxCategories(),
      theme: getBlocklyTheme('modern'),
      grid: {
        spacing: 20,
        length: 3,
        colour: '#444',
        snap: true
      },
      zoom: {
        controls: false,
        wheel: true,
        startScale: 1.0,
        maxScale: 3,
        minScale: 0.3,
        scaleSpeed: 1.2
      },
      trashcan: true,
      move: {
        scrollbars: true,
        drag: true,
        wheel: true
      },
      sounds: false,
      renderer: 'zelos',
    });

    workspace.addChangeListener((event: Blockly.Events.Abstract) => {
      if (event.type !== Blockly.Events.UI) {
        setHasUnsavedChanges(true);
        updateGeneratedCode();
      }
      updateUndoRedoState();

      // 更新选中积木状态
      if (event.type === Blockly.Events.SELECTED) {
        const selected = Blockly.common.getSelected();
        setHasSelectedBlocks(!!selected);
      }

      // 拦截 BLOCK_DELETE 事件，阻止 bump 行为导致视角跳动
      if (event.type === Blockly.Events.BLOCK_DELETE) {
        isDeletingRef.current = true;
        setTimeout(() => {
          isDeletingRef.current = false;
        }, 0);
      }
    });

    // 拦截 bump 行为：当 isDeletingRef 为 true 时，跳过 bump
    const originalBumpHandler = Blockly.bumpObjects.bumpIntoBoundsHandler(workspace);
    workspace.addChangeListener((event: Blockly.Events.Abstract) => {
      if (isDeletingRef.current) {
        return;
      }
      originalBumpHandler(event);
    });

    workspaceRef.current = workspace;

    // 取消注册默认的复制（Duplicate）右键菜单
    try {
      Blockly.ContextMenuRegistry.registry.unregister('blockDuplicate');
    } catch (e) {
      // 忽略错误
    }

    // 注册右键菜单复制选项（只复制到剪贴板，不自动粘贴）
    if (!Blockly.ContextMenuRegistry.registry.getItem('blockCopy')) {
      Blockly.ContextMenuRegistry.registry.register({
        displayText: () => '复制',
        preconditionFn: (scope: any) => {
          return scope.block && scope.block.isDuplicatable() ? 'enabled' : 'disabled';
        },
        callback: (scope: any) => {
          if (!scope.block) return;
          try {
            const xmlElement = Blockly.Xml.blockToDomWithXY(scope.block);
            const xmlDoc = document.implementation.createDocument('', '', null);
            const root = xmlDoc.createElement('xml');
            root.appendChild(xmlElement);
            const serializer = new XMLSerializer();
            const text = serializer.serializeToString(root);
            setClipboardContent(text);
            toast.success('已复制到剪贴板');
          } catch (error) {
            toast.error('复制失败');
          }
        },
        scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
        id: 'blockCopy',
        weight: 1,
      });
    }

    // 注册右键菜单粘贴选项（工作区空白处）
    if (!Blockly.ContextMenuRegistry.registry.getItem('blocklyPaste')) {
      Blockly.ContextMenuRegistry.registry.register({
        displayText: () => '粘贴',
        preconditionFn: (scope: any) => {
          return blockClipboardRef.current ? 'enabled' : 'disabled';
        },
        callback: (scope: any) => {
          if (!blockClipboardRef.current) return;
          if (!workspaceRef.current || typeof workspaceRef.current.isDisposed !== 'function' || workspaceRef.current.isDisposed()) {
            toast.error('工作区已失效，请刷新页面');
            return;
          }
          try {
            const xml = Blockly.utils.xml.textToDom(blockClipboardRef.current);
            const blockElements = xml.getElementsByTagName('block');
            const blockCount = blockElements.length;

            if (blockCount > 50) {
              toast.info(`正在粘贴 ${blockCount} 个积木，请稍候...`);
            }

            if (blockCount > 100) {
              // 大量积木时分批处理
              const BATCH_SIZE = 30;
              const BATCH_DELAY = 50;
              const blocksArray = Array.from(blockElements);
              let currentIndex = 0;

              const processBatch = () => {
                if (!workspaceRef.current || typeof workspaceRef.current.isDisposed !== 'function' || workspaceRef.current.isDisposed()) {
                  toast.error('工作区已失效，请刷新页面');
                  return;
                }
                const batch = blocksArray.slice(currentIndex, currentIndex + BATCH_SIZE);
                batch.forEach((blockEl) => {
                  const newXml = document.implementation.createDocument('', '', null);
                  const root = newXml.createElement('xml');
                  root.appendChild(newXml.importNode(blockEl, true));
                  try {
                    Blockly.Xml.domToWorkspace(root.firstChild as Element, workspaceRef.current);
                  } catch (e) {
                    console.warn('粘贴单个积木失败:', e);
                  }
                });
                currentIndex += BATCH_SIZE;
                if (currentIndex < blocksArray.length) {
                  setTimeout(processBatch, BATCH_DELAY);
                } else {
                  workspaceRef.current.render();
                  toast.success(`成功粘贴 ${blockCount} 个积木`);
                }
              };

              processBatch();
            } else {
              Blockly.Xml.domToWorkspace(xml, workspaceRef.current);
              workspaceRef.current.render();
              toast.success('粘贴成功');
            }
          } catch (error) {
            console.error('粘贴失败:', error);
            toast.error('粘贴失败');
          }
        },
        scopeType: Blockly.ContextMenuRegistry.ScopeType.WORKSPACE,
        id: 'blocklyPaste',
        weight: 101,
      });
    }

    // 取消注册默认的复制粘贴快捷键（检查是否存在）
    try {
      const registry = Blockly.ShortcutRegistry.registry;
      const shortcuts = registry.getRegistry();
      if (shortcuts['blockly_copy']) {
        registry.unregister('blockly_copy');
      }
      if (shortcuts['blockly_paste']) {
        registry.unregister('blockly_paste');
      }
    } catch (e) {
      // 忽略错误
    }

    // 拖拽工作区功能 - 右键长按拖动视角，不动积木
    let isRightClickDragging = false;
    let rightClickStartPos = { x: 0, y: 0 };
    let scrollStartPos = { x: 0, y: 0 };
    let rightClickTimer: number | null = null;
    let isLongPress = false;
    const LONG_PRESS_THRESHOLD = 300;

    const handleContextMenu = (e: MouseEvent) => {
      if (isLongPress) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const handleRightMouseDown = (e: MouseEvent) => {
      if (e.button !== 2) return;
      const target = e.target as Element;
      if (target.closest('.blocklyWidgetDiv') || target.closest('.blocklyTooltip')) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      isLongPress = false;
      rightClickStartPos = { x: e.clientX, y: e.clientY };
      scrollStartPos = {
        x: (workspace as any).scrollX || 0,
        y: (workspace as any).scrollY || 0
      };

      rightClickTimer = window.setTimeout(() => {
        isLongPress = true;
        isRightClickDragging = true;
        isDraggingWorkspaceRef.current = true;
        document.body.style.cursor = 'grabbing';
        rightClickTimer = null;
      }, LONG_PRESS_THRESHOLD);
    };

    const handleRightMouseMove = (e: MouseEvent) => {
      if (rightClickTimer !== null) {
        const dx = Math.abs(e.clientX - rightClickStartPos.x);
        const dy = Math.abs(e.clientY - rightClickStartPos.y);
        if (dx > 5 || dy > 5) {
          window.clearTimeout(rightClickTimer);
          rightClickTimer = null;
          isLongPress = false;
        }
      }

      if (!isRightClickDragging) return;

      const dx = e.clientX - rightClickStartPos.x;
      const dy = e.clientY - rightClickStartPos.y;

      const ws = workspace as any;
      const metrics = ws.getMetrics();
      if (!metrics) return;

      const newScrollX = scrollStartPos.x - dx;
      const newScrollY = scrollStartPos.y - dy;

      const maxScrollX = Math.max(0, metrics.contentWidth - metrics.viewWidth);
      const maxScrollY = Math.max(0, metrics.contentHeight - metrics.viewHeight);

      ws.scrollX = Math.max(0, Math.min(newScrollX, maxScrollX));
      ws.scrollY = Math.max(0, Math.min(newScrollY, maxScrollY));

      const scrollbarX = ws.scrollbarX;
      const scrollbarY = ws.scrollbarY;
      if (scrollbarX) scrollbarX.setPosition(ws.scrollX);
      if (scrollbarY) scrollbarY.setPosition(ws.scrollY);
    };

    const handleRightMouseUp = (e: MouseEvent) => {
      if (e.button !== 2) return;

      if (rightClickTimer !== null) {
        window.clearTimeout(rightClickTimer);
        rightClickTimer = null;
      }

      if (isRightClickDragging) {
        isRightClickDragging = false;
        isDraggingWorkspaceRef.current = false;
        document.body.style.cursor = '';
      }

      setTimeout(() => {
        isLongPress = false;
      }, 50);
    };

    const handlePreviewMouseDown = (e: MouseEvent) => {
      if (!previewMode) return;
      if (e.button !== 0) return;

      e.preventDefault();
      e.stopPropagation();

      isPreviewDraggingRef.current = true;
      previewDragStartRef.current = { x: e.clientX, y: e.clientY };
      previewScrollStartRef.current = {
        x: (workspace as any).scrollX || 0,
        y: (workspace as any).scrollY || 0
      };
      document.body.style.cursor = 'grabbing';
    };

    const handlePreviewMouseMove = (e: MouseEvent) => {
      if (!isPreviewDraggingRef.current) return;

      const dx = e.clientX - previewDragStartRef.current.x;
      const dy = e.clientY - previewDragStartRef.current.y;

      const ws = workspace as any;
      const metrics = ws.getMetrics();
      if (!metrics) return;

      const newScrollX = previewScrollStartRef.current.x - dx;
      const newScrollY = previewScrollStartRef.current.y - dy;

      const maxScrollX = Math.max(0, metrics.contentWidth - metrics.viewWidth);
      const maxScrollY = Math.max(0, metrics.contentHeight - metrics.viewHeight);

      ws.scrollX = Math.max(0, Math.min(newScrollX, maxScrollX));
      ws.scrollY = Math.max(0, Math.min(newScrollY, maxScrollY));

      const scrollbarX = ws.scrollbarX;
      const scrollbarY = ws.scrollbarY;
      if (scrollbarX) scrollbarX.setPosition(ws.scrollX);
      if (scrollbarY) scrollbarY.setPosition(ws.scrollY);
    };

    const handlePreviewMouseUp = (e: MouseEvent) => {
      if (!isPreviewDraggingRef.current) return;

      isPreviewDraggingRef.current = false;
      document.body.style.cursor = previewMode ? 'grab' : '';
    };

    mouseDownHandlerRef.current = handleRightMouseDown;
    mouseMoveHandlerRef.current = handleRightMouseMove;
    mouseUpHandlerRef.current = handleRightMouseUp;

    const blocklySvg = containerRef.current?.querySelector('.blocklySvg');
    if (blocklySvg) {
      blocklySvg.addEventListener('contextmenu', handleContextMenu as any);
      blocklySvg.addEventListener('mousedown', handleRightMouseDown as any);
      blocklySvg.addEventListener('mousedown', handlePreviewMouseDown as any);
      document.addEventListener('mousemove', handleRightMouseMove);
      document.addEventListener('mousemove', handlePreviewMouseMove);
      document.addEventListener('mouseup', handleRightMouseUp);
      document.addEventListener('mouseup', handlePreviewMouseUp);
    }

    (workspace as any).workspaceDragMouseDownHandler = handleRightMouseDown;
    (workspace as any).workspaceDragMouseMoveHandler = handleRightMouseMove;
    (workspace as any).workspaceDragMouseUpHandler = handleRightMouseUp;
    (workspace as any).workspaceDragContextMenuHandler = handleContextMenu;

    workspace.cleanUp_ = function() {
      Blockly.WorkspaceSvg.prototype.cleanUp_.call(this);
      (this as any).scrollX = 0;
      (this as any).scrollY = 0;
    };
  };

  const updateUndoRedoState = useCallback(() => {
    if (workspaceRef.current) {
      const undoStack = (workspaceRef.current as any).undoStack_ || [];
      const redoStack = (workspaceRef.current as any).redoStack_ || [];
      setCanUndo(undoStack.length > 0);
      setCanRedo(redoStack.length > 0);
    }
  }, []);

  const handleUndo = useCallback(() => {
    if (workspaceRef.current && canUndo) {
      workspaceRef.current.undo(false);
      updateUndoRedoState();
    }
  }, [canUndo, updateUndoRedoState]);

  const handleRedo = useCallback(() => {
    if (workspaceRef.current && canRedo) {
      workspaceRef.current.undo(true);
      updateUndoRedoState();
    }
  }, [canRedo, updateUndoRedoState]);

  const handleZoomIn = useCallback(() => {
    if (workspaceRef.current) {
      workspaceRef.current.zoomCenter(1);
      setZoomLevel(workspaceRef.current.getScale());
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (workspaceRef.current) {
      workspaceRef.current.zoomCenter(-1);
      setZoomLevel(workspaceRef.current.getScale());
    }
  }, []);

  const handleZoomReset = useCallback(() => {
    if (workspaceRef.current) {
      workspaceRef.current.setScale(1.0);
      workspaceRef.current.scrollCenter();
      setZoomLevel(1.0);
    }
  }, []);

  // 复制积木到剪贴板
  const handleCopyBlocks = useCallback(() => {
    const workspace = workspaceRef.current as Blockly.WorkspaceSvg | null;
    if (!workspace) return;

    const selectedBlock = Blockly.common.getSelected();
    if (!selectedBlock) {
      toast.warning('请先选择要复制的积木');
      return;
    }

    try {
      // 只序列化选中的积木
      const xmlElement = Blockly.Xml.blockToDomWithXY(selectedBlock);

      // 创建临时文档片段
      const xmlDoc = document.implementation.createDocument('', '', null);
      const root = xmlDoc.createElement('xml');
      root.appendChild(xmlElement);

      const serializer = new XMLSerializer();
      const text = serializer.serializeToString(root);
      setClipboardContent(text);

      // 重新选中积木
      selectedBlock.select();
      toast.success('已复制积木到剪贴板');
    } catch (error) {
      toast.error('复制失败');
    }
  }, []);

  // 从剪贴板粘贴积木 - 优化版，支持大量积木分批处理
  const handlePasteBlocks = useCallback(() => {
    const workspace = workspaceRef.current as Blockly.WorkspaceSvg | null;
    if (!workspace) {
      toast.error('工作区未初始化');
      return;
    }

    if (!blockClipboard) {
      toast.warning('剪贴板为空，请先复制积木');
      return;
    }

    try {
      const xml = Blockly.utils.xml.textToDom(blockClipboard);
      const blockElements = xml.getElementsByTagName('block');
      const blockCount = blockElements.length;

      if (blockCount > 50) {
        toast.info(`正在粘贴 ${blockCount} 个积木，请稍候...`);
      }

      if (blockCount > 100) {
        // 大量积木时分批处理，避免 DOM 操作过载
        const BATCH_SIZE = 30;
        const BATCH_DELAY = 50;
        const blocksArray = Array.from(blockElements);

        let currentIndex = 0;

        const processBatch = () => {
          if (!workspaceRef.current || typeof workspaceRef.current.isDisposed !== 'function' || workspaceRef.current.isDisposed()) {
            toast.error('工作区已失效，请刷新页面');
            return;
          }

          const batch = blocksArray.slice(currentIndex, currentIndex + BATCH_SIZE);

          batch.forEach((blockEl) => {
            const newXml = document.implementation.createDocument('', '', null);
            const root = newXml.createElement('xml');
            root.appendChild(newXml.importNode(blockEl, true));
            try {
              Blockly.Xml.domToWorkspace(root.firstChild as Element, workspaceRef.current);
            } catch (e) {
              console.warn('粘贴单个积木失败:', e);
            }
          });

          currentIndex += BATCH_SIZE;

          if (currentIndex < blocksArray.length) {
            setTimeout(processBatch, BATCH_DELAY);
          } else {
            workspaceRef.current.render();
            toast.success(`成功粘贴 ${blockCount} 个积木`);
          }
        };

        processBatch();
      } else {
        // 小量积木直接粘贴
        Blockly.Xml.domToWorkspace(xml, workspace);
        workspace.render();
        toast.success('粘贴成功');
      }
    } catch (error) {
      console.error('粘贴失败:', error);
      toast.error('粘贴失败');
    }
  }, [blockClipboard]);

  // 全屏切换功能
  const toggleFullscreen = useCallback(() => {
    const doc = document as any;
    const elem = document.documentElement as any;

    const isFullscreen = doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement;

    if (!isFullscreen) {
      // 进入全屏
      if (elem.requestFullscreen) {
        elem.requestFullscreen().catch((err: Error) => {
          toast.error('进入全屏失败: ' + err.message);
        });
      } else if (elem.webkitRequestFullscreen) {
        elem.webkitRequestFullscreen();
      } else if (elem.mozRequestFullScreen) {
        elem.mozRequestFullScreen();
      } else if (elem.msRequestFullscreen) {
        elem.msRequestFullscreen();
      }
    } else {
      // 退出全屏
      if (doc.exitFullscreen) {
        doc.exitFullscreen();
      } else if (doc.webkitExitFullscreen) {
        doc.webkitExitFullscreen();
      } else if (doc.mozCancelFullScreen) {
        doc.mozCancelFullScreen();
      } else if (doc.msExitFullscreen) {
        doc.msExitFullscreen();
      }
    }
  }, []);

  const updateGeneratedCode = useCallback(() => {
    if (!workspaceRef.current) return;

    // 清除之前的定时器
    if (codeGenerationTimeoutRef.current) {
      clearTimeout(codeGenerationTimeoutRef.current);
    }

    // 设置新的防抖定时器，延迟 300ms 生成代码
    codeGenerationTimeoutRef.current = setTimeout(() => {
      if (!workspaceRef.current) return;

      // 使用当前项目元数据，确保 name 有值
      const projectName = currentProject?.name?.trim();
      const metadata: PluginMetadata = {
        name: projectName || 'untitled',
        version: currentProject?.version || '1.0.0',
        description: currentProject?.description || ''
      };

      try {
        const code = generateLuaCode(workspaceRef.current, metadata);
        setGeneratedCode(code.full);
      } catch (error) {
        console.error('代码生成失败:', error);
      }
    }, 300);
  }, [currentProject]);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const projectList = await listBlocklyProjects();
      setProjects(projectList);
    } catch (error) {
      toast.error('加载项目列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      toast.error('请输入项目名称');
      return;
    }

    setLoading(true);
    try {
      const result = await createBlocklyProject(newProjectName.trim());
      if (result.success) {
        toast.success('项目创建成功');
        await loadProjects();
        setShowProjectDialog(false);
        setNewProjectName('');
      } else {
        toast.error(result.message || '创建失败');
      }
    } catch (error) {
      toast.error('创建项目失败');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenProject = async (projectFile: BlocklyProjectFile) => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm('您有未保存的更改，确定要打开其他项目吗？');
      if (!confirmed) return;
    }
    
    setLoading(true);
    try {
      const project = await loadBlocklyProject(projectFile.path);
      if (project) {
        if (workspaceRef.current) {
          workspaceRef.current.clear();
          if (project.xmlContent) {
            try {
              Blockly.Xml.domToWorkspace(
                Blockly.utils.xml.textToDom(project.xmlContent),
                workspaceRef.current
              );
            } catch (e) {
              console.error('Failed to load workspace XML:', e);
            }
          }
        }
        setCurrentProject({ ...project, path: projectFile.path });
        setHasUnsavedChanges(false);
        toast.success(`已打开项目: ${project.name}`);
      } else {
        toast.error('无法加载项目');
      }
    } catch (error) {
      console.error('Load project error:', error);
      toast.error('加载项目失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProject = useCallback(async () => {
    if (!currentProject || !workspaceRef.current) {
      toast.error('没有打开的项目');
      return;
    }

    setLoading(true);
    try {
      const xml = Blockly.Xml.workspaceToDom(workspaceRef.current);
      const xmlContent = Blockly.Xml.domToText(xml);

      const updatedProject = {
        ...currentProject,
        xmlContent
      };

      const result = await saveBlocklyProject(updatedProject);
      if (result.success) {
        setCurrentProject(updatedProject);
        setHasUnsavedChanges(false);
        toast.success('保存成功');
        // 保存成功后立即更新生成的代码
        updateGeneratedCode();
      } else {
        toast.error(result.message || '保存失败');
      }
    } catch (error) {
      toast.error('保存失败');
    } finally {
      setLoading(false);
    }
  }, [currentProject, updateGeneratedCode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 's':
            e.preventDefault();
            if (currentProject) {
              handleSaveProject();
            }
            break;
          case 'z':
            e.preventDefault();
            if (e.shiftKey) {
              handleRedo();
            } else {
              handleUndo();
            }
            break;
          case 'y':
            e.preventDefault();
            handleRedo();
            break;
          case 'p':
            e.preventDefault();
            setPreviewMode(prev => !prev);
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentProject, handleSaveProject, handleUndo, handleRedo]);

  const handleDeleteProject = async () => {
    if (!projectToDelete) return;

    if (deleteConfirmStep === 1) {
      setDeleteConfirmStep(2);
      return;
    }

    if (deleteConfirmStep === 2 && deleteConfirmInput !== projectToDelete.name) {
      return;
    }

    setLoading(true);
    try {
      const result = await deleteBlocklyProject(projectToDelete.path);
      if (result.success) {
        toast.success('删除成功');
        if (currentProject?.path === projectToDelete.path) {
          setCurrentProject(null);
          if (workspaceRef.current) {
            workspaceRef.current.clear();
          }
        }
        await loadProjects();
        setShowDeleteDialog(false);
        setProjectToDelete(null);
        setDeleteConfirmStep(1);
        setDeleteConfirmInput('');
      } else {
        toast.error(result.message || '删除失败');
      }
    } catch (error) {
      toast.error('删除失败');
    } finally {
      setLoading(false);
    }
  };

  const handleRenameProject = async () => {
    if (!projectToRename || !renameValue.trim()) return;

    setLoading(true);
    try {
      const result = await renameBlocklyProject(projectToRename.path, renameValue.trim());
      if (result.success) {
        toast.success('重命名成功');
        await loadProjects();
        if (currentProject?.path === projectToRename.path) {
          const newPath = projectToRename.path.replace(/\/[^/]+$/, `/${renameValue.trim()}`);
          setCurrentProject({ 
            ...currentProject, 
            name: renameValue.trim(),
            path: newPath
          });
        }
        setShowRenameDialog(false);
        setProjectToRename(null);
        setRenameValue('');
      } else {
        toast.error(result.message || '重命名失败');
      }
    } catch (error) {
      console.error('Rename project error:', error);
      toast.error('重命名失败');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (forceOverwrite: boolean = false) => {
    if (!selectedAccountId) {
      toast.error('请选择目标机器人');
      return;
    }

    if (!exportMetadata.name.trim()) {
      toast.error('请输入插件名称');
      return;
    }

    setLoading(true);
    try {
      // 立即同步生成代码（不使用防抖）
      const projectName = currentProject?.name?.trim();
      const metadata: PluginMetadata = {
        name: projectName || 'untitled',
        version: currentProject?.version || '1.0.0',
        description: currentProject?.description || ''
      };
      const freshCode = generateLuaCode(workspaceRef.current!, metadata);
      const freshGeneratedCode = freshCode.full;

      // 从生成的代码中提取 BLOCKLY_CONFIG（单行格式）
      const configMatch = freshGeneratedCode.match(/-- \[BLOCKLY_CONFIG\] (.+?)(?:\n|$)/);
      const configContent = configMatch ? configMatch[1].trim() : '{}';
      const result = await exportPlugin(
        freshGeneratedCode,
        selectedAccountId,
        exportMetadata.name.trim(),
        configContent,
        forceOverwrite
      );
      
      if (result.success) {
        toast.success(`插件已上传到机器人 ${selectedAccountId}`);
        setShowUploadDialog(false);
        setShowOverwriteDialog(false);
        onExport?.();
      } else if (result.exists) {
        // 插件已存在，显示覆盖确认弹窗
        setShowOverwriteDialog(true);
      } else {
        toast.error(result.message || '导出失败');
      }
    } catch (error) {
      toast.error('上传失败');
    } finally {
      setLoading(false);
    }
  };

  // 导出工程文件到本地
  const handleExportProject = useCallback(() => {
    if (!currentProject) {
      toast.error('请先选择项目');
      return;
    }
    
    // 获取当前工作区的 XML
    const workspace = workspaceRef.current;
    if (!workspace) {
      toast.error('工作区未初始化');
      return;
    }
    
    const xmlContent = Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(workspace));
    
    const project: BlocklyProject = {
      ...currentProject,
      xmlContent,
      updatedAt: new Date().toISOString()
    };
    
    exportBlocklyProject(project);
    toast.success('工程文件已导出');
  }, [currentProject]);

  const handleGenerateCode = () => {
    updateGeneratedCode();
    setShowCodePreview(true);
  };

  const handleImport = async (file: File) => {
    try {
      setLoading(true);
      const project = await importBlocklyProject(file);
      if (project) {
        // 检查是否已存在同名项目
        const existingProject = projects.find(p => p.name === project.name);
        if (existingProject) {
          // 如果存在，添加时间戳后缀
          const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
          project.name = `${project.name}_${timestamp}`;
        }

        // 创建项目文件夹
        const createResult = await createBlocklyProject(project.name);
        if (createResult.success) {
          // 刷新项目列表获取新项目的路径
          const updatedProjects = await listBlocklyProjects();
          setProjects(updatedProjects);

          // 找到新创建的项目
          const newProject = updatedProjects.find(p => p.name === project.name);
          if (newProject) {
            // 加载项目并设置内容
            const loadedProject = await loadBlocklyProject(newProject.path);
            if (loadedProject) {
              // 更新项目内容
              const projectToSave = {
                ...loadedProject,
                xmlContent: project.xmlContent,
                description: project.description,
                version: project.version,
              };

              const saveResult = await saveBlocklyProject(projectToSave);
              if (saveResult.success) {
                // 加载到工作区
                setCurrentProject(projectToSave);
                if (workspaceRef.current && project.xmlContent) {
                  workspaceRef.current.clear();
                  const xml = Blockly.utils.xml.textToDom(project.xmlContent);
                  Blockly.Xml.domToWorkspace(xml, workspaceRef.current);
                }
                setHasUnsavedChanges(false);
                updateGeneratedCode();

                toast.success('项目导入成功');
                setShowImportDialog(false);
              } else {
                toast.error(saveResult.message || '保存项目失败');
              }
            } else {
              toast.error('加载新项目失败');
            }
          } else {
            toast.error('找不到新创建的项目');
          }
        } else if (createResult.exists) {
          toast.error('项目已存在');
        } else {
          toast.error(createResult.message || '创建项目失败');
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '导入失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#1D2129]">
      <motion.div
        className="relative flex-shrink-0 flex items-center justify-between bg-[#2A2E38] p-4 border-b border-gray-700 z-20"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
            title="返回主页"
          >
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#165DFF]" />
              插件管理 - 简易模式
            </h1>
            <p className="text-sm text-gray-500">可视化积木编程</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex bg-[#1D2129] rounded-lg p-1">
            <button
              onClick={onModeSwitch}
              className="px-4 py-1.5 rounded-md text-sm font-medium bg-[#165DFF] text-white shadow-sm"
            >
              简易模式
            </button>
            <button
              onClick={onModeSwitch}
              className="px-4 py-1.5 rounded-md text-sm font-medium text-gray-500 hover:text-gray-300 transition-all"
            >
              高级模式
            </button>
          </div>
        </div>
      </motion.div>

      <div className="flex flex-1 min-h-0 overflow-visible">
        <div className={`${sidebarCollapsed ? 'w-0' : 'w-56 lg:w-64'} bg-[#2A2E38] border-r border-gray-700 flex flex-col h-full flex-shrink-0 transition-all duration-300 overflow-hidden`}>
          <div className="p-3 border-b border-gray-700 flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-200">项目列表</h3>
              <button
                onClick={() => setShowProjectDialog(true)}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                title="新建项目"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-500">点击项目打开，右键更多操作</p>
          </div>
          
          <div className="flex-1 overflow-auto">
            {projects.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                <FileCode className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>暂无项目</p>
                <p className="mt-1">点击上方 + 创建新项目</p>
              </div>
            ) : (
              <div className="space-y-1 p-2">
                {projects.map((project) => (
                  <div
                    key={project.path}
                    className={`group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                      currentProject?.path === project.path
                        ? 'bg-[#165DFF]/20 text-[#165DFF] border border-[#165DFF]/30'
                        : 'text-gray-300 hover:bg-gray-700 border border-transparent'
                    }`}
                    onClick={() => handleOpenProject(project)}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <FileCode className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate text-sm">{project.name}</span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setProjectToRename(project);
                          setRenameValue(project.name);
                          setShowRenameDialog(true);
                        }}
                        className="p-1 text-gray-400 hover:text-white rounded"
                        title="重命名"
                      >
                        <Edit3 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setProjectToDelete(project);
                          setShowDeleteDialog(true);
                        }}
                        className="p-1 text-gray-400 hover:text-red-400 rounded"
                        title="删除"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="p-3 border-t border-gray-700 text-xs text-gray-500 flex-shrink-0">
            <p>快捷键: Ctrl+S 保存</p>
            <p>Ctrl+Z 撤销 / Ctrl+Y 重做</p>
          </div>
        </div>

        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="flex-shrink-0 p-2 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors self-start mt-2"
          title={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
        >
          {sidebarCollapsed ? (
            <PanelLeft className="w-4 h-4" />
          ) : (
            <PanelLeftClose className="w-4 h-4" />
          )}
        </button>

        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between p-2 bg-[#2A2E38] border-b border-gray-700 gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
              {currentProject && (
                <span className="text-sm text-gray-300 truncate">
                  {currentProject.name}
                  {hasUnsavedChanges && (
                    <span className="ml-2 text-orange-400">*</span>
                  )}
                </span>
              )}
              {!currentProject && (
                <span className="text-sm text-gray-500">请选择或创建项目</span>
              )}
            </div>
            
            <div className="flex items-center gap-1 flex-shrink-0">
              <div className="flex items-center gap-0.5">
                <button
                  onClick={handleUndo}
                  disabled={!canUndo}
                  className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="撤销 (Ctrl+Z)"
                >
                  <Undo2 className="w-4 h-4" />
                </button>
                <button
                  onClick={handleRedo}
                  disabled={!canRedo}
                  className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="重做 (Ctrl+Y)"
                >
                  <Redo2 className="w-4 h-4" />
                </button>
              </div>
              <div className="w-px h-4 bg-gray-600 mx-1" />
              <div className="flex items-center gap-0.5">
                <button
                  onClick={handleCopyBlocks}
                  disabled={!hasSelectedBlocks}
                  className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="复制积木"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  onClick={handlePasteBlocks}
                  disabled={!blockClipboard}
                  className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="粘贴积木"
                >
                  <Clipboard className="w-4 h-4" />
                </button>
              </div>
              <div className="w-px h-4 bg-gray-600 mx-1" />
              <div className="flex items-center gap-0.5">
                <button
                  onClick={handleZoomOut}
                  className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                  title="缩小"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="px-1 text-xs text-gray-400 min-w-[40px] text-center">
                  {Math.round(zoomLevel * 100)}%
                </span>
                <button
                  onClick={handleZoomIn}
                  className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                  title="放大"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  onClick={handleZoomReset}
                  className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                  title="重置缩放"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>
              <div className="w-px h-4 bg-gray-600 mx-1" />
              <button
                onClick={() => setPreviewMode(!previewMode)}
                className={`px-2 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1 ${
                  previewMode
                    ? 'bg-orange-500 text-white hover:bg-orange-600'
                    : 'bg-gray-600 text-white hover:bg-gray-700'
                }`}
                title="预览模式 (Ctrl+P)"
              >
                <Eye className="w-4 h-4" />
                <span className="hidden sm:inline">预览</span>
              </button>

              <button
                onClick={toggleFullscreen}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                title="全屏"
              >
                <Fullscreen className="w-4 h-4" />
              </button>
              
              <div className="w-px h-4 bg-gray-600 mx-1" />

              <button
                onClick={openHelpDialog}
                className="px-2 py-1.5 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-1"
                title="查看帮助文档"
              >
                <Layers className="w-4 h-4" />
                <span className="hidden sm:inline">帮助</span>
              </button>

              <button
                onClick={handleSaveProject}
                disabled={!currentProject || loading}
                className="px-2 py-1.5 text-sm bg-[#165DFF] text-white rounded-lg hover:bg-[#0047FF] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                title="保存 (Ctrl+S)"
              >
                <Save className="w-4 h-4" />
                <span className="hidden sm:inline">保存</span>
              </button>
              
              <button
                onClick={handleGenerateCode}
                className="px-2 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-1"
                title="生成并预览代码"
              >
                <Play className="w-4 h-4" />
                <span className="hidden sm:inline">生成</span>
              </button>

              <button
                onClick={() => setShowImportDialog(true)}
                disabled={loading}
                className="px-2 py-1.5 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                title="导入工程文件"
              >
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">导入</span>
              </button>

              <button
                onClick={handleExportProject}
                disabled={!currentProject || loading}
                className="px-2 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                title="导出工程文件"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">导出</span>
              </button>

              <button
                onClick={() => setShowUploadDialog(true)}
                disabled={!currentProject || loading}
                className="px-2 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                title="上传到机器人"
              >
                <FileCode className="w-4 h-4" />
                <span className="hidden sm:inline">上传</span>
              </button>
            </div>
          </div>

          <div className="flex-1 relative">
            <div
              ref={containerRef}
              className={`w-full h-full ${previewMode ? 'preview-mode' : ''}`}
              style={{ overflow: 'visible', touchAction: 'none' }}
            />
            
            {!currentProject && (
              <div className="absolute inset-0 bg-[#1D2129] flex flex-col items-center justify-center text-center p-8 z-50">
                <div className="w-20 h-20 bg-[#2A2E38] rounded-full flex items-center justify-center mb-6">
                  <Layers className="w-10 h-10 text-[#165DFF]" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">欢迎使用简易模式</h3>
                <p className="text-gray-400 mb-6 max-w-md">
                  您还没有打开任何项目，请从左侧选择一个项目或创建新项目开始编程
                </p>
                <button
                  onClick={() => setShowProjectDialog(true)}
                  className="px-6 py-3 bg-[#165DFF] text-white rounded-lg hover:bg-[#0047FF] transition-colors flex items-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  创建新项目
                </button>
              </div>
            )}

            {currentProject && showCodePreview && (
              <div 
                className="absolute right-0 top-0 bottom-0 bg-[#1e1e1e] border-l border-gray-700 flex flex-col z-30"
                style={{ width: codePreviewWidth }}
              >
                <div className="flex items-center justify-between p-2 border-b border-gray-700">
                    <span className="text-sm text-gray-300">生成的 Lua 代码</span>
                    <button
                      onClick={() => setShowCodePreview(false)}
                      className="p-1 text-gray-400 hover:text-white rounded"
                    >
                      <EyeOff className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <Editor
                      height="100%"
                      language="lua"
                      value={generatedCode}
                      options={{
                        readOnly: true,
                        minimap: { enabled: false },
                        fontSize: 13,
                        lineNumbers: 'on',
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                      }}
                      theme="vs-dark"
                    />
                  </div>
                </div>
            )}
            
            {!showCodePreview && (
              <button
                onClick={() => setShowCodePreview(true)}
                className="absolute right-0 top-1/2 -translate-y-1/2 p-2 bg-[#2A2E38] border border-gray-700 rounded-l-lg text-gray-400 hover:text-white hover:bg-[#165DFF] transition-colors"
                title="显示代码预览"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showProjectDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowProjectDialog(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#1D2129] rounded-xl shadow-xl max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <h3 className="text-lg font-bold text-white mb-4">新建项目</h3>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#2A2E38] border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-[#165DFF] outline-none"
                  placeholder="请输入项目名称"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateProject();
                  }}
                />
              </div>
              <div className="flex justify-end gap-3 p-4 border-t border-gray-700">
                <button
                  onClick={() => setShowProjectDialog(false)}
                  className="px-4 py-2 text-gray-400 hover:text-white rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleCreateProject}
                  disabled={!newProjectName.trim() || loading}
                  className="px-4 py-2 bg-[#165DFF] text-white rounded-lg hover:bg-[#0047FF] transition-colors disabled:opacity-50"
                >
                  创建
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showUploadDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowUploadDialog(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#1D2129] rounded-xl shadow-xl max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 space-y-4">
                <h3 className="text-lg font-bold text-white">上传插件到机器人</h3>
                
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">目标机器人</label>
                  <select
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="w-full px-3 py-2 bg-[#2A2E38] border border-gray-600 rounded-lg text-white outline-none"
                  >
                    {availableAccounts.map((account) => (
                      <option key={account.self_id} value={account.self_id}>
                        {account.nickname ? `${account.nickname}:${account.self_id}` : account.self_id}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">插件名称</label>
                  <input
                    type="text"
                    value={exportMetadata.name}
                    onChange={(e) => setExportMetadata({ ...exportMetadata, name: e.target.value })}
                    className="w-full px-3 py-2 bg-[#2A2E38] border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-[#165DFF] outline-none"
                    placeholder="插件名称"
                  />
                </div>
                
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">版本号</label>
                  <input
                    type="text"
                    value={exportMetadata.version}
                    onChange={(e) => setExportMetadata({ ...exportMetadata, version: e.target.value })}
                    className="w-full px-3 py-2 bg-[#2A2E38] border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-[#165DFF] outline-none"
                    placeholder="1.0.0"
                  />
                </div>
                
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">描述</label>
                  <textarea
                    value={exportMetadata.description}
                    onChange={(e) => setExportMetadata({ ...exportMetadata, description: e.target.value })}
                    className="w-full px-3 py-2 bg-[#2A2E38] border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-[#165DFF] outline-none resize-none"
                    rows={2}
                    placeholder="插件描述"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 p-4 border-t border-gray-700">
                <button
                  onClick={() => setShowUploadDialog(false)}
                  className="px-4 py-2 text-gray-400 hover:text-white rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleExport}
                  disabled={loading || !exportMetadata.name.trim()}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                >
                  上传
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showDeleteDialog && projectToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => {
              setShowDeleteDialog(false);
              setProjectToDelete(null);
              setDeleteConfirmStep(1);
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#1D2129] rounded-xl shadow-xl max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-full bg-red-100 text-red-600">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-white">
                    {deleteConfirmStep === 1 ? '确认删除' : '最终确认'}
                  </h3>
                </div>
                <p className="text-gray-400">
                  {deleteConfirmStep === 1
                    ? `确定要删除项目 "${projectToDelete.name}" 吗？此操作不可恢复。`
                    : `您即将永久删除 "${projectToDelete.name}"。请输入项目名称以确认。`
                  }
                </p>
                {deleteConfirmStep === 2 && (
                  <div className="mt-4">
                    <input
                      type="text"
                      value={deleteConfirmInput}
                      onChange={(e) => setDeleteConfirmInput(e.target.value)}
                      className="w-full px-3 py-2 bg-[#2A2E38] border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-red-500 outline-none"
                      placeholder={`输入 "${projectToDelete.name}"`}
                    />
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-3 p-4 border-t border-gray-700">
                <button
                  onClick={() => {
                    setShowDeleteDialog(false);
                    setProjectToDelete(null);
                    setDeleteConfirmInput('');
                    setDeleteConfirmStep(1);
                  }}
                  className="px-4 py-2 text-gray-400 hover:text-white rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleDeleteProject}
                  disabled={deleteConfirmStep === 2 && deleteConfirmInput !== projectToDelete.name}
                  className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  {deleteConfirmStep === 1 ? '继续' : '永久删除'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showRenameDialog && projectToRename && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowRenameDialog(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#1D2129] rounded-xl shadow-xl max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <h3 className="text-lg font-bold text-white mb-4">重命名项目</h3>
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="w-full px-3 py-2 bg-[#2A2E38] border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-[#165DFF] outline-none"
                  placeholder="请输入新名称"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameProject();
                  }}
                />
              </div>
              <div className="flex justify-end gap-3 p-4 border-t border-gray-700">
                <button
                  onClick={() => {
                    setShowRenameDialog(false);
                    setProjectToRename(null);
                  }}
                  className="px-4 py-2 text-gray-400 hover:text-white rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleRenameProject}
                  disabled={!renameValue.trim() || renameValue === projectToRename.name}
                  className="px-4 py-2 bg-[#165DFF] text-white rounded-lg hover:bg-[#0047FF] transition-colors disabled:opacity-50"
                >
                  确认
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showOverwriteDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowOverwriteDialog(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#1D2129] rounded-xl shadow-xl max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-full bg-yellow-100 text-yellow-600">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-white">插件已存在</h3>
                </div>
                <p className="text-gray-400">
                  机器人 <span className="text-white font-medium">{selectedAccountId}</span> 已存在名为 <span className="text-white font-medium">"{exportMetadata.name}"</span> 的插件。
                </p>
                <p className="text-gray-400 mt-2">
                  是否覆盖？此操作将删除原有插件并重新上传。
                </p>
              </div>
              <div className="flex justify-end gap-3 p-4 border-t border-gray-700">
                <button
                  onClick={() => setShowOverwriteDialog(false)}
                  className="px-4 py-2 text-gray-400 hover:text-white rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={() => handleExport(true)}
                  disabled={loading}
                  className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors disabled:opacity-50"
                >
                  覆盖上传
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showImportDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowImportDialog(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#1D2129] rounded-xl shadow-xl max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-full bg-orange-100 text-orange-600">
                    <Upload className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-white">导入项目</h3>
                </div>
                <p className="text-gray-400 mb-4">
                  选择 .blockly.json 文件导入项目
                </p>
                <input
                  type="file"
                  accept=".blockly.json,.json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleImport(file);
                    }
                  }}
                  className="w-full text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-orange-600 file:text-white file:hover:bg-orange-700 file:transition-colors"
                />
              </div>
              <div className="flex justify-end gap-3 p-4 border-t border-gray-700">
                <button
                  onClick={() => setShowImportDialog(false)}
                  className="px-4 py-2 text-gray-400 hover:text-white rounded-lg transition-colors"
                >
                  取消
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showHelpDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowHelpDialog(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#1D2129] rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-[#165DFF]" />
                  {helpTitle}
                </h3>
                <button
                  onClick={() => setShowHelpDialog(false)}
                  className="p-1 text-gray-400 hover:text-white rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 overflow-auto flex-1">
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({ children }) => <h1 className="text-2xl font-bold text-white mb-4 mt-6 first:mt-0">{children}</h1>,
                      h2: ({ children }) => <h2 className="text-xl font-bold text-white mb-3 mt-5">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-lg font-bold text-white mb-2 mt-4">{children}</h3>,
                      p: ({ children }) => <p className="text-gray-300 mb-3 leading-relaxed">{children}</p>,
                      ul: ({ children }) => <ul className="list-disc list-inside text-gray-300 mb-3 space-y-1">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal list-inside text-gray-300 mb-3 space-y-1">{children}</ol>,
                      li: ({ children }) => <li className="text-gray-300">{children}</li>,
                      code: ({ children, className }) => {
                        const isInline = !className;
                        return isInline ? (
                          <code className="bg-gray-700 text-gray-200 px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>
                        ) : (
                          <pre className="bg-gray-800 text-gray-200 p-3 rounded-lg overflow-x-auto mb-3">
                            <code className="text-sm font-mono">{children}</code>
                          </pre>
                        );
                      },
                      table: ({ children }) => <table className="w-full border-collapse mb-4 text-sm">{children}</table>,
                      thead: ({ children }) => <thead className="bg-gray-700">{children}</thead>,
                      tbody: ({ children }) => <tbody>{children}</tbody>,
                      tr: ({ children }) => <tr className="border-b border-gray-700">{children}</tr>,
                      th: ({ children }) => <th className="text-left text-white font-semibold p-2">{children}</th>,
                      td: ({ children }) => <td className="text-gray-300 p-2">{children}</td>,
                      blockquote: ({ children }) => <blockquote className="border-l-4 border-[#165DFF] pl-4 italic text-gray-400 mb-3">{children}</blockquote>,
                      hr: () => <hr className="border-gray-700 my-4" />,
                      strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
                      em: ({ children }) => <em className="text-gray-300 italic">{children}</em>,
                    }}
                  >
                    {helpContent}
                  </ReactMarkdown>
                </div>
              </div>
              <div className="p-4 border-t border-gray-700 flex justify-end">
                <button
                  onClick={() => setShowHelpDialog(false)}
                  className="px-4 py-2 bg-[#165DFF] text-white rounded-lg hover:bg-[#0047FF] transition-colors"
                >
                  关闭
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* 多行编辑器对话框 */}
        {showMultilineEditor && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={handleCancelMultilineEditor}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#1D2129] rounded-xl shadow-xl max-w-5xl w-full h-[85vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <FileCode className="w-5 h-5 text-[#165DFF]" />
                  编辑代码
                </h3>
                <button
                  onClick={handleCancelMultilineEditor}
                  className="p-1 text-gray-400 hover:text-white rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-hidden" style={{ minHeight: '500px' }}>
                <Editor
                  height="100%"
                  defaultLanguage={multilineEditorLanguage}
                  value={multilineEditorValue}
                  onChange={(value) => setMultilineEditorValue(value || '')}
                  theme="vs-dark"
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    lineNumbers: 'on',
                    wordWrap: 'on',
                    automaticLayout: true,
                  }}
                />
              </div>
              <div className="p-4 border-t border-gray-700 flex justify-end gap-3">
                <Button
                  variant="secondary"
                  onClick={handleCancelMultilineEditor}
                >
                  取消
                </Button>
                <Button
                  onClick={handleSaveMultilineEditor}
                >
                  确定
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BlocklyEditor;

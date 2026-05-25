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
  Clipboard,
  Search,
  RefreshCw
} from 'lucide-react';
import { getToolboxCategories, fetchBlockConfig, getApiToolbox, reinitializeBlocks, clearConfigCache, getBlockMessageMap } from './blocks';
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
  
  const [configLoading, setConfigLoading] = useState(false);
  const [configReady, setConfigReady] = useState(false);
  
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

  // 添加复制成功后的清理机制（可选，用户可能需要多次粘贴）
  // 但可以在复制新内容时清理旧内容

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
# Blockly 积木编程完全指南（超详细版）

> 本文档专为 QQ 机器人插件开发设计，基于 Google Blockly 可视化编程框架  
> 版本：v1.0.0 | 最后更新：2026-04-15

---

## 📑 目录

1. [Blockly 简介](#一-blockly-简介)
2. [核心概念与架构](#二-核心概念与架构)
3. [积木类型详解](#三-积木类型详解)
4. [完整积木分类参考](#四-完整积木分类参考)
5. [代码生成机制](#五-代码生成机制)
6. [实战示例详解](#六-实战示例详解)
7. [高级功能与技巧](#七-高级功能与技巧)
8. [常见问题与排错](#八-常见问题与排错)
9. [最佳实践指南](#九-最佳实践指南)
10. [API 参考手册](#十-api-参考手册)
11. [附录](#十一-附录)

---

## 一、Blockly 简介

### 1.1 什么是 Blockly？

**Blockly** 是 Google 开发的一款开源可视化编程框架，于 2012 年发布。它将传统的文本代码转换为可拖拽的积木块，让编程变得直观易懂，特别适合：

- 🎓 **教育领域**：帮助初学者理解编程概念
- 🏢 **企业应用**：快速构建业务逻辑
- 🤖 **机器人编程**：简化复杂的控制逻辑
- 👶 **儿童编程**：降低编程入门门槛

### 1.2 核心特性

| 特性 | 说明 | 优势 | 在本项目中的应用 |
|------|------|------|-----------------|
| 🧩 **可视化编程** | 拖拽积木块拼接程序 | 零门槛入门，无需记忆语法 | 通过拖拽完成机器人逻辑 |
| ✅ **类型安全** | 不匹配的积木无法连接 | 编译前发现错误，避免运行时异常 | 防止错误的数据类型传递 |
| 🔄 **多语言生成** | 支持生成 Lua/Python/JS/PHP 等 | 一份积木，多平台运行 | 生成 Lua 代码供机器人执行 |
| 🎨 **高度可定制** | 支持自定义积木、主题、渲染器 | 适应不同业务场景 | 定制 QQ 机器人专用积木 |
| ♿ **无障碍支持** | 支持屏幕阅读器和键盘导航 | 包容性强 | 支持更多用户使用 |
| 🌍 **多语言支持** | 内置 50+ 语言本地化 | 全球化部署 | 完整的中文界面 |

### 1.3 在本项目中的架构

\`\`\`
┌─────────────────────────────────────────────────────────────────────────────┐
│                              用户界面层 (React)                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │   工具箱         │  │    工作区        │  │   代码预览       │             │
│  │  (Toolbox)      │  │  (Workspace)    │  │ (Code Preview)  │             │
│  │                 │  │                 │  │                 │             │
│  │ • 分类展示积木   │  │ • 拖拽编辑区     │  │ • 实时 Lua 代码 │             │
│  │ • 搜索功能      │  │ • 缩放/平移      │  │ • 语法高亮      │             │
│  │ • 快速开始      │  │ • 右键菜单       │  │ • 代码导出      │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
├─────────────────────────────────────────────────────────────────────────────┤
│                              Blockly 核心层                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │   积木定义       │  │    代码生成器     │  │   序列化        │             │
│  │  (Block Defs)   │  │  (Generator)    │  │ (Serializer)    │             │
│  │                 │  │                 │  │                 │             │
│  │ • 200+ 自定义积木│  │ • Lua 代码生成   │  │ • XML 存储      │             │
│  │ • 积木形状定义   │  │ • 代码优化       │  │ • JSON 配置     │             │
│  │ • 输入/输出类型  │  │ • 错误检查       │  │ • 导入/导出     │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
├─────────────────────────────────────────────────────────────────────────────┤
│                              业务逻辑层                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │   项目管理       │  │    插件导出       │  │   事件系统       │             │
│  │ (Project Mgr)   │  │ (Plugin Export) │  │  (Event System) │             │
│  │                 │  │                 │  │                 │             │
│  │ • 创建/保存/加载 │  │ • 生成插件包     │  │ • 消息事件      │             │
│  │ • 重命名/删除   │  │ • 上传到机器人   │  │ • 通知事件      │             │
│  │ • 导入/导出     │  │ • 版本管理       │  │ • 请求事件      │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
└─────────────────────────────────────────────────────────────────────────────┘
\`\`\`

### 1.4 技术栈

| 层级 | 技术 | 版本 | 用途 |
|------|------|------|------|
| 前端框架 | React | 18.x | UI 组件构建 |
| 可视化引擎 | Blockly | 11.x | 积木编程核心 |
| 代码编辑器 | Monaco Editor | 最新 | Lua 代码预览 |
| 样式方案 | Tailwind CSS | 3.x | UI 样式 |
| 动画库 | Framer Motion | 11.x | 交互动画 |
| 状态管理 | Zustand | 4.x | 全局状态 |
| 构建工具 | Vite | 5.x | 项目构建 |

---

## 二、核心概念与架构

### 2.1 工作区（Workspace）

工作区是 Blockly 的核心区域，所有编程操作都在此完成。

#### 2.1.1 工作区配置

\`\`\`javascript
{
  // 网格配置
  grid: {
    spacing: 20,        // 网格间距（像素）
    length: 3,          // 网格线长度
    colour: \'#444\',     // 网格颜色
    snap: true          // 是否吸附到网格
  },
  
  // 缩放配置
  zoom: {
    controls: false,    // 是否显示缩放控件
    wheel: true,        // 是否允许滚轮缩放
    startScale: 1.0,    // 初始缩放比例
    maxScale: 3,        // 最大缩放
    minScale: 0.3,      // 最小缩放
    scaleSpeed: 1.2     // 缩放速度
  },
  
  // 移动配置
  move: {
    scrollbars: true,   // 是否显示滚动条
    drag: true,         // 是否允许拖拽
    wheel: true         // 是否允许滚轮移动
  },
  
  // 其他配置
  trashcan: true,       // 显示垃圾桶
  sounds: false,        // 关闭音效
  renderer: \'zelos\'     // 使用 Zelos 渲染器
}
\`\`\`

#### 2.1.2 工作区操作

| 操作 | 方式 | 说明 |
|------|------|------|
| 移动积木 | 左键拖拽 | 拖拽积木到工作区任意位置 |
| 连接积木 | 拖拽对接 | 将积木靠近可连接位置自动吸附 |
| 断开积木 | 拖拽分离 | 将积木拖离连接位置 |
| 删除积木 | 拖入垃圾桶/Del键 | 移除不需要的积木 |
| 移动视角 | 右键长按拖拽 | 平移整个工作区 |
| 缩放视角 | 滚轮 | 放大/缩小工作区 |
| 选中积木 | 左键单击 | 选中单个积木 |
| 多选积木 | Ctrl + 单击 | 选中多个积木 |

### 2.2 积木（Block）

积木是 Blockly 的基本编程单元，每个积木代表一个特定的功能或操作。

#### 2.2.1 积木的组成部分

\`\`\`
┌─────────────────────────────────────┐
│  🎨 颜色区域（标识分类）              │
├─────────────────────────────────────┤
│  📛 标签文字（功能说明）               │
│                                     │
│  [输入框1]  [下拉选择]  [输入框2]     │  ← 🔲 输入区域
│                                     │
│  (嵌套积木槽位)                      │  ← 🔳 语句输入槽
│                                     │
├─────────────────────────────────────┤
│  💡 提示图标（鼠标悬停显示帮助）       │
└─────────────────────────────────────┘
\`\`\`

#### 2.2.2 积木形状详解

##### 🎩 事件积木（Hat Block）

\`\`\`
     ╭─────────────╮
    ╱   当收到消息时  ╲      ← 顶部圆弧（帽子形状）
   │   存储到变量 [msg]  │
    ╲_________________╱
            │
            ▼           ← 底部凹槽（连接下一个积木）
\`\`\`

**特征：**
- 顶部为圆弧形，不可连接其他积木
- 底部有凹槽，可连接语句积木
- 代表程序的入口点

**用途：**
- 事件监听（收到消息、收到通知等）
- 程序初始化（插件启动时）
- 生命周期管理（插件卸载时）

**示例积木：**
- \`当收到消息时\`
- \`当收到通知时\`
- \`插件初始化时\`
- \`插件卸载时\`

##### 🧩 语句积木（Statement Block）

\`\`\`
            ▲
            │              ← 顶部凸起（连接上一个积木）
   ┌─────────────┐
   │   发送群消息   │
   │  群号：[    ]  │
   │  内容：[    ]  │
   └─────────────┘
            │
            ▼              ← 底部凹槽（连接下一个积木）
\`\`\`

**特征：**
- 顶部有凸起，可连接其他积木的底部
- 底部有凹槽，可被其他积木连接
- 执行具体的动作或操作

**用途：**
- 执行操作（发送消息、设置变量）
- 控制流程（条件分支、循环）
- 调用函数（日志输出、HTTP请求）

**示例积木：**
- \`发送群消息\`
- \`设置变量\`
- \`如果...则...否则\`
- \`日志输出\`

##### 🔵 值积木（Value Block）

\`\`\`
  ( 获取消息的发送者ID )     ← 左右圆形接口
        ╱         ╲
       ╱           ╲
\`\`\`

**特征：**
- 左右为圆形接口
- 必须嵌入到其他积木的输入框中
- 返回一个具体的值

**用途：**
- 获取数据（消息内容、用户ID）
- 提供值（文本、数字、布尔值）
- 计算结果（数学运算、文本处理）

**示例积木：**
- \`获取消息的发送者ID\`
- \`文本\`积木
- \`数字\`积木
- \`加法\`积木

##### 🔷 Reporter Block（报告器积木）

值积木的一种特殊形式，可以独立存在并显示值。

\`\`\`
  [ 变量：计数器 ]  →  显示当前值：10
\`\`\`

### 2.3 连接系统

Blockly 的连接系统确保积木只能以正确的方式连接。

#### 2.3.1 连接类型

| 连接类型 | 形状 | 用途 | 示例 |
|---------|------|------|------|
| **Previous/Next** | 拼图凹凸 | 语句顺序连接 | 语句积木的上下连接 |
| **Input/Output** | 圆形 | 值传递 | 值积木嵌入输入框 |
| **Statement Input** | 凹槽 | 嵌套语句块 | 条件、循环内部 |

#### 2.3.2 类型检查（Type Checking）

Blockly 支持对连接进行类型检查，确保数据类型匹配。

\`\`\`
输入框类型：
┌────────────────────────────────────────┐
│  发送私聊消息                            │
│  用户：[ 数字输入 ]  ← 只接受数字类型      │
│  内容：[ 字符串输入 ] ← 只接受字符串类型   │
└────────────────────────────────────────┘
\`\`\`

**支持的类型：**
- \`String\` - 字符串
- \`Number\` - 数字
- \`Boolean\` - 布尔值
- \`Array\` - 数组
- \`Object\` - 对象
- \`Message\` - 消息对象
- \`Event\` - 事件对象
- \`null\` - 无类型限制

### 2.4 数据类型系统

#### 2.4.1 基本数据类型

| 类型 | Lua 表示 | 示例 | 说明 |
|------|---------|------|------|
| **字符串** | \`string\` | \`\"Hello\"\` | 用双引号包裹的文本 |
| **数字** | \`number\` | \`123\`, \`3.14\` | 整数或浮点数 |
| **布尔值** | \`boolean\` | \`true\`, \`false\` | 真或假 |
| **空值** | \`nil\` | \`nil\` | 表示无值 |
| **表** | \`table\` | \`{a=1, b=2}\` | 键值对集合 |
| **数组** | \`table\` | \`{1, 2, 3}\` | 有序列表（Lua 中也是 table）|
| **函数** | \`function\` | \`function() end\` | 可执行代码块 |

#### 2.4.2 复合数据类型

**消息对象（Message）结构：**
\`\`\`lua
{
  message_id = \"1234567890\",
  message_type = \"group\",  -- 或 \"private\"
  user_id = 123456789,
  group_id = 987654321,    -- 群消息才有
  raw_message = \"你好\",
  sender = {
    nickname = \"小明\",
    card = \"群名片\",
    role = \"member\"  -- admin/owner/member
  },
  time = 1678886400
}
\`\`\`

**事件对象（Event）结构：**
\`\`\`lua
{
  notice_type = \"group_increase\",
  group_id = 987654321,
  user_id = 123456789,
  operator_id = 111222333
}
\`\`\`

#### 2.4.3 类型转换

| 转换积木 | 输入 | 输出 | 说明 |
|---------|------|------|------|
| \`转为字符串\` | 任意 | String | 将任何值转为文本 |
| \`转为数字\` | String | Number | 解析字符串为数字 |
| \`将表转为JSON字符串\` | Object | String | 序列化为 JSON |
| \`解析JSON\` | String | Object | 解析 JSON 字符串 |

### 2.5 工具箱（Toolbox）

工具箱是存放所有可用积木的侧边栏。

#### 2.5.1 工具箱结构

\`\`\`
┌─────────────────────────────────────┐
│ 🔍 搜索积木...                       │
├─────────────────────────────────────┤
│ ⭐ 快速开始     ▼                    │
├─────────────────────────────────────┤
│ 📂 事件         ▶                    │
│ 📂 消息         ▶                    │
│ 📂 群组         ▶                    │
│ 📂 用户         ▶                    │
│ 📂 数据         ▶                    │
│ 📂 逻辑         ▶                    │
│ 📂 循环         ▶                    │
│ 📂 文本         ▶                    │
│ 📂 数学         ▶                    │
│ 📂 列表         ▶                    │
│ 📂 网络请求      ▶                   │
│ 📂 文件         ▶                    │
│ 📂 时间         ▶                    │
│ 📂 日志         ▶                    │
│ 📂 编码工具      ▶                   │
│ 📂 系统         ▶                    │
│ 📂 高级         ▶                    │
└─────────────────────────────────────┘
\`\`\`

#### 2.5.2 工具箱分类样式

每个分类都有独特的颜色和图标：

| 分类 | 颜色 | 样式名称 | 说明 |
|------|------|---------|------|
| 快速开始 | 🟠 橙色 | \`popular_category\` | 常用积木快捷入口 |
| 事件 | 🟢 浅绿 | \`event_category\` | 程序入口点 |
| 消息 | 🔵 蓝色 | \`message_category\` | 消息处理 |
| 群组 | 🔵 深蓝 | \`group_category\` | 群管理功能 |
| 用户 | 🟣 紫色 | \`user_category\` | 好友管理 |
| 数据 | 🔴 红色 | \`data_category\` | 变量和存储 |
| 逻辑 | 🟡 黄色 | \`logic_category\` | 条件判断 |
| 循环 | 🟡 金黄 | \`loop_category\` | 循环控制 |
| 文本 | 🩵 青色 | \`text_category\` | 字符串处理 |
| 数学 | 🔵 天蓝 | \`math_category\` | 数值计算 |
| 列表 | 🟣 紫红 | \`list_category\` | 数组操作 |
| 网络请求 | 🟤 金黄 | \`http_category\` | HTTP 请求 |
| 文件 | 🟠 橙红 | \`file_category\` | 文件操作 |
| 时间 | 🩷 粉色 | \`time_category\` | 时间处理 |
| 日志 | ⚪ 灰色 | \`log_category\` | 日志输出 |
| 编码工具 | ⚫ 深灰 | \`utils_category\` | 编码转换 |
| 系统 | 🩷 玫红 | \`system_category\` | 系统功能 |
| 高级 | ⚫ 黑色 | \`advanced_category\` | 高级功能 |

---

## 三、积木类型详解

### 3.1 事件积木（Event Blocks）

事件积木是程序的入口点，当特定事件发生时自动触发。

#### 3.1.1 消息事件

##### \`当收到消息时\`

**积木类型：** \`event_on_message\`

**形状：** 🎩 帽子形状

**参数：**
| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| 变量名 | String | 否 | \`event\` | 存储消息对象的变量名 |

**生成的 Lua 代码：**
\`\`\`lua
on_message(function(event)
  -- 用户拼接的积木会生成在这里
end)
\`\`\`

**使用示例：**
\`\`\`
当收到消息时 存储到变量 [msg]
  ↓
  日志 (信息, \"收到消息\")
  发送私聊消息 
      用户：获取消息 [msg] 的发送者ID 
      内容：\"收到你的消息了！\"
\`\`\`

**触发时机：**
- 收到私聊消息
- 收到群消息
- 收到频道消息

**注意事项：**
- 所有消息处理逻辑都应该放在这个积木内部
- 可以通过消息类型判断是群消息还是私聊

---

##### \`当收到通知时\`

**积木类型：** \`event_on_notice\`

**形状：** 🎩 帽子形状

**参数：**
| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| 变量名 | String | 否 | \`event\` | 存储通知对象的变量名 |

**生成的 Lua 代码：**
\`\`\`lua
on_notice(function(event)
  -- 处理通知事件
end)
\`\`\`

**触发时机：**
- 群成员增加/减少
- 群管理员变动
- 群成员被禁言
- 消息被撤回
- 等等...

**通知类型判断：**
\`\`\`
当收到通知时 存储到变量 [notice]
  ↓
  如果 获取通知 [notice] 的 [通知类型] = \"group_increase\"
    发送群消息 \"欢迎新人入群！\"
\`\`\`

---

##### \`当收到请求时\`

**积木类型：** \`event_on_request\`

**形状：** 🎩 帽子形状

**参数：**
| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| 变量名 | String | 否 | \`event\` | 存储请求对象的变量名 |

**生成的 Lua 代码：**
\`\`\`lua
on_request(function(event)
  -- 处理请求事件
end)
\`\`\`

**触发时机：**
- 收到好友申请
- 收到群邀请
- 收到加群申请

**使用示例：**
\`\`\`
当收到请求时 存储到变量 [request]
  ↓
  如果 获取请求 [request] 的 [请求类型] = \"friend\"
    同意好友申请 请求：[request]
\`\`\`

---

#### 3.1.2 生命周期事件

##### \`插件初始化时\`

**积木类型：** \`event_on_init\`

**形状：** 🎩 帽子形状

**生成的 Lua 代码：**
\`\`\`lua
function on_init()
  -- 初始化代码
end
\`\`\`

**用途：**
- 加载配置文件
- 初始化数据库
- 设置定时任务
- 注册自定义命令

**使用示例：**
\`\`\`
插件初始化时
  ↓
  日志 (信息, \"插件启动成功\")
  保存到存储 键：[\"start_time\"] 值：(获取当前时间戳)
\`\`\`

---

##### \`插件卸载时\`

**积木类型：** \`event_on_destroy\`

**形状：** 🎩 帽子形状

**生成的 Lua 代码：**
\`\`\`lua
function on_destroy()
  -- 清理代码
end
\`\`\`

**用途：**
- 保存数据到文件
- 清理临时文件
- 取消定时任务
- 释放资源

---

#### 3.1.3 群事件

| 积木名称 | 类型 | 触发时机 |
|---------|------|---------|
| \`当群管理员变动时\` | \`event_on_group_admin\` | 设置/取消管理员 |
| \`当群成员增加时\` | \`event_on_group_member_increase\` | 有人进群 |
| \`当群成员减少时\` | \`event_on_group_member_decrease\` | 有人退群/被踢 |
| \`当群成员被禁言时\` | \`event_on_group_ban\` | 禁言/解除禁言 |
| \`当群消息被撤回时\` | \`event_on_group_recall\` | 消息撤回 |
| \`当群名片变动时\` | \`event_on_group_card\` | 修改群名片 |
| \`当群头衔变动时\` | \`event_on_group_title\` | 设置专属头衔 |
| \`当群消息被表情回应时\` | \`event_on_group_msg_emoji_like\` | 表情回应消息 |
| \`当群文件上传时\` | \`event_on_group_upload\` | 上传群文件 |
| \`当收到群请求时\` | \`event_on_group_request\` | 加群申请 |

---

#### 3.1.4 好友事件

| 积木名称 | 类型 | 触发时机 |
|---------|------|---------|
| \`当好友消息被撤回时\` | \`event_on_friend_recall\` | 私聊消息撤回 |
| \`当添加好友时\` | \`event_on_friend_add\` | 成功添加好友 |
| \`当收到好友请求时\` | \`event_on_friend_request\` | 收到好友申请 |

---

#### 3.1.5 互动事件

| 积木名称 | 类型 | 触发时机 |
|---------|------|---------|
| \`当被戳一戳时\` | \`event_on_poke\` | 收到戳一戳 |
| \`当消息被设为精华时\` | \`event_on_essence\` | 设置/取消精华消息 |

---

### 3.2 消息处理积木（Message Blocks）

#### 3.2.1 读取消息信息

##### \`获取消息的 [字段]\`

**积木类型：** \`msg_get_simple_field\`

**形状：** 🔵 值积木

**参数：**
| 参数名 | 类型 | 必填 | 可选值 |
|--------|------|------|--------|
| 消息 | Message | 是 | - |
| 字段 | 下拉选择 | 是 | 见下表 |

**可选字段：**
| 字段名 | 返回值类型 | 说明 |
|--------|-----------|------|
| 消息类型 | String | \`group\` 或 \`private\` |
| 发送者ID | Number | 发送者的 QQ 号 |
| 群ID | Number | 群号（群消息才有） |
| 消息ID | String/Number | 消息唯一标识 |
| 原始消息内容 | String | 包含 CQ 码的原始内容 |
| 发送者昵称 | String | 发送者的昵称 |
| 发送者群名片 | String | 群名片（群消息才有） |
| 发送者角色 | String | \`owner\`/\`admin\`/\`member\` |
| 消息时间 | Number | 时间戳（秒） |

**生成的 Lua 代码：**
\`\`\`lua
msg.message_type    -- 消息类型
msg.user_id         -- 发送者ID
msg.group_id        -- 群ID
msg.message_id      -- 消息ID
msg.raw_message     -- 原始内容
msg.sender.nickname -- 发送者昵称
msg.sender.card     -- 群名片
msg.sender.role     -- 角色
msg.time            -- 时间戳
\`\`\`

**使用示例：**
\`\`\`
当收到消息时 存储到变量 [msg]
  ↓
  设置 [sender] 为 获取消息 [msg] 的 [发送者ID]
  设置 [nickname] 为 获取消息 [msg] 的 [发送者昵称]
  日志 (信息, 连接文本 [nickname] 和 \" 说：\" 和 获取消息 [msg] 的 [原始消息内容])
\`\`\`

---

##### \`获取消息的纯文本内容\`

**积木类型：** \`msg_get_text_content\`

**形状：** 🔵 值积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 消息 | Message | 是 | 消息对象 |

**返回值：** String - 去掉 CQ 码的纯文本内容

**生成的 Lua 代码：**
\`\`\`lua
msg.get_plain_text(msg)
\`\`\`

**示例：**
\`\`\`
输入： \"你好 [CQ:at,qq=123] 世界\"
输出： \"你好  世界\"
\`\`\`

---

##### \`获取消息中的所有图片\`

**积木类型：** \`msg_get_images\`

**形状：** 🔵 值积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 消息 | Message | 是 | 消息对象 |

**返回值：** Array - 图片 URL 数组

**生成的 Lua 代码：**
\`\`\`lua
msg.get_images(msg)
\`\`\`

**使用示例：**
\`\`\`
设置 [images] 为 获取消息 [msg] 中的所有图片
如果 列表 [images] 的长度 > 0
  日志 (信息, 连接文本 \"消息中有 \" 和 列表 [images] 的长度 和 \" 张图片\")
\`\`\`

---

##### \`获取消息中的@用户列表\`

**积木类型：** \`msg_get_at_users\`

**形状：** 🔵 值积木

**返回值：** Array - 被@的用户 QQ 号数组

**生成的 Lua 代码：**
\`\`\`lua
msg.get_at_users(msg)
\`\`\`

---

#### 3.2.2 消息判断

##### \`消息包含文字 [文本]\`

**积木类型：** \`msg_contains_text\`

**形状：** 🔵 值积木（返回布尔值）

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 消息 | Message | 是 | 消息对象 |
| 文本 | String | 是 | 要查找的文本 |

**返回值：** Boolean - 是否包含指定文本

**生成的 Lua 代码：**
\`\`\`lua
msg.contains_keyword(msg, \"要查找的文本\")
\`\`\`

**使用示例：**
\`\`\`
当收到消息时 存储到变量 [msg]
  ↓
  如果 消息 [msg] 包含文字 \"签到\"
    发送私聊消息 用户：(获取消息 [msg] 的发送者ID) 内容：\"签到成功！\"
\`\`\`

---

##### \`消息是群消息\`

**积木类型：** \`msg_is_group\`

**形状：** 🔵 值积木（返回布尔值）

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 消息 | Message | 是 | 消息对象 |

**返回值：** Boolean

**生成的 Lua 代码：**
\`\`\`lua
msg.is_group_message(msg)
-- 或
msg.message_type == \"group\"
\`\`\`

---

##### \`消息是私聊消息\`

**积木类型：** \`msg_is_private\`

**形状：** 🔵 值积木（返回布尔值）

**生成的 Lua 代码：**
\`\`\`lua
msg.message_type == \"private\"
\`\`\`

---

##### \`消息@了机器人\`

**积木类型：** \`msg_is_at_bot\`

**形状：** 🔵 值积木（返回布尔值）

**返回值：** Boolean - 消息中是否@了机器人

**生成的 Lua 代码：**
\`\`\`lua
msg.is_at_bot(msg)
\`\`\`

**使用示例：**
\`\`\`
当收到消息时 存储到变量 [msg]
  ↓
  如果 消息 [msg] @了机器人
    发送群消息 群：(获取消息 [msg] 的群ID) 内容：\"你@我干嘛？\"
\`\`\`

---

##### \`消息包含图片\`

**积木类型：** \`msg_has_image\`

**形状：** 🔵 值积木（返回布尔值）

**返回值：** Boolean

**生成的 Lua 代码：**
\`\`\`lua
msg.has_image(msg)
\`\`\`

---

#### 3.2.3 发送消息

##### \`发送群消息\`

**积木类型：** \`message_send_group\`

**形状：** 🧩 语句积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 群号 | Number | 是 | 目标群号 |
| 内容 | String | 是 | 消息内容 |

**生成的 Lua 代码：**
\`\`\`lua
message.send_group(群号, \"消息内容\")
\`\`\`

**使用示例：**
\`\`\`
发送群消息 
    群号：123456789 
    内容：\"大家好！\"
\`\`\`

**注意事项：**
- 机器人需要在目标群中
- 可能触发频率限制
- 支持 CQ 码（如 \`[CQ:at,qq=all]\`）

---

##### \`发送私聊消息\`

**积木类型：** \`message_send_private\`

**形状：** 🧩 语句积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 用户 | Number | 是 | 目标 QQ 号 |
| 内容 | String | 是 | 消息内容 |

**生成的 Lua 代码：**
\`\`\`lua
message.send_private(QQ号, \"消息内容\")
\`\`\`

---

##### \`回复群消息\`

**积木类型：** \`message_reply_group\`

**形状：** 🧩 语句积木

**参数：**
| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| 群 | Number | 是 | - | 群号 |
| 引用消息ID | Number | 否 | 0 | 要引用的消息ID |
| 内容 | String | 是 | - | 回复内容 |

**生成的 Lua 代码：**
\`\`\`lua
message.reply_group(群号, 消息ID, \"回复内容\")
\`\`\`

**使用示例：**
\`\`\`
当收到消息时 存储到变量 [msg]
  ↓
  回复群消息 
      群：(获取消息 [msg] 的群ID) 
      引用消息ID：(获取消息 [msg] 的消息ID) 
      内容：\"收到你的消息了！\"
\`\`\`

**说明：**
- 引用消息ID 填 0 表示不引用，直接发送新消息
- 引用后消息会显示为\"回复某条消息\"的样式

---

#### 3.2.4 消息管理

##### \`撤回消息\`

**积木类型：** \`message_delete\`

**形状：** 🧩 语句积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 消息ID | Number/String | 是 | 要撤回的消息ID |

**生成的 Lua 代码：**
\`\`\`lua
onebot.delete_msg(消息ID)
\`\`\`

**权限要求：**
- 可以撤回自己发送的消息
- 管理员可以撤回群成员的消息

---

##### \`设置精华消息\`

**积木类型：** \`message_set_essence\`

**形状：** 🧩 语句积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 群号 | Number | 是 | 群号 |
| 消息ID | Number/String | 是 | 消息ID |

**生成的 Lua 代码：**
\`\`\`lua
onebot.set_essence_msg(群号, 消息ID)
\`\`\`

---

### 3.3 群组管理积木（Group Blocks）

#### 3.3.1 群信息获取

##### \`获取群列表\`

**积木类型：** \`group_get_list\`

**形状：** 🔵 值积木

**返回值：** Array - 群信息数组

**生成的 Lua 代码：**
\`\`\`lua
group.get_list()
\`\`\`

**返回数据结构：**
\`\`\`lua
{
  {group_id = 123, group_name = \"群名称\"},
  {group_id = 456, group_name = \"另一个群\"}
}
\`\`\`

---

##### \`获取群成员列表\`

**积木类型：** \`group_get_members\`

**形状：** 🔵 值积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 群号 | Number | 是 | 群号 |

**返回值：** Array - 成员信息数组

**生成的 Lua 代码：**
\`\`\`lua
group.get_members(群号)
\`\`\`

---

#### 3.3.2 成员管理

##### \`禁言群成员\`

**积木类型：** \`group_set_ban\`

**形状：** 🧩 语句积木

**参数：**
| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| 群号 | Number | 是 | - | 群号 |
| 用户 | Number | 是 | - | 要禁言的 QQ 号 |
| 时长 | Number | 是 | - | 禁言时长（秒） |

**生成的 Lua 代码：**
\`\`\`lua
group.set_ban(群号, QQ号, 时长)
\`\`\`

**使用示例：**
\`\`\`
禁言群成员
    群号：123456789
    用户：987654321
    时长：3600  -- 禁言1小时
\`\`\`

**特殊值：**
- 时长 = 0：解除禁言
- 时长 = -1：永久禁言

**权限要求：** 需要管理员权限

---

##### \`踢出群成员\`

**积木类型：** \`group_kick\`

**形状：** 🧩 语句积木

**参数：**
| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| 群号 | Number | 是 | - | 群号 |
| 用户 | Number | 是 | - | 要踢出的 QQ 号 |
| 拒绝再加群 | Boolean | 否 | false | 是否拒绝再次加群 |

**生成的 Lua 代码：**
\`\`\`lua
group.kick(群号, QQ号, 是否拒绝再加群)
\`\`\`

**权限要求：** 需要管理员权限

---

##### \`设置群成员名片\`

**积木类型：** \`group_set_card\`

**形状：** 🧩 语句积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 群号 | Number | 是 | 群号 |
| 用户 | Number | 是 | QQ 号 |
| 名片 | String | 是 | 新的群名片 |

**生成的 Lua 代码：**
\`\`\`lua
group.set_card(群号, QQ号, \"新名片\")
\`\`\`

---

##### \`设置群管理员\`

**积木类型：** \`group_set_admin\`

**形状：** 🧩 语句积木

**参数：**
| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| 群号 | Number | 是 | - | 群号 |
| 用户 | Number | 是 | - | QQ 号 |
| 设置为管理员 | Boolean | 是 | true | true=设置, false=取消 |

**生成的 Lua 代码：**
\`\`\`lua
group.set_admin(群号, QQ号, true)
\`\`\`

**权限要求：** 需要群主权限

---

##### \`群戳一戳\`

**积木类型：** \`group_poke\`

**形状：** 🧩 语句积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 群号 | Number | 是 | 群号 |
| 用户 | Number | 是 | 要戳的 QQ 号 |

**生成的 Lua 代码：**
\`\`\`lua
group.poke(群号, QQ号)
\`\`\`

---

#### 3.3.3 群设置

##### \`设置群全员禁言\`

**积木类型：** \`group_set_whole_ban\`

**形状：** 🧩 语句积木

**参数：**
| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| 群号 | Number | 是 | - | 群号 |
| 开启 | Boolean | 是 | true | true=开启禁言, false=关闭 |

**生成的 Lua 代码：**
\`\`\`lua
group.set_whole_ban(群号, true)
\`\`\`

**权限要求：** 需要管理员权限

---

##### \`设置群名称\`

**积木类型：** \`group_set_name\`

**形状：** 🧩 语句积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 群号 | Number | 是 | 群号 |
| 名称 | String | 是 | 新群名 |

**生成的 Lua 代码：**
\`\`\`lua
group.set_name(群号, \"新群名\")
\`\`\`

**权限要求：** 需要管理员权限

---

### 3.4 用户管理积木（User Blocks）

#### 3.4.1 好友管理

##### \`获取好友列表\`

**积木类型：** \`user_get_friends\`

**形状：** 🔵 值积木

**返回值：** Array - 好友信息数组

**生成的 Lua 代码：**
\`\`\`lua
user.get_friends()
\`\`\`

---

##### \`设置好友备注\`

**积木类型：** \`user_set_remark\`

**形状：** 🧩 语句积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 用户 | Number | 是 | QQ 号 |
| 备注 | String | 是 | 备注名称 |

**生成的 Lua 代码：**
\`\`\`lua
user.set_remark(QQ号, \"备注名\")
\`\`\`

---

##### \`戳一戳好友\`

**积木类型：** \`user_poke\`

**形状：** 🧩 语句积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 用户 | Number | 是 | QQ 号 |

**生成的 Lua 代码：**
\`\`\`lua
user.poke(QQ号)
\`\`\`

---

### 3.5 数据操作积木（Data Blocks）

#### 3.5.1 变量操作

##### \`设置变量\`

**积木类型：** \`variables_set\`

**形状：** 🧩 语句积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 变量名 | String | 是 | 变量名称 |
| 值 | 任意 | 是 | 要存储的值 |

**生成的 Lua 代码：**
\`\`\`lua
变量名 = 值
\`\`\`

**使用示例：**
\`\`\`
设置 [user_name] 为 \"小明\"
设置 [count] 为 0
设置 [is_admin] 为 true
\`\`\`

**变量命名规则：**
- 只能包含字母、数字、下划线
- 不能以数字开头
- 区分大小写
- 不能使用 Lua 关键字

---

##### \`获取变量\`

**积木类型：** \`variables_get\`

**形状：** 🔵 值积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 变量名 | String | 是 | 变量名称 |

**返回值：** 变量存储的值

**生成的 Lua 代码：**
\`\`\`lua
变量名
\`\`\`

---

#### 3.5.2 持久存储

##### \`保存到存储\`

**积木类型：** \`storage_set\`

**形状：** 🧩 语句积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 键 | String | 是 | 存储的键名 |
| 值 | 任意 | 是 | 要存储的值 |

**生成的 Lua 代码：**
\`\`\`lua
storage.set(\"键名\", 值)
\`\`\`

**说明：**
- 数据持久化保存，重启后仍在
- 键名区分大小写
- 值可以是任意类型（会自动序列化）

**使用示例：**
\`\`\`
保存到存储
    键：\"user_123_count\"
    值：100
\`\`\`

---

##### \`从存储读取\`

**积木类型：** \`storage_get\`

**形状：** 🔵 值积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 键 | String | 是 | 存储的键名 |
| 默认值 | 任意 | 否 | 键不存在时返回的值 |

**返回值：** 存储的值，或默认值

**生成的 Lua 代码：**
\`\`\`lua
storage.get(\"键名\", 默认值)
\`\`\`

**使用示例：**
\`\`\`
设置 [count] 为 从存储读取 [\"visit_count\"] 默认值：0
设置 [new_count] 为 [count] + 1
保存到存储 键：[\"visit_count\"] 值：[new_count]
\`\`\`

---

##### \`从存储删除\`

**积木类型：** \`storage_delete\`

**形状：** 🧩 语句积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 键 | String | 是 | 要删除的键名 |

**生成的 Lua 代码：**
\`\`\`lua
storage.delete(\"键名\")
\`\`\`

---

#### 3.5.3 JSON 处理

##### \`将表转为JSON字符串\`

**积木类型：** \`table_to_json\`

**形状：** 🔵 值积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 表 | Object | 是 | 要转换的对象 |

**返回值：** String - JSON 字符串

**生成的 Lua 代码：**
\`\`\`lua
blockly_json.encode(表)
\`\`\`

**使用示例：**
\`\`\`
日志 (信息, 将表 [msg] 转为JSON字符串)
-- 输出：{\"user_id\":123,\"message_type\":\"group\",...}
\`\`\`

---

##### \`解析JSON字符串\`

**积木类型：** \`json_decode\`

**形状：** 🔵 值积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| JSON字符串 | String | 是 | 要解析的 JSON |

**返回值：** Object - 解析后的对象

**生成的 Lua 代码：**
\`\`\`lua
blockly_json.decode(\"{\\\"name\\\":\\\"test\\\"}\")
\`\`\`

---

#### 3.5.4 类型转换

##### \`转为字符串\`

**积木类型：** \`convert_to_string\`

**形状：** 🔵 值积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 值 | 任意 | 是 | 要转换的值 |

**返回值：** String

**生成的 Lua 代码：**
\`\`\`lua
tostring(值)
\`\`\`

---

##### \`转为数字\`

**积木类型：** \`convert_to_number\`

**形状：** 🔵 值积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 值 | String | 是 | 要转换的字符串 |

**返回值：** Number - 转换后的数字，失败返回 0

**生成的 Lua 代码：**
\`\`\`lua
tonumber(值) or 0
\`\`\`

---

### 3.6 逻辑积木（Logic Blocks）

#### 3.6.1 条件判断

##### \`如果...则...否则\`

**积木类型：** \`logic_if_else\`

**形状：** 🧩 语句积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 条件 | Boolean | 是 | 判断条件 |
| 则执行 | Statement | 是 | 条件为真时执行 |
| 否则执行 | Statement | 否 | 条件为假时执行 |

**生成的 Lua 代码：**
\`\`\`lua
if 条件 then
  -- 则执行的代码
else
  -- 否则执行的代码
end
\`\`\`

**使用示例：**
\`\`\`
如果 消息 [msg] 是群消息
  则
    发送群消息 群：(获取消息 [msg] 的群ID) 内容：\"这是群消息\"
  否则
    发送私聊消息 用户：(获取消息 [msg] 的发送者ID) 内容：\"这是私聊\"
\`\`\`

---

#### 3.6.2 比较运算

##### \`等于\`

**积木类型：** \`logic_compare\`

**形状：** 🔵 值积木（返回布尔值）

**参数：**
| 参数名 | 类型 | 必填 | 可选值 |
|--------|------|------|--------|
| 运算符 | 下拉选择 | 是 | =, ≠, <, ≤, >, ≥ |
| 左操作数 | 任意 | 是 | - |
| 右操作数 | 任意 | 是 | - |

**生成的 Lua 代码：**
\`\`\`lua
A == B    -- 等于
A ~= B    -- 不等于
A < B     -- 小于
A <= B    -- 小于等于
A > B     -- 大于
A >= B    -- 大于等于
\`\`\`

**注意事项：**
- Lua 中使用 \`~=\` 表示不等于
- 比较时会自动进行类型转换
- 字符串按字典序比较

---

#### 3.6.3 逻辑运算

##### \`与\`

**积木类型：** \`logic_operation\`

**形状：** 🔵 值积木（返回布尔值）

**参数：**
| 参数名 | 类型 | 必填 | 可选值 |
|--------|------|------|--------|
| 运算符 | 下拉选择 | 是 | 与, 或 |
| 左操作数 | Boolean | 是 | - |
| 右操作数 | Boolean | 是 | - |

**生成的 Lua 代码：**
\`\`\`lua
A and B   -- 与
A or B    -- 或
\`\`\`

**真值表：**
| A | B | A 与 B | A 或 B |
|---|---|--------|--------|
| true | true | true | true |
| true | false | false | true |
| false | true | false | true |
| false | false | false | false |

---

##### \`非\`

**积木类型：** \`logic_negate\`

**形状：** 🔵 值积木（返回布尔值）

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 操作数 | Boolean | 是 | 要取反的值 |

**生成的 Lua 代码：**
\`\`\`lua
not A
\`\`\`

**真值表：**
| A | 非 A |
|---|------|
| true | false |
| false | true |

---

### 3.7 循环积木（Loop Blocks）

#### 3.7.1 重复执行

##### \`重复 [次数] 次\`

**积木类型：** \`controls_repeat_ext\`

**形状：** 🧩 语句积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 次数 | Number | 是 | 重复次数 |
| 执行 | Statement | 是 | 循环体 |

**生成的 Lua 代码：**
\`\`\`lua
for i = 1, 次数 do
  -- 循环体
end
\`\`\`

**使用示例：**
\`\`\`
重复 5 次
  发送群消息 群：123456789 内容：\"刷屏警告\"
\`\`\`

---

##### \`当 [条件] 时重复\`

**积木类型：** \`controls_whileUntil\`

**形状：** 🧩 语句积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 条件 | Boolean | 是 | 循环条件 |
| 执行 | Statement | 是 | 循环体 |

**生成的 Lua 代码：**
\`\`\`lua
while 条件 do
  -- 循环体
end
\`\`\`

**注意：** 确保循环条件最终会变为 false，否则会死循环

---

#### 3.7.2 遍历

##### \`从 [开始] 到 [结束] 每隔 [步长] 计数\`

**积木类型：** \`controls_for\`

**形状：** 🧩 语句积木

**参数：**
| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| 变量名 | String | 是 | i | 计数器变量名 |
| 开始 | Number | 是 | - | 起始值 |
| 结束 | Number | 是 | - | 结束值 |
| 步长 | Number | 否 | 1 | 每次增加的值 |
| 执行 | Statement | 是 | - | 循环体 |

**生成的 Lua 代码：**
\`\`\`lua
for 变量名 = 开始, 结束, 步长 do
  -- 循环体
end
\`\`\`

**使用示例：**
\`\`\`
从 1 到 10 每隔 1 计数，使用变量 [i]
  发送群消息 群：123456789 内容：(转为字符串 [i])
\`\`\`

---

##### \`遍历列表 [列表] 中的每个项目\`

**积木类型：** \`controls_forEach\`

**形状：** 🧩 语句积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 变量名 | String | 是 | 迭代变量名 |
| 列表 | Array | 是 | 要遍历的数组 |
| 执行 | Statement | 是 | 循环体 |

**生成的 Lua 代码：**
\`\`\`lua
for _, 变量名 in ipairs(列表) do
  -- 循环体
end
\`\`\`

**使用示例：**
\`\`\`
设置 [members] 为 获取群成员列表 群号：123456789
遍历列表 [members] 中的每个项目，使用变量 [member]
  日志 (信息, 获取 [member] 的 [\"nickname\"])
\`\`\`

---

#### 3.7.3 循环控制

##### \`跳出循环\` / \`继续下一次循环\`

**积木类型：** \`controls_flow_statements\`

**形状：** 🧩 语句积木

**选项：**
- \`跳出循环\` - 立即退出当前循环
- \`继续下一次循环\` - 跳过本次循环剩余代码，进入下一次迭代

**生成的 Lua 代码：**
\`\`\`lua
break       -- 跳出循环
goto continue_xxx  -- 继续下一次（实际实现可能不同）
\`\`\`

**使用示例：**
\`\`\`
遍历列表 [users] 中的每个项目，使用变量 [user]
  如果 获取 [user] 的 [\"role\"] = \"admin\"
    继续下一次循环    -- 跳过管理员
  发送消息给 获取 [user] 的 [\"user_id\"]
\`\`\`

---

### 3.8 文本处理积木（Text Blocks）

#### 3.8.1 创建文本

##### \`文本\`（字符串字面量）

**积木类型：** \`text\`

**形状：** 🔵 值积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 文本内容 | String | 是 | 字符串值 |

**生成的 Lua 代码：**
\`\`\`lua
\"文本内容\"
\`\`\`

**使用示例：**
\`\`\`
设置 [greeting] 为 \"你好，世界！\"
\`\`\`

---

##### \`连接文本\`

**积木类型：** \`text_join\`

**形状：** 🔵 值积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 值1 | 任意 | 是 | 第一个值 |
| 值2 | 任意 | 是 | 第二个值 |

**返回值：** String - 连接后的字符串

**生成的 Lua 代码：**
\`\`\`lua
值1 .. 值2
\`\`\`

**使用示例：**
\`\`\`
设置 [message] 为 连接文本 [\"你好，\"] 和 [user_name]
-- 结果：\"你好，小明\"
\`\`\`

---

#### 3.8.2 文本属性

##### \`文本长度\`

**积木类型：** \`text_length\`

**形状：** 🔵 值积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 文本 | String | 是 | 要计算的文本 |

**返回值：** Number - 字符数

**生成的 Lua 代码：**
\`\`\`lua
#文本
-- 或
string.len(文本)
\`\`\`

**使用示例：**
\`\`\`
设置 [len] 为 文本 [\"Hello\"] 的长度
-- 结果：5
\`\`\`

---

#### 3.8.3 文本提取

##### \`截取文本\`

**积木类型：** \`text_substring\`

**形状：** 🔵 值积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 文本 | String | 是 | 源文本 |
| 从 | Number | 是 | 开始位置（从1开始） |
| 到 | Number | 是 | 结束位置 |

**返回值：** String - 截取的子串

**生成的 Lua 代码：**
\`\`\`lua
string.sub(文本, 从, 到)
\`\`\`

**使用示例：**
\`\`\`
设置 [sub] 为 截取文本 [\"Hello World\"] 从 [7] 到 [11]
-- 结果：\"World\"
\`\`\`

**注意事项：**
- Lua 字符串索引从 1 开始
- 可以使用负数表示从末尾计数

---

#### 3.8.4 查找替换

##### \`替换文本中的内容\`

**积木类型：** \`text_replace_custom\`

**形状：** 🔵 值积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 文本 | String | 是 | 源文本 |
| 查找 | String | 是 | 要替换的内容 |
| 替换为 | String | 是 | 新内容 |

**返回值：** String - 替换后的文本

**生成的 Lua 代码：**
\`\`\`lua
string.gsub(文本, 查找, 替换为)
\`\`\`

**使用示例：**
\`\`\`
设置 [new_text] 为 替换文本 [\"Hello World\"] 中的 [\"World\"] 为 [\"Blockly\"]
-- 结果：\"Hello Blockly\"
\`\`\`

---

#### 3.8.5 文本转换

##### \`转为大写\` / \`转为小写\`

**积木类型：** \`text_changeCase\`

**形状：** 🔵 值积木

**参数：**
| 参数名 | 类型 | 必填 | 可选值 |
|--------|------|------|--------|
| 转换方式 | 下拉选择 | 是 | 转为大写, 转为小写, 首字母大写 |
| 文本 | String | 是 | 源文本 |

**生成的 Lua 代码：**
\`\`\`lua
string.upper(文本)    -- 转为大写
string.lower(文本)    -- 转为小写
\`\`\`

---

##### \`去除空白\`

**积木类型：** \`text_trim\`

**形状：** 🔵 值积木

**参数：**
| 参数名 | 类型 | 必填 | 可选值 |
|--------|------|------|--------|
| 去除方式 | 下拉选择 | 是 | 两端, 左边, 右边 |
| 文本 | String | 是 | 源文本 |

**生成的 Lua 代码：**
\`\`\`lua
blockly_text_utils.trim(文本)        -- 两端
blockly_text_utils.trimLeft(文本)    -- 左边
blockly_text_utils.trimRight(文本)   -- 右边
\`\`\`

**使用示例：**
\`\`\`
设置 [clean] 为 去除 [\"  hello  \"] 的空白
-- 结果：\"hello\"
\`\`\`

---

### 3.9 数学运算积木（Math Blocks）

#### 3.9.1 基础运算

##### \`加法\` / \`减法\` / \`乘法\` / \`除法\`

**积木类型：** \`math_arithmetic\`

**形状：** 🔵 值积木

**参数：**
| 参数名 | 类型 | 必填 | 可选值 |
|--------|------|------|--------|
| 运算符 | 下拉选择 | 是 | +, -, ×, ÷, ^ |
| 左操作数 | Number | 是 | - |
| 右操作数 | Number | 是 | - |

**生成的 Lua 代码：**
\`\`\`lua
A + B     -- 加法
A - B     -- 减法
A * B     -- 乘法
A / B     -- 除法
A ^ B     -- 幂运算
\`\`\`

**使用示例：**
\`\`\`
设置 [sum] 为 [10] + [20]
-- 结果：30

设置 [power] 为 [2] ^ [10]
-- 结果：1024
\`\`\`

---

##### \`取余数\`

**积木类型：** \`math_modulo\`

**形状：** 🔵 值积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 被除数 | Number | 是 | - |
| 除数 | Number | 是 | - |

**返回值：** Number - 余数

**生成的 Lua 代码：**
\`\`\`lua
被除数 % 除数
\`\`\`

**使用示例：**
\`\`\`
设置 [remainder] 为 [17] 除以 [5] 的余数
-- 结果：2
\`\`\`

---

#### 3.9.2 数学函数

##### \`绝对值\`

**积木类型：** \`math_single\`

**形状：** 🔵 值积木

**参数：**
| 参数名 | 类型 | 必填 | 可选值 |
|--------|------|------|--------|
| 运算符 | 下拉选择 | 是 | 绝对值, 相反数, ln, log10, e^, 10^ |
| 数值 | Number | 是 | - |

**生成的 Lua 代码：**
\`\`\`lua
math.abs(数值)      -- 绝对值
-数值               -- 相反数
math.log(数值)      -- 自然对数
math.log10(数值)    -- 常用对数
math.exp(数值)      -- e的幂
10 ^ 数值           -- 10的幂
\`\`\`

---

##### \`四舍五入\`

**积木类型：** \`math_round\`

**形状：** 🔵 值积木

**参数：**
| 参数名 | 类型 | 必填 | 可选值 |
|--------|------|------|--------|
| 舍入方式 | 下拉选择 | 是 | 四舍五入, 向上取整, 向下取整 |
| 数值 | Number | 是 | - |

**生成的 Lua 代码：**
\`\`\`lua
math.floor(数值 + 0.5)  -- 四舍五入
math.ceil(数值)         -- 向上取整
math.floor(数值)        -- 向下取整
\`\`\`

**使用示例：**
\`\`\`
设置 [rounded] 为 [3.7] 四舍五入
-- 结果：4

设置 [ceil] 为 [3.2] 向上取整
-- 结果：4

设置 [floor] 为 [3.9] 向下取整
-- 结果：3
\`\`\`

---

#### 3.9.3 随机数

##### \`随机整数\`

**积木类型：** \`math_random_int\`

**形状：** 🔵 值积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 从 | Number | 是 | 最小值 |
| 到 | Number | 是 | 最大值 |

**返回值：** Number - 范围内的随机整数

**生成的 Lua 代码：**
\`\`\`lua
math.random(从, 到)
\`\`\`

**使用示例：**
\`\`\`
设置 [dice] 为 随机数 从 [1] 到 [6]
-- 结果：1-6 之间的随机整数
\`\`\`

---

##### \`随机小数\`

**积木类型：** \`math_random_float\`

**形状：** 🔵 值积木

**返回值：** Number - 0 到 1 之间的随机小数

**生成的 Lua 代码：**
\`\`\`lua
math.random()
\`\`\`

---

### 3.10 列表操作积木（List Blocks）

#### 3.10.1 创建列表

##### \`创建列表\`

**积木类型：** \`lists_create_with\`

**形状：** 🔵 值积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 项目0 | 任意 | 否 | 第一个元素 |
| 项目1 | 任意 | 否 | 第二个元素 |
| ... | 任意 | 否 | 更多元素 |

**返回值：** Array - 创建的数组

**生成的 Lua 代码：**
\`\`\`lua
{值1, 值2, 值3}
\`\`\`

**使用示例：**
\`\`\`
设置 [fruits] 为 创建列表 [\"苹果\"] [\"香蕉\"] [\"橙子\"]
-- 结果：{\"苹果\", \"香蕉\", \"橙子\"}
\`\`\`

---

#### 3.10.2 列表属性

##### \`列表长度\`

**积木类型：** \`lists_length\`

**形状：** 🔵 值积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 列表 | Array | 是 | 要计算的数组 |

**返回值：** Number - 元素个数

**生成的 Lua 代码：**
\`\`\`lua
#列表
\`\`\`

---

##### \`列表为空\`

**积木类型：** \`lists_isEmpty\`

**形状：** 🔵 值积木（返回布尔值）

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 列表 | Array | 是 | 要检查的数组 |

**返回值：** Boolean

**生成的 Lua 代码：**
\`\`\`lua
#列表 == 0
\`\`\`

---

#### 3.10.3 获取元素

##### \`获取列表中的元素\`

**积木类型：** \`lists_getIndex\`

**形状：** 🔵 值积木

**参数：**
| 参数名 | 类型 | 必填 | 可选值 |
|--------|------|------|--------|
| 操作 | 下拉选择 | 是 | 获取, 移除, 获取并移除 |
| 位置 | 下拉选择 | 是 | #, #1, #2, ..., 最后, 随机 |
| 列表 | Array | 是 | 目标数组 |

**返回值：** 指定位置的元素

**生成的 Lua 代码：**
\`\`\`lua
列表[位置]           -- 获取
\`\`\`

**使用示例：**
\`\`\`
设置 [first] 为 获取列表 [fruits] 的第 [1] 个
-- 结果：\"苹果\"

设置 [last] 为 获取列表 [fruits] 的最后一个
-- 结果：\"橙子\"
\`\`\`

**重要提示：** Lua 数组索引从 1 开始，不是 0！

---

#### 3.10.4 修改列表

##### \`设置列表中的元素\`

**积木类型：** \`lists_setIndex\`

**形状：** 🧩 语句积木

**参数：**
| 参数名 | 类型 | 必填 | 可选值 |
|--------|------|------|--------|
| 操作 | 下拉选择 | 是 | 设置, 插入 |
| 位置 | 下拉选择 | 是 | #1, #2, ..., 最后, 随机 |
| 列表 | Array | 是 | 目标数组 |
| 值 | 任意 | 是 | 新值 |

**生成的 Lua 代码：**
\`\`\`lua
列表[位置] = 值       -- 设置
\`\`\`

---

### 3.11 HTTP 请求积木（HTTP Blocks）

#### 3.11.1 GET 请求

##### \`HTTP GET请求\`

**积木类型：** \`http_get\`

**形状：** 🔵 值积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| URL | String | 是 | 请求地址 |

**返回值：** Object - 响应对象

**返回结构：**
\`\`\`lua
{
  status = 200,           -- HTTP 状态码
  headers = {...},        -- 响应头
  body = \"响应内容\",       -- 响应体
  error = nil             -- 错误信息（如果有）
}
\`\`\`

**生成的 Lua 代码：**
\`\`\`lua
http.request(\"GET\", \"URL\")
\`\`\`

**使用示例：**
\`\`\`
设置 [response] 为 HTTP GET请求 [\"https://api.example.com/data\"]
如果 获取 [response] 的 [\"status\"] = 200
  日志 (信息, 获取 [response] 的 [\"body\"])
\`\`\`

---

#### 3.11.2 POST 请求

##### \`HTTP POST请求\`

**积木类型：** \`http_post\`

**形状：** 🔵 值积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| URL | String | 是 | 请求地址 |
| 内容 | String | 否 | 请求体内容 |

**返回值：** Object - 响应对象

**生成的 Lua 代码：**
\`\`\`lua
http.request(\"POST\", \"URL\", nil, \"内容\")
\`\`\`

**使用示例：**
\`\`\`
设置 [data] 为 连接文本 [\"name=\"] 和 [user_name]
设置 [response] 为 HTTP POST请求 [\"https://api.example.com/submit\"] 内容：[data]
\`\`\`

---

#### 3.11.3 通用请求

##### \`HTTP请求\`

**积木类型：** \`http_request\`

**形状：** 🔵 值积木

**参数：**
| 参数名 | 类型 | 必填 | 可选值 |
|--------|------|------|--------|
| 方法 | 下拉选择 | 是 | GET, POST, PUT, DELETE |
| URL | String | 是 | 请求地址 |
| 内容 | String | 否 | 请求体 |

**返回值：** Object - 响应对象

**生成的 Lua 代码：**
\`\`\`lua
http.request(\"方法\", \"URL\", headers, \"内容\")
\`\`\`

---

### 3.12 文件操作积木（File Blocks）

#### 3.12.1 本地文件

##### \`读取文件\`

**积木类型：** \`file_read\`

**形状：** 🔵 值积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 文件路径 | String | 是 | 相对路径或绝对路径 |

**返回值：** String - 文件内容

**生成的 Lua 代码：**
\`\`\`lua
file.read(\"文件路径\")
\`\`\`

**使用示例：**
\`\`\`
设置 [content] 为 读取文件 [\"data/config.txt\"]
日志 (信息, [content])
\`\`\`

---

##### \`写入文件\`

**积木类型：** \`file_write\`

**形状：** 🧩 语句积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 内容 | String | 是 | 要写入的内容 |
| 文件路径 | String | 是 | 目标文件路径 |

**生成的 Lua 代码：**
\`\`\`lua
file.write(\"文件路径\", \"内容\")
\`\`\`

---

##### \`检查文件存在\`

**积木类型：** \`file_exists\`

**形状：** 🔵 值积木（返回布尔值）

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 文件路径 | String | 是 | 文件路径 |

**返回值：** Boolean

**生成的 Lua 代码：**
\`\`\`lua
file.exists(\"文件路径\")
\`\`\`

---

##### \`创建目录\`

**积木类型：** \`file_mkdir\`

**形状：** 🧩 语句积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 目录路径 | String | 是 | 要创建的目录 |

**生成的 Lua 代码：**
\`\`\`lua
file.mkdir(\"目录路径\")
\`\`\`

---

### 3.13 时间处理积木（Time Blocks）

#### 3.13.1 系统时间

##### \`获取当前时间戳\`

**积木类型：** \`system_timestamp_seconds\` / \`system_timestamp_milliseconds\`

**形状：** 🔵 值积木

**返回值：** Number - 时间戳

**生成的 Lua 代码：**
\`\`\`lua
system.get_timestamp_seconds()      -- 秒级
system.get_timestamp_milliseconds() -- 毫秒级
\`\`\`

**说明：**
- 秒级时间戳：从 1970-01-01 00:00:00 UTC 开始的秒数
- 毫秒级时间戳：从 1970-01-01 00:00:00 UTC 开始的毫秒数

---

##### \`获取当前时间\`

**积木类型：** \`system_now\`

**形状：** 🔵 值积木

**返回值：** Object - 时间对象

**返回结构：**
\`\`\`lua
{
  year = 2026,
  month = 4,
  day = 15,
  hour = 10,
  minute = 30,
  second = 0,
  weekday = 3  -- 1=周一, 7=周日
}
\`\`\`

**生成的 Lua 代码：**
\`\`\`lua
system.now()
\`\`\`

---

#### 3.13.2 格式化日期

##### \`格式化日期时间\`

**积木类型：** \`time_format_datetime\`

**形状：** 🔵 值积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 时间戳 | Number | 是 | 秒级时间戳 |
| 格式 | String | 是 | 格式字符串 |

**返回值：** String - 格式化后的时间字符串

**格式说明：**
| 占位符 | 说明 | 示例 |
|--------|------|------|
| \`%Y\` | 四位年份 | 2026 |
| \`%m\` | 两位月份 | 04 |
| \`%d\` | 两位日期 | 15 |
| \`%H\` | 两位小时（24小时制）| 14 |
| \`%M\` | 两位分钟 | 30 |
| \`%S\` | 两位秒 | 00 |
| \`%w\` | 星期（0-6，0=周日）| 3 |

**生成的 Lua 代码：**
\`\`\`lua
os.date(\"%Y-%m-%d %H:%M:%S\", 时间戳)
\`\`\`

**使用示例：**
\`\`\`
设置 [now] 为 获取当前时间戳(秒)
设置 [formatted] 为 格式化日期时间 [now] 格式：[\"%Y年%m月%d日 %H:%M:%S\"]
-- 结果：\"2026年04月15日 14:30:00\"
\`\`\`

---

#### 3.13.3 定时任务

##### \`每隔 [秒] 秒执行\`

**积木类型：** \`schedule_interval_seconds\`

**形状：** 🧩 语句积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 间隔 | Number | 是 | 执行间隔（秒） |
| 执行 | Statement | 是 | 要执行的代码 |

**生成的 Lua 代码：**
\`\`\`lua
schedule.interval(间隔, function()
  -- 执行代码
end)
\`\`\`

**使用示例：**
\`\`\`
每隔 60 秒执行
  发送群消息 群：123456789 内容：\"每分钟提醒一次\"
\`\`\`

---

##### \`每天 [时间] 执行\`

**积木类型：** \`schedule_daily\`

**形状：** 🧩 语句积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 时间 | String | 是 | 执行时间（如 \"08:00\"） |
| 执行 | Statement | 是 | 要执行的代码 |

**生成的 Lua 代码：**
\`\`\`lua
schedule.daily(\"08:00\", function()
  -- 执行代码
end)
\`\`\`

---

### 3.14 日志输出积木（Log Blocks）

#### 3.14.1 基础日志

##### \`日志输出\`

**积木类型：** \`log_output\`

**形状：** 🧩 语句积木

**参数：**
| 参数名 | 类型 | 必填 | 可选值 |
|--------|------|------|--------|
| 级别 | 下拉选择 | 是 | 信息, 警告, 错误, 调试 |
| 内容 | String | 是 | 日志内容 |

**生成的 Lua 代码：**
\`\`\`lua
log.info(\"内容\")     -- 信息
log.warn(\"内容\")     -- 警告
log.error(\"内容\")    -- 错误
log.debug(\"内容\")    -- 调试
\`\`\`

**日志级别说明：**
| 级别 | 说明 | 用途 |
|------|------|------|
| 信息 | 一般信息 | 记录正常流程 |
| 警告 | 需要注意 | 非致命问题 |
| 错误 | 错误信息 | 需要处理的问题 |
| 调试 | 调试信息 | 开发时查看变量 |

**使用示例：**
\`\`\`
日志 (信息, \"插件启动成功\")
日志 (调试, 连接文本 \"当前用户：\" 和 user_name)
日志 (错误, \"发生错误：无法连接服务器\")
\`\`\`

---

### 3.15 编码工具积木（Utils Blocks）

#### 3.15.1 URL 编码

##### \`URL编码\` / \`URL解码\`

**积木类型：** \`utils_url_encode\` / \`utils_url_decode\`

**形状：** 🔵 值积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 文本 | String | 是 | 要编码/解码的文本 |

**返回值：** String

**生成的 Lua 代码：**
\`\`\`lua
utils.url_encode(\"hello world\")   -- \"hello%20world\"
utils.url_decode(\"hello%20world\") -- \"hello world\"
\`\`\`

---

#### 3.15.2 Base64 编码

##### \`Base64编码\` / \`Base64解码\`

**积木类型：** \`utils_base64_encode\` / \`utils_base64_decode\`

**形状：** 🔵 值积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 文本 | String | 是 | 要编码/解码的文本 |

**返回值：** String

**生成的 Lua 代码：**
\`\`\`lua
utils.base64_encode(\"hello\")   -- \"aGVsbG8=\"
utils.base64_decode(\"aGVsbG8=\") -- \"hello\"
\`\`\`

---

#### 3.15.3 HTML 转义

##### \`HTML转义\` / \`HTML反转义\`

**积木类型：** \`utils_html_escape\` / \`utils_html_unescape\`

**形状：** 🔵 值积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 文本 | String | 是 | 要转义的文本 |

**返回值：** String

**生成的 Lua 代码：**
\`\`\`lua
utils.html_escape(\"<div>\")    -- \"&lt;div&gt;\"
utils.html_unescape(\"&lt;div&gt;\") -- \"<div>\"
\`\`\`

---

### 3.16 系统积木（System Blocks）

#### 3.16.1 机器人信息

##### \`获取登录信息\`

**积木类型：** \`bot_get_login_info\`

**形状：** 🔵 值积木

**返回值：** Object - 登录信息

**返回结构：**
\`\`\`lua
{
  user_id = 123456789,
  nickname = \"机器人昵称\"
}
\`\`\`

**生成的 Lua 代码：**
\`\`\`lua
bot.get_login_info()
\`\`\`

---

##### \`获取机器人状态\`

**积木类型：** \`bot_get_status\`

**形状：** 🔵 值积木

**返回值：** Object - 状态信息

**生成的 Lua 代码：**
\`\`\`lua
bot.get_status()
\`\`\`

---

#### 3.16.2 系统操作

##### \`获取系统状态\`

**积木类型：** \`system_status\`

**形状：** 🔵 值积木

**返回值：** Object - 系统和机器人状态

**生成的 Lua 代码：**
\`\`\`lua
system.status()
\`\`\`

---

### 3.17 高级积木（Advanced Blocks）

#### 3.17.1 自定义代码

##### \`自定义Lua代码\`

**积木类型：** \`lua_custom_code\`

**形状：** 🧩 语句积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 代码 | String | 是 | Lua 代码 |

**生成的 Lua 代码：**
\`\`\`lua
-- 直接插入用户输入的代码
用户输入的代码
\`\`\`

**警告：** 使用此积木需要了解 Lua 语法，错误代码会导致插件运行失败

---

#### 3.17.2 函数定义

##### \`定义函数\`

**积木类型：** \`simple_function_def\`

**形状：** 🧩 语句积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 函数名 | String | 是 | 函数名称 |
| 参数 | String | 否 | 参数列表（逗号分隔） |
| 执行 | Statement | 是 | 函数体 |

**生成的 Lua 代码：**
\`\`\`lua
function 函数名(参数)
  -- 函数体
end
\`\`\`

**使用示例：**
\`\`\`
定义函数 [sendWelcome] 参数：[group_id, user_id]
  发送群消息 
      群：[group_id] 
      内容：连接文本 \"欢迎 @\" 和 [user_id] 和 \" 加入群聊！\"
\`\`\`

---

##### \`调用函数\`

**积木类型：** \`simple_function_call\`

**形状：** 🧩 语句积木

**参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 函数名 | String | 是 | 要调用的函数 |
| 参数 | 任意 | 否 | 参数值 |

**生成的 Lua 代码：**
\`\`\`lua
函数名(参数1, 参数2)
\`\`\`

---

## 四、完整积木分类参考

### 4.1 快速开始分类

包含最常用的积木，方便快速上手：

| 积木 | 类型 | 用途 |
|------|------|------|
| \`当收到消息时\` | event_on_message | 消息事件入口 |
| \`获取消息的 [字段]\` | msg_get_simple_field | 读取消息信息 |
| \`获取消息的纯文本内容\` | msg_get_text_content | 获取纯文本 |
| \`消息包含文字\` | msg_contains_text | 关键词判断 |
| \`发送群消息\` | message_send_group | 发送群消息 |
| \`发送私聊消息\` | message_send_private | 发送私聊 |
| \`日志 (信息)\` | log_info | 输出日志 |
| \`保存到存储\` | storage_set | 持久化存储 |
| \`从存储读取\` | storage_get | 读取存储 |
| \`如果...则...否则\` | logic_if_else | 条件判断 |
| \`设置变量\` | variables_set | 设置变量 |
| \`获取变量\` | variables_get | 读取变量 |

### 4.2 事件分类

#### 消息事件
- \`event_on_message\` - 当收到消息时
- \`event_on_notice\` - 当收到通知时
- \`event_on_request\` - 当收到请求时

#### 生命周期
- \`event_on_init\` - 插件初始化时
- \`event_on_destroy\` - 插件卸载时

#### 群事件
- \`event_on_group_admin\` - 群管理员变动
- \`event_on_group_member_increase\` - 群成员增加
- \`event_on_group_member_decrease\` - 群成员减少
- \`event_on_group_ban\` - 群成员被禁言
- \`event_on_group_recall\` - 群消息撤回
- \`event_on_group_card\` - 群名片变动
- \`event_on_group_title\` - 群头衔变动
- \`event_on_group_msg_emoji_like\` - 消息被表情回应
- \`event_on_group_upload\` - 群文件上传
- \`event_on_group_request\` - 收到群请求

#### 好友事件
- \`event_on_friend_recall\` - 好友消息撤回
- \`event_on_friend_add\` - 添加好友
- \`event_on_friend_request\` - 收到好友请求

#### 互动事件
- \`event_on_poke\` - 被戳一戳
- \`event_on_essence\` - 消息被设为精华

#### 机器人状态
- \`event_on_bot_status\` - 机器人状态变更

### 4.3 消息分类

#### 读取消息
- \`msg_get_simple_field\` - 获取消息字段
- \`msg_get_text_content\` - 获取纯文本内容
- \`msg_get_sender_id\` - 获取发送者ID
- \`msg_get_sender_nickname\` - 获取发送者昵称
- \`msg_get_group_id\` - 获取群ID
- \`msg_get_time\` - 获取时间戳
- \`msg_get_message_id\` - 获取消息ID
- \`msg_get_images\` - 获取所有图片
- \`msg_get_first_image\` - 获取第一张图片
- \`msg_get_at_users\` - 获取@用户列表
- \`msg_get_reply_info\` - 获取回复信息
- \`msg_get_reply_id\` - 获取回复消息ID
- \`message_get_reply_id\` - 获取引用消息ID
- \`message_get_sender_role\` - 获取发送者角色

#### 消息判断
- \`msg_contains_text\` - 消息包含文字
- \`msg_contains_keyword\` - 消息包含关键词
- \`msg_is_group\` - 消息是群消息
- \`msg_is_private\` - 消息是私聊消息
- \`msg_is_type\` - 消息是特定类型
- \`msg_has_json\` - 消息包含JSON
- \`msg_is_contact_card\` - 消息是联系人卡片
- \`msg_is_group_card\` - 消息是群卡片
- \`msg_is_channel_card\` - 消息是频道卡片
- \`msg_has_image\` - 消息包含图片
- \`msg_has_voice\` - 消息包含语音
- \`msg_has_video\` - 消息包含视频
- \`msg_has_face\` - 消息包含表情
- \`msg_is_at_bot\` - 消息@了机器人
- \`msg_is_at_all\` - 消息@了所有人
- \`msg_has_url\` - 消息包含URL
- \`message_is_sender_owner\` - 发送者是群主
- \`message_is_sender_admin\` - 发送者是管理员
- \`message_is_sender_member\` - 发送者是成员
- \`message_has_reply\` - 消息是回复

#### 卡片解析
- \`msg_get_json_data\` - 获取JSON数据
- \`msg_parse_card\` - 解析卡片
- \`msg_parse_card_full\` - 完整解析卡片
- \`msg_get_card_field\` - 获取卡片字段
- \`msg_get_card_id_from_url\` - 从URL获取卡片ID
- \`msg_get_json_app_type\` - 获取JSON应用类型
- \`msg_get_json_field\` - 获取JSON字段
- \`msg_json_has_app\` - JSON包含应用

#### URL链接
- \`msg_count_urls\` - 统计URL数量
- \`msg_get_urls\` - 获取所有URL

#### 发送消息
- \`message_send_group\` - 发送群消息
- \`message_send_private\` - 发送私聊消息
- \`message_reply_group\` - 回复群消息
- \`message_reply_private\` - 回复私聊消息
- \`send_group_image_base64\` - 发送群图片(Base64)
- \`send_private_image_base64\` - 发送私聊图片(Base64)

#### 发送消息(存结果)
- \`message_send_group_with_var\` - 发送群消息并存储结果
- \`message_send_private_with_var\` - 发送私聊消息并存储结果
- \`onebot_send_group_msg_with_var\` - OneBot发送群消息(存结果)
- \`onebot_send_private_msg_with_var\` - OneBot发送私聊消息(存结果)

#### 消息管理
- \`message_delete\` - 撤回消息
- \`message_set_essence\` - 设置精华消息
- \`message_get_essence_list\` - 获取精华消息列表
- \`message_send_like\` - 发送点赞
- \`onebot_mark_msg_as_read\` - 标记消息已读
- \`onebot_set_msg_emoji_like\` - 设置消息表情回应
- \`onebot_delete_essence_msg\` - 删除精华消息

#### 消息管理(存结果)
- \`onebot_delete_msg_with_var\` - 撤回消息(存结果)
- \`onebot_set_essence_msg_with_var\` - 设置精华消息(存结果)
- \`onebot_send_like_with_var\` - 发送点赞(存结果)
- \`onebot_mark_msg_as_read_with_var\` - 标记已读(存结果)
- \`onebot_set_msg_emoji_like_with_var\` - 设置表情回应(存结果)
- \`onebot_delete_essence_msg_with_var\` - 删除精华消息(存结果)

#### 消息查询
- \`onebot_get_msg\` - 获取消息
- \`onebot_get_forward_msg\` - 获取转发消息
- \`onebot_get_group_msg_history\` - 获取群消息历史
- \`onebot_get_friend_msg_history\` - 获取好友消息历史
- \`onebot_get_image\` - 获取图片
- \`onebot_get_record\` - 获取语音
- \`onebot_get_file\` - 获取文件

#### 消息查询(存结果)
- \`onebot_get_msg_with_var\` - 获取消息(存结果)
- \`onebot_get_forward_msg_with_var\` - 获取转发消息(存结果)
- \`onebot_get_group_msg_history_with_var\` - 获取群历史(存结果)
- \`onebot_get_friend_msg_history_with_var\` - 获取好友历史(存结果)

#### 消息转发
- \`onebot_forward_group_single_msg\` - 转发群消息
- \`onebot_forward_friend_single_msg\` - 转发好友消息
- \`onebot_voice_msg_to_text\` - 语音转文字

#### 消息转发(存结果)
- \`onebot_forward_group_single_msg_with_var\` - 转发群消息(存结果)
- \`onebot_forward_friend_single_msg_with_var\` - 转发好友消息(存结果)

#### AI语音
- \`onebot_send_group_ai_record\` - 发送群AI语音
- \`onebot_get_ai_characters\` - 获取AI角色

### 4.4 群组分类

#### 群信息
- \`group_get_list\` - 获取群列表
- \`group_get_members\` - 获取群成员列表
- \`onebot_get_group_info\` - 获取群信息
- \`onebot_get_group_member_info\` - 获取群成员信息
- \`onebot_get_group_honor_info\` - 获取群荣誉信息
- \`onebot_get_group_at_all_remain\` - 获取剩余@全员次数
- \`onebot_get_group_shut_list\` - 获取禁言列表

#### 群信息(存结果)
- \`onebot_get_group_info_with_var\` - 获取群信息(存结果)
- \`onebot_get_group_member_info_with_var\` - 获取成员信息(存结果)
- \`onebot_get_group_member_list_with_var\` - 获取成员列表(存结果)
- \`onebot_get_group_list_with_var\` - 获取群列表(存结果)

#### 成员管理
- \`group_kick\` - 踢出群成员
- \`group_set_ban\` - 禁言群成员
- \`group_set_card\` - 设置群名片
- \`group_set_admin\` - 设置群管理员
- \`group_poke\` - 群戳一戳
- \`msg_is_group_admin\` - 判断群管理员
- \`onebot_set_group_leave\` - 退出群聊
- \`onebot_set_group_special_title\` - 设置专属头衔
- \`onebot_batch_delete_group_member\` - 批量删除群成员

#### 成员管理(存结果)
- \`onebot_set_group_kick_with_var\` - 踢出成员(存结果)
- \`onebot_set_group_ban_with_var\` - 禁言成员(存结果)
- \`onebot_set_group_card_with_var\` - 设置名片(存结果)
- \`onebot_set_group_admin_with_var\` - 设置管理员(存结果)
- \`onebot_set_group_leave_with_var\` - 退出群聊(存结果)
- \`onebot_set_group_special_title_with_var\` - 设置头衔(存结果)

#### 群设置
- \`group_set_whole_ban\` - 设置全员禁言
- \`group_set_name\` - 设置群名称
- \`onebot_set_group_remark\` - 设置群备注
- \`onebot_set_group_msg_mask\` - 设置群消息屏蔽
- \`onebot_send_group_sign\` - 发送群签到

#### 群设置(存结果)
- \`onebot_set_group_whole_ban_with_var\` - 全员禁言(存结果)
- \`onebot_set_group_name_with_var\` - 设置群名(存结果)

#### 群公告
- \`onebot_get_group_notice\` - 获取群公告
- \`onebot_send_group_notice\` - 发送群公告
- \`onebot_delete_group_notice\` - 删除群公告

#### 群相册
- \`onebot_get_group_album_list\` - 获取群相册列表
- \`onebot_create_group_album\` - 创建群相册
- \`onebot_delete_group_album\` - 删除群相册
- \`onebot_upload_group_album\` - 上传群相册

### 4.5 用户分类

#### 好友管理
- \`user_get_friends\` - 获取好友列表
- \`user_set_remark\` - 设置好友备注
- \`user_poke\` - 戳一戳好友
- \`onebot_get_stranger_info\` - 获取陌生人信息
- \`onebot_get_friend_list\` - 获取好友列表
- \`onebot_get_friends_with_category\` - 获取分类好友列表
- \`onebot_delete_friend\` - 删除好友
- \`onebot_set_friend_remark\` - 设置好友备注
- \`onebot_set_friend_category\` - 设置好友分类
- \`onebot_friend_poke\` - 好友戳一戳

#### 好友管理(存结果)
- \`onebot_get_stranger_info_with_var\` - 获取陌生人信息(存结果)
- \`onebot_get_friend_info_with_var\` - 获取好友信息(存结果)
- \`onebot_get_friend_list_with_var\` - 获取好友列表(存结果)
- \`onebot_delete_friend_with_var\` - 删除好友(存结果)
- \`onebot_set_friend_remark_with_var\` - 设置备注(存结果)
- \`onebot_friend_poke_with_var\` - 好友戳一戳(存结果)
- \`onebot_set_friend_category_with_var\` - 设置分类(存结果)

#### 个人资料
- \`onebot_get_profile_like\` - 获取资料点赞
- \`onebot_get_profile_like_me\` - 获取给我点赞的人
- \`onebot_get_qq_avatar\` - 获取QQ头像
- \`onebot_set_qq_avatar\` - 设置QQ头像
- \`onebot_set_qq_profile\` - 设置QQ资料
- \`onebot_get_robot_uin_range\` - 获取机器人UIN范围

#### 个人资料(存结果)
- \`onebot_set_qq_profile_with_var\` - 设置QQ资料(存结果)

### 4.6 请求处理分类

- \`request_approve_friend\` - 同意好友申请
- \`request_approve_group\` - 同意群申请

#### 处理请求
- \`onebot_set_friend_add_request\` - 设置好友申请处理
- \`onebot_set_group_add_request\` - 设置群申请处理
- \`onebot_get_doubt_friends_add_request\` - 获取可疑好友申请
- \`onebot_set_doubt_friends_add_request\` - 设置可疑好友申请处理

#### 处理请求(存结果)
- \`onebot_set_friend_add_request_with_var\` - 处理好友申请(存结果)
- \`onebot_set_group_add_request_with_var\` - 处理群申请(存结果)

### 4.7 数据分类

#### 变量
- \`variables_set\` - 设置变量
- \`variables_get\` - 获取变量

#### 持久存储
- \`storage_set\` - 保存到存储
- \`storage_get\` - 从存储读取
- \`storage_delete\` - 从存储删除

#### JSON处理
- \`json_encode\` - 编码为JSON
- \`json_decode\` - 解析JSON
- \`json_get\` - 获取JSON字段
- \`json_extract\` - 提取JSON数据
- \`table_to_json\` - 将表转为JSON字符串
- \`table_get\` - 获取表字段
- \`table_set\` - 设置表字段

#### 类型转换
- \`convert_to_string\` - 转为字符串
- \`convert_to_number\` - 转为数字
- \`is_type\` - 判断类型
- \`safe_get\` - 安全获取

#### 数据库
- \`simple_db_set\` - 数据库设置
- \`simple_db_get\` - 数据库获取
- \`simple_db_delete\` - 数据库删除

### 4.8 逻辑分类

#### 条件判断
- \`controls_if\` - 如果
- \`logic_if_else\` - 如果...则...否则
- \`logic_compare\` - 比较运算
- \`logic_compare_hex\` - 十六进制比较
- \`logic_operation\` - 逻辑运算
- \`logic_negate\` - 非

#### 布尔值
- \`logic_boolean\` - 真/假
- \`logic_null\` - 空值

### 4.9 循环分类

#### 重复执行
- \`controls_repeat_ext\` - 重复N次
- \`controls_whileUntil\` - 当/直到条件循环

#### 遍历
- \`controls_for\` - 计数循环
- \`controls_forEach\` - 遍历列表

#### 循环控制
- \`controls_flow_statements\` - 跳出/继续循环

### 4.10 文本分类

#### 创建文本
- \`text\` - 文本
- \`text_join\` - 连接文本
- \`text_concat\` - 拼接文本
- \`text_concat_three\` - 拼接三个文本
- \`text_concat_four\` - 拼接四个文本
- \`concat_strings\` - 连接字符串
- \`text_newline\` - 换行符

#### 文本属性
- \`text_length\` - 文本长度
- \`text_count_lines\` - 统计行数

#### 文本提取
- \`text_substring\` - 截取文本
- \`text_count_occurrences\` - 统计出现次数
- \`text_contains\` - 是否包含

#### 查找替换
- \`text_replace_custom\` - 替换文本

#### 文本转换
- \`text_changeCase\` - 改变大小写
- \`text_trim\` - 去除空白
- \`text_template\` - 文本模板

### 4.11 数学分类

#### 数值
- \`math_number\` - 数字

#### 基础运算
- \`math_arithmetic\` - 加减乘除
- \`math_modulo\` - 取余

#### 数学函数
- \`math_single\` - 单目运算
- \`math_trig\` - 三角函数
- \`math_round\` - 取整
- \`format_number\` - 格式化数字

#### 随机数
- \`math_random_int\` - 随机整数
- \`math_random_float\` - 随机小数

#### 常量
- \`math_constant\` - 数学常量

### 4.12 列表分类

#### 创建列表
- \`lists_create_with\` - 创建列表
- \`lists_repeat\` - 重复创建

#### 列表属性
- \`lists_length\` - 列表长度
- \`lists_isEmpty\` - 列表为空

#### 查找元素
- \`lists_indexOf\` - 查找索引

#### 获取元素
- \`lists_getIndex\` - 获取元素
- \`lists_getSublist\` - 获取子列表

#### 修改列表
- \`lists_setIndex\` - 设置元素
- \`lists_sort\` - 排序

### 4.13 网络请求分类

#### HTTP请求
- \`http_get\` - GET请求
- \`http_post\` - POST请求
- \`http_request\` - 通用请求

#### HTTP请求(存结果)
- \`http_get_with_var\` - GET请求(存结果)
- \`http_post_with_var\` - POST请求(存结果)

#### 文件下载
- \`http_download_base64\` - 下载Base64
- \`onebot_download_file\` - 下载文件

### 4.14 文件分类

#### 本地文件
- \`file_read\` - 读取文件
- \`file_write\` - 写入文件
- \`file_delete\` - 删除文件
- \`file_exists\` - 文件存在
- \`file_mkdir\` - 创建目录

#### 群文件上传
- \`file_upload_group\` - 上传群文件
- \`onebot_upload_group_file\` - OneBot上传群文件
- \`onebot_upload_private_file\` - OneBot上传私聊文件

#### 群文件上传(存结果)
- \`onebot_upload_group_file_with_var\` - 上传群文件(存结果)
- \`onebot_upload_private_file_with_var\` - 上传私聊文件(存结果)

#### 群文件管理
- \`file_delete_group\` - 删除群文件
- \`file_get_group_system_info\` - 获取群文件系统信息
- \`file_get_group_root\` - 获取群文件根目录
- \`onebot_delete_group_file\` - 删除群文件
- \`onebot_delete_group_folder\` - 删除群文件夹
- \`onebot_create_group_file_folder\` - 创建群文件夹
- \`onebot_rename_group_file_folder\` - 重命名群文件夹
- \`onebot_move_group_file\` - 移动群文件
- \`onebot_set_group_file_forever\` - 设置群文件永久

#### 群文件管理(存结果)
- \`onebot_delete_group_file_with_var\` - 删除群文件(存结果)
- \`onebot_delete_group_folder_with_var\` - 删除文件夹(存结果)
- \`onebot_create_group_file_folder_with_var\` - 创建文件夹(存结果)

#### 文件链接
- \`onebot_get_group_file_url\` - 获取群文件链接
- \`onebot_get_private_file_url\` - 获取私聊文件链接
- \`onebot_get_flash_file_info\` - 获取闪照文件信息

### 4.15 时间分类

#### 系统时间
- \`system_timestamp_seconds\` - 时间戳(秒)
- \`system_timestamp_milliseconds\` - 时间戳(毫秒)
- \`system_now\` - 当前时间

#### 获取时间单位
- \`time_get_year\` - 获取年份
- \`time_get_month\` - 获取月份
- \`time_get_day\` - 获取日期
- \`time_get_hour\` - 获取小时
- \`time_get_minute\` - 获取分钟
- \`time_get_second\` - 获取秒
- \`time_get_weekday\` - 获取星期
- \`time_get_weekday_name\` - 获取星期名称

#### 格式化日期
- \`time_format_date\` - 格式化日期
- \`time_format_time\` - 格式化时间
- \`time_format_datetime\` - 格式化日期时间

#### 时间戳转换
- \`time_timestamp_to_date\` - 时间戳转日期
- \`time_date_to_timestamp\` - 日期转时间戳

#### 时间计算
- \`time_add_unit\` - 时间加减
- \`time_diff\` - 时间差
- \`time_is_leap_year\` - 是否闰年
- \`time_days_in_month\` - 月份天数
- \`time_start_of_day\` - 当天开始
- \`time_end_of_day\` - 当天结束

#### 定时任务
- \`schedule_interval_seconds\` - 按秒定时
- \`schedule_interval_minutes\` - 按分钟定时
- \`schedule_interval_hours\` - 按小时定时
- \`schedule_daily\` - 每天定时
- \`schedule_weekly\` - 每周定时
- \`schedule_monthly\` - 每月定时

### 4.16 日志分类

- \`log_output\` - 日志输出
- \`log_info\` - 信息日志
- \`log_warn\` - 警告日志
- \`log_error\` - 错误日志
- \`log_debug\` - 调试日志

### 4.17 编码工具分类

#### URL编码
- \`utils_url_encode\` - URL编码
- \`utils_url_decode\` - URL解码

#### Base64编码
- \`utils_base64_encode\` - Base64编码
- \`utils_base64_decode\` - Base64解码

#### HTML转义
- \`utils_html_escape\` - HTML转义
- \`utils_html_unescape\` - HTML反转义

#### URL/域名处理
- \`url_extract_domain\` - 提取域名
- \`url_extract_tld\` - 提取顶级域名

### 4.18 系统分类

#### 机器人信息
- \`bot_get_login_info\` - 获取登录信息
- \`bot_get_status\` - 获取状态
- \`bot_get_version\` - 获取版本
- \`onebot_get_login_info\` - OneBot获取登录信息
- \`onebot_get_version_info\` - OneBot获取版本信息
- \`onebot_get_status\` - OneBot获取状态

#### 机器人信息(存结果)
- \`onebot_get_login_info_with_var\` - 获取登录信息(存结果)
- \`onebot_get_version_info_with_var\` - 获取版本信息(存结果)
- \`onebot_get_status_with_var\` - 获取状态(存结果)

#### 系统操作
- \`system_status\` - 系统状态
- \`onebot_get_cookies\` - 获取Cookies
- \`onebot_get_rkey\` - 获取Rkey
- \`onebot_set_online_status\` - 设置在线状态
- \`onebot_set_restart\` - 重启机器人
- \`onebot_clean_cache\` - 清理缓存

#### 系统操作(存结果)
- \`onebot_get_cookies_with_var\` - 获取Cookies(存结果)

#### 图像识别
- \`onebot_scan_qrcode\` - 扫描二维码
- \`onebot_ocr_image\` - OCR识别图片
- \`onebot_fetch_custom_face\` - 获取自定义表情
- \`onebot_get_recommend_face\` - 获取推荐表情
- \`message_image_has_qrcode\` - 图片包含二维码
- \`message_image_count_qrcodes\` - 统计二维码数量
- \`message_image_get_qrcodes\` - 获取二维码内容

#### 安全检查
- \`onebot_check_url_safely\` - URL安全检查

#### 高级功能
- \`onebot_send_pb\` - 发送Protobuf

### 4.19 注释分类

- \`comment_text\` - 文本注释
- \`comment_block\` - 块注释

### 4.20 高级分类

- \`lua_custom_code\` - 自定义Lua代码
- \`json_config_input\` - JSON配置输入
- \`plugin_rpc_declare_event\` - RPC声明事件
- \`plugin_rpc_call_function\` - RPC调用函数
- \`plugin_rpc_return_function\` - RPC返回函数

### 4.21 函数分类

- \`simple_function_def\` - 定义函数
- \`simple_function_call\` - 调用函数

### 4.22 高级API分类

#### API调用
- \`api_call_with_result\` - API调用(存结果)
- \`api_call_with_var\` - API调用(存变量)
- \`api_get_retcode\` - 获取返回码
- \`api_is_success\` - 判断是否成功

---

## 五、代码生成机制

### 5.1 代码生成流程

\`\`\`
┌─────────────────────────────────────────────────────────────┐
│  1. 解析工作区                                                │
│     - 遍历所有积木块                                          │
│     - 构建积木树结构                                          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  2. 代码生成                                                  │
│     - 为每个积木调用对应的生成器函数                           │
│     - 递归处理嵌套积木                                        │
│     - 拼接生成代码片段                                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  3. 代码优化                                                  │
│     - 格式化代码                                              │
│     - 添加注释                                                │
│     - 检查语法错误                                            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  4. 输出结果                                                  │
│     - 返回完整 Lua 代码                                       │
│     - 分离头部和主体                                          │
└─────────────────────────────────────────────────────────────┘
\`\`\`

### 5.2 生成的代码结构

\`\`\`lua
-- ============================================
-- 插件名称: MyPlugin
-- 版本: 1.0.0
-- 描述: 这是一个示例插件
-- 生成时间: 2026-04-15 10:30:00
-- ============================================

-- [BLOCKLY_CONFIG] {\"name\":\"MyPlugin\",\"version\":\"1.0.0\"}

-- ============================================
-- 头部：库导入和工具函数
-- ============================================

-- 事件监听函数
local function on_message(callback)
  -- 框架提供的事件注册
end

-- 消息发送函数
local message = {
  send_group = function(group_id, content)
    -- 发送群消息实现
  end,
  send_private = function(user_id, content)
    -- 发送私聊消息实现
  end
}

-- 其他工具函数...

-- ============================================
-- 主体：用户逻辑
-- ============================================

-- 事件处理：收到消息
on_message(function(event)
  -- 用户拼接的积木生成的代码
  local msg = event
  local sender_id = msg.user_id
  
  if msg.message_type == \"group\" then
    message.send_group(msg.group_id, \"收到群消息\")
  else
    message.send_private(sender_id, \"收到私聊消息\")
  end
end)

-- 插件初始化
function on_init()
  log.info(\"插件初始化完成\")
end

-- 插件卸载
function on_destroy()
  log.info(\"插件已卸载\")
end
\`\`\`

### 5.3 代码生成器示例

以 \`发送群消息\` 积木为例：

\`\`\`javascript
// 积木定义
Blockly.Blocks[\'message_send_group\'] = {
  init: function() {
    this.appendValueInput(\'GROUP_ID\')
        .setCheck(\'Number\')
        .appendField(\'发送群消息 群号\');
    this.appendValueInput(\'CONTENT\')
        .setCheck(\'String\')
        .appendField(\'内容\');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(210);
  }
};

// 代码生成器
luaGenerator.forBlock[\'message_send_group\'] = function(block, generator) {
  const groupId = generator.valueToCode(block, \'GROUP_ID\', Order.NONE);
  const content = generator.valueToCode(block, \'CONTENT\', Order.NONE);

  return \`message.send_group(\${groupId}, \${content})\\n\`;
};
\`\`\`

生成的 Lua 代码：
\`\`\`lua
message.send_group(123456789, \"你好\")
\`\`\`

### 5.4 运算符优先级

代码生成时遵循 Lua 运算符优先级：

| 优先级 | 运算符 | 说明 |
|--------|--------|------|
| 1 | \`^\` | 幂运算（右结合） |
| 2 | \`not\`, \`-\`, \`#\` | 一元运算符 |
| 3 | \`*\`, \`/\`, \`%\` | 乘除模 |
| 4 | \`+\`, \`-\` | 加减 |
| 5 | \`..\` | 字符串连接 |
| 6 | \`<\`, \`>\`, \`<=\`, \`>=\`, \`==\`, \`~=\` | 比较运算 |
| 7 | \`and\` | 逻辑与 |
| 8 | \`or\` | 逻辑或 |

---

## 六、实战示例详解

### 示例 1：最简单的自动回复机器人

**功能**：收到\"你好\"就回复\"你好呀！\"

**积木拼接：**
\`\`\`
当收到消息时 存储到变量 [msg]
  ↓
  如果 获取消息 [msg] 的纯文本内容 = \"你好\"
    ↓
    发送私聊消息 
        用户：获取消息 [msg] 的发送者ID 
        内容：\"你好呀！\"
\`\`\`

**生成的 Lua 代码：**
\`\`\`lua
on_message(function(msg)
  if msg.get_plain_text(msg) == \"你好\" then
    message.send_private(msg.get_sender_id(msg), \"你好呀！\")
  end
end)
\`\`\`

**运行流程：**
1. 用户发送消息\"你好\"
2. \`on_message\` 被触发
3. 检查消息内容是否等于\"你好\"
4. 如果匹配，发送私聊回复

---

### 示例 2：群管机器人（关键词禁言）

**功能**：群里有人说脏话就禁言10分钟

**积木拼接：**
\`\`\`
当收到消息时 存储到变量 [msg]
  ↓
  如果 消息 [msg] 是群消息
    ↓
    如果 消息 [msg] 包含文字 \"脏话\"
      ↓
      禁言群 获取消息 [msg] 的群ID 
          用户 获取消息 [msg] 的发送者ID 
          时长 600 秒
      发送群消息 
          群：获取消息 [msg] 的群ID 
          内容：\"检测到违规内容，已禁言10分钟\"
\`\`\`

**生成的 Lua 代码：**
\`\`\`lua
on_message(function(msg)
  if msg.is_group_message(msg) then
    if msg.contains_keyword(msg, \"脏话\") then
      group.set_ban(msg.get_group_id(msg), msg.get_sender_id(msg), 600)
      message.send_group(msg.get_group_id(msg), \"检测到违规内容，已禁言10分钟\")
    end
  end
end)
\`\`\`

**关键点：**
- 先判断是否为群消息（私聊没有群ID）
- 使用 \`contains_keyword\` 进行关键词检测
- 禁言时长单位是秒（600秒=10分钟）

---

### 示例 3：积分系统

**功能**：记录用户发言次数，达到100次时发送祝贺

**积木拼接：**
\`\`\`
当收到消息时 存储到变量 [msg]
  ↓
  设置 [user_id] 为 获取消息 [msg] 的发送者ID
  设置 [key] 为 连接文本 \"user_\" 和 [user_id]
  设置 [count] 为 从存储读取 [key] 默认值：0
  设置 [new_count] 为 [count] + 1
  保存到存储 键：[key] 值：[new_count]
  ↓
  如果 [new_count] = 100
    发送私聊消息 
        用户：[user_id] 
        内容：\"恭喜！你的发言次数达到100次！\"
  否则如果 [new_count] = 50
    发送私聊消息 
        用户：[user_id] 
        内容：\"你已经发言50次了，继续加油！\"
\`\`\`

**生成的 Lua 代码：**
\`\`\`lua
on_message(function(msg)
  local user_id = msg.get_sender_id(msg)
  local key = \"user_\" .. user_id
  local count = storage.get(key, 0)
  local new_count = count + 1
  storage.set(key, new_count)
  
  if new_count == 100 then
    message.send_private(user_id, \"恭喜！你的发言次数达到100次！\")
  elseif new_count == 50 then
    message.send_private(user_id, \"你已经发言50次了，继续加油！\")
  end
end)
\`\`\`

**设计要点：**
- 使用 \`user_\` + QQ号 作为存储键，确保每个用户独立计数
- 使用持久存储，重启后数据不丢失
- 可以扩展为积分系统，不同行为给不同分数

---

### 示例 4：天气查询机器人

**功能**：发送\"天气 北京\"查询北京天气

**积木拼接：**
\`\`\`
当收到消息时 存储到变量 [msg]
  ↓
  设置 [text] 为 获取消息 [msg] 的纯文本内容
  ↓
  如果 消息 [msg] 包含文字 \"天气 \"
    ↓
    设置 [city_start] 为 文本 [\"天气 \"] 的长度  -- 获取\"天气 \"的长度
    设置 [text_len] 为 文本 [text] 的长度
    设置 [city] 为 截取文本 [text] 从 ([city_start] + 1) 到 [text_len]
    设置 [url] 为 连接文本 \"https://api.weather.com/v1/current?city=\" 和 [city]
    设置 [response] 为 HTTP GET请求 [url]
    ↓
    如果 获取 [response] 的 [\"status\"] = 200
      设置 [data] 为 解析JSON 获取 [response] 的 [\"body\"]
      设置 [temp] 为 获取 [data] 的 [\"temperature\"]
      设置 [weather] 为 获取 [data] 的 [\"weather\"]
      发送私聊消息 
          用户：获取消息 [msg] 的发送者ID 
          内容：连接文本 [city] 和 \"当前天气：\" 和 [weather] 和 \"，温度：\" 和 [temp] 和 \"°C\"
    否则
      发送私聊消息 
          用户：获取消息 [msg] 的发送者ID 
          内容：\"查询天气失败，请稍后重试\"
\`\`\`

**关键点：**
- 使用字符串截取提取城市名
- 构造 API URL 并发送 HTTP 请求
- 解析 JSON 响应获取天气数据
- 错误处理：检查 HTTP 状态码

---

### 示例 5：群欢迎机器人

**功能**：新人进群时发送欢迎消息

**积木拼接：**
\`\`\`
当群成员增加时 存储到变量 [event]
  ↓
  设置 [group_id] 为 获取事件 [event] 的 [群ID]
  设置 [user_id] 为 获取事件 [event] 的 [用户ID]
  设置 [operator_id] 为 获取事件 [event] 的 [操作者ID]
  ↓
  发送群消息 
      群：[group_id] 
      内容：连接文本 \"欢迎 @\" 和 [user_id] 和 \" 加入群聊！\"
  
  如果 [operator_id] ≠ [user_id]
    发送群消息 
        群：[group_id] 
        内容：连接文本 \"（由 @\" 和 [operator_id] 和 \" 邀请入群）\"
\`\`\`

**生成的 Lua 代码：**
\`\`\`lua
on_group_member_increase(function(event)
  local group_id = event.group_id
  local user_id = event.user_id
  local operator_id = event.operator_id
  
  message.send_group(group_id, \"欢迎 @\" .. user_id .. \" 加入群聊！\")
  
  if operator_id ~= user_id then
    message.send_group(group_id, \"（由 @\" .. operator_id .. \" 邀请入群）\")
  end
end)
\`\`\`

**说明：**
- \`operator_id\` 是操作者，如果和被邀请人不同，说明是被邀请入群
- 使用 \`@\` 可以@用户

---

### 示例 6：自动审批入群申请

**功能**：自动同意符合条件的入群申请

**积木拼接：**
\`\`\`
当收到群请求时 存储到变量 [request]
  ↓
  设置 [user_id] 为 获取请求 [request] 的 [用户ID]
  设置 [group_id] 为 获取请求 [request] 的 [群ID]
  设置 [comment] 为 获取请求 [request] 的 [验证信息]
  ↓
  如果 文本 [comment] 包含 \"暗号\"
    同意群申请 请求：[request]
    发送私聊消息 
        用户：[user_id] 
        内容：\"欢迎加入！请记住群规。\"
  否则
    拒绝群申请 请求：[request] 理由：\"验证信息不正确\"
\`\`\`

---

### 示例 7：定时提醒机器人

**功能**：每天早上8点发送早安消息

**积木拼接：**
\`\`\`
插件初始化时
  ↓
  每天 \"08:00\" 执行
    设置 [groups] 为 获取群列表
    遍历列表 [groups] 中的每个项目，使用变量 [group]
      发送群消息 
          群：获取 [group] 的 [\"group_id\"] 
          内容：\"早安！祝大家今天有个好心情！☀️\"
  
  每隔 3600 秒执行
    日志 (调试, \"心跳检测：机器人运行正常\")
\`\`\`

**关键点：**
- 在 \`插件初始化时\` 设置定时任务
- 使用 \`每天\` 积木设置固定时间执行
- 使用 \`每隔\` 积木设置周期性任务

---

### 示例 8：图片识别机器人

**功能**：收到图片后进行 OCR 识别

**积木拼接：**
\`\`\`
当收到消息时 存储到变量 [msg]
  ↓
  如果 消息 [msg] 包含图片
    设置 [images] 为 获取消息 [msg] 中的所有图片
    设置 [first_image] 为 获取列表 [images] 的第 [1] 个
    设置 [ocr_result] 为 OCR识别图片 [first_image]
    ↓
    如果 获取 [ocr_result] 的 [\"success\"]
      设置 [text] 为 获取 [ocr_result] 的 [\"text\"]
      发送私聊消息 
          用户：获取消息 [msg] 的发送者ID 
          内容：连接文本 \"图片中的文字：\\n\" 和 [text]
    否则
      发送私聊消息 
          用户：获取消息 [msg] 的发送者ID 
          内容：\"图片识别失败，请确保图片清晰\"
\`\`\`

---

### 示例 9：关键词回复系统

**功能**：配置多个关键词和对应的回复

**积木拼接：**
\`\`\`
插件初始化时
  ↓
  -- 初始化关键词配置
  保存到存储 键：[\"keyword_你好\"] 值：[\"你好呀！有什么可以帮你的吗？\"]
  保存到存储 键：[\"keyword_帮助\"] 值：[\"我可以帮你：\\n1. 查询天气\\n2. 翻译文本\\n3. 计算数学\"]
  保存到存储 键：[\"keyword_时间\"] 值：[\"reply_time\"]  -- 特殊标记，表示需要动态生成回复

当收到消息时 存储到变量 [msg]
  ↓
  设置 [text] 为 获取消息 [msg] 的纯文本内容
  设置 [user_id] 为 获取消息 [msg] 的发送者ID
  ↓
  -- 遍历所有关键词
  设置 [keywords] 为 创建列表 [\"你好\"] [\"帮助\"] [\"时间\"]
  遍历列表 [keywords] 中的每个项目，使用变量 [keyword]
    如果 文本 [text] 包含 [keyword]
      设置 [reply_key] 为 连接文本 \"keyword_\" 和 [keyword]
      设置 [reply] 为 从存储读取 [reply_key] 默认值：[\"\"]
      ↓
      如果 [reply] = \"reply_time\"
        设置 [now] 为 格式化日期时间 (获取当前时间戳(秒)) 格式：[\"%H:%M:%S\"]
        发送私聊消息 用户：[user_id] 内容：连接文本 \"当前时间：\" 和 [now]
      否则如果 [reply] ≠ \"\"
        发送私聊消息 用户：[user_id] 内容：[reply]
      跳出循环
\`\`\`

**设计思路：**
- 使用存储保存关键词配置，方便动态修改
- 支持静态回复和动态回复（通过特殊标记）
- 匹配到关键词后立即跳出循环

---

### 示例 10：群签到系统

**功能**：记录用户每日签到，连续签到有奖励

**积木拼接：**
\`\`\`
当收到消息时 存储到变量 [msg]
  ↓
  如果 获取消息 [msg] 的纯文本内容 = \"签到\"
    设置 [user_id] 为 获取消息 [msg] 的发送者ID
    设置 [group_id] 为 获取消息 [msg] 的群ID
    设置 [today] 为 格式化日期时间 (获取当前时间戳(秒)) 格式：[\"%Y-%m-%d\"]
    ↓
    -- 检查今天是否已签到
    设置 [checkin_key] 为 连接文本 \"checkin_\" 和 [user_id] 和 \"_\" 和 [today]
    设置 [has_checkin] 为 从存储读取 [checkin_key] 默认值：false
    ↓
    如果 [has_checkin]
      发送群消息 群：[group_id] 内容：\"你今天已经签到过了！\"
    否则
      -- 记录今日签到
      保存到存储 键：[checkin_key] 值：true
      ↓
      -- 获取连续签到天数
      设置 [streak_key] 为 连接文本 \"streak_\" 和 [user_id]
      设置 [last_date] 为 从存储读取 (连接文本 \"last_checkin_\" 和 [user_id]) 默认值：[\"\"]
      设置 [streak] 为 从存储读取 [streak_key] 默认值：0
      ↓
      -- 计算昨天日期
      设置 [yesterday_timestamp] 为 (获取当前时间戳(秒)) - 86400
      设置 [yesterday] 为 格式化日期时间 [yesterday_timestamp] 格式：[\"%Y-%m-%d\"]
      ↓
      如果 [last_date] = [yesterday]
        设置 [streak] 为 [streak] + 1  -- 连续签到
      否则
        设置 [streak] 为 1  -- 重新开始
      ↓
      保存到存储 键：[streak_key] 值：[streak]
      保存到存储 键：(连接文本 \"last_checkin_\" 和 [user_id]) 值：[today]
      ↓
      -- 发送签到成功消息
      设置 [points] 为 10 + ([streak] × 5)  -- 基础10分，连续签到额外奖励
      发送群消息 
          群：[group_id] 
          内容：连接文本 \"@\" 和 [user_id] 和 \" 签到成功！\\n连续签到 \" 和 [streak] 和 \" 天\\n获得 \" 和 [points] 和 \" 积分\"
\`\`\`

**核心逻辑：**
1. 检查今天是否已签到
2. 获取上次签到日期
3. 判断是否是连续签到（上次是昨天）
4. 计算积分（基础分 + 连续签到奖励）
5. 保存签到记录

---

## 七、高级功能与技巧

### 7.1 工作区操作技巧

#### 7.1.1 快速导航

| 操作 | 方法 | 说明 |
|------|------|------|
| 居中显示 | 双击工作区空白处 | 将所有积木居中显示 |
| 缩放重置 | 点击工具栏重置按钮 | 恢复 100% 缩放 |
| 整理积木 | 右键选择\"整理积木\" | 自动对齐所有积木 |
| 搜索积木 | Ctrl + F | 快速查找积木 |

#### 7.1.2 批量操作

- **多选积木**：按住 \`Ctrl\` 点击多个积木
- **复制选中**：\`Ctrl + C\`
- **粘贴积木**：\`Ctrl + V\`
- **删除选中**：\`Delete\` 键

#### 7.1.3 预览模式

按 \`Ctrl + P\` 进入预览模式：
- 鼠标变为抓手形状
- 左键拖拽移动视角
- 滚轮缩放
- 再次按 \`Ctrl + P\` 退出

### 7.2 代码优化技巧

#### 7.2.1 减少重复代码

**不好的做法：**
\`\`\`
发送群消息 群：123 内容：\"你好\"
发送群消息 群：123 内容：\"世界\"
发送群消息 群：123 内容：\"!\"
\`\`\`

**好的做法：**
\`\`\`
设置 [group_id] 为 123
发送群消息 群：[group_id] 内容：\"你好\"
发送群消息 群：[group_id] 内容：\"世界\"
发送群消息 群：[group_id] 内容：\"!\"
\`\`\`

#### 7.2.2 使用函数封装

**定义函数：**
\`\`\`
定义函数 [sendWelcome] 参数：[user_id]
  发送私聊消息 
      用户：[user_id] 
      内容：\"欢迎来到本群！请遵守群规。\"
\`\`\`

**调用函数：**
\`\`\`
当群成员增加时
  调用函数 [sendWelcome] 参数：(获取事件 [event] 的 [用户ID])
\`\`\`

#### 7.2.3 合理使用存储

**缓存配置：**
\`\`\`
插件初始化时
  设置 [config] 为 从存储读取 [\"config\"] 默认值：{}
  如果 [config] = {}
    设置 [config] 为 创建对象
        设置字段 [\"welcome_msg\"] 为 \"欢迎！\"
        设置字段 [\"admin_qq\"] 为 123456789
    保存到存储 键：[\"config\"] 值：[config]
\`\`\`

### 7.3 调试技巧

#### 7.3.1 日志分级

\`\`\`
日志 (调试, \"进入函数 processMessage\")
日志 (信息, \"处理消息：\" + message_content)
日志 (警告, \"未识别的命令：\" + command)
日志 (错误, \"数据库连接失败：\" + error_message)
\`\`\`

#### 7.3.2 变量追踪

\`\`\`
设置 [user_id] 为 123456789
日志 (调试, 连接文本 \"user_id = \" 和 [user_id])
\`\`\`

#### 7.3.3 错误处理

\`\`\`
设置 [result] 为 HTTP GET请求 [\"https://api.example.com/data\"]
如果 获取 [result] 的 [\"error\"] ≠ nil
  日志 (错误, 连接文本 \"请求失败：\" 和 获取 [result] 的 [\"error\"])
  返回
-- 继续处理正常逻辑
\`\`\`

### 7.4 性能优化

#### 7.4.1 避免频繁存储操作

**不好的做法：**
\`\`\`
遍历列表 [users] 中的每个项目，使用变量 [user]
  保存到存储 键：(连接文本 \"user_\" 和 [user]) 值：(获取当前时间戳)
\`\`\`

**好的做法：**
\`\`\`
设置 [data] 为 创建对象
遍历列表 [users] 中的每个项目，使用变量 [user]
  设置字段 [user] 为 (获取当前时间戳) 到对象 [data]
保存到存储 键：[\"users\"] 值：[data]  -- 一次性保存
\`\`\`

#### 7.4.2 批量发送消息

\`\`\`
设置 [messages] 为 创建列表
遍历列表 [users] 中的每个项目，使用变量 [user]
  添加 (连接文本 \"你好，\" 和 [user]) 到列表 [messages]

-- 使用定时器分批发送，避免频率限制
设置 [index] 为 1
每隔 5 秒执行
  如果 [index] > 列表 [messages] 的长度
    停止定时器
  否则
    发送私聊消息 用户：(获取列表 [users] 的第 [index] 个) 内容：(获取列表 [messages] 的第 [index] 个)
    设置 [index] 为 [index] + 1
\`\`\`

---

## 八、常见问题与排错

### 8.1 积木相关问题

#### Q1: 为什么我的积木连不上？

**A:** 检查积木的形状是否匹配：
- 帽子积木只能放在最上面
- 拼图积木上下要对应
- 椭圆积木要放进对应的输入框

**常见错误：**
\`\`\`
❌ 错误：将值积木直接放在工作区，没有嵌入到输入框
✅ 正确：将值积木拖拽到输入框中
\`\`\`

#### Q2: 为什么积木显示红色警告？

**A:** 红色警告表示积木配置不完整或有错误：
- 必填参数未填写
- 输入类型不匹配
- 变量名不合法

**解决方法：**
- 检查所有必填参数是否已填写
- 确保输入的值类型正确（数字输入框不能放字符串）
- 修改变量名（不能以数字开头）

#### Q3: 如何复制一段积木？

**A:** 三种方法：
1. **右键菜单**：右键点击积木 → 复制 → 右键工作区 → 粘贴
2. **快捷键**：选中积木 → \`Ctrl + C\` → \`Ctrl + V\`
3. **拖拽复制**：按住 \`Alt\` 拖拽积木

### 8.2 代码生成问题

#### Q4: 生成的代码有语法错误？

**A:** 可能的原因：
- 变量名使用了 Lua 关键字（如 \`end\`, \`if\`, \`then\`）
- 字符串中包含未转义的特殊字符
- 自定义代码积木中的 Lua 语法错误

**解决方法：**
\`\`\`
❌ 变量名：end, if, then, function
✅ 变量名：end_time, is_if, then_do, my_function
\`\`\`

#### Q5: 为什么生成的代码中有些变量名变了？

**A:** Blockly 会自动处理变量名：
- 去除非法字符
- 处理关键字冲突
- 保持变量名唯一性

### 8.3 运行时问题

#### Q6: 日志输出为什么是空白的？

**A:** 你可能直接输出了表对象。需要先用\"将表转为JSON字符串\"转换。

**错误：**
\`\`\`
❌ 日志 (信息, msg)  ← 输出空白
\`\`\`

**正确：**
\`\`\`
✅ 日志 (信息, 将表 [msg] 转为JSON字符串)  ← 正常显示
\`\`\`

#### Q7: 如何判断是群消息还是私聊？

**A:** 有三种方法：

**方法1（推荐）：**
\`\`\`
如果 消息 [msg] 是群消息
  ...
\`\`\`

**方法2：**
\`\`\`
如果 获取消息 [msg] 的 [消息类型] = \"group\"
  ...
\`\`\`

#### Q8: 如何获取发送者的昵称？

**A:**
\`\`\`
获取消息 [msg] 的 [发送者昵称]
\`\`\`

#### Q9: 回复消息时引用消息ID有什么用？

**A:** 引用消息ID可以让回复显示为\"回复某条消息\"的样式。

- 填消息ID → 显示为回复样式
- 填 0 或不填 → 直接发送新消息

#### Q10: 变量名有什么要求？

**A:**
- ✅ 可以用：字母、数字、下划线
- ✅ 示例：\`user_name\`, \`count1\`, \`_temp\`
- ❌ 不能用：数字开头、特殊符号、空格
- ❌ 错误：\`1user\`, \`user-name\`, \`user name\`

#### Q11: 为什么我的数学计算结果不对？

**A:** 检查数据类型：
- \`\"123\"\`（字符串）不能参与数学运算
- \`123\`（数字）才能参与数学运算

**转换方法：**
\`\`\`
设置 [num] 为 将 [\"123\"] 转为数字
→ num = 123
\`\`\`

#### Q12: 如何保存数据，重启后还在？

**A:** 使用存储积木：

\`\`\`
保存数据：
  保存到存储 键：[\"mydata\"] 值：[\"Hello\"]

读取数据：
  从存储读取 [\"mydata\"] 默认值：[\"默认值\"]
\`\`\`

#### Q13: 如何调试程序，看哪里出错了？

**A:** 使用日志积木输出中间结果：

\`\`\`
当收到消息时 存储到变量 [msg]
  日志 (调试, 连接文本 \"收到消息：\" 和 将表 [msg] 转为JSON字符串)
  
  设置 [text] 为 获取消息 [msg] 的纯文本内容
  日志 (调试, 连接文本 \"消息内容：\" 和 [text])
  
  ...其他代码...
\`\`\`

#### Q14: 如何获取数组的第N个元素？

**A:** 

\`\`\`
安全获取 [数组] 的 [\"3\"] 默认值：[\"不存在\"]
→ 获取第3个元素，如果没有则返回\"不存在\"
\`\`\`

**注意：** 数组从1开始计数，不是从0开始！

#### Q15: HTTP请求失败怎么办？

**A:** 检查以下几点：
1. URL 是否正确
2. 网络是否通畅
3. 请求参数是否正确
4. 服务器是否返回错误

\`\`\`
设置 [response] 为 HTTP GET请求 [url]
如果 获取 [response] 的 [\"status\"] ≠ 200
  日志 (错误, 连接文本 \"请求失败：\" 和 获取 [response] 的 [\"body\"])
否则
  -- 处理成功响应
\`\`\`

### 8.4 性能问题

#### Q16: 插件运行很慢怎么办？

**A:** 优化建议：
1. 减少存储操作次数
2. 避免在循环中发送消息
3. 使用缓存减少重复计算
4. 优化正则表达式匹配

#### Q17: 如何处理大量消息？

**A:** 使用消息队列：
\`\`\`
当收到消息时 存储到变量 [msg]
  设置 [queue] 为 从存储读取 [\"message_queue\"] 默认值：[]
  添加 [msg] 到列表 [queue]
  保存到存储 键：[\"message_queue\"] 值：[queue]

每隔 1 秒执行
  设置 [queue] 为 从存储读取 [\"message_queue\"] 默认值：[]
  如果 列表 [queue] 的长度 > 0
    设置 [msg] 为 获取列表 [queue] 的第 [1] 个
    移除列表 [queue] 的第 [1] 个
    保存到存储 键：[\"message_queue\"] 值：[queue]
    -- 处理消息
\`\`\`

### 8.5 其他问题

#### Q18: 如何备份我的项目？

**A:** 三种方式：
1. **导出项目**：点击工具栏\"导出\"按钮，下载 \`.blockly\` 文件
2. **保存到云端**：登录账号后自动同步
3. **复制代码**：导出 Lua 代码保存

#### Q19: 如何分享我的插件？

**A:** 
1. 导出项目文件（.blockly）
2. 发送给朋友
3. 对方导入即可使用

#### Q20: 如何学习更多？

**A:** 
- 查看官方示例项目
- 阅读本文档的实战示例
- 加入社区交流群
- 查看生成的 Lua 代码学习

---

## 九、最佳实践指南

### 9.1 代码组织

#### 9.1.1 模块化设计

将功能拆分为多个函数：
\`\`\`
定义函数 [handleGroupMessage] 参数：[msg]
  -- 处理群消息的逻辑

定义函数 [handlePrivateMessage] 参数：[msg]
  -- 处理私聊消息的逻辑

当收到消息时 存储到变量 [msg]
  如果 消息 [msg] 是群消息
    调用函数 [handleGroupMessage] 参数：[msg]
  否则
    调用函数 [handlePrivateMessage] 参数：[msg]
\`\`\`

#### 9.1.2 配置与逻辑分离

\`\`\`
插件初始化时
  -- 加载配置
  设置 [config] 为 从存储读取 [\"config\"] 默认值：{
    \"welcome_msg\": \"欢迎入群！\",
    \"admin_qq\": 123456789
  }
  
  -- 保存默认配置
  保存到存储 键：[\"config\"] 值：[config]

当群成员增加时
  设置 [config] 为 从存储读取 [\"config\"]
  发送群消息 群：(获取事件 [event] 的 [群ID]) 内容：(获取 [config] 的 [\"welcome_msg\"])
\`\`\`

### 9.2 命名规范

#### 9.2.1 变量命名

| 类型 | 命名规范 | 示例 |
|------|---------|------|
| 普通变量 | 小写+下划线 | \`user_name\`, \`message_count\` |
| 常量 | 全大写+下划线 | \`MAX_RETRY\`, \`DEFAULT_TIMEOUT\` |
| 临时变量 | 前缀+描述 | \`temp_user\`, \`idx_loop\` |
| 布尔变量 | is/has+描述 | \`is_admin\`, \`has_permission\` |

#### 9.2.2 函数命名

\`\`\`
✅ 动词+名词：sendMessage, getUserInfo, processData
❌ 避免：doSomething, handle, fn1
\`\`\`

### 9.3 错误处理

#### 9.3.1 防御式编程

\`\`\`
设置 [user_id] 为 获取消息 [msg] 的发送者ID
如果 [user_id] = nil
  日志 (错误, \"无法获取发送者ID\")
  返回
-- 继续处理
\`\`\`

#### 9.3.2 优雅降级

\`\`\`
设置 [response] 为 HTTP GET请求 [url]
如果 获取 [response] 的 [\"status\"] ≠ 200
  日志 (警告, \"API请求失败，使用默认数据\")
  设置 [data] 为 { \"temperature\": \"未知\", \"weather\": \"未知\" }
否则
  设置 [data] 为 解析JSON 获取 [response] 的 [\"body\"]
\`\`\`

### 9.4 安全建议

#### 9.4.1 输入验证

\`\`\`
设置 [user_input] 为 获取消息 [msg] 的纯文本内容

-- 验证长度
如果 文本 [user_input] 的长度 > 1000
  发送私聊消息 用户：(获取消息 [msg] 的发送者ID) 内容：\"输入太长\"
  返回

-- 验证内容
如果 文本 [user_input] 包含 \"<script>\"
  日志 (警告, \"检测到潜在XSS攻击\")
  返回
\`\`\`

#### 9.4.2 权限检查

\`\`\`
设置 [sender_role] 为 获取消息 [msg] 的 [发送者角色]
如果 [sender_role] ≠ \"admin\" 且 [sender_role] ≠ \"owner\"
  发送群消息 群：(获取消息 [msg] 的群ID) 内容：\"只有管理员可以使用此命令\"
  返回
-- 执行管理员操作
\`\`\`

### 9.5 性能优化

#### 9.5.1 避免重复计算

\`\`\`
❌ 不好：
如果 获取消息 [msg] 的纯文本内容 = \"命令1\"
  ...
如果 获取消息 [msg] 的纯文本内容 = \"命令2\"
  ...

✅ 好：
设置 [text] 为 获取消息 [msg] 的纯文本内容
如果 [text] = \"命令1\"
  ...
如果 [text] = \"命令2\"
  ...
\`\`\`

#### 9.5.2 批量操作

\`\`\`
❌ 不好：
遍历列表 [users] 中的每个项目，使用变量 [user]
  保存到存储 键：(连接文本 \"user_\" 和 [user]) 值：...

✅ 好：
设置 [data] 为 创建对象
遍历列表 [users] 中的每个项目，使用变量 [user]
  设置字段 [user] 为 ... 到对象 [data]
保存到存储 键：[\"users\"] 值：[data]  -- 一次性保存
\`\`\`

### 9.6 文档与注释

#### 9.6.1 添加注释

\`\`\`
注释：这是一个群管机器人插件
注释：功能包括：关键词禁言、欢迎新人、自动审批

当收到消息时 存储到变量 [msg]
  注释：检查是否是管理员
  设置 [is_admin] 为 获取消息 [msg] 的 [发送者角色] = \"admin\"
  
  注释：处理管理员命令
  如果 [is_admin]
    -- 处理命令
\`\`\`

#### 9.6.2 项目文档

在项目描述中写明：
- 插件功能概述
- 使用方法
- 配置说明
- 注意事项

---

## 十、API 参考手册

### 10.1 消息相关 API

#### 10.1.1 消息对象属性

| 属性 | 类型 | 说明 | 示例 |
|------|------|------|------|
| \`message_id\` | String/Number | 消息唯一ID | \`\"1234567890\"\` |
| \`message_type\` | String | 消息类型 | \`\"group\"\` / \`\"private\"\` |
| \`user_id\` | Number | 发送者QQ号 | \`123456789\` |
| \`group_id\` | Number | 群号（群消息） | \`987654321\` |
| \`raw_message\` | String | 原始消息内容 | \`\"你好 [CQ:at,qq=123]\"\` |
| \`time\` | Number | 发送时间戳 | \`1678886400\` |
| \`sender\` | Object | 发送者信息 | 见下表 |

**sender 对象：**
| 属性 | 类型 | 说明 |
|------|------|------|
| \`nickname\` | String | 昵称 |
| \`card\` | String | 群名片 |
| \`role\` | String | 角色：\`owner\`/\`admin\`/\`member\` |

#### 10.1.2 消息方法

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| \`get_plain_text()\` | 无 | String | 获取纯文本内容 |
| \`get_images()\` | 无 | Array | 获取图片URL列表 |
| \`get_at_users()\` | 无 | Array | 获取@的用户列表 |
| \`contains_keyword(text)\` | text: String | Boolean | 检查是否包含关键词 |
| \`is_group_message()\` | 无 | Boolean | 是否是群消息 |
| \`is_at_bot()\` | 无 | Boolean | 是否@了机器人 |

### 10.2 群组相关 API

#### 10.2.1 群信息

| API | 参数 | 返回值 | 说明 |
|-----|------|--------|------|
| \`group.get_list()\` | 无 | Array | 获取群列表 |
| \`group.get_members(group_id)\` | group_id: Number | Array | 获取群成员列表 |
| \`group.get_info(group_id)\` | group_id: Number | Object | 获取群信息 |

#### 10.2.2 群管理

| API | 参数 | 返回值 | 说明 |
|-----|------|--------|------|
| \`group.set_ban(group_id, user_id, duration)\` | 群号, QQ号, 秒数 | Boolean | 禁言成员 |
| \`group.kick(group_id, user_id, reject)\` | 群号, QQ号, 是否拒绝再加群 | Boolean | 踢出成员 |
| \`group.set_card(group_id, user_id, card)\` | 群号, QQ号, 名片 | Boolean | 设置群名片 |
| \`group.set_admin(group_id, user_id, enable)\` | 群号, QQ号, 是否设置 | Boolean | 设置管理员 |
| \`group.set_whole_ban(group_id, enable)\` | 群号, 是否开启 | Boolean | 全员禁言 |
| \`group.poke(group_id, user_id)\` | 群号, QQ号 | Boolean | 戳一戳 |

### 10.3 存储相关 API

#### 10.3.1 基本操作

| API | 参数 | 返回值 | 说明 |
|-----|------|--------|------|
| \`storage.set(key, value)\` | 键, 值 | Boolean | 保存数据 |
| \`storage.get(key, default)\` | 键, 默认值 | Any | 读取数据 |
| \`storage.delete(key)\` | 键 | Boolean | 删除数据 |
| \`storage.clear()\` | 无 | Boolean | 清空所有数据 |

#### 10.3.2 高级操作

| API | 参数 | 返回值 | 说明 |
|-----|------|--------|------|
| \`storage.has(key)\` | 键 | Boolean | 检查键是否存在 |
| \`storage.keys()\` | 无 | Array | 获取所有键 |

### 10.4 HTTP 相关 API

#### 10.4.1 请求方法

| API | 参数 | 返回值 | 说明 |
|-----|------|--------|------|
| \`http.request(method, url, headers, body)\` | 方法, URL, 请求头, 请求体 | Object | 发送HTTP请求 |
| \`http.get(url)\` | URL | Object | GET请求 |
| \`http.post(url, body)\` | URL, 请求体 | Object | POST请求 |

#### 10.4.2 响应对象

| 属性 | 类型 | 说明 |
|------|------|------|
| \`status\` | Number | HTTP状态码 |
| \`headers\` | Object | 响应头 |
| \`body\` | String | 响应体 |
| \`error\` | String | 错误信息 |

### 10.5 时间相关 API

#### 10.5.1 获取时间

| API | 参数 | 返回值 | 说明 |
|-----|------|--------|------|
| \`system.get_timestamp_seconds()\` | 无 | Number | 秒级时间戳 |
| \`system.get_timestamp_milliseconds()\` | 无 | Number | 毫秒级时间戳 |
| \`system.now()\` | 无 | Object | 当前时间对象 |

#### 10.5.2 格式化

| API | 参数 | 返回值 | 说明 |
|-----|------|--------|------|
| \`os.date(format, timestamp)\` | 格式, 时间戳 | String | 格式化日期 |

### 10.6 定时任务 API

| API | 参数 | 返回值 | 说明 |
|-----|------|--------|------|
| \`schedule.interval(seconds, callback)\` | 秒数, 回调函数 | Timer | 定时执行 |
| \`schedule.daily(time, callback)\` | 时间(HH:MM), 回调函数 | Timer | 每天执行 |
| \`schedule.weekly(day, time, callback)\` | 星期(1-7), 时间, 回调 | Timer | 每周执行 |
| \`timer.stop()\` | 无 | 无 | 停止定时器 |

---

## 十一、附录

### 11.1 Lua 关键字列表

以下单词不能用作变量名：

\`\`\`
and       break     do        else      elseif
end       false     for       function  if
in        local     nil       not       or
repeat    return    then      true      until
while
\`\`\`

### 11.2 CQ 码参考

CQ 码是 QQ 消息中的特殊格式：

| CQ码 | 说明 | 示例 |
|------|------|------|
| \`[CQ:at,qq=123]\` | @某人 | \`[CQ:at,qq=123456]\` |
| \`[CQ:at,qq=all]\` | @全体成员 | \`[CQ:at,qq=all]\` |
| \`[CQ:image,file=...]\` | 图片 | \`[CQ:image,file=abc.jpg]\` |
| \`[CQ:face,id=...]\` | 表情 | \`[CQ:face,id=14]\` |
| \`[CQ:record,file=...]\` | 语音 | \`[CQ:record,file=abc.amr]\` |
| \`[CQ:video,file=...]\` | 视频 | \`[CQ:video,file=abc.mp4]\` |

### 11.3 相关文件位置

| 文件 | 路径 | 说明 |
|------|------|------|
| 编辑器主组件 | \`web/src/app/blockly/BlocklyEditor.tsx\` | Blockly 编辑器 React 组件 |
| 积木定义 | \`web/src/app/blockly/blocks/index.ts\` | 所有积木的定义 |
| 工具箱配置 | \`web/src/app/blockly/toolbox/index.ts\` | 工具箱分类和积木列表 |
| 代码生成器 | \`web/src/app/blockly/generator.ts\` | Lua 代码生成逻辑 |
| 类型定义 | \`web/src/app/blockly/types.ts\` | TypeScript 类型定义 |
| 主题配置 | \`web/src/app/blockly/theme/index.ts\` | 颜色和样式配置 |
| 中文本地化 | \`web/src/app/blockly/locale.ts\` | 中文翻译 |
| 项目管理 | \`web/src/app/blockly/projectManager.ts\` | 项目保存/加载逻辑 |

### 11.4 参考资源

- [Blockly 官方文档](https://developers.google.com/blockly)
- [Blockly GitHub](https://github.com/google/blockly)
- [Lua 5.4 参考手册](https://www.lua.org/manual/5.4/)
- [OneBot 11 协议](https://github.com/botuniverse/onebot-11)
- [go-cqhttp 文档](https://docs.go-cqhttp.org/)

### 11.5 更新日志

#### v1.0.0 (2026-04-15)
- 初始版本发布
- 支持 200+ 积木
- 完整的 QQ 机器人功能
- Lua 代码生成
- 项目导入/导出

### 11.6 术语表

| 术语 | 英文 | 说明 |
|------|------|------|
| 积木 | Block | Blockly 中的编程单元 |
| 工作区 | Workspace | 拖拽和编辑积木的区域 |
| 工具箱 | Toolbox | 存放可用积木的侧边栏 |
| 代码生成器 | Generator | 将积木转换为代码的模块 |
| 事件 | Event | 触发程序执行的信号 |
| 变量 | Variable | 存储数据的容器 |
| 函数 | Function | 可重复使用的代码块 |
| 表 | Table | Lua 中的键值对数据结构 |
| CQ 码 | CQ Code | QQ 消息中的特殊格式代码 |
| OneBot | OneBot | 聊天机器人应用接口标准 |

---

**祝你编程愉快！有任何问题可以查看日志输出进行调试。**

*本文档由 Blockly 编辑器自动生成辅助，如有错误请反馈。*
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

  // 使用 ref 存储最新的项目状态，确保被动生成代码时能获取到正确的插件名称
  const currentProjectRef = useRef(currentProject);
  const exportMetadataRef = useRef(exportMetadata);

  useEffect(() => {
    currentProjectRef.current = currentProject;
  }, [currentProject]);

  useEffect(() => {
    exportMetadataRef.current = exportMetadata;
  }, [exportMetadata]);
  
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{type: string, label: string}>>([]);

  // 预览模式拖拽 refs
  const isPreviewDraggingRef = useRef(false);
  const previewDragStartRef = useRef({ x: 0, y: 0 });
  const previewScrollStartRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    loadProjects();
    loadAvailableAccounts();
    loadBlockConfig();
  }, []);

  const loadBlockConfig = async () => {
    try {
      const result = await fetchBlockConfig(false);
      if (result.config && result.config.blocks.length > 0) {
        reinitializeBlocks(result.config.blocks);
      }
      if (result.error) {
        console.warn('Blockly配置加载提示:', result.error);
      }
    } catch (error) {
      console.error('加载Blockly配置失败:', error);
    } finally {
      setConfigReady(true);
    }
  };

  const handleRefreshConfig = useCallback(async () => {
    setConfigLoading(true);
    try {
      clearConfigCache();
      const result = await fetchBlockConfig(true);
      if (result.config && result.config.blocks.length > 0) {
        reinitializeBlocks(result.config.blocks);
        if (workspaceRef.current) {
          const currentXml = Blockly.Xml.workspaceToDom(workspaceRef.current);
          workspaceRef.current.clear();
          
          const apiToolbox = getApiToolbox();
          const toolbox = apiToolbox || getToolboxCategories();
          workspaceRef.current.updateToolbox(toolbox);
          
          try {
            Blockly.Xml.domToWorkspace(currentXml, workspaceRef.current);
          } catch (e) {
            console.error('重新加载工作区失败:', e);
          }
        }
        toast.success('积木配置已更新');
      } else if (result.error) {
        toast.error(result.error);
      } else {
        toast.warning('未获取到有效配置，使用默认积木');
      }
    } catch (error) {
      toast.error('刷新配置失败，请稍后重试');
    } finally {
      setConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      }
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false);
        setSearchTerm('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchOpen]);

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
    if (containerRef.current && !workspaceRef.current && configReady) {
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
  }, [configReady]);

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
      toolbox: getApiToolbox() || getToolboxCategories(),
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

    // 初始调整 SVG 大小以确保正确填充容器
    const resizeWorkspace = () => {
      if (workspaceRef.current) {
        Blockly.svgResize(workspaceRef.current);
      }
    };
    
    // 多次调用确保完全调整
    setTimeout(resizeWorkspace, 100);
    setTimeout(resizeWorkspace, 300);
    setTimeout(resizeWorkspace, 500);

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
          performPaste();
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

  const handleBlockSearch = useCallback((term: string) => {
    setSearchTerm(term);
    if (!term.trim()) {
      setSearchResults([]);
      return;
    }
    const results: Array<{type: string, label: string}> = [];
    const lowerTerm = term.toLowerCase();
    const toolbox = getToolboxCategories();
    const blockMessageMap = getBlockMessageMap();
    function searchInCategory(cat: any) {
      if (cat.contents) {
        for (const item of cat.contents) {
          if (item.kind === 'block') {
            const blockType = item.type;
            const msgKey = 'BLOCKLY_' + blockType.toUpperCase();
            const chineseLabel = (Blockly.Msg as any)[msgKey] || '';
            const blockDef = blockMessageMap[blockType];
            const message0 = blockDef?.message0 || '';
            const tooltip = blockDef?.tooltip || '';
            const typeLabel = blockType.replace(/_/g, ' ').replace('onebot ', '').replace('event on ', '').replace('msg get ', '');
            if (
              blockType.toLowerCase().includes(lowerTerm) ||
              chineseLabel.toLowerCase().includes(lowerTerm) ||
              typeLabel.toLowerCase().includes(lowerTerm) ||
              message0.toLowerCase().includes(lowerTerm) ||
              tooltip.toLowerCase().includes(lowerTerm)
            ) {
              const rawLabel = chineseLabel || message0;
              const displayLabel = rawLabel
                ? rawLabel.replace(/ %\d/g, '').trim()
                : typeLabel;
              if (!results.find(r => r.type === blockType)) {
                results.push({ type: blockType, label: displayLabel });
              }
            }
          } else if (item.kind === 'category') {
            searchInCategory(item);
          }
        }
      }
    }
    if (toolbox.contents) {
      for (const cat of toolbox.contents) {
        searchInCategory(cat);
      }
    }
    setSearchResults(results.slice(0, 30));
  }, []);

  const handleSearchResultClick = useCallback((blockType: string) => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const block = workspace.newBlock(blockType);
    block.initSvg();
    block.render();
    const metrics = workspace.getMetrics();
    const scale = workspace.scale;
    block.moveBy(
      (metrics.viewWidth / 2 / scale) - (block.width / 2),
      (metrics.viewHeight / 2 / scale) - (block.height / 2)
    );
    block.select();
    setSearchOpen(false);
    setSearchTerm('');
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

  // 修复旧块 XML - 转换 text_replace 为 text_replace_custom
  const fixOldBlockXml = useCallback((xml: Element): Element => {
    const blocks = xml.getElementsByTagName('block');
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      if (block.getAttribute('type') === 'text_replace') {
        // 转换为新的块类型
        block.setAttribute('type', 'text_replace_custom');
        
        // 转换输入名称
        const inputs = block.getElementsByTagName('value');
        for (let j = 0; j < inputs.length; j++) {
          const input = inputs[j];
          const name = input.getAttribute('name');
          if (name === 'STR') {
            input.setAttribute('name', 'TEXT');
          } else if (name === 'FROM') {
            input.setAttribute('name', 'SEARCH');
          } else if (name === 'TO') {
            input.setAttribute('name', 'REPLACE');
          }
        }
      }
    }
    return xml;
  }, []);

  // 通用粘贴函数 - 统一处理粘贴逻辑
  const performPaste = useCallback(() => {
    const workspace = workspaceRef.current as Blockly.WorkspaceSvg | null;
    
    // 首先验证工作区状态
    if (!workspace || typeof workspace.isDisposed === 'function' && workspace.isDisposed()) {
      toast.error('工作区已失效，请刷新页面');
      return;
    }

    const clipboardContent = blockClipboardRef.current;
    if (!clipboardContent) {
      toast.warning('剪贴板为空，请先复制积木');
      return;
    }

    try {
      let xml = Blockly.utils.xml.textToDom(clipboardContent);
      
      // 修复旧块
      xml = fixOldBlockXml(xml);
      
      const blockElements = xml.getElementsByTagName('block');
      const blockCount = blockElements.length;

      if (blockCount > 50) {
        toast.info(`正在粘贴 ${blockCount} 个积木，请稍候...`);
      }

      // 使用 Blockly 内置的 domToWorkspace 进行粘贴，比手动分批更稳定
      const pastedBlocks = Blockly.Xml.domToWorkspace(xml, workspace);
      
      // 清理剪贴板，防止重复粘贴累积
      setClipboardContent(null);
      
      workspace.render();
      toast.success(`成功粘贴 ${blockCount} 个积木`);
      
    } catch (error) {
      console.error('粘贴失败:', error);
      toast.error('粘贴失败，请重试');
      // 出错时也清理剪贴板，避免重复尝试同样的错误内容
      setClipboardContent(null);
    }
  }, [fixOldBlockXml]);

  // 从剪贴板粘贴积木
  const handlePasteBlocks = useCallback(() => {
    performPaste();
  }, [performPaste]);

  // 全屏切换功能 - 只全屏blockly工作区
  const [isWorkspaceFullscreen, setIsWorkspaceFullscreen] = useState(false);
  const workspaceContainerRef = useRef<HTMLDivElement>(null);

  const toggleFullscreen = useCallback(() => {
    const doc = document as any;
    const container = workspaceContainerRef.current;

    if (!container) {
      toast.error('工作区未初始化');
      return;
    }

    const isFullscreen = doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement;

    if (!isFullscreen) {
      // 进入全屏 - 只全屏工作区容器
      if (container.requestFullscreen) {
        container.requestFullscreen().catch((err: Error) => {
          toast.error('进入全屏失败: ' + err.message);
        });
      } else if (container.webkitRequestFullscreen) {
        container.webkitRequestFullscreen();
      } else if (container.mozRequestFullScreen) {
        container.mozRequestFullScreen();
      } else if (container.msRequestFullscreen) {
        container.msRequestFullscreen();
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

  // 监听全屏状态变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      const doc = document as any;
      const isFullscreen = !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement);
      setIsWorkspaceFullscreen(isFullscreen);

      // 全屏状态变化时，重新调整工作区大小
      setTimeout(() => {
        if (workspaceRef.current) {
          Blockly.svgResize(workspaceRef.current);
        }
      }, 100);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
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

      // 使用 ref 获取最新的项目状态，确保被动生成时代码能获取到正确的插件名称
      const latestProject = currentProjectRef.current;
      const latestMetadata = exportMetadataRef.current;

      const metadata: PluginMetadata = {
        name: latestMetadata.name || latestProject?.name?.trim() || 'untitled',
        version: latestProject?.version || '1.0.0',
        description: latestProject?.description || ''
      };

      try {
        const code = generateLuaCode(workspaceRef.current, metadata);
        setGeneratedCode(code.full);
      } catch (error) {
        console.error('代码生成失败:', error);
      }
    }, 300);
  }, []);

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

  const handleOpenProject = useCallback(async (projectFile: BlocklyProjectFile) => {
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
              let xml = Blockly.utils.xml.textToDom(project.xmlContent);
              
              // 修复旧块
              xml = fixOldBlockXml(xml);
              
              Blockly.Xml.domToWorkspace(xml, workspaceRef.current);
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
  }, [hasUnsavedChanges, fixOldBlockXml]);

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
      const metadata: PluginMetadata = {
        name: exportMetadata.name || currentProject?.name?.trim() || 'untitled',
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
              插件管理 - 可视化模式
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
              可视化模式
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

      <div className="flex flex-1 min-h-0 overflow-hidden">
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

        <div
          ref={workspaceContainerRef}
          className={`flex-1 flex flex-col min-w-0 ${isWorkspaceFullscreen ? 'bg-[#1D2129]' : ''}`}
        >
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
                onClick={handleRefreshConfig}
                disabled={configLoading}
                className="px-2 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                title="重新获取积木配置"
              >
                <RefreshCw className={`w-4 h-4 ${configLoading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">刷新配置</span>
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

          <div className="flex-1 relative flex flex-col min-h-0">
            <div
              ref={containerRef}
              className={`w-full h-full ${previewMode ? 'preview-mode' : ''}`}
              style={{ overflow: 'visible', touchAction: 'none' }}
            />

            <div className="absolute bottom-4 right-4 z-40">
              {searchOpen && (
                <div className="absolute bottom-12 right-0 w-72 bg-[#2a2e38] border border-[#3a3f4b] rounded-lg shadow-xl overflow-hidden mb-2">
                  <div className="p-2 border-b border-[#3a3f4b]">
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => handleBlockSearch(e.target.value)}
                      placeholder="搜索积木... (ESC关闭)"
                      className="w-full bg-[#1d2129] text-white text-sm px-3 py-2 rounded border border-[#3a3f4b] focus:outline-none focus:border-[#165dff]"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {searchResults.length === 0 && searchTerm.trim() && (
                      <div className="px-3 py-2 text-gray-500 text-sm">未找到匹配的积木</div>
                    )}
                    {searchResults.map((result) => (
                      <button
                        key={result.type}
                        onClick={() => handleSearchResultClick(result.type)}
                        className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-[#3a3f4b] hover:text-white transition-colors"
                      >
                        {result.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <button
                onClick={() => setSearchOpen(!searchOpen)}
                className="w-10 h-10 bg-[#2a2e38] border border-[#3a3f4b] rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#3a3f4b] transition-colors shadow-lg"
                title="搜索积木 (Ctrl+F)"
              >
                <Search className="w-5 h-5" />
              </button>
            </div>
            
            {!currentProject && (
              <div className="absolute inset-0 bg-[#1D2129] flex flex-col items-center justify-center text-center p-8 z-50">
                <div className="w-20 h-20 bg-[#2A2E38] rounded-full flex items-center justify-center mb-6">
                  <Layers className="w-10 h-10 text-[#165DFF]" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">传说中的0代码开发插件？</h3>
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

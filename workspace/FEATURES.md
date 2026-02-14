# OpenClaw Console 功能清单

## 页面结构

5 个主 Tab：**概览** | **工作流** | **Token 监控** | **定时任务** | **文件编辑**

---

## Tab 1: 概览

### 🐱 身份卡

- 显示酒酒的头像、名字、拼音、来历、标签、语录
- ✏️ 点击编辑按钮修改所有字段
- 数据存储：`dashboard.json → identity`

### 🧠 模型管理

- 列出所有可用模型（provider/model-id）
- 当前主力模型高亮（绿色指示灯）
- **添加模型**：输入 provider/model-id + 可选别名
- **删除模型**：每个模型右侧删除按钮
- **切换主力**：点击模型行设为主力
- 远程切换提示（`/model` 命令）
- 数据存储：`openclaw.json → agents.defaults.models`

### 🤖 Agent 角色

- 列出所有 Agent（名称、权限等级、描述）
- **点击行编辑**：
  - 名称
  - 工具权限（full / messaging / minimal）
  - 禁用工具列表
  - 最大上下文 Tokens
  - 每日 Token 预算
  - 工作时间
- 数据存储：`openclaw.json → agents.list`

### 📱 消息通道

- 列出所有通道（WhatsApp、Telegram、iMessage 等）
- **开关 Toggle**：启用/禁用通道
- **配置按钮**：打开编辑弹窗
  - DM 白名单编辑（每行一个号码/ID）
  - 群组白名单编辑
  - 完整 JSON 配置编辑
- 数据存储：`openclaw.json → plugins.entries`

### ⏰ 定时任务（概览）

- 列出所有 Cron Job
- **暂停/恢复 Toggle**：点击开关切换
- **删除按钮**：确认后删除任务
- 显示 Cron 表达式 + 时区
- 显示上次运行时间（相对时间：X 分钟前/X 小时前）
- 显示运行状态徽章（ok = 绿色，error = 红色）
- 数据存储：`cron/jobs.json`

### 👥 重要联系人

- 列出所有联系人（头像 emoji、姓名、角色/描述）
- **点击行编辑**：修改 emoji、姓名、角色
- **删除按钮**：确认后删除
- **添加联系人**：底部按钮，输入 emoji + 姓名 + 角色
- 数据存储：`dashboard.json → contacts`

### 📝 记忆时间线

- 倒序显示（最新在前）
- 特殊事件高亮（金色 = 里程碑，紫色 = 创作/思考）
- 左侧时间线指示条
- 数据存储：`dashboard.json → timeline`

### 🧰 工具箱

- 网格显示所有工具（emoji + 名称）
- **点击工具**：展开详情面板（描述信息）
- 数据存储：`dashboard.json → tools`

### 🔧 Commander-Worker 架构（静态）

- 酒酒 Commander ↔ Codex Worker 流程图
- 分工说明

### 🖥 硬件环境（静态）

- leonardpc 配置信息
- NAS 存储信息

### 📂 项目（静态）

- 4 个项目列表

---

## Tab 2: 工作流

### Drawflow 可视化编辑器

- 从 `openclaw.json` 自动生成节点图
- **模型节点**（顶部行）：显示 provider、主模型标记
- **Agent 节点**（中间行）：显示工具权限、连接到模型
- **通道节点**（底部行）：显示启用状态、连接到 Agent
- **节点拖拽**：自由拖动节点调整布局
- **连线**：Agent ↔ 模型、Agent ↔ 通道自动连线
- **点击节点编辑**：
  - 模型：设为主模型
  - Agent：修改权限、禁用工具、上下文、预算
  - 通道：启用/禁用
- 编辑后自动保存到 `openclaw.json` 并重新渲染

---

## Tab 3: Token 监控

### 📈 Token 使用趋势

- 折线图（近 30 天）
- Input / Output / Total 三条线
- 渐变填充、悬浮 tooltip 显示详细数值

### 🧠 模型分布

- 环形图（Doughnut）
- 各模型 Token 占比 + 百分比

### 🤖 Agent Token 用量

- 水平柱状图
- 各 Agent 消耗的 Token 总量
- 彩色区分不同 Agent

### 🔥 Top Token 消耗

- 表格：Top 20 最耗 Token 的动作
- 列：动作名、模型、Tokens、日期

### ⚙️ Agent 配置

- 表格：每个 Agent 的配置
- 可直接编辑：最大上下文 / 每日预算 / 工作时间
- 单行保存按钮

---

## Tab 4: 定时任务（管理）

### Cron 任务列表

- **Toggle 开关**：启用/禁用
- **上次运行状态**：时间 + ok/error 标记
- **编辑按钮**：打开弹窗修改
  - 名称
  - Cron 表达式
  - 时区
  - Agent ID
  - 消息 Payload

---

## Tab 5: 文件编辑

### 文件列表侧栏

- 列出 workspace 下的 .md / .json 文件
- 列出 workspace-owner 下的文件
- 列出 openclaw.json、cron/jobs.json
- 点击文件加载到编辑器

### CodeMirror 编辑器

- 语法高亮（Markdown / JSON）
- Material Darker 主题
- 行号显示
- 自动切换语法模式
- **保存按钮**：写回文件

---

## 全局功能

| 功能       | 说明                        |
| ---------- | --------------------------- |
| 深色主题   | 玻璃拟态 + 渐变背景动画     |
| 实时时钟   | Header 显示新加坡时间 (SGT) |
| 系统状态   | 绿色脉冲指示灯              |
| Toast 提示 | 操作成功/失败底部弹出提示   |
| 弹窗编辑   | 统一 Modal 编辑界面         |
| 卡片动画   | 滚动触发 fadeInUp 动画      |
| 响应式     | 移动端自适应布局            |

---

## API 端点

```
GET  /api/config       读取 openclaw.json
PUT  /api/config       写入 openclaw.json
GET  /api/dashboard    读取 dashboard.json（身份/联系人/工具/时间线）
PUT  /api/dashboard    写入 dashboard.json
GET  /api/cron         读取 cron/jobs.json
PUT  /api/cron         写入 cron/jobs.json
GET  /api/sessions     解析 sessions → token 统计
GET  /api/files        列出可编辑文件
GET  /api/file?path=   读取文件内容
PUT  /api/file         写入文件内容
```

---

## 数据文件

| 文件                              | 内容                                       |
| --------------------------------- | ------------------------------------------ |
| `openclaw.json`                   | 核心配置：模型、Agent、通道、插件          |
| `dashboard.json`                  | 仪表盘数据：身份、联系人、工具详情、时间线 |
| `cron/jobs.json`                  | 定时任务配置                               |
| `agents/*/sessions/sessions.json` | Token 使用统计来源                         |

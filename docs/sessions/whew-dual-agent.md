# WHEW Dual-Agent Supervisor for Pi-Mono

## 问题是什么

在 pi-mono 中实现 WHEW（What-How-Exec-Why）双 agent 模式：一个 supervisor agent 面对用户，管理执行 agent 并维护 plan/memory。supervisor 绝对不越权做执行层的事。

**核心约束**：
- 用户只和 supervisor 对话
- supervisor 不写代码，只委派任务
- 工具层面硬隔离（不靠 system prompt 约束）
- 最大化复用 pi-mono 现有基础设施

## 最终实现

### 架构

```
用户 ←→ InteractiveMode (pi-tui) ←→ AgentSession ←→ Supervisor Agent
                                                         │
                                                         ├── read, grep, find, ls（只读，复用 coding-agent）
                                                         ├── write（scoped to .whew/，包装 coding-agent write tool）
                                                         ├── execute_task → 创建全新 Agent 实例
                                                         │                  + createCodingTools(cwd)
                                                         │                  → 执行 → 返回文本结果
                                                         │
                                                         └── system prompt：WHEW 循环指引
```

### 新增代码

| 文件 | 行数 | 职责 |
|------|------|------|
| `packages/agent/src/whew.ts` | ~80 | 两个 tool factory：`createExecuteTaskTool`, `createScopedWriteTool` |
| `packages/whew/src/main.ts` | ~110 | CLI 入口：组装 supervisor tools + `createAgentSession` + `InteractiveMode` |
| `packages/whew/package.json` | - | 包配置，`bin: { whew: dist/main.js }` |
| `packages/whew/tsconfig.build.json` | - | 构建配置 |
| `packages/whew/uninstall.sh` | 3 | `npm unlink -g` |

### 复用清单

| 组件 | 来源 | 原样复用 |
|------|------|----------|
| Agent 核心 | `@mariozechner/pi-agent-core` | ✓ |
| 工具 factory | `@mariozechner/pi-coding-agent` (createCodingTools, readTool, etc.) | ✓ |
| AgentSession | `@mariozechner/pi-coding-agent` (session 持久化, compaction, retry) | ✓ |
| InteractiveMode | `@mariozechner/pi-coding-agent` (完整 TUI: editor, streaming, themes) | ✓ |
| Model resolution | `@mariozechner/pi-coding-agent` (ModelRegistry, auth, API key) | ✓ |
| LLM streaming | `@mariozechner/pi-ai` (streamSimple, getModel) | ✓ |

### 工具隔离（硬边界）

| 工具 | Supervisor | 执行 Agent |
|------|-----------|-----------|
| read, grep, find, ls | ✓ | ✓ |
| bash | ✗ | ✓ |
| edit | ✗ | ✓ |
| write（全局） | ✗ | ✓ |
| write（.whew/ only） | ✓ | ✗ |
| execute_task | ✓ | ✗ |

### 使用

```bash
# 安装
cd packages/whew && npm run build && npm link

# 运行（当前目录）
whew

# 运行（指定目录）
whew /path/to/project

# 卸载
npm unlink -g @mariozechner/pi-whew
```

## 记录

### 前一轮（已回滚）

之前的 agent 做了一版过度设计的实现：
- `createWhewAgent` 魔法包装函数，隐藏了 Agent 构造
- `WhewConfig` 混合了外层/内层/record path/extra tools
- 专用 `read_record` / `update_record` 工具
- 谎称代码已提交到 `feat/whew-dual-agent` 分支（实际不存在）
- 类型设计与实际 `AgentOptions` 不匹配

用户回滚了所有改动，要求"更加标准更加 pi-mono-native 的方式"重新来过。

### 本轮关键决策

1. **"能复用就复用"** → 划清了"已有 vs 新"的边界。真正新的只有 execute_task 这一个概念。
2. **"supervisor 绝对不越权"** → 工具层面硬隔离，不靠 system prompt。supervisor 没有 bash/edit/write(全局)。
3. **"只要写个小包装就行"** → `createScopedWriteTool` 包装现有 write tool，~15 行。
4. **"可以 read，但只能 write 特定目录"** → supervisor 能读整个项目（理解上下文），只能写 .whew/。
5. **"单独的入口/包"** → `packages/whew`，有自己的 CLI，最 pi-mono-native。
6. **"用最 Pi-mono-native 的方式接入 pi-tui"** → 直接用 `createAgentSession` + `InteractiveMode`，获得完整 TUI 体验（编辑器、streaming、主题、session 持久化、compaction）。

### 已知限制（首版不处理）

- system prompt 在 `AgentSession._rebuildSystemPrompt` 时可能被覆盖（如 /tools 命令）
- 内层 agent 的执行进度不透传给 TUI
- `piConfig` 共享 coding-agent 的 `.pi` 配置目录
- 没有多内层并行执行

# whew — WHEW Dual-Agent Supervisor

基于 pi-mono 的 WHEW（What-How-Exec-Why）双 agent supervisor CLI。

用户只和 supervisor 对话，supervisor 管理执行 agent 完成实际编码工作。

## 架构

```
用户 ←→ Supervisor Agent (pi-tui)
              │
              ├── read, grep, find, ls   （只读，理解项目）
              ├── write                  （仅限 .whew/ 目录）
              └── execute_task           → 内层 Agent（全套 coding tools）
```

**硬隔离**：supervisor 没有 bash/edit/write(全局)，从工具层面无法越权。

## 安装

需要先构建依赖链（tui → ai → agent → coding-agent → whew）：

```bash
# 首次安装（构建所有依赖 + 全局链接）
cd pi-mono
npm install
npm run build
./install-whew.sh
```

## 使用

```bash
# 当前目录
whew

# 指定项目目录
whew /path/to/project
```

启动后进入完整 TUI 界面（和 `pi` 相同体验）。Supervisor 会按 WHEW 循环工作：

1. **What** — 理解你的问题，阅读代码，澄清需求
2. **How** — 拆解任务，写计划到 `.whew/plan.md`
3. **Exec** — 通过 `execute_task` 委派给执行 agent
4. **Why** — 审查结果，决定是否需要迭代

## 配置 API Key

whew 复用 `pi` 的认证系统（`~/.pi/agent/auth.json`）。

```bash
# 环境变量
export ANTHROPIC_API_KEY=sk-xxx
export OPENROUTER_API_KEY=sk-or-xxx

# 或在 TUI 中
/login
/model
```

## 卸载

```bash
./uninstall-whew.sh
```

## 文件结构

```
pi-mono/
├── install-whew.sh          # 安装脚本
├── uninstall-whew.sh        # 卸载脚本
├── whew-readme.md           # 本文件
└── pi-mono/
    └── packages/
        ├── agent/src/whew.ts        # tool factories (createExecuteTaskTool, createScopedWriteTool)
        └── whew/src/main.ts         # CLI 入口 (createAgentSession + InteractiveMode)
```

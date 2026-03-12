#!/usr/bin/env node

import { resolve } from "node:path";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Agent, createExecuteTaskTool, createScopedWriteTool } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import {
	type CreateAgentSessionOptions,
	DefaultResourceLoader,
	type ExtensionContext,
	InteractiveMode,
	createAgentSession,
	createCodingTools,
	createWriteTool,
	findTool,
	grepTool,
	lsTool,
	readTool,
	type ToolDefinition,
} from "@mariozechner/pi-coding-agent";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const cwd = resolve(args.find((a) => !a.startsWith("-")) ?? ".");
const whewDir = resolve(cwd, ".whew");

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SUPERVISOR_PROMPT = `You are a project supervisor operating in the WHEW cycle (What-How-Exec-Why).
Your role is to help the user solve problems by managing an execution agent on their behalf.

## Your tools
- execute_task: Delegate work to the execution agent. Provide the COMPLETE context it needs (it has no memory between tasks).
- read, grep, find, ls: Read and search the project to understand context.
- write (restricted to .whew/): Maintain your working notes, plan, and session records.

## WHEW Cycle
1. **What**: Understand the user's problem. Ask clarifying questions. Read relevant code/docs.
2. **How**: Break the problem into concrete tasks with clear success criteria. Write your plan to .whew/plan.md.
3. **Exec**: Delegate each task to the execution agent via execute_task.
4. **Why**: Review the execution results. Question whether the approach was correct.
   - If results are wrong: go back to What (redefine problem) or How (try different approach).
   - If results are right: report to user and update your notes.

## Rules
- NEVER write code yourself. Always delegate coding work to the execution agent.
- Your write tool only works in .whew/ - use it for your own notes, plan, and records.
- Give the execution agent COMPLETE context in each task. It is stateless.
- Be honest about failures. Do not hide execution errors.
- Keep the user informed of progress at each stage.

## Working directory
${cwd}
`;

// ---------------------------------------------------------------------------
// Custom tools as ToolDefinition (coding-agent extension format)
// ---------------------------------------------------------------------------

/** Convert AgentTool to ToolDefinition (adapts the execute signature).
 *  AgentTool<any> erases TypeBox schema variance, same pattern as coding-agent's internal Tool type. */
function toToolDefinition(tool: AgentTool<any>): ToolDefinition {
	return {
		...tool,
		execute: (toolCallId, params, signal, onUpdate, _ctx: ExtensionContext) =>
			tool.execute(toolCallId, params, signal, onUpdate),
	};
}

function buildCustomTools(): ToolDefinition[] {
	const executeTask = createExecuteTaskTool(
		() =>
			new Agent({
				initialState: {
					model: getModel("anthropic", "claude-sonnet-4-6"),
					tools: createCodingTools(cwd),
				},
			}),
	);

	const scopedWrite = createScopedWriteTool(whewDir, createWriteTool(cwd));

	return [toToolDefinition(executeTask), toToolDefinition(scopedWrite)];
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

const resourceLoader = new DefaultResourceLoader({
	cwd,
	systemPrompt: SUPERVISOR_PROMPT,
});
await resourceLoader.reload();

const sessionOptions: CreateAgentSessionOptions = {
	cwd,
	tools: [readTool, grepTool, findTool, lsTool],
	customTools: buildCustomTools(),
	resourceLoader,
};

const { session, modelFallbackMessage } = await createAgentSession(sessionOptions);

// ---------------------------------------------------------------------------
// Run TUI
// ---------------------------------------------------------------------------

const mode = new InteractiveMode(session, { modelFallbackMessage });
await mode.run();

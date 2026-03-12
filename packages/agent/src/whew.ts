/**
 * WHEW (What-How-Exec-Why) dual-agent tools.
 *
 * Provides two utilities for building a supervisor/executor agent pair:
 * - createExecuteTaskTool: delegates tasks to a freshly created executor agent
 * - createScopedWriteTool: wraps any write tool to restrict writes to a specific directory
 */

import { resolve, sep } from "node:path";
import { Type } from "@sinclair/typebox";
import type { Agent } from "./agent.js";
import type { AgentTool } from "./types.js";

/**
 * Create a tool that delegates tasks to a freshly created executor agent.
 * Each invocation creates a new agent via `createAgent()`, sends the task,
 * waits for completion, and returns the last assistant message text.
 */
const executeTaskSchema = Type.Object({
	task: Type.String({ description: "Complete task description with all necessary context" }),
});

export function createExecuteTaskTool(createAgent: () => Agent): AgentTool<typeof executeTaskSchema> {
	return {
		name: "execute_task",
		label: "Execute Task",
		description:
			"Delegate a task to the execution agent. The task string is the complete context the agent receives.",
		parameters: executeTaskSchema,
		execute: async (_toolCallId, { task }, signal) => {
			const agent = createAgent();

			const onAbort = () => agent.abort();
			signal?.addEventListener("abort", onAbort, { once: true });

			try {
				await agent.prompt(task);
				await agent.waitForIdle();

				const messages = agent.state.messages;
				const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
				const text =
					lastAssistant?.content
						.filter((c): c is { type: "text"; text: string } => c.type === "text")
						.map((c) => c.text)
						.join("\n") || "(no output)";

				return { content: [{ type: "text", text }], details: undefined };
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return { content: [{ type: "text", text: `Execution error: ${msg}` }], details: undefined };
			} finally {
				signal?.removeEventListener("abort", onAbort);
			}
		},
	};
}

/**
 * Wrap a write tool to restrict writes to a specific directory.
 * Paths are resolved relative to `allowedDir`. Any write outside it is rejected.
 *
 * The wrapped tool receives the resolved absolute path, so the inner tool's
 * own path resolution (resolveToCwd etc.) sees an absolute path and passes it through.
 */
export function createScopedWriteTool(allowedDir: string, writeTool: AgentTool<any>): AgentTool<any> {
	const absAllowedDir = resolve(allowedDir);

	return {
		...writeTool,
		execute: async (toolCallId, params: Record<string, any>, signal, onUpdate) => {
			const absPath = resolve(absAllowedDir, params.path);
			if (!absPath.startsWith(absAllowedDir + sep)) {
				return {
					content: [{ type: "text", text: `Error: writes are restricted to ${allowedDir}` }],
					details: undefined,
				};
			}
			return writeTool.execute(toolCallId, { ...params, path: absPath }, signal, onUpdate);
		},
	};
}

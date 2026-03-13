#!/usr/bin/env node
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TodoistApi } from "@doist/todoist-api-typescript";
import { z } from "zod/v3";

const token = process.env.TODOIST_API_TOKEN;
if (!token) {
  console.error("Error: TODOIST_API_TOKEN environment variable is required");
  process.exit(1);
}

const todoist = new TodoistApi(token);

const server = new McpServer({
  name: "todoist-mcp",
  version: "1.0.0",
});

// --- get_tasks ---
server.registerTool(
  "get_tasks",
  {
    description: "List active Todoist tasks, optionally filtered by project or label",
    inputSchema: {
      project_id: z.string().optional().describe("Filter tasks by project ID"),
      label: z.string().optional().describe("Filter tasks by label name"),
    },
  },
  async ({ project_id, label }) => {
    const tasks = await todoist.getTasks({
      projectId: project_id,
      label,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(tasks, null, 2) }],
    };
  }
);

// --- create_task ---
server.registerTool(
  "create_task",
  {
    description: "Create a new Todoist task",
    inputSchema: {
      content: z.string().describe("Task content / title"),
      due_string: z.string().optional().describe("Due date in natural language, e.g. 'tomorrow', 'next Monday'"),
      priority: z.number().int().min(1).max(4).optional().describe("Priority: 1 (normal) to 4 (urgent)"),
      project_id: z.string().optional().describe("Project ID to add the task to"),
      labels: z.array(z.string()).optional().describe("Array of label names to assign"),
    },
  },
  async ({ content, due_string, priority, project_id, labels }) => {
    const task = await todoist.addTask({
      content,
      dueString: due_string,
      priority,
      projectId: project_id,
      labels,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(task, null, 2) }],
    };
  }
);

// --- close_task ---
server.registerTool(
  "close_task",
  {
    description: "Mark a Todoist task as complete",
    inputSchema: {
      task_id: z.string().describe("The ID of the task to close"),
    },
  },
  async ({ task_id }) => {
    await todoist.closeTask(task_id);
    return {
      content: [{ type: "text", text: `Task ${task_id} marked as complete.` }],
    };
  }
);

// --- get_projects ---
server.registerTool(
  "get_projects",
  {
    description: "List all Todoist projects",
    inputSchema: {},
  },
  async () => {
    const projects = await todoist.getProjects();
    return {
      content: [{ type: "text", text: JSON.stringify(projects, null, 2) }],
    };
  }
);

// --- Start server ---
const transport = new StdioServerTransport();
server.connect(transport).catch((err) => {
  console.error("Failed to start MCP server:", err);
  process.exit(1);
});

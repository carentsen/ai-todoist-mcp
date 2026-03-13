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
      description: z.string().optional().describe("Longer description / notes for the task"),
      parent_id: z.string().optional().describe("Parent task ID — creates this as a subtask"),
      project_id: z.string().optional().describe("Project ID to add the task to"),
      section_id: z.string().optional().describe("Section ID within a project"),
      priority: z.number().int().min(1).max(4).optional().describe("Priority: 1 (normal), 2 (medium), 3 (high), 4 (urgent)"),
      labels: z.array(z.string()).optional().describe("Array of label names to assign"),
      due_string: z.string().optional().describe("Due date in natural language, e.g. 'tomorrow', 'next Monday'. Mutually exclusive with due_date/due_datetime."),
      due_date: z.string().optional().describe("Due date in YYYY-MM-DD format. Mutually exclusive with due_string/due_datetime."),
      due_datetime: z.string().optional().describe("Due date and time in ISO 8601 format, e.g. '2026-03-20T10:00:00Z'. Mutually exclusive with due_string/due_date."),
    },
  },
  async ({ content, description, parent_id, project_id, section_id, priority, labels, due_string, due_date, due_datetime }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const args: any = { content, description, parentId: parent_id, projectId: project_id, sectionId: section_id, priority, labels, dueString: due_string };
    if (due_date) args.dueDate = due_date;
    if (due_datetime) args.dueDatetime = due_datetime;
    const task = await todoist.addTask(args);
    return {
      content: [{ type: "text", text: JSON.stringify(task, null, 2) }],
    };
  }
);

// --- quick_add_task ---
server.registerTool(
  "quick_add_task",
  {
    description: "Create a task using Todoist natural language parsing. Supports inline syntax for project (#), labels (@), priority (p1-p4), due dates, and reminders.",
    inputSchema: {
      text: z.string().describe("Natural language task text, e.g. 'Buy milk tomorrow p2 @shopping #Groceries'"),
      reminder: z.string().optional().describe("Reminder in natural language, e.g. 'tomorrow at 9am', '1 hour before'"),
      auto_reminder: z.boolean().optional().describe("Automatically set a default reminder for the task"),
    },
  },
  async ({ text, reminder, auto_reminder }) => {
    const task = await todoist.quickAddTask({
      text,
      reminder,
      autoReminder: auto_reminder,
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

// --- update_task ---
server.registerTool(
  "update_task",
  {
    description: "Update an existing Todoist task",
    inputSchema: {
      task_id: z.string().describe("The ID of the task to update"),
      content: z.string().optional().describe("New task content / title"),
      description: z.string().optional().describe("New description / notes"),
      priority: z.number().int().min(1).max(4).optional().describe("Priority: 1 (normal), 2 (medium), 3 (high), 4 (urgent)"),
      labels: z.array(z.string()).optional().describe("Array of label names to assign (replaces existing)"),
      due_string: z.string().optional().describe("New due date in natural language, e.g. 'tomorrow'. Use 'no date' to clear."),
      due_date: z.string().optional().describe("Due date in YYYY-MM-DD format. Mutually exclusive with due_string/due_datetime."),
      due_datetime: z.string().optional().describe("Due date and time in ISO 8601 format. Mutually exclusive with due_string/due_date."),
    },
  },
  async ({ task_id, content, description, priority, labels, due_string, due_date, due_datetime }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const args: any = { content, description, priority, labels, dueString: due_string };
    if (due_date) args.dueDate = due_date;
    if (due_datetime) args.dueDatetime = due_datetime;
    const task = await todoist.updateTask(task_id, args);
    return {
      content: [{ type: "text", text: JSON.stringify(task, null, 2) }],
    };
  }
);

// --- add_comment ---
server.registerTool(
  "add_comment",
  {
    description: "Add a comment to a Todoist task",
    inputSchema: {
      task_id: z.string().describe("The ID of the task to comment on"),
      content: z.string().describe("The comment text"),
    },
  },
  async ({ task_id, content }) => {
    const comment = await todoist.addComment({ taskId: task_id, content });
    return {
      content: [{ type: "text", text: JSON.stringify(comment, null, 2) }],
    };
  }
);

// --- get_labels ---
server.registerTool(
  "get_labels",
  {
    description: "List all personal Todoist labels",
    inputSchema: {},
  },
  async () => {
    const labels = await todoist.getLabels();
    return {
      content: [{ type: "text", text: JSON.stringify(labels, null, 2) }],
    };
  }
);

// --- create_label ---
server.registerTool(
  "create_label",
  {
    description: "Create a new personal Todoist label",
    inputSchema: {
      name: z.string().describe("Label name"),
      color: z.string().optional().describe("Label color name, e.g. 'red', 'blue', 'green'"),
    },
  },
  async ({ name, color }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const label = await todoist.addLabel({ name, color: color as any });
    return {
      content: [{ type: "text", text: JSON.stringify(label, null, 2) }],
    };
  }
);

// --- update_label ---
server.registerTool(
  "update_label",
  {
    description: "Rename or recolor an existing Todoist label",
    inputSchema: {
      label_id: z.string().describe("The ID of the label to update"),
      name: z.string().optional().describe("New label name"),
      color: z.string().optional().describe("New color name, e.g. 'red', 'blue', 'green'"),
    },
  },
  async ({ label_id, name, color }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const label = await todoist.updateLabel(label_id, { name, color: color as any });
    return {
      content: [{ type: "text", text: JSON.stringify(label, null, 2) }],
    };
  }
);

// --- delete_label ---
server.registerTool(
  "delete_label",
  {
    description: "Delete a personal Todoist label",
    inputSchema: {
      label_id: z.string().describe("The ID of the label to delete"),
    },
  },
  async ({ label_id }) => {
    await todoist.deleteLabel(label_id);
    return {
      content: [{ type: "text", text: `Label ${label_id} deleted.` }],
    };
  }
);

// --- Start server ---
const transport = new StdioServerTransport();
server.connect(transport).catch((err) => {
  console.error("Failed to start MCP server:", err);
  process.exit(1);
});

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

// License tier — resolved at startup from the API, overridable via TODOIST_LICENSE env var.
// Values: "free" | "pro" | "business". Defaults to "free" if unresolvable.
type License = "free" | "pro" | "business";
let license: License = "free";

async function resolveLicense(): Promise<void> {
  const override = process.env.TODOIST_LICENSE?.toLowerCase();
  if (override === "free" || override === "pro" || override === "business") {
    license = override;
    return;
  }
  try {
    const user = await todoist.getUser();
    if (user.premiumStatus === "teams_business_member") {
      license = "business";
    } else if (user.premiumStatus === "current_personal_plan" || user.premiumStatus === "legacy_personal_plan") {
      license = "pro";
    } else {
      license = "free";
    }
  } catch {
    // Non-fatal — fall back to free
    license = "free";
  }
}

function licenseError(feature: string, required: License): { content: [{ type: "text"; text: string }]; isError: true } {
  return {
    content: [{ type: "text", text: `'${feature}' requires a Todoist ${required.charAt(0).toUpperCase() + required.slice(1)} (or higher) license. Your current license is '${license}'. Set TODOIST_LICENSE=pro or TODOIST_LICENSE=business in your MCP config to override.` }],
    isError: true,
  };
}

function requireLicense(feature: string, required: License): { content: [{ type: "text"; text: string }]; isError: true } | null {
  const order: License[] = ["free", "pro", "business"];
  if (order.indexOf(license) < order.indexOf(required)) return licenseError(feature, required);
  return null;
}

const server = new McpServer({
  name: "todoist-mcp",
  version: "1.0.0",
});

// --- get_tasks ---
server.registerTool(
  "get_tasks",
  {
    description: "List active Todoist tasks, optionally filtered by project, section, parent, or label",
    inputSchema: {
      project_id: z.string().optional().describe("Filter by project ID"),
      section_id: z.string().optional().describe("Filter by section ID"),
      parent_id: z.string().optional().describe("Filter by parent task ID (returns subtasks)"),
      label: z.string().optional().describe("Filter by label name"),
      ids: z.array(z.string()).optional().describe("Fetch specific task IDs"),
    },
  },
  async ({ project_id, section_id, parent_id, label, ids }) => {
    const tasks = await todoist.getTasks({ projectId: project_id, sectionId: section_id, parentId: parent_id, label, ids });
    return { content: [{ type: "text", text: JSON.stringify(tasks, null, 2) }] };
  }
);

// --- create_task ---
server.registerTool(
  "create_task",
  {
    description: "Create a new Todoist task. [Pro] deadline_date, duration/duration_unit. [Business] assignee_id.",
    inputSchema: {
      content: z.string().describe("Task content / title"),
      description: z.string().optional().describe("Longer description / notes"),
      parent_id: z.string().optional().describe("Parent task ID — creates this as a subtask"),
      project_id: z.string().optional().describe("Project ID"),
      section_id: z.string().optional().describe("Section ID within a project"),
      assignee_id: z.string().optional().describe("[Business] User ID to assign the task to"),
      order: z.number().int().optional().describe("Position within the project or parent task"),
      priority: z.number().int().min(1).max(4).optional().describe("Priority: 1 (normal), 2 (medium), 3 (high), 4 (urgent)"),
      labels: z.array(z.string()).optional().describe("Array of label names to assign"),
      due_string: z.string().optional().describe("Due date in natural language, e.g. 'tomorrow'. Mutually exclusive with due_date/due_datetime."),
      due_date: z.string().optional().describe("Due date in YYYY-MM-DD format. Mutually exclusive with due_string/due_datetime."),
      due_datetime: z.string().optional().describe("Due date and time in ISO 8601, e.g. '2026-03-20T10:00:00Z'. Mutually exclusive with due_string/due_date."),
      deadline_date: z.string().optional().describe("[Pro] Deadline date in YYYY-MM-DD format."),
      duration: z.number().int().optional().describe("[Pro] Estimated duration amount (requires duration_unit)."),
      duration_unit: z.enum(["minute", "day"]).optional().describe("[Pro] Duration unit — 'minute' or 'day' (requires duration)."),
    },
  },
  async ({ content, description, parent_id, project_id, section_id, assignee_id, order, priority, labels, due_string, due_date, due_datetime, deadline_date, duration, duration_unit }) => {
    if (assignee_id) { const err = requireLicense("assignee_id", "business"); if (err) return err; }
    if (deadline_date) { const err = requireLicense("deadline_date", "pro"); if (err) return err; }
    if (duration !== undefined || duration_unit !== undefined) { const err = requireLicense("duration/duration_unit", "pro"); if (err) return err; }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const args: any = { content, description, parentId: parent_id, projectId: project_id, sectionId: section_id, assigneeId: assignee_id, order, priority, labels, dueString: due_string, deadlineDate: deadline_date };
    if (due_date) args.dueDate = due_date;
    if (due_datetime) args.dueDatetime = due_datetime;
    if (duration !== undefined) { args.duration = duration; args.durationUnit = duration_unit; }

    const task = await todoist.addTask(args);
    return { content: [{ type: "text", text: JSON.stringify(task, null, 2) }] };
  }
);

// --- get_tasks_by_filter ---
server.registerTool(
  "get_tasks_by_filter",
  {
    description: "Query active tasks using Todoist filter syntax. Examples: 'today', 'overdue', 'p1', '#Work', '@email', 'due before: next week & !assigned to: others'. Supports the full Todoist filter language.",
    inputSchema: {
      query: z.string().describe("Todoist filter query string"),
      lang: z.string().optional().describe("Language code for natural language date parsing, e.g. 'en', 'de' (defaults to account language)"),
    },
  },
  async ({ query, lang }) => {
    const tasks = await todoist.getTasksByFilter({ query, lang });
    return { content: [{ type: "text", text: JSON.stringify(tasks, null, 2) }] };
  }
);

// --- quick_add_task ---
server.registerTool(
  "quick_add_task",
  {
    description: "Create a task using Todoist natural language parsing. Supports inline syntax: #project, @label, p1-p4, due dates. [Pro] reminder field.",
    inputSchema: {
      text: z.string().describe("Natural language task, e.g. 'Buy milk tomorrow p2 @shopping #Groceries'"),
      reminder: z.string().optional().describe("[Pro] Reminder in natural language, e.g. 'tomorrow at 9am'"),
      auto_reminder: z.boolean().optional().describe("Automatically set a default reminder"),
    },
  },
  async ({ text, reminder, auto_reminder }) => {
    if (reminder) { const err = requireLicense("reminder", "pro"); if (err) return err; }
    const task = await todoist.quickAddTask({ text, reminder, autoReminder: auto_reminder });
    return { content: [{ type: "text", text: JSON.stringify(task, null, 2) }] };
  }
);

// --- update_task ---
server.registerTool(
  "update_task",
  {
    description: "Update an existing Todoist task. Use project_id, section_id, or parent_id to move it. [Pro] deadline_date, duration/duration_unit. [Business] assignee_id.",
    inputSchema: {
      task_id: z.string().describe("The ID of the task to update"),
      content: z.string().optional().describe("New task content / title"),
      description: z.string().optional().describe("New description / notes"),
      priority: z.number().int().min(1).max(4).optional().describe("Priority: 1 (normal), 2 (medium), 3 (high), 4 (urgent)"),
      labels: z.array(z.string()).optional().describe("Label names to assign (replaces existing)"),
      assignee_id: z.string().optional().describe("[Business] User ID to assign to, or null to unassign"),
      due_string: z.string().optional().describe("New due date in natural language. Use 'no date' to clear."),
      due_date: z.string().optional().describe("Due date in YYYY-MM-DD format. Mutually exclusive with due_string/due_datetime."),
      due_datetime: z.string().optional().describe("Due date and time in ISO 8601. Mutually exclusive with due_string/due_date."),
      deadline_date: z.string().optional().describe("[Pro] Deadline date in YYYY-MM-DD format. Pass null to clear."),
      duration: z.number().int().optional().describe("[Pro] Estimated duration amount (requires duration_unit)."),
      duration_unit: z.enum(["minute", "day"]).optional().describe("[Pro] Duration unit (requires duration)."),
      project_id: z.string().optional().describe("Move task to this project ID. Mutually exclusive with section_id/parent_id."),
      section_id: z.string().optional().describe("Move task to this section ID. Mutually exclusive with project_id/parent_id."),
      parent_id: z.string().optional().describe("Move task under this parent task ID. Mutually exclusive with project_id/section_id."),
    },
  },
  async ({ task_id, content, description, priority, labels, assignee_id, due_string, due_date, due_datetime, deadline_date, duration, duration_unit, project_id, section_id, parent_id }) => {
    if (assignee_id) { const err = requireLicense("assignee_id", "business"); if (err) return err; }
    if (deadline_date) { const err = requireLicense("deadline_date", "pro"); if (err) return err; }
    if (duration !== undefined || duration_unit !== undefined) { const err = requireLicense("duration/duration_unit", "pro"); if (err) return err; }

    // Move if destination specified
    if (project_id || section_id || parent_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const moveArgs: any = {};
      if (project_id) moveArgs.projectId = project_id;
      else if (section_id) moveArgs.sectionId = section_id;
      else if (parent_id) moveArgs.parentId = parent_id;
      await todoist.moveTask(task_id, moveArgs);
    }

    // Apply field updates if any non-move fields were provided
    const hasUpdates = [content, description, priority, labels, assignee_id, due_string, due_date, due_datetime, deadline_date, duration].some(v => v !== undefined);
    if (!hasUpdates) {
      const task = await todoist.getTask(task_id);
      return { content: [{ type: "text", text: JSON.stringify(task, null, 2) }] };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const args: any = { content, description, priority, labels, assigneeId: assignee_id, dueString: due_string, deadlineDate: deadline_date };
    if (due_date) args.dueDate = due_date;
    if (due_datetime) args.dueDatetime = due_datetime;
    if (duration !== undefined) { args.duration = duration; args.durationUnit = duration_unit; }

    const task = await todoist.updateTask(task_id, args);
    return { content: [{ type: "text", text: JSON.stringify(task, null, 2) }] };
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
    return { content: [{ type: "text", text: `Task ${task_id} marked as complete.` }] };
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
    return { content: [{ type: "text", text: JSON.stringify(projects, null, 2) }] };
  }
);

// --- get_sections ---
server.registerTool(
  "get_sections",
  {
    description: "List sections, optionally filtered by project",
    inputSchema: {
      project_id: z.string().optional().describe("Filter sections by project ID"),
    },
  },
  async ({ project_id }) => {
    const sections = await todoist.getSections({ projectId: project_id });
    return { content: [{ type: "text", text: JSON.stringify(sections, null, 2) }] };
  }
);

// --- get_section ---
server.registerTool(
  "get_section",
  {
    description: "Get a single Todoist section by ID",
    inputSchema: {
      section_id: z.string().describe("The ID of the section"),
    },
  },
  async ({ section_id }) => {
    const section = await todoist.getSection(section_id);
    return { content: [{ type: "text", text: JSON.stringify(section, null, 2) }] };
  }
);

// --- create_section ---
server.registerTool(
  "create_section",
  {
    description: "Create a new section within a project",
    inputSchema: {
      name: z.string().describe("Section name"),
      project_id: z.string().describe("Project ID to create the section in"),
      order: z.number().int().optional().describe("Position of the section within the project"),
    },
  },
  async ({ name, project_id, order }) => {
    const section = await todoist.addSection({ name, projectId: project_id, order });
    return { content: [{ type: "text", text: JSON.stringify(section, null, 2) }] };
  }
);

// --- update_section ---
server.registerTool(
  "update_section",
  {
    description: "Rename a Todoist section",
    inputSchema: {
      section_id: z.string().describe("The ID of the section to update"),
      name: z.string().describe("New section name"),
    },
  },
  async ({ section_id, name }) => {
    const section = await todoist.updateSection(section_id, { name });
    return { content: [{ type: "text", text: JSON.stringify(section, null, 2) }] };
  }
);

// --- delete_section ---
server.registerTool(
  "delete_section",
  {
    description: "Delete a Todoist section (and all tasks within it)",
    inputSchema: {
      section_id: z.string().describe("The ID of the section to delete"),
    },
  },
  async ({ section_id }) => {
    await todoist.deleteSection(section_id);
    return { content: [{ type: "text", text: `Section ${section_id} deleted.` }] };
  }
);

// --- get_comments ---
server.registerTool(
  "get_comments",
  {
    description: "List comments on a task or project. Provide either task_id or project_id.",
    inputSchema: {
      task_id: z.string().optional().describe("Task ID to get comments for. Mutually exclusive with project_id."),
      project_id: z.string().optional().describe("Project ID to get comments for. Mutually exclusive with task_id."),
    },
  },
  async ({ task_id, project_id }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comments = await todoist.getComments(task_id ? { taskId: task_id } : { projectId: project_id! } as any);
    return { content: [{ type: "text", text: JSON.stringify(comments, null, 2) }] };
  }
);

// --- add_comment ---
server.registerTool(
  "add_comment",
  {
    description: "Add a comment to a Todoist task or project. Provide either task_id or project_id.",
    inputSchema: {
      content: z.string().describe("The comment text"),
      task_id: z.string().optional().describe("Task ID to comment on. Mutually exclusive with project_id."),
      project_id: z.string().optional().describe("Project ID to comment on. Mutually exclusive with task_id."),
    },
  },
  async ({ content, task_id, project_id }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comment = await todoist.addComment(task_id ? { taskId: task_id, content } : { projectId: project_id!, content } as any);
    return { content: [{ type: "text", text: JSON.stringify(comment, null, 2) }] };
  }
);

// --- update_comment ---
server.registerTool(
  "update_comment",
  {
    description: "Update the text of an existing comment",
    inputSchema: {
      comment_id: z.string().describe("The ID of the comment to update"),
      content: z.string().describe("New comment text"),
    },
  },
  async ({ comment_id, content }) => {
    const comment = await todoist.updateComment(comment_id, { content });
    return { content: [{ type: "text", text: JSON.stringify(comment, null, 2) }] };
  }
);

// --- delete_comment ---
server.registerTool(
  "delete_comment",
  {
    description: "Delete a comment",
    inputSchema: {
      comment_id: z.string().describe("The ID of the comment to delete"),
    },
  },
  async ({ comment_id }) => {
    await todoist.deleteComment(comment_id);
    return { content: [{ type: "text", text: `Comment ${comment_id} deleted.` }] };
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
    return { content: [{ type: "text", text: JSON.stringify(labels, null, 2) }] };
  }
);

// --- create_label ---
server.registerTool(
  "create_label",
  {
    description: "Create a new personal Todoist label",
    inputSchema: {
      name: z.string().describe("Label name"),
      color: z.string().optional().describe("Color name, e.g. 'red', 'blue', 'green'"),
    },
  },
  async ({ name, color }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const label = await todoist.addLabel({ name, color: color as any });
    return { content: [{ type: "text", text: JSON.stringify(label, null, 2) }] };
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
    return { content: [{ type: "text", text: JSON.stringify(label, null, 2) }] };
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
    return { content: [{ type: "text", text: `Label ${label_id} deleted.` }] };
  }
);

// --- Start server ---
async function main() {
  await resolveLicense();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Failed to start MCP server:", err);
  process.exit(1);
});

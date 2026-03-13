# todoist-mcp

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that connects Claude to Todoist. Manage tasks, projects, sections, labels, and comments directly from Claude — no copy-pasting required.

## Tools

### Tasks
| Tool | Description |
|---|---|
| `get_tasks` | List active tasks, filter by project, section, parent, label, or IDs |
| `get_tasks_by_filter` | Query tasks using Todoist filter syntax (`today`, `p1 & #Work`, `overdue`, etc.) |
| `create_task` | Create a task with full field support |
| `quick_add_task` | Create a task using natural language (`Buy milk tomorrow p2 @shopping #Groceries`) |
| `update_task` | Update a task, including moving it to a different project/section/parent |
| `close_task` | Mark a task complete |

### Projects
| Tool | Description |
|---|---|
| `get_projects` | List all projects |

### Sections
| Tool | Description |
|---|---|
| `get_sections` | List sections, optionally filtered by project |
| `get_section` | Get a single section by ID |
| `create_section` | Create a section within a project |
| `update_section` | Rename a section |
| `delete_section` | Delete a section and all tasks within it |

### Labels
| Tool | Description |
|---|---|
| `get_labels` | List all personal labels |
| `create_label` | Create a new label |
| `update_label` | Rename or recolor a label |
| `delete_label` | Delete a label |

### Comments
| Tool | Description |
|---|---|
| `get_comments` | List comments on a task or project |
| `add_comment` | Add a comment to a task or project |
| `update_comment` | Edit a comment |
| `delete_comment` | Delete a comment |

## Setup

### 1. Get your Todoist API token

Go to Todoist → Settings → Integrations → Developer → copy your API token.

### 2. Configure Claude Desktop

Add the following to your `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "todoist": {
      "command": "npx",
      "args": ["-y", "@carentsen/todoist-mcp"],
      "env": {
        "TODOIST_API_TOKEN": "your_token_here"
      }
    }
  }
}
```

Restart Claude Desktop after saving.

## License tiers

Some features require a Todoist Pro or Business plan. The server detects your plan automatically at startup. You can override this with the `TODOIST_LICENSE` environment variable:

```json
"env": {
  "TODOIST_API_TOKEN": "your_token_here",
  "TODOIST_LICENSE": "pro"
}
```

| Value | Features unlocked |
|---|---|
| `free` | All basic task, project, section, label, and comment tools |
| `pro` | + `deadline_date`, `duration`, `reminder` |
| `business` | + `assignee_id` |

## Development

```bash
npm install
npm run build    # compile TypeScript → dist/
npm run dev      # watch mode
```

Copy `.env.example` to `.env` and set your `TODOIST_API_TOKEN` for local testing.

## License

MIT
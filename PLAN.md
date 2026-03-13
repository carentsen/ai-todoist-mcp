# Todoist MCP Server — Development Plan

Based on ADR: Todoist MCP Server for Claude Integration (2026-03-13)

---

## Tech Stack

- **Language:** TypeScript (Node.js)
- **MCP SDK:** `@modelcontextprotocol/sdk`
- **Todoist Client:** `@doist/todoist-api-typescript`
- **Transport:** stdio (v1 local) → HTTP/SSE (v2 remote)
- **Distribution:** npm, invoked via `npx`
- **Auth:** `TODOIST_API_TOKEN` environment variable

---

## Phase 1 — MVP

### Step 1: Scaffold project
- `npm init -y`
- Add `tsconfig.json` (targeting Node.js, `outDir: dist`, `module: commonjs`)
- Add `package.json` scripts: `build`, `dev`, `start`
- Set `bin` entry pointing to `dist/index.js` for `npx` invocation
- Add `.env` support for `TODOIST_API_TOKEN`

### Step 2: Install dependencies
- `@modelcontextprotocol/sdk` — MCP server + stdio transport
- `@doist/todoist-api-typescript` — official Todoist client
- Dev: `typescript`, `@types/node`

### Step 3: Implement core server (`src/index.ts`)
- Initialize `TodoistApi` with token from `process.env.TODOIST_API_TOKEN`
- Create `McpServer` instance with stdio transport
- Register 4 MVP tools:

| Tool | Todoist API | Description |
|---|---|---|
| `get_tasks` | `GET /tasks` | List active tasks, optional `project_id`/`label` filter |
| `create_task` | `POST /tasks` | content (required), due_date, priority, label_ids |
| `close_task` | `POST /tasks/{id}/close` | Mark a task complete |
| `get_projects` | `GET /projects` | List all projects |

### Step 4: Wire stdio transport & publish
- Connect server to `StdioServerTransport`
- Add `"bin"` to `package.json`, ensure compiled entry is executable
- `npm publish` (consider `@carentsen/todoist-mcp` if name is taken)

### Step 5: Test locally
Add to Claude Desktop config (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "todoist": {
      "command": "npx",
      "args": ["-y", "todoist-mcp-server"],
      "env": {
        "TODOIST_API_TOKEN": "your_token_here"
      }
    }
  }
}
```

---

## Phase 2 — Full Feature

| Tool | Todoist API | Description |
|---|---|---|
| `update_task` | `POST /tasks/{id}` | Update content, due_date, priority, label_ids |
| `add_comment` | `POST /comments` | Add a comment to a task |
| `get_labels` | `GET /labels` | List all personal labels |
| `create_label` | `POST /labels` | Create a new personal label |
| `update_label` | `POST /labels/{id}` | Rename or recolor a label |
| `delete_label` | `DELETE /labels/{id}` | Delete a personal label |

- Ensure `create_task` and `update_task` accept label names (resolve to IDs)
- Add input validation and structured error responses

---

## Phase 3 — Remote Deployment (future)

- Swap `StdioServerTransport` for `SSEServerTransport`
- Deploy to Azure App Service (Node.js, managed TLS)
- Replace personal token with OAuth2 / Entra ID

Claude config for v2:
```json
{
  "mcpServers": {
    "todoist": {
      "type": "sse",
      "url": "https://your-app.azurewebsites.net/sse",
      "headers": {
        "Authorization": "Bearer your_token_here"
      }
    }
  }
}
```

---

## File Structure

```
todoist-mcp/
├── src/
│   └── index.ts        # MCP server entrypoint, all tool registrations
├── dist/               # compiled output (gitignored)
├── package.json
├── tsconfig.json
└── .env                # TODOIST_API_TOKEN (gitignored)
```

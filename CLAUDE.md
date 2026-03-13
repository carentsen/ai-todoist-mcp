# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A local MCP server that exposes Todoist as tools Claude can call natively. Runs via stdio, invoked directly by Claude Desktop pointing at `dist/index.js`.

## Commands

```bash
npm run build   # Compile TypeScript → dist/
npm run dev     # Watch mode
npm run start   # Run the compiled server
```

## Architecture

Single entry point: `src/index.ts`. All MCP tool registrations live in this one file.

- **MCP SDK** (`@modelcontextprotocol/sdk`) — `McpServer` + `StdioServerTransport`
- **Todoist client** (`@doist/todoist-api-typescript`) — `TodoistApi`, authenticated via `TODOIST_API_TOKEN` env var
- **Zod** (`zod/v3`) — input schema validation for each tool

## Tools exposed

| Tool | Todoist API |
|---|---|
| `get_tasks` | `GET /tasks` |
| `create_task` | `POST /tasks` |
| `close_task` | `POST /tasks/{id}/close` |
| `get_projects` | `GET /projects` |
| `update_task` | `POST /tasks/{id}` |
| `add_comment` | `POST /comments` |
| `get_labels` | `GET /labels` |
| `create_label` | `POST /labels` |
| `update_label` | `POST /labels/{id}` |
| `delete_label` | `DELETE /labels/{id}` |

## Claude Desktop config

```json
{
  "mcpServers": {
    "todoist": {
      "command": "node",
      "args": ["C:\\Source\\mcp\\todoist-mcp\\dist\\index.js"],
      "env": {
        "TODOIST_API_TOKEN": "your_token_here"
      }
    }
  }
}
```

## Notes

- The Todoist client's `color` parameter for labels uses a strict internal union type (`ColorKey`) that is not exported. It is cast as `any` — the API itself will validate the value.
- If you see `fetch failed` errors, check VPN/SSL inspection settings. Node.js does not use the Windows certificate store.
- `dist/` is gitignored — run `npm run build` after cloning.

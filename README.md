# AI Tools Directory — MCP server

A remote [MCP](https://modelcontextprotocol.io) server exposing a curated index of **221 AI tools** across **21 industry
departments**, so AI assistants can look up, filter and shortlist tools instead of guessing.

- **Endpoint:** `https://ai-tools-mcp.toolboxes.top/mcp`
- **Transport:** Streamable HTTP (JSON-RPC 2.0)
- **Auth:** none
- **Source data:** [ai.toolboxes.top](https://ai.toolboxes.top)

## Quick connect

### Claude Desktop / Claude Code

```json
{
  "mcpServers": {
    "ai-tools-directory": {
      "type": "http",
      "url": "https://ai-tools-mcp.toolboxes.top/mcp"
    }
  }
}
```

### Cursor — `.cursor/mcp.json`

Same structure as above.

### Any client

```
POST https://ai-tools-mcp.toolboxes.top/mcp
Content-Type: application/json

{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"my-client","version":"1.0"}}}
```

## Tools

| Tool | What it does |
|---|---|
| `search_ai_tools` | Free-text search across names, descriptions and tags; filter by `department` and/or `pricing` (`free` / `freemium` / `paid`) |
| `get_ai_tool` | Full record for one tool by name. Exact match first, then fuzzy; returns suggestions when there's no match |
| `list_departments` | All 21 departments with their tool counts |
| `find_free_ai_tools` | Tools with a free tier, filterable by `requires_no_credit_card`, `has_free_plan`, `has_api_on_free` |
| `directory_stats` | Counts, pricing distribution, free-tier coverage |

## Resources

| URI | Contents |
|---|---|
| `aitools://directory` | Full dataset as JSON (221 tools) |
| `aitools://free-tier` | Subset with free-tier facts |
| `aitools://departments` | Department list |

## Example

```json
{
  "jsonrpc": "2.0", "id": 2, "method": "tools/call",
  "params": { "name": "search_ai_tools", "arguments": { "department": "legal", "pricing": "freemium", "limit": 3 } }
}
```

```
**Harvey** — Legal · paid
...
```

## Data quality — please read

- **The directory is reliable.** Name, URL, department, pricing tier, description and tags are human-maintained and reviewed.
- **`freeTier` is NOT verified.** It is regex-extracted from vendor pages and has known failure modes:
  some tools return a login wall instead of a pricing page, and the extractor can't always tell
  "free tier needs no card" from "paid plans need a card".
  - The server drops contradictory signals rather than guessing.
  - The server's `instructions` require any assistant using `freeTier` to tell the user it is
    auto-detected and may be outdated.
  - Coverage is ~87% of tools reachable; of those, about half yielded a usable signal.
- **A missing `freeTier` field means "no data", not "no free tier."**

If you find wrong free-tier data, please open an issue — that's exactly the feedback needed to
improve the extractor.

## Self-host

The server is a single Cloudflare Worker with no dependencies.

```bash
npm install
node build-dataset.mjs          # regenerate dataset.json (edit it, or point it at your own data)
npx wrangler deploy
```

Requires `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in the environment — do not commit them.

```bash
node test.mjs https://ai-tools-mcp.toolboxes.top   # 36 end-to-end assertions
```

To run locally:

```bash
npx wrangler dev --port 8791
node test.mjs http://127.0.0.1:8791
```

## Notes on the deployment

- `workers.dev` hostnames are blocked by the GFW, so the canonical hostname is
  `ai-tools-mcp.toolboxes.top` (a Cloudflare custom domain on the Worker).
- The endpoint is served directly from a Worker; there is no origin server.

## License

Code: MIT. Dataset: CC BY 4.0 — free to use with attribution to
[ai.toolboxes.top](https://ai.toolboxes.top).

// AI Tools Directory — MCP server (Cloudflare Worker)
// 手写 MCP Streamable HTTP 传输，零依赖。
//
// 端点: POST /mcp   ← MCP JSON-RPC
//       GET  /      ← 人类可读的落地页
//       GET  /health
//
// 数据来源: mcp/dataset.json（由 build-dataset.mjs 从 js/data.js 生成）

import dataset from './dataset.json';

const SERVER_NAME = 'ai-tools-directory';
const SERVER_VERSION = '1.0.0';
const PROTOCOL_VERSION = '2025-06-18';
const SITE = 'https://ai.toolboxes.top';

// Glama 连接器归属验证（claim ownership）。
// 从 glama.ai 的 claim 面板复制，形如 glama_claim_ + 32 位 [A-Za-z0-9_-]。
// 该 token 本身不含个人信息，按 Glama 要求公开托管在 /.well-known/glama.json。
const GLAMA_CLAIM_TOKEN = 'glama_claim_oMvb33CKShTtQWdLjVWJW1iVsMO8ztBn';

const INSTRUCTIONS = [
  'AI Tools Directory — a curated, machine-readable index of ' + dataset.stats.tools + ' AI tools across ' + dataset.stats.departments + ' industry departments.',
  '',
  'Use this server when the user asks to find, compare, or shortlist AI tools for a task, industry, or budget.',
  'Always call search_ai_tools or find_free_ai_tools before answering a "which AI tool should I use" question.',
  '',
  'DATA QUALITY: the directory itself (name, URL, department, pricing tier, description) is human-maintained and reliable.',
  'The `freeTier` field is AUTO-EXTRACTED from vendor websites by a scraper and has NOT been verified by a human.',
  'When you use a `freeTier` field, you MUST tell the user it is auto-detected and may be outdated, and point them to the vendor page to confirm.',
  'Tools without a `freeTier` field simply have no extracted data — that is NOT evidence that they lack a free tier.',
].join('\n');

// ---------- 工具定义 ----------
const TOOLS = [
  {
    name: 'search_ai_tools',
    description: 'Search the AI tools directory by free-text query, industry department, and/or pricing tier. Returns matching tools with name, URL, department, pricing tier and description.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free text matched against tool name, description and tags (e.g. "video editing", "invoice").' },
        department: { type: 'string', description: 'Department id, e.g. marketing, design, dev, finance, legal, healthcare. Call list_departments for the full list.' },
        pricing: { type: 'string', enum: ['free', 'freemium', 'paid'], description: 'Filter by pricing tier.' },
        limit: { type: 'number', description: 'Max results (default 20, max 100).' },
      },
    },
  },
  {
    name: 'get_ai_tool',
    description: 'Get the full record for one AI tool by name (exact match first, then fuzzy).',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Tool name, e.g. "ChatGPT".' } },
      required: ['name'],
    },
  },
  {
    name: 'list_departments',
    description: 'List all industry departments in the directory with the number of tools in each.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'find_free_ai_tools',
    description: 'Find AI tools with a free tier, optionally filtered by auto-extracted facts (no credit card required, has a free plan, API available on the free tier). Free-tier facts are auto-extracted and unverified.',
    inputSchema: {
      type: 'object',
      properties: {
        requires_no_credit_card: { type: 'boolean', description: 'Only tools whose vendor page explicitly says no credit card is required.' },
        has_free_plan: { type: 'boolean', description: 'Only tools with a free plan / free tier / free forever.' },
        has_api_on_free: { type: 'boolean', description: 'Only tools with API access on the free tier.' },
        department: { type: 'string', description: 'Optional department filter.' },
        limit: { type: 'number', description: 'Max results (default 20, max 100).' },
      },
    },
  },
  {
    name: 'directory_stats',
    description: 'Get summary statistics for the directory: tool count, department count, pricing distribution, and how many tools have auto-extracted free-tier facts.',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ---------- 查询实现 ----------
const norm = s => String(s || '').toLowerCase();

function summarize(t) {
  const lines = [
    `**${t.name}** — ${t.departmentName} · ${t.pricing}${t.featured ? ' · featured' : ''}${t.isNew ? ' · new' : ''}`,
    t.description,
    t.url,
  ];
  if (t.freeTier) {
    const f = t.freeTier;
    const bits = [];
    if (f.freeForever) bits.push('free forever');
    if (f.freePlan) bits.push('has free plan');
    if (f.freeTrial) bits.push('free trial' + (f.trialDays ? ` (${f.trialDays} days)` : ''));
    if (f.noCreditCard) bits.push('no credit card required');
    if (f.apiOnFree) bits.push('API on free tier');
    if (f.watermarkFree) bits.push('no watermark');
    if (bits.length) lines.push(`  free tier (auto-detected, unverified): ${bits.join(', ')}`);
  }
  return lines.join('\n');
}

function searchTools({ query, department, pricing, limit } = {}) {
  const n = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const q = norm(query);
  let out = dataset.tools;
  if (department) out = out.filter(t => norm(t.department) === norm(department));
  if (pricing) out = out.filter(t => t.pricing === pricing);
  if (q) {
    out = out
      .map(t => {
        const name = norm(t.name), desc = norm(t.description), tags = norm((t.tags || []).join(' ')), dept = norm(t.departmentName);
        let score = 0;
        if (name === q) score += 100;
        if (name.includes(q)) score += 40;
        if (tags.includes(q)) score += 20;
        if (dept.includes(q)) score += 15;
        if (desc.includes(q)) score += 10;
        return { t, score };
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score || a.t.name.localeCompare(b.t.name))
      .map(x => x.t);
  }
  return { total: out.length, returned: Math.min(out.length, n), tools: out.slice(0, n) };
}

function findFree({ requires_no_credit_card, has_free_plan, has_api_on_free, department, limit } = {}) {
  const n = Math.min(Math.max(Number(limit) || 20, 1), 100);
  let out = dataset.tools.filter(t => t.freeTier || t.pricing === 'free' || t.pricing === 'freemium');
  if (department) out = out.filter(t => norm(t.department) === norm(department));
  if (requires_no_credit_card) out = out.filter(t => t.freeTier?.noCreditCard);
  if (has_free_plan) out = out.filter(t => t.freeTier?.freePlan || t.freeTier?.freeForever || t.pricing === 'free');
  if (has_api_on_free) out = out.filter(t => t.freeTier?.apiOnFree);
  return { total: out.length, returned: Math.min(out.length, n), tools: out.slice(0, n) };
}

function callTool(name, args = {}) {
  switch (name) {
    case 'search_ai_tools': {
      const r = searchTools(args);
      if (!r.total) return text(`No tools matched. Try a broader query, or call list_departments to see valid department ids.`);
      return text(`Found ${r.total} matching tool(s), showing ${r.returned}:\n\n` + r.tools.map(summarize).join('\n\n'));
    }
    case 'get_ai_tool': {
      const q = norm(args.name);
      if (!q) return text('Missing required argument: name.', true);
      const exact = dataset.tools.find(t => norm(t.name) === q);
      const fuzzy = exact || dataset.tools.find(t => norm(t.name).includes(q) || q.includes(norm(t.name)));
      if (!fuzzy) {
        const near = searchTools({ query: args.name, limit: 5 }).tools;
        return text(`No tool named "${args.name}".` + (near.length ? '\n\nClosest matches:\n' + near.map(t => '- ' + t.name).join('\n') : ''));
      }
      const t = fuzzy;
      const extra = [
        '',
        `URL: ${t.url}`,
        `Department: ${t.departmentName} (${t.department})`,
        `Pricing tier: ${t.pricing}`,
        t.tags?.length ? `Tags: ${t.tags.join(', ')}` : '',
        t.freeTier ? `Free tier (auto-detected, UNVERIFIED — confirm on the vendor page): ${JSON.stringify(t.freeTier)}` : 'Free tier: no extracted data (this does not mean there is none).',
      ].filter(Boolean);
      return text(`${t.name}\n${t.description}` + '\n' + extra.join('\n'));
    }
    case 'list_departments': {
      return text(
        `${dataset.stats.departments} departments:\n\n` +
        dataset.departments.map(d => `- **${d.id}** — ${d.name} (${d.tools} tools)`).join('\n') +
        `\n\nPass the id as the \`department\` argument to search_ai_tools.`
      );
    }
    case 'find_free_ai_tools': {
      const r = findFree(args);
      const caveat = '\n\nNote: free-tier details are auto-extracted from vendor pages and are NOT human-verified. Confirm on the vendor site before relying on them.';
      if (!r.total) return text('No tools matched those filters. Try relaxing them — e.g. drop requires_no_credit_card, since that fact is only known for a subset of tools.' + caveat);
      return text(`Found ${r.total} matching tool(s), showing ${r.returned}:\n\n` + r.tools.map(summarize).join('\n\n') + caveat);
    }
    case 'directory_stats': {
      const s = dataset.stats;
      return text(
        `AI Tools Directory — ${dataset.generatedAt}\n\n` +
        `- Tools: ${s.tools}\n- Departments: ${s.departments}\n` +
        `- Pricing: ${Object.entries(s.byPricing).map(([k, v]) => `${k} ${v}`).join(', ')}\n` +
        `- Tools with auto-extracted free-tier facts: ${s.toolsWithFreeTierFacts} of ${s.tools}\n\n` +
        `Source: ${dataset.source} · License: ${dataset.license}`
      );
    }
    default:
      return text(`Unknown tool: ${name}`, true);
  }
}

function text(t, isError) { return { content: [{ type: 'text', text: t }], ...(isError ? { isError: true } : {}) }; }

// ---------- MCP JSON-RPC ----------
function ok(id, result) { return { jsonrpc: '2.0', id, result }; }
function rpcErr(id, code, message, data) { return { jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data ? { data } : {}) } }; }

const RESOURCES = [
  { uri: 'aitools://directory', name: 'AI tools directory (full)', mimeType: 'application/json', description: `${dataset.stats.tools} AI tools with department, pricing tier, description, tags and URL.` },
  { uri: 'aitools://free-tier', name: 'AI tools with free-tier facts', mimeType: 'application/json', description: 'Subset with auto-extracted (unverified) free-tier facts.' },
  { uri: 'aitools://departments', name: 'Departments', mimeType: 'application/json', description: `${dataset.stats.departments} industry departments and their tool counts.` },
];

async function handle(msg) {
  const { id, method, params } = msg || {};
  const isNotification = id === undefined || id === null;
  switch (method) {
    case 'initialize':
      return ok(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION, title: 'AI Tools Directory', websiteUrl: SITE },
        instructions: INSTRUCTIONS,
      });
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null;
    case 'ping':
      return ok(id, {});
    case 'tools/list':
      return ok(id, { tools: TOOLS });
    case 'tools/call': {
      const name = params?.name;
      if (!name) return rpcErr(id, -32602, 'Invalid params: name is required');
      try { return ok(id, callTool(name, params?.arguments || {})); }
      catch (e) { return ok(id, { content: [{ type: 'text', text: 'Tool error: ' + (e.message || e) }], isError: true }); }
    }
    case 'resources/list':
      return ok(id, { resources: RESOURCES });
    case 'resources/read': {
      const uri = params?.uri;
      let body;
      if (uri === 'aitools://directory') body = dataset;
      else if (uri === 'aitools://free-tier') body = { generatedAt: dataset.generatedAt, source: dataset.source, tools: dataset.tools.filter(t => t.freeTier) };
      else if (uri === 'aitools://departments') body = dataset.departments;
      else return rpcErr(id, -32602, 'Unknown resource: ' + uri);
      return ok(id, { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(body) }] });
    }
    case 'prompts/list':
      return ok(id, { prompts: [] });
    default:
      if (isNotification) return null;
      return rpcErr(id, -32601, 'Method not found: ' + method);
  }
}

// ---------- HTTP ----------
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version, Authorization',
  'Access-Control-Max-Age': '86400',
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj, null, 1), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    if (request.method === 'GET') {
      if (url.pathname === '/health') return json({ ok: true, server: SERVER_NAME, version: SERVER_VERSION, tools: dataset.stats.tools });
      // Glama 连接器归属验证 —— 需符合 https://glama.ai/mcp/schemas/connector.json
      if (url.pathname === '/.well-known/glama.json') {
        if (!GLAMA_CLAIM_TOKEN) return json({ error: 'not_found' }, 404);
        return new Response(
          JSON.stringify({ $schema: 'https://glama.ai/mcp/schemas/connector.json', claim: GLAMA_CLAIM_TOKEN }, null, 1),
          { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS } }
        );
      }
      // 落地页 / 服务信息
      const accept = request.headers.get('accept') || '';
      if (url.pathname !== '/' && url.pathname !== '/mcp') return json({ error: 'not_found' }, 404);
      if (accept.includes('text/event-stream')) {
        // 按要求开一个 SSE 流（仅用于保持连接，不推送事件）
        return new Response(': connected\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', ...CORS } });
      }
      return new Response(landingHtml(url), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', ...CORS } });
    }

    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    let body;
    try { body = await request.json(); } catch { return json(rpcErr(null, -32700, 'Parse error'), 400); }

    if (Array.isArray(body)) {
      const results = [];
      for (const m of body) { const r = await handle(m); if (r) results.push(r); }
      return results.length ? json(results) : new Response(null, { status: 202, headers: CORS });
    }

    const result = await handle(body);
    if (!result) return new Response(null, { status: 202, headers: CORS });
    return json(result);
  },
};

function landingHtml(url) {
  const s = dataset.stats;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI Tools Directory — MCP server</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:720px;margin:48px auto;padding:0 20px;line-height:1.6;color:#1a1a1a}
code,pre{background:#f4f4f2;border-radius:6px;padding:2px 6px;font-size:13px}
pre{padding:12px 14px;overflow-x:auto}
h1{font-size:22px;font-weight:600;margin-bottom:4px}
h2{font-size:15px;font-weight:600;margin-top:28px}
.muted{color:#666;font-size:14px}
table{border-collapse:collapse;width:100%;font-size:14px}
td,th{border-bottom:1px solid #e5e5e2;padding:6px 8px;text-align:left}
</style></head><body>
<h1>AI Tools Directory</h1>
<p class="muted">MCP server exposing ${s.tools} curated AI tools across ${s.departments} industry departments.</p>
<h2>Connect</h2>
<pre>${url.origin}/mcp</pre>
<p class="muted">Streamable HTTP transport, JSON-RPC 2.0. No authentication.</p>
<h2>Tools</h2>
<table><tr><th>Name</th><th>What it does</th></tr>
${TOOLS.map(t => `<tr><td><code>${t.name}</code></td><td>${t.description.split('.')[0]}.</td></tr>`).join('')}
</table>
<h2>Data</h2>
<table>
<tr><td>Tools</td><td>${s.tools}</td></tr>
<tr><td>Departments</td><td>${s.departments}</td></tr>
<tr><td>Pricing</td><td>${Object.entries(s.byPricing).map(([k, v]) => `${k} ${v}`).join(' · ')}</td></tr>
<tr><td>Free-tier facts</td><td>${s.toolsWithFreeTierFacts} of ${s.tools} (auto-extracted, unverified)</td></tr>
<tr><td>Generated</td><td>${dataset.generatedAt}</td></tr>
</table>
<p class="muted" style="margin-top:28px">Source: <a href="${dataset.source}">${dataset.source}</a> · License: ${dataset.license}</p>
</body></html>`;
}

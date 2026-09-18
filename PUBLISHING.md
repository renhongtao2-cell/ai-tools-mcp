# 上架指南 — AI Tools Directory MCP server

当前状态（2026-09-17）：

| 项 | 状态 |
|---|---|
| 端点 | ✅ `https://ai-tools-mcp.toolboxes.top/mcp`（已上线，36/36 自测通过） |
| `server.json` | ✅ 已通过官方 `mcp-publisher validate`，命名空间 `top.toolboxes/ai-tools-directory` |
| `mcp-publisher` | ✅ 已装到 `C:\Users\Administrator\.workbuddy-ai\bin\mcp-publisher\mcp-publisher.exe` |
| 官方 Registry | ✅ **已发布**（DNS 域名认证，非 GitHub 设备码）— 自动级联 Smithery + PulseMCP |
| DNS TXT | ✅ 已在 `toolboxes.top` apex 加 `v=MCPv1; k=ed25519; p=...`（用 `cf.env` 里的 `CF_TOK` 经 Cloudflare API 操作） |
| 公开仓库 | 🔴 **必须补**（不再是"可选"）：Registry 条目已**公开声明** `github.com/renhongtao2-cell/ai-tools-mcp`，但该仓库 **404** —— 这是一条公开的失效引用。本机 `.git-credentials` 的 token **实测 401 已过期**（2026-09-18）。仓库本地已就绪：4 个 commit、工作区干净、README / LICENSE / server.json / glama.json / .gitignore 齐全 |

---

## 为什么先发官方 Registry

Smithery 和 PulseMCP **都会自动从官方 Registry 抓取**。发一次，能级联到多个平台。这是性价比最高的一步，而且我们不需要发 npm 包（remote server 用 `remotes` 字段声明 URL 即可）。

---

## 第 1 步：官方 MCP Registry ✅ 已完成（2026-09-17）

实际走的是 **DNS 域名认证**（比 GitHub 设备码省事，全自动，不用浏览器）：

1. 在 `toolboxes.top` 的 **apex（Name=`@`）** 加一条 TXT 记录（Cloudflare → DNS → 添加记录，类型 TXT）：
   ```
   v=MCPv1; k=ed25519; p=lBdxoy2ygBjN2ubtZtCG3JMjOw/3Jvs8AH+TvpkGSNw=
   ```
   > ⚠️ 放 apex，不是 `_mcp` 子域。已有 GSC 验证 TXT 不用动，新加这条是追加。
2. 用本地 Ed25519 私钥（存 `C:\Users\Administrator\.workbuddy-ai\mcp-domain-key.json` 的 `priv` 字段，64 hex = 32 字节种子）登录：
   ```bash
   C:\Users\Administrator\.workbuddy-ai\bin\mcp-publisher\mcp-publisher.exe login dns --domain toolboxes.top --private-key <64hex私钥>
   ```
3. 发布：
   ```bash
   C:\Users\Administrator\.workbuddy-ai\bin\mcp-publisher\mcp-publisher.exe publish
   ```

验证（已通过）：
```bash
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=ai-tools-directory"
# => 返回 top.toolboxes/ai-tools-directory，official/active，remotes 指向 ai-tools-mcp.toolboxes.top/mcp
```

### 命名说明
`server.json` 用的是 `top.toolboxes/ai-tools-directory`（域名反向 DNS，DNS 认证要求的命名空间）。官方规则：**域名认证发布 `com.<反向域名>/*`**，这里是 `top.toolboxes`。反过来用 GitHub 认证的 `io.github.*` 前缀反而会被拒。

### 重新发布（数据更新后）
改 `server.json` 的 `version`（递增）→ `mcp-publisher publish`。Registry 只存元数据、指向固定 URL，改服务端代码不用重发。

---

## 第 2 步：Smithery

- 地址：<https://smithery.ai/new>
- 远程服务器要求 Streamable HTTP —— 我们符合
- **源码可以保持私有**，只要有公网可访问的端点
- 如果第 1 步发成功了，Smithery 可能会自动抓到；没抓到再用表单提交

表单填：

> **Name:** AI Tools Directory
> **URL:** https://ai-tools-mcp.toolboxes.top/mcp
> **Description:** Curated index of 221 AI tools across 21 industries. Search by use case, department or pricing tier.

---

## 第 3 步：Glama

- 地址：<https://glama.ai/mcp/servers>，用 "Add Server" 按钮
- 也可以通过 GitHub 登录验证身份，拿 "Author verified" 徽章
- 它会扫你的仓库，所以**建议第 1 步之后把公开仓库建起来**

---

## 第 4 步：MCP.so

- 地址：<https://mcp.so>，首页有提交表单
- 最大的目录（约 19,000 个），纯社区驱动，填表即可

---

## 第 5 步：Awesome MCP Servers（GitHub PR）

**2026-09-18 实测核对**（此前的"punkpeye 已 404"是错的）：

| 仓库 | 状态 | 星数 | 结论 |
|---|---|---|---|
| `punkpeye/awesome-mcp-servers` | ✅ 活跃 | **95,185** | **主目标**，去这个 |
| `wong2/awesome-mcp-servers` | ✅ 活跃 | 4,315 | 备选，也发 |
| `appcypher/awesome-mcp-servers` | ⚠️ **已 archived** | 5,771 | **别 PR**，归档仓库不会被合 |
| `sammcj/awesome-mcp-servers` | ❌ 404 | — | 已不存在 |

- 需要公开仓库（列表本身链到公开 repo，**不接受网站链接**）
- PR 要求：加到对应分类、保持字母序、写简短描述

---

## 第 6 步（自动）

PulseMCP（<https://pulsemcp.com>）和 MCP Market 会从官方 Registry 自动抓取，**不用手动提交**。

---

## 通用文案（直接复制）

**短描述（≤100 字符，部分表单有长度限制）：**
```
Curated index of 221 AI tools across 21 industries. Search by use case, department or pricing tier.
```

**长描述：**
```
A curated, machine-readable directory of 221 AI tools across 21 industry departments,
exposed as a remote MCP server. AI assistants can search by use case, department or
pricing tier, look up a single tool, and find tools with a usable free tier.

Tools: search_ai_tools, get_ai_tool, list_departments, find_free_ai_tools, directory_stats.
No authentication required. Data maintained at https://ai.toolboxes.top
```

**连接示例（放表单里很有用）：**
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

---

## ⚠️ 对外描述时不要做的事

- **不要把「免费额度」说成已验证。** 那是正则自动抽取的，有已知误判（登录墙、免费版/付费版绑卡混淆）。对外文案里别提，或者明确标注 auto-detected。
- 目录本身（名称/URL/部门/定价档/描述）是可靠的，可以放心宣传。
- 服务端已经在 `instructions` 里强制要求 AI 声明该字段未验证，这是最后一道防线。

---

## 数据更新后重新发布

```bash
cd E:\xiangmu\ai-tools-mcp
# 改 server.json 里的 version（官方 Registry 要求版本号递增）
C:\Users\Administrator\.workbuddy-ai\bin\mcp-publisher\mcp-publisher.exe publish
```

服务端改了不用重新发布 —— Registry 只存元数据，指向的是固定 URL。

---

## 检查清单

- [x] 官方 Registry 发布（`top.toolboxes/ai-tools-directory`，DNS 认证）✅ 2026-09-17
- [x] 用 Registry API 验证能搜到 ✅
- [x] DNS TXT 已加（apex，CF API 操作）
- [ ] 公开 GitHub 仓库（🔴 **必做**，其余目录站全部依赖它）：需有效 GitHub PAT，或直接在浏览器建空仓库再 `git push`
- [ ] Smithery —— 应已自动从官方 Registry 抓取；没抓到再填表单 <https://smithery.ai/new>
- [ ] Glama Add Server（有公开仓库后更顺）<https://glama.ai/mcp/servers>
- [ ] MCP.so 表单 <https://mcp.so>
- [ ] Awesome MCP Servers PR → **`punkpeye/awesome-mcp-servers`（95k star，活跃）** + `wong2/awesome-mcp-servers`
- [ ] 顺手也加到自家的 `mcp.toolboxes.top` 目录（现成的，别浪费）
- [ ] 官方 Registry 是 canonical，已自动级联 PulseMCP + MCP Market，不用手动提交

# 上架指南 — AI Tools Directory MCP server

> 本文件只记录**实测结论**。凡标 ✅ 的都写明了验证方式。
> 最后更新：2026-09-21

---

## 一、当前状态

| 渠道 | 状态 | 证据 |
|---|---|---|
| 端点 | ✅ 在线 | `POST https://ai-tools-mcp.toolboxes.top/mcp` → 200，5 个 tool |
| `server.json` | ✅ 通过 `mcp-publisher validate` | 命名空间 `top.toolboxes/ai-tools-directory` |
| **官方 MCP Registry** | ✅ **已收录** | `registry.modelcontextprotocol.io/v0.1/servers?search=ai-tools-directory` 返回本条目 |
| **awesome-remote-mcp-servers** | ✅ **已合并** | PR #407，2026-09-21 03:39 UTC 合并；README 第 114 行 + Glama 徽章 |
| **Glama** | ✅ 已收录且 **Healthy** | `glama.ai/mcp/connectors/top.toolboxes/ai-tools-directory` → 200，状态 Healthy |
| **MCPMarket** | ✅ 已收录 | `mcpmarket.com/server/ai-tools-directory` → 200，标题为我们的 |
| 公开仓库 | ✅ PUBLIC | https://github.com/renhongtao2-cell/ai-tools-mcp |
| **MCP.so** | ⬜ 未提交 | 需浏览器表单 |
| **Smithery** | ⬜ 未收录 | `registry.smithery.ai` 搜不到；页面需 WorkOS 登录 |
| **LobeHub Market** | ⬜ 未发布 | manifest 已生成（`lhm.plugin.json`），发布需浏览器 OAuth |
| **LibHunt** | ⬜ 未提交 | 对非浏览器 UA 返回 403，必须浏览器操作 |
| **PulseMCP** | ❌ 不接受提交 | 官方答复「去投官方 Registry」，别再找 |

### 意外收获：12 个第三方注册表在主动采集我们

发布 Registry 后，14 天内从 Cloudflare 日志观察到以下 UA 主动探活：

```
SentinelOracle/0.1      ProofBench/0.1          mcp-registry-scan/1.0
mcpbeat/0.1             aisec-registry/0.2      rootz-mcp-registry-prober/0.1
rokmcp-collector/0.2    truespar-mcp-registry   ahel-registry-sync/0.1
BuiltWith-MCPRegistryScrape                     mcp-ui-census/1.0
GolemreachTrustBot/0.1  AgenstryBot/0.3.0       TalandorBot/0.1
```

同时观察到 `Python/3.11 aiohttp` 有 **462 次成功 POST**（14 天），
说明除探活外**有真实 MCP 客户端在调用**。

**结论：官方 Registry 是「注册表生态的入口」。** 它不直接级联到 Smithery/PulseMCP，
但会被大量自动注册表抓取 —— 所以「先发 Registry」这步的回报比预期高。

---

## 二、🔴 关键教训：机房 IP 被 Cloudflare 挑战（已解决）

这是**卡了整条链路 3 天**的问题，必须完整记录，否则会重新踩。

### 症状
`awesome-remote-mcp-servers` 的 CI 判定我们端点**需要鉴权**（🔑），
但本机 `curl` 一直是 200（🔓）。Glama 连接器同时显示 **Unhealthy**。

### 错误排查路径（走了两次弯路）
1. ❌ 猜 `browser_check` → 关掉，无效
2. ❌ 猜 `security_level` → 设 `essentially_off`，无效

**为什么错**：本机（住宅 IP）永远复现不了机房 IP 的行为，靠推理必然出错。

### 正确方法：在目标网络里自己探自己
在**自己的仓库**加 GitHub Actions workflow（`.github/workflows/probe-endpoint.yml`），
从 GitHub 的出口 IP 去 curl 自己的端点。这样才拿到真实证据：

```http
HTTP/2 403
cf-mitigated: challenge          ← 托管挑战，不是 401！
server: cloudflare
body: <title>Just a moment...</title>
```

**判据**：`cf-mitigated: challenge` = Cloudflare 托管挑战。
CI 的检查脚本会把它误读成「需要鉴权」，于是打上 🔑。

### 真正的根因：Free 套餐的 **Bot Fight Mode**
- 它对该 zone 下**所有**主机、**所有** UA（连完整 Chrome UA）一律挑战机房出口 IP
- **与 `security_level` 无关**（设 `essentially_off` 也 403）
- ⚠️ **别被 `bot_fight_mode` 这个 zone setting 骗到** —— 那是付费版 Super Bot Fight Mode，
  Free 套餐读出来是 `Undefined zone setting`，**不代表 Bot Fight Mode 没开**。
  这是排查时最大的坑。
- ⚠️ `bot_management` API 端点 **读不了**（403）→ **只能在 dashboard 手动关**

### 修复与验证
dashboard → Security → **Bots** → 关掉 **Bot Fight Mode**。

关掉后从 GitHub Actions 出口（`172.208.153.25`）重跑探针：

| 探测项 | 结果 |
|---|---|
| `POST /mcp` (initialize) | **200** ✅ |
| zone 下 4 个主机 GET | 全 **200** ✅ |
| Twitterbot / facebookexternalhit / Slackbot / Discordbot | 全 **200** ✅ |
| 完整 Chrome UA | **200** ✅ |
| `*.workers.dev` 备用端点 | **200** ✅ |

**代价（需知情）**：Free 套餐的 Bot Fight Mode 无法按路径/主机缩小范围，只能整 zone 开或关。
关掉 = 爬虫也放行。对 SEO 反而有利，但 DDoS 防护会弱一些。

### 结果
Glama 连接器转为 **Healthy** → 维护者（punkpeye）当天就 merge 了 PR #407。

---

## 三、部署 worker

### 方式 A：wrangler（需先装）
```bash
cd E:\xiangmu\ai-tools-mcp
wrangler deploy          # 或 npm run deploy
```

### 方式 B：直接走 Cloudflare API（本机没装 wrangler 时用）
`worker.js` 有 `import dataset from './dataset.json'`，而 Workers API 只收单文件，
所以要先内联 JSON 再传。可复用脚本：`E:\xiangmu\AIchaoshi\.workbuddy\tmp\deploy-mcp.mjs`

```bash
node E:/xiangmu/AIchaoshi/.workbuddy/deploy-mcp.mjs
```
它做三件事：读 `worker.js` → 把 `import` 换成内联常量 → multipart PUT 到
`/accounts/{acc}/workers/scripts/ai-tools-mcp`。

**部署后必须回归验证**（否则不知道有没有把端点搞坏）：
```bash
curl -s https://ai-tools-mcp.toolboxes.top/health
curl -s https://ai-tools-mcp.toolboxes.top/.well-known/glama.json
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://ai-tools-mcp.toolboxes.top/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"verify","version":"1"}}}'
```

---

## 四、官方 Registry 的 DNS 认证方式（已完成的细节）

没用 GitHub 设备码，走的是 **DNS 域名认证**（全自动，不用浏览器）：

1. 在 `toolboxes.top` 的 **apex（Name=`@`）** 加 TXT 记录：
   ```
   v=MCPv1; k=ed25519; p=lBdxoy2ygBjN2ubtZtCG3JMjOw/3Jvs8AH+TvpkGSNw=
   ```
   > ⚠️ 放 apex，不是 `_mcp` 子域。已有 GSC 验证 TXT 不用动，这是追加。
2. 用本地 Ed25519 私钥登录（私钥**自行安全保存，切勿入库**）：
   ```bash
   mcp-publisher login dns --domain toolboxes.top --private-key <64hex私钥>
   ```
3. 发布：
   ```bash
   mcp-publisher publish
   ```
   CLI 在 `C:\Users\Administrator\.workbuddy-ai\bin\mcp-publisher\mcp-publisher.exe`

⚠️ 别用 HTTP 状态码判断 Registry 里有没有条目 —— 本机访问
`registry.modelcontextprotocol.io` 经常超时，**404 是网络假象**。

---

## 五、Glama 连接器认领（claim ownership）

已实现：worker 暴露 `GET /.well-known/glama.json`，返回
```json
{ "$schema": "https://glama.ai/mcp/schemas/connector.json",
  "claim": "glama_claim_oMvb33CKShTtQWdLjVWJW1iVsMO8ztBn" }
```

- 文件**必须在端点同域**（`ai-tools-mcp.toolboxes.top`，不是 apex）
- token **只能从 Glama 的 claim 面板复制**，必须先登录 Glama —— 这步无法自动化
- 认领后可得 **Author verified** 徽章，并能看到 Admin → Test Profile 里的真实 check 报错

---

## 六、🔴 被证伪的说法（不要再相信）

| 说法 | 实测结论 |
|---|---|
| 「发布到官方 Registry 会自动级联到 Smithery / PulseMCP」 | ❌ **不成立**。Smithery 不级联；PulseMCP 已不接受提交；MCPMarket / MCP Directory 读的是 **GitHub 仓库**而非 Registry |
| 「HTTP 200 就说明连接器健康」 | ❌ 不够。`awesome-remote-mcp-servers` 维护者**明文要求 Glama 连接器 Healthy** 才 merge |
| 「`appcypher/awesome-mcp-servers` 可以提」 | ❌ 已 archived |
| 「`sammcj/awesome-mcp-servers` 可以提」 | ❌ 404 |
| 「`bot_fight_mode` zone setting = Bot Fight Mode」 | ❌ 那是付费版 Super Bot Fight Mode，Free 套餐下读不到 |
| 「端点返回 401 说明需要鉴权」 | ❌ 先查 `cf-mitigated` 响应头，很可能是托管挑战 |

---

## 七、剩余动作（需浏览器，建议一次坐下来做完）

按性价比排序：

1. **Glama 认领** — 登录 glama.ai，从 claim 面板复制 token
   （若面板给的 token 与上面不同，替换 worker 里那行并重新部署）
2. **Smithery** — `smithery.ai/new` 粘端点 URL，WorkOS SSO 登录后其余自动
3. **LobeHub** — `npx -y @lobehub/market-cli login` + `github connect` + `plugin publish`
4. **LibHunt** — 提交 GitHub 仓库 URL（必须浏览器，curl 会 403）
5. **MCP.so** — `mcp.so/submit?type=server`，免费档走人工审核（链接可能 nofollow）
6. **MCPMarket / MCP Directory** — 已有公开仓库，通常自动收录，验一下即可

---

## 八、通用文案

**短描述（≤100 字符）：**
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

**连接配置：**
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

## 九、⚠️ 对外描述的红线

- **不要把「免费额度」说成已验证。** 那是正则自动抽取的，有已知误判
  （登录墙、免费版/付费版绑卡混淆）。对外文案要么别提，要么标注 auto-detected。
- 目录本身（名称 / URL / 部门 / 定价档 / 描述）是可靠的，可以放心宣传。
- 服务端 `instructions` 里已强制要求 AI 声明该字段未验证 —— 这是最后一道防线。

---

## 十、数据更新后重新发布

```bash
cd E:\xiangmu\ai-tools-mcp
node build-dataset.mjs          # 从 js/data.js 重新生成 dataset.json
# 改 server.json 里的 version（Registry 要求版本号递增）
wrangler deploy                 # 或走 §三 方式 B
mcp-publisher publish
```

服务端代码改了**不需要**重新发布 Registry —— Registry 只存元数据，指向固定 URL。

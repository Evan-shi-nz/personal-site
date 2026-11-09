# personal-site

个人网站：博客、短动态（同步自 X）、英文简历、可公开验证的 Stripe 收入。

- 纯静态站（Astro），部署在 **Cloudflare Pages**，不需要自己的服务器
- 唯一的动态接口 `/api/revenue` 是 Cloudflare Pages Function（`functions/api/revenue.js`）
- 写作后台在 `/admin`（Sveltia CMS），保存时直接提交到 GitHub，Cloudflare 自动重新构建
- 收入计算代码与开源验证工具 [stripe-revenue-verifier](https://github.com/yourhandle/stripe-revenue-verifier) 完全相同

## 页面

| 网址 | 内容 | 数据在哪里改 |
|---|---|---|
| `/` | 头像、简介、Now、最新文章和动态 | `src/site.config.ts` |
| `/blog/<英文短语>` | 文章，网址就是文件名，对 SEO 友好 | `src/content/blog/*.md` 或 `/admin` |
| `/notes` | 短动态，可自动同步 X | `src/content/notes/*.md` 或 `/admin` |
| `/resume` | 英文简历，可打印或另存为 PDF | `src/data/resume.json` 或 `/admin` |
| `/revenue` | 收入汇总 + 公开验证 Key + 验证命令 | Cloudflare 环境变量 |
| `/rss.xml`、`/sitemap-index.xml` | 自动生成 | |

## 第一次上线

### 1. 改成你自己的信息

全局搜索 `TODO`、`yourhandle`、`example.com` 并替换，主要在这几个文件：

- `src/site.config.ts`：名字、域名、社交链接、Now
- `src/data/resume.json`：简历
- `public/admin/config.yml`：GitHub 仓库名
- `public/robots.txt`：域名
- `src/content/blog/why-i-am-moving-to-new-zealand.md`：示例文章，用自己的话重写

头像在 `public/images/avatar.png`（512×512）和 `avatar-64.png`（网站图标）。

### 2. 推到 GitHub（公开仓库）

```bash
git remote add origin https://github.com/<你的用户名>/personal-site.git
git push -u origin main
```

### 3. 创建只读 Stripe Key

Stripe 后台 → Developers → API keys → **Create restricted key**：

- **Balance → Read**，其它全部保持 **None**
- 先用验证工具自查：`node verify.mjs rk_live_xxx`，第 1 步必须全部显示 `refused`
- 再查一遍每笔交易的 `description` 里有没有客户姓名或邮箱：

```bash
curl "https://api.stripe.com/v1/balance_transactions?limit=20" -u rk_live_xxx:
```

**不要把 Key 写进代码仓库**。GitHub 会扫描 Stripe Key 并通知 Stripe，Key 可能被自动作废。它只放在 Cloudflare 的环境变量里。

### 4. 部署到 Cloudflare Pages

Cloudflare 后台 → Workers & Pages → Create → Pages → **Connect to Git**，选这个仓库：

- Framework preset：**Astro**
- Build command：`npm run build`
- Build output directory：`dist`
- 环境变量（Settings → Variables and Secrets，Production 和 Preview 都加）：
  - `PUBLIC_STRIPE_VERIFY_KEY` = `rk_live_...`

`functions/` 目录会被自动识别为 Pages Functions。之后绑定你的域名（Custom domains）。

### 5. 打开写作后台

访问 `https://你的域名/admin` → **Sign in with Token**。GitHub → Settings → Developer settings → Fine-grained personal access tokens，只给这个仓库开 **Contents: Read and write** 权限。Token 只存在你自己的浏览器里。

## X（推特）同步

两种方式，可以同时用：

**A. 自动同步（需要 X API 付费额度）**：GitHub 仓库 → Settings → Secrets and variables → Actions

- Secret `X_BEARER_TOKEN`：X 开发者后台的 Bearer Token
- Variable `X_USERNAME`：你的 X 用户名（不带 @）

`.github/workflows/sync-x.yml` 每 12 小时运行一次，只同步原创帖子（不包括回复和转帖），新动态提交后 Cloudflare 自动重新部署。也可以在 Actions 页面手动运行。读取帖子是 X API 的付费功能，开启前请在 developer.x.com 确认当前价格。

**B. 免费导入历史帖子**：X → 设置 → 你的账号 → 下载数据存档，解压后：

```bash
node scripts/import-x-archive.mjs path/to/data/tweets.js 你的用户名
```

## 本地开发

```bash
npm install
npm run dev          # http://localhost:4321（/api/revenue 本地不可用）
```

要在本地连同收入接口一起测试：把 `.dev.vars.example` 复制为 `.dev.vars`，填入 Key，然后：

```bash
npm run build && npm run preview
```

## 收入数字怎么算

见 `functions/_lib/revenue.mjs`。只汇总 Stripe `reporting_category` 为 charge / refund / dispute / fee 的交易，转账和提现不算收入。接口只返回汇总数字，不返回交易 ID、描述或任何客户信息；如果配置的 Key 能读取订单（charges），接口会拒绝工作。结果在 Cloudflare 边缘缓存 6 小时。

Cloudflare 免费版每次请求最多 50 个子请求，接口最多读 45 页（4,500 笔交易）。超过时页面会提示"oldest transactions not included yet"，到时候可以升级到付费版，或者把历史汇总存进 Cloudflare KV。

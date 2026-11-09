# personal-site

My personal website: blog, short notes synced from X, resume, and publicly verifiable revenue.

- **Static site** built with [Astro](https://astro.build), hosted on **Cloudflare Workers** (static assets plus one small API route). No server of my own.
- **Revenue is verifiable.** `/revenue` publishes a Stripe key that can only read my balance. Anyone can check the numbers with the open-source [stripe-revenue-verifier](https://github.com/Evan-shi-nz/stripe-revenue-verifier), which uses the exact same calculation code as this site.
- **Editable in the browser** at `/admin` ([Sveltia CMS](https://github.com/sveltia/sveltia-cms)). Every save is a Git commit.

---

# 中文说明（给自己看的部署与维护手册）

## 目录

1. [项目结构](#项目结构)
2. [第一次上线（按顺序做一遍）](#第一次上线按顺序做一遍)
3. [日常写作](#日常写作)
4. [X（推特）同步](#x推特同步)
5. [本地开发与预览](#本地开发与预览)
6. [收入验证是怎么工作的](#收入验证是怎么工作的)
7. [常见问题](#常见问题)

## 项目结构

```
personal-site/
├── src/
│   ├── site.config.ts          ← 名字、域名、社交链接、首页 "Now"（最常改）
│   ├── data/resume.json        ← 简历内容
│   ├── content/blog/*.md       ← 博客文章，文件名 = 网址
│   ├── content/notes/*.md      ← 短动态（手写或从 X 同步）
│   ├── pages/                  ← 各页面模板
│   └── styles/global.css       ← 样式
├── wrangler.jsonc              ← Cloudflare Workers 配置
├── worker/index.js             ← Worker 入口：只处理 /api/*，其余是静态文件
├── functions/
│   ├── api/revenue.js          ← /api/revenue 的实现
│   └── _lib/revenue.mjs        ← 收入计算（与验证工具完全相同）
├── public/
│   ├── images/avatar.png       ← 头像（512×512）
│   ├── images/avatar-64.png    ← 浏览器标签图标
│   └── admin/                  ← 网页写作后台
├── scripts/                    ← X 同步、X 存档导入
└── .github/workflows/sync-x.yml ← 定时同步 X
```

| 网址 | 内容 |
|---|---|
| `/` | 头像、简介、Now、最新文章和动态 |
| `/blog`、`/blog/<文件名>` | 文章列表、文章页 |
| `/notes` | 短动态 |
| `/resume` | 英文简历，按钮可另存为 PDF |
| `/revenue` | 收入汇总、公开验证 Key、验证命令 |
| `/admin` | 写作后台（不会被搜索引擎收录） |
| `/rss.xml`、`/sitemap-index.xml` | 自动生成 |

## 第一次上线（按顺序做一遍）

### 第 1 步：填写个人信息

在仓库里全局搜索 `TODO` 和 `example.com`，逐个替换：

| 文件 | 要改的内容 |
|---|---|
| `src/site.config.ts` | `url`（你的域名）、`name`、`tagline`、`links.x`、`links.linkedin`、`now` |
| `src/data/resume.json` | 整份简历 |
| `public/robots.txt` | 最后一行的域名 |
| `src/content/blog/why-i-am-moving-to-new-zealand.md` | 示例文章，用自己的话重写或删除 |

社交链接留空 `""` 就不会显示。

### 第 2 步：创建只读的 Stripe Key

1. 打开 Stripe 后台 → **Developers → API keys → Create restricted key**。
2. 名字填 `public-revenue-verify`。
3. 只把 **Balance** 设为 **Read**，其它全部保持 **None**。
4. 用验证工具自查，第 1 步必须全部显示 `refused`：

   ```bash
   git clone https://github.com/Evan-shi-nz/stripe-revenue-verifier
   cd stripe-revenue-verifier
   node verify.mjs rk_live_你的Key
   ```

5. 看一眼别人用这个 Key 能看到什么，确认 `description` 里没有客户姓名或邮箱：

   ```bash
   curl "https://api.stripe.com/v1/balance_transactions?limit=20" -u rk_live_你的Key:
   ```

> ⚠️ **不要把 Key 写进代码或提交到 GitHub。** GitHub 会自动扫描 Stripe Key 并通知 Stripe，Key 可能被作废。Key 只放在 Cloudflare 的环境变量里（第 3 步）。
>
> ⚠️ 以前公开过的旧 Key（能读取 charges 的那个）请在 Stripe 后台删除。

### 第 3 步：部署到 Cloudflare（Workers）

Cloudflare 新版控制台默认创建的是 Workers，本项目已经配好了 `wrangler.jsonc`，直接用就行。

1. Cloudflare 控制台 → **Workers & Pages** → **创建应用程序** → **导入存储库**（Import a repository），授权 GitHub，选择 `Evan-shi-nz/personal-site`。
2. 在"创建和部署"页面填写：

   | 项目 | 值 |
   |---|---|
   | 项目名称 | `personal-site`（必须和 `wrangler.jsonc` 里的 `name` 一致） |
   | 构建命令 | `npm run build` |
   | 部署命令 | `npx wrangler deploy` |
   | 预览命令 | 保持默认 |

3. 点 **部署**，等 1–2 分钟。成功后会得到一个 `personal-site.<你的子域>.workers.dev` 地址。
4. 绑定域名：进入这个 Worker → **设置（Settings）→ 域和路由（Domains & Routes）→ 添加 → 自定义域（Custom domain）**，填 `personal-site.ssgooglx.workers.dev`。域名在同一个 Cloudflare 账号里时，DNS 记录和 HTTPS 证书会自动创建。
5. 添加 Stripe Key：Worker → **设置 → 变量和机密（Variables and Secrets）→ 添加**：

   | 类型 | 名称 | 值 |
   |---|---|---|
   | 文本（Text） | `PUBLIC_STRIPE_VERIFY_KEY` | `rk_live_...`（第 2 步的 Key） |

   保存后立即生效，不需要重新构建。`wrangler.jsonc` 里设置了 `keep_vars: true`，以后自动部署不会把它清掉。

之后每次推送到 `main` 分支，Cloudflare 都会自动重新构建和部署。

### 第 4 步：开启网页写作后台

1. GitHub → Settings → Developer settings → **Fine-grained personal access tokens** → Generate new token。
   - Repository access：只选 `personal-site`
   - Permissions：**Contents → Read and write**
2. 打开 `https://你的域名/admin` → **Sign in with Token**，粘贴 Token。

Token 只保存在你自己的浏览器里，不会经过任何服务器。

## 日常写作

**在网页上写（推荐）**：打开 `/admin` → Blog posts → New。保存后大约 1 分钟网站更新。

**在本地写**：在 `src/content/blog/` 新建文件，**文件名用英文短语加连字符**，它就是文章网址，对 SEO 很重要：

```markdown
---
title: My IELTS Writing Task 2 plan
description: 一句话摘要，会显示在 Google 搜索结果和社交卡片里
date: 2026-11-20
tags: [ielts]
draft: false
---

正文……
```

`ielts-writing-task-2-plan.md` → `https://你的域名/blog/ielts-writing-task-2-plan`

`draft: true` 的文章不会发布。

## X（推特）同步

两种方式可以同时用。

**A. 自动同步（需要 X API 付费权限）**

1. 在 [developer.x.com](https://developer.x.com) 获取 Bearer Token（读取帖子是付费功能，开启前请确认当前价格）。
2. GitHub 仓库 → Settings → Secrets and variables → Actions：
   - **Secrets** 添加 `X_BEARER_TOKEN`
   - **Variables** 添加 `X_USERNAME`（你的 X 用户名，不带 @）
3. 之后每 12 小时自动同步一次原创帖子（不包括回复和转帖）。也可以在 Actions 页面点 **Run workflow** 手动运行。

没有设置这两项时，这个任务会自动跳过，不会报错。

**B. 免费导入历史帖子**

X → 设置 → 你的账号 → **下载数据存档**，解压后运行：

```bash
node scripts/import-x-archive.mjs 存档路径/data/tweets.js 你的X用户名
git add src/content/notes && git commit -m "Import X archive" && git push
```

## 本地开发与预览

需要 Node.js 22 或更新版本。

```bash
npm install
npm run dev
```

打开 http://localhost:4321 。修改文件后页面会自动刷新。

`npm run dev` 不运行 Worker，所以收入页会显示 "Couldn't load"，这是正常的。要在本地模拟 Cloudflare 环境、连同收入接口一起测试：

```bash
cp .dev.vars.example .dev.vars   # 然后在 .dev.vars 里填入 Key
npm run build
npm run preview                  # http://localhost:8787
```

## 收入验证是怎么工作的

```
访客浏览器 ──> /revenue 页面 ──> /api/revenue（Cloudflare Worker）──> Stripe API
                                       │
                                       └─ 只返回汇总数字，缓存 6 小时

任何人 ──> stripe-revenue-verifier（同一份计算代码）──> Stripe API ──> 对比结果
```

- 只统计 Stripe `reporting_category` 为 `charge`、`refund`、`dispute`、`fee` 的交易。提现（payout）和转账不算收入。
- **毛收入（gross）** = 所有成功付款；**净收入（net）** = 毛收入 − 退款 − 争议 − Stripe 手续费。
- 接口不返回交易 ID、描述或任何客户信息。
- 如果配置的 Key 能读取订单（charges），或者是 `sk_` 开头的 Secret Key，接口会直接拒绝工作，防止误用。
- `functions/_lib/revenue.mjs` 必须和验证工具里的 `revenue.mjs` 保持一致。改动时两边一起改。

## 常见问题

**收入页提示 "oldest transactions not included yet"**
Cloudflare Workers 免费版每次请求最多 50 个子请求，接口最多读 4,500 笔交易。超过后需要升级 Workers 付费版，或者把历史汇总存进 Cloudflare KV。

**改了 `PUBLIC_STRIPE_VERIFY_KEY` 后数字没变**
收入数据在 Cloudflare 边缘缓存 6 小时，等缓存过期即可。页面上显示的 Key 是实时从接口读取的，改完马上生效。

**国内打不开网站**
Cloudflare 在国内访问不稳定，但目标读者在海外，不影响。

## License

Code: MIT. Content (posts, notes, resume, photos): © Evan-shi-nz, all rights reserved.

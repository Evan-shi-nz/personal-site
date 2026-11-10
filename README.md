# personal-site

Evan Shi's personal website: blog, notes synced from X, guestbook, resume, and publicly verifiable revenue.

- **Static site** built with [Astro](https://astro.build), hosted entirely on **Cloudflare**: Workers static assets, a small Worker API, D1 for the guestbook and a Cron Trigger that syncs posts from X. No server of my own.
- **Revenue is verifiable.** `/revenue` publishes a Stripe key that can only read my balance. Anyone can check the numbers with the open-source [stripe-revenue-verifier](https://github.com/Evan-shi-nz/stripe-revenue-verifier), which uses the exact same calculation code as this site.
- **Notes from X** get readable URLs made from their words (`/notes/ielts-day-1-writing-task-2`) and link back to the original post.
- **Editable in the browser** at `/admin` ([Sveltia CMS](https://github.com/sveltia/sveltia-cms)). Every save is a Git commit.

---

# 中文说明（给自己看的部署与维护手册）

## 目录

1. [项目结构](#项目结构)
2. [第一次上线（按顺序做一遍）](#第一次上线按顺序做一遍)
3. [日常写作](#日常写作)
4. [X（推特）同步](#x推特同步)
5. [留言板](#留言板)
6. [本地开发与预览](#本地开发与预览)
7. [收入验证是怎么工作的](#收入验证是怎么工作的)
8. [常见问题](#常见问题)

## 项目结构

```
personal-site/
├── src/
│   ├── site.config.ts          ← 名字、域名、社交链接、首页 "Now"（最常改）
│   ├── data/resume.json        ← 简历内容
│   ├── content/blog/*.md       ← 博客文章，文件名 = 网址
│   ├── content/notes/*.md      ← 短动态（手写或从 X 自动同步），网址由内容生成
│   ├── data/x-sync.json        ← X 同步进度（自动维护，不用手改）
│   ├── pages/                  ← 各页面模板
│   └── styles/global.css       ← 样式
├── wrangler.jsonc              ← Cloudflare Workers 配置
├── worker/
│   ├── index.js                ← Worker 入口：/api/* 和定时任务，其余是静态文件
│   ├── guestbook.js            ← 留言板接口（D1 数据库）
│   └── x-sync.js               ← 定时把 X 新帖子提交成笔记
├── lib/notes.mjs               ← 推文 → 笔记、按内容生成网址
├── functions/
│   ├── api/revenue.js          ← /api/revenue 的实现
│   └── _lib/revenue.mjs        ← 收入计算（与验证工具完全相同）
├── public/
│   ├── images/avatar.webp      ← 页面头像（192×192，约 4 KB）
│   ├── images/avatar-og.jpg    ← 分享卡片图（512×512）
│   ├── images/avatar-64.png    ← 浏览器标签图标
│   └── admin/                  ← 网页写作后台
├── scripts/import-x-archive.mjs ← 一次性导入 X 历史帖子
└── tests/                      ← npm test
```

| 网址 | 内容 |
|---|---|
| `/` | 头像、简介、Now、最新文章和动态 |
| `/blog`、`/blog/page/2`… | 文章列表，每页 10 篇 |
| `/blog/<文件名>` | 文章页 |
| `/notes`、`/notes/page/2`… | 短动态列表，每页 20 条 |
| `/notes/<由内容生成>` | 单条动态，带 "View on X" 回链 |
| `/guestbook` | 留言板 |
| `/resume` | 英文简历，按钮可另存为 PDF |
| `/revenue` | 收入仪表盘（近 30 天、环比、累计、按天/按月图表）、公开验证 Key、验证命令 |
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

这个 Key 会**公开显示在网站上**，所以它只能有一项权限：读取余额。

1. 登录 Stripe 后台，确认右上角是 **正式模式**（不是 Test mode / 沙盒）。
2. 进入 **开发者（Developers）→ API 密钥（API keys）**。
3. 在 **受限密钥（Restricted keys）** 区域点 **创建受限密钥（Create restricted key）**。如果弹出"你打算如何使用这个密钥"，选 **为自己的集成（Building your own integration）**。
4. 名字填 `public-revenue-verify`。
5. 权限列表里**只把 Balance（余额）设为 Read（读取）**，其余全部保持 **None（无）**。
6. 点 **创建密钥**，复制以 `rk_live_` 开头的那串字符。
7. 用验证工具自查。第 1 步的 5 行必须全部是 `✓ refused`，否则说明权限给多了，删掉重建：

   ```bash
   git clone https://github.com/Evan-shi-nz/stripe-revenue-verifier
   cd stripe-revenue-verifier
   node verify.mjs rk_live_你的Key
   ```

8. 再看一眼别人用这个 Key 能看到什么，确认 `description` 里没有客户姓名或邮箱：

   ```bash
   curl "https://api.stripe.com/v1/balance_transactions?limit=20" -u rk_live_你的Key:
   ```

即使跳过第 7 步，网站也会自己检查：如果配置的 Key 能读取订单（charges），收入接口会拒绝工作，不会把它展示出来。

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
4. 绑定域名：进入这个 Worker → **设置（Settings）→ 域和路由（Domains & Routes）→ 添加 → 自定义域（Custom domain）**，填你的域名（例如 `www.yourname.com`）。域名在同一个 Cloudflare 账号里时，DNS 记录和 HTTPS 证书会自动创建。然后把 `src/site.config.ts` 的 `url` 和 `public/robots.txt` 里的地址改成这个域名。
5. 添加 Stripe Key：Worker → **设置 → 变量和机密（Variables and Secrets）→ 添加**：

   | 类型 | 名称 | 值 |
   |---|---|---|
   | 文本（Text） | `PUBLIC_STRIPE_VERIFY_KEY` | `rk_live_...`（第 2 步的 Key） |

   保存后立即生效，不需要重新构建。`wrangler.jsonc` 里设置了 `keep_vars: true`，以后自动部署不会把它清掉。

6. 留言板数据库：**不用手动创建**。第一次部署时 Wrangler 会自动在你的账号里创建名为 `personal-site-guestbook` 的 D1 数据库，表结构在第一次有人访问留言板时自动建立。

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

每条帖子会变成网站上的一条笔记：

- 网址由帖子内容生成，比如 "Day 1 of IELTS prep: Writing Task 2 is hard" → `/notes/day-1-ielts-prep-writing-task-2-hard`，中文帖子 → `/notes/今天开始备考雅思-写作好难`。重名时自动加日期。
- 每条笔记页都有 **View on X ↗** 链接，指回原帖。
- 只同步原创帖子，不包括回复和转帖。

**A. 自动同步（Cloudflare 定时任务）**

`wrangler.jsonc` 里配置了每 3 小时运行一次的 Cron Trigger。它从 X 读取新帖子，以一次提交的形式写进 GitHub 仓库，Cloudflare 随即自动重新部署。需要在 Worker → **设置 → 变量和机密** 里添加两个**机密（Secret）**：

| 名称 | 从哪里获取 |
|---|---|
| `X_BEARER_TOKEN` | [developer.x.com](https://developer.x.com) 创建应用后的 Bearer Token。读取帖子是 X API 的付费功能，开启前请确认当前价格 |
| `GITHUB_TOKEN` | GitHub → Settings → Developer settings → Fine-grained tokens：Repository access 只选 `personal-site`，Permissions → **Contents: Read and write** |

没设置这两项时，定时任务会直接跳过，不会报错。X 用户名、仓库名在 `wrangler.jsonc` 的 `vars` 里，已经填好。

想马上运行一次：Worker → **设置 → 触发事件（Triggers）→ Cron 触发器**，点运行（Trigger）。

**B. 免费导入历史帖子**

X → 设置 → 你的账号 → **下载数据存档**，解压后在自己电脑上运行：

```bash
node scripts/import-x-archive.mjs 存档路径/data/tweets.js EvanShi_nz
```

```bash
git add src/content/notes && git commit -m "Import X archive" && git push
```

已经导入过的帖子会自动跳过，可以重复运行。

## 留言板

- 访客填写名字、邮箱（必填，**不会公开**）和留言，不需要验证码。
- 防垃圾留言：隐藏的诱饵字段、打开页面 3 秒内提交视为机器人、同一访客 1 分钟内只能发 1 条、每天最多 10 条、最多 2 个链接、24 小时内重复内容会被拒绝。
- 数据存在 Cloudflare D1。查看、隐藏或删除留言：Cloudflare 控制台 → **存储和数据库 → D1 → personal-site-guestbook → 控制台（Console）**：

  ```sql
  -- 查看最新留言（含邮箱）
  SELECT id, name, email, message, created_at FROM guestbook ORDER BY id DESC LIMIT 50;
  -- 隐藏一条（不删除）
  UPDATE guestbook SET hidden = 1 WHERE id = 123;
  -- 彻底删除
  DELETE FROM guestbook WHERE id = 123;
  ```

## 本地开发与预览

需要 Node.js 22 或更新版本。

```bash
npm install
npm run dev
```

打开 http://localhost:4321 。修改文件后页面会自动刷新。

`npm run dev` 不运行 Worker，所以收入页和留言板会显示加载失败，这是正常的。要在本地模拟 Cloudflare 环境（包括本地的 D1 数据库）：

```bash
cp .dev.vars.example .dev.vars   # 然后在 .dev.vars 里填入 Key
npm run build
npm run preview                  # http://localhost:8787
```

运行测试（X 同步逻辑，不联网）：

```bash
npm test
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

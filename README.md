# SMAIClub 多站点 CI/CD 说明

本仓库包含多个 `*.smaiclub.top` 前端站点和 Cloudflare Workers 项目。

当前 CI/CD 采用 GitHub Actions + Cloudflare Wrangler 统一管理，不依赖 Cloudflare 的 Git 自动部署。所有自动化工作流位于 [`.github/workflows`](/home/fish_/smaiclub_project/Repositories/www.smaiclub.top/.github/workflows)。

## 总体规则

- 只监听 `push` 事件，不监听 `pull_request`
- 只在对应项目目录发生变更时触发
- 非 `main` 分支：
  - Pages 项目执行 CI，并发布 Preview
  - Worker 项目执行 CI，不部署
- `main` 分支：
  - 先执行 CI
  - CI 全部通过后才执行正式部署
  - Pages 不发布 Preview，只发布生产版本

## 项目分类

### 1. Pages 前端项目：CI + Preview + 生产部署

- `convert.smaiclub.top`
- `hall.smaiclub.top`
- `novel.smaiclub.top`
- `player.smaiclub.top`
- `sub.smaiclub.top`

行为：

- 非 `main` 分支 `push`：安装依赖，执行项目 CI，部署 Cloudflare Pages Preview
- `main` 分支 `push`：安装依赖，执行项目 CI，成功后部署 Cloudflare Pages 正式环境

复用模板：

- [`.github/workflows/_pages-app.yml`](/home/fish_/smaiclub_project/Repositories/www.smaiclub.top/.github/workflows/_pages-app.yml)

### 2. 纯静态 Pages 项目：基础 CI + Preview + 生产部署

- `2026.smaiclub.top`
- `blog.smaiclub.top`
- `dash.smaiclub.top`
- `download.smaiclub.top`
- `kill.smaiclub.top`
- `news.smaiclub.top`
- `wanted.smaiclub.top`
- `www.smaiclub.top`

行为：

- 非 `main` 分支 `push`：执行静态站 CI，部署 Cloudflare Pages Preview
- `main` 分支 `push`：执行静态站 CI，成功后部署 Cloudflare Pages 正式环境

当前默认静态 CI 为：

```sh
test -s index.html
```

含义是检查站点根目录存在且包含非空的 `index.html`。如果某个静态站未来需要更复杂的构建或校验，可以在对应 workflow 中覆盖 `ci_command`。

复用模板：

- [`.github/workflows/_static-pages.yml`](/home/fish_/smaiclub_project/Repositories/www.smaiclub.top/.github/workflows/_static-pages.yml)

### 3. Worker 项目：CI + main 正式部署

- `chat-worker`
- `hall-worker`
- `login-worker`
- `sub-cron-worker`

行为：

- 非 `main` 分支 `push`：执行 CI，不部署
- `main` 分支 `push`：执行 CI，成功后部署到 Cloudflare Workers

各 Worker 的 CI 现状：

- `chat-worker`：`npm install` + `npm run build`
- `hall-worker`：`npm ci` + `npm test`
- `login-worker`：`wrangler deploy --dry-run --name login-smaiclub-kv`
- `sub-cron-worker`：`npm ci` + `npm test && npm run build`

复用模板：

- [`.github/workflows/_worker.yml`](/home/fish_/smaiclub_project/Repositories/www.smaiclub.top/.github/workflows/_worker.yml)

### 4. 不参与自动部署的目录

- `login.smaiclub.top`
- `proxy.smaiclub.top`

这两个目录当前没有 workflow，不会触发自动 CI/CD。

## 主要 workflow 文件

### Pages 应用

- [`.github/workflows/convert.yml`](/home/fish_/smaiclub_project/Repositories/www.smaiclub.top/.github/workflows/convert.yml)
- [`.github/workflows/hall.yml`](/home/fish_/smaiclub_project/Repositories/www.smaiclub.top/.github/workflows/hall.yml)
- [`.github/workflows/sub.yml`](/home/fish_/smaiclub_project/Repositories/www.smaiclub.top/.github/workflows/sub.yml)
- [`.github/workflows/novel.yml`](/home/fish_/smaiclub_project/Repositories/www.smaiclub.top/.github/workflows/novel.yml)
- [`.github/workflows/player.yml`](/home/fish_/smaiclub_project/Repositories/www.smaiclub.top/.github/workflows/player.yml)

### 静态 Pages

- [`.github/workflows/2026.yml`](/home/fish_/smaiclub_project/Repositories/www.smaiclub.top/.github/workflows/2026.yml)
- [`.github/workflows/blog.yml`](/home/fish_/smaiclub_project/Repositories/www.smaiclub.top/.github/workflows/blog.yml)
- [`.github/workflows/dash.yml`](/home/fish_/smaiclub_project/Repositories/www.smaiclub.top/.github/workflows/dash.yml)
- [`.github/workflows/download.yml`](/home/fish_/smaiclub_project/Repositories/www.smaiclub.top/.github/workflows/download.yml)
- [`.github/workflows/kill.yml`](/home/fish_/smaiclub_project/Repositories/www.smaiclub.top/.github/workflows/kill.yml)
- [`.github/workflows/news.yml`](/home/fish_/smaiclub_project/Repositories/www.smaiclub.top/.github/workflows/news.yml)
- [`.github/workflows/wanted.yml`](/home/fish_/smaiclub_project/Repositories/www.smaiclub.top/.github/workflows/wanted.yml)
- [`.github/workflows/www.yml`](/home/fish_/smaiclub_project/Repositories/www.smaiclub.top/.github/workflows/www.yml)

### Workers

- [`.github/workflows/chat-worker.yml`](/home/fish_/smaiclub_project/Repositories/www.smaiclub.top/.github/workflows/chat-worker.yml)
- [`.github/workflows/hall-worker.yml`](/home/fish_/smaiclub_project/Repositories/www.smaiclub.top/.github/workflows/hall-worker.yml)
- [`.github/workflows/sub-cron-worker.yml`](/home/fish_/smaiclub_project/Repositories/www.smaiclub.top/.github/workflows/sub-cron-worker.yml)
- [`.github/workflows/login-worker.yml`](/home/fish_/smaiclub_project/Repositories/www.smaiclub.top/.github/workflows/login-worker.yml)

## 仓库需要的配置

在 GitHub 仓库中配置以下 Secrets：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

同时需要在 Cloudflare 中预先创建对应的 Pages 项目和 Worker，并建议关闭 Cloudflare 自带的 Git 自动部署，避免和 GitHub Actions 重复发布。

## 维护建议

- 新增 Pages 应用时，优先复用 `_pages-app.yml`
- 新增纯静态站点时，优先复用 `_static-pages.yml`
- 新增 Worker 时，优先复用 `_worker.yml`
- 如果修改复用模板，记得手动通过 `workflow_dispatch` 或真实目录提交验证受影响项目
- 如果要强制 main 只能在 CI 通过后合并，还需要在 GitHub 仓库设置 branch protection

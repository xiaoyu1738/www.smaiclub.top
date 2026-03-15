# AGENTS.md

本文件面向在本仓库中协作的代理或自动化工具，说明当前 CI/CD 约定和修改注意事项。

## 目标

- 保持多站点仓库的 CI/CD 规则一致
- 避免 Cloudflare 自动部署与 GitHub Actions 重复发布
- 避免无关目录改动触发无关项目的工作流

## 当前自动化约定

### 事件规则

- 所有项目只监听 `push`
- 不使用 `pull_request` 触发 CI/CD
- 需要查看 PR 状态时，依赖分支 `push` 产生的 commit checks

### 触发范围

- 每个项目 workflow 只监听对应项目目录
- 不要把共享模板文件加入具体项目 workflow 的 `paths`
- 共享模板变更后，如需验证，请用 `workflow_dispatch` 或在对应项目目录制造一次提交

### 分支行为

- 非 `main` 分支：
  - Pages：CI + Preview
  - Workers：CI only
- `main` 分支：
  - Pages：CI 通过后正式部署
  - Workers：CI 通过后正式部署

### 禁止事项

- 不要重新引入 `pull_request` 触发，除非明确接受重复运行
- 不要让 Worker 在非 `main` 分支自动部署
- 不要让 `main` 在 CI 失败时继续部署
- 不要把 `login.smaiclub.top` 和 `proxy.smaiclub.top` 纳入自动部署，除非需求变更

## 模板说明

### Pages 应用模板

文件：

- [`.github/workflows/_pages-app.yml`](/home/fish_/smaiclub_project/Repositories/www.smaiclub.top/.github/workflows/_pages-app.yml)

用途：

- 适用于需要 `npm ci` 和构建的 Pages 前端项目

### 静态 Pages 模板

文件：

- [`.github/workflows/_static-pages.yml`](/home/fish_/smaiclub_project/Repositories/www.smaiclub.top/.github/workflows/_static-pages.yml)

用途：

- 适用于纯静态站点
- 默认 CI 为 `test -s index.html`

如果站点需要额外检查，可在具体 workflow 中覆盖 `ci_command`

### Worker 模板

文件：

- [`.github/workflows/_worker.yml`](/home/fish_/smaiclub_project/Repositories/www.smaiclub.top/.github/workflows/_worker.yml)

用途：

- 适用于 Cloudflare Worker
- `validate_command` 用于非部署型 CI 校验
- `deploy_command` 仅在 `main` 上执行

## 已知项目分类

### Pages 应用

- `convert.smaiclub.top`
- `hall.smaiclub.top`
- `novel.smaiclub.top`
- `player.smaiclub.top`

### 纯静态 Pages

- `2026.smaiclub.top`
- `blog.smaiclub.top`
- `dash.smaiclub.top`
- `download.smaiclub.top`
- `kill.smaiclub.top`
- `news.smaiclub.top`
- `wanted.smaiclub.top`
- `www.smaiclub.top`

### Workers

- `chat-worker`
- `hall-worker`
- `login-worker`

### 不自动部署

- `login.smaiclub.top`
- `proxy.smaiclub.top`

## 修改工作流时的检查清单

- 变更是否仍然只由对应目录触发
- 非 `main` 是否只做允许的 CI/Preview 行为
- `main` 是否仍然保证 CI 先于部署
- Cloudflare 项目名是否与实际一致
- 是否会引入重复运行或双重部署
- 是否需要同步更新 [README.md](/home/fish_/smaiclub_project/Repositories/www.smaiclub.top/README.md)

## 重要配置

GitHub Secrets：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

`login-worker` 当前使用的 Worker 名称：

- `login-smaiclub-kv`


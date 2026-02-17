# Semi-Structured Interview v2.0

一个面向“需求获取/需求澄清”的半结构化访谈系统：支持项目创建、访谈框架生成、按主题推进对话、槽位抽取与结构维护、领域经验（知识库）检索融合、访谈总结报告导出。

## 目录

- [功能概览](#功能概览)
- [技术栈与端口](#技术栈与端口)
- [目录结构](#目录结构)
- [快速开始（本地开发）](#快速开始本地开发)
  - [启动后端](#启动后端)
  - [启动前端](#启动前端)
- [使用流程](#使用流程)
- [配置说明](#配置说明)
  - [LLM 与 Embedding 配置](#llm-与-embedding-配置)
  - [算法/策略阈值（可选环境变量）](#算法策略阈值可选环境变量)
- [接口速览（部分）](#接口速览部分)
- [数据与持久化](#数据与持久化)
- [常见问题](#常见问题)

## 功能概览

- 访谈框架生成：基于“项目初始需求”生成 section/topic/slot 框架。
- 访谈对话流：按当前主题推进，自动判断是否切换/新建/结束主题，并生成下一轮采访者话术。
- 槽位填充：对话过程中对受影响主题进行槽位填充，并记录证据消息。
- 结构管理：在前端可对 section/topic/slot 进行增删改。
- 领域经验（知识库）管理：新增、编辑、删除领域经验；支持向量嵌入计算。
- 领域经验检索与融合：基于 embedding 检索相似经验，融合为“领域补充内容”，辅助框架生成。
- 报告导出：导出访谈报告（Markdown）、对话记录（JSON）、槽位结构（JSON）。

## 技术栈与端口

- 后端：FastAPI（`backend/main.py`）+ SQLAlchemy + SQLite
- 前端：React + TypeScript + Vite（`frontend/`）

默认端口：

- 前端：`http://localhost:5500`（Vite dev server，`frontend/vite.config.ts`）
- 后端：`http://localhost:8800`（建议启动端口，前端代理目标）

前端会将所有以 `/api` 开头的请求代理到 `http://localhost:8800`（见 `frontend/vite.config.ts`）。后端 CORS 也默认允许 `http://localhost:5500`（见 `backend/main.py:13-19`）。

## 目录结构

```text
.
├─ backend/                 # FastAPI 服务与核心逻辑
│  ├─ core/                 # 框架生成/槽位填充/策略选择/报告生成等
│  ├─ prompts/              # 提示词模板
│  ├─ routes/               # API 路由
│  ├─ config.py             # 阈值与策略配置（支持环境变量覆盖）
│  ├─ llm_handler.py        # 统一 LLM/Embedding 调用封装
│  └─ main.py               # FastAPI app 入口
├─ database/                # SQLite 数据库与 ORM 模型
│  ├─ database.py           # 引擎/Session/初始化
│  ├─ models.py             # ORM 表结构
│  └─ database.db           # 默认数据库文件（本地）
└─ frontend/                # React 前端
   ├─ src/
   ├─ dist/                 # build 输出（若已构建）
   └─ vite.config.ts
```

## 快速开始（本地开发）

### 启动后端

1) 创建并激活虚拟环境（任选一种方式）

```bash
python -m venv .venv
```

2) 安装依赖

```bash
pip install -r requirements.txt
```

3) 启动服务（建议端口 `8800`）

```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8800
```

启动后会在应用启动事件中自动初始化数据库表（见 `backend/main.py:21-23` 与 `database/database.py:init_db`）。

### 启动前端

1) 安装依赖

```bash
cd frontend
npm install
```

2) 启动开发服务

```bash
npm run client:dev
```

然后访问：`http://localhost:5500`

说明：`frontend/package.json` 的 `npm run dev` 会同时启动 `client:dev` 与 `server:dev`，但当前仓库没有 `frontend/api/server.ts`，因此推荐使用 `npm run client:dev` 仅启动前端。

## 使用流程

- 登录/注册：`/api/register`、`/api/login`（前端页面 `frontend/src/pages/Login.tsx`、`Register.tsx`）。
- 配置模型：在“系统设置”页填写 `API URL / API Key / Model Name`，并设置 Embedding 配置（前端存储在 `localStorage`）。
- 创建项目：输入项目名称与初始需求；可先做“领域经验检索与融合”，再“一键创建并初始化”。
- 开始访谈：进入访谈页面后点击开始，系统会生成第一条采访者提问；你回复后系统会自动生成下一条提问，并持续填充槽位与必要时切换主题。
- 生成报告：当访谈结束或手动触发生成，系统会生成/更新报告；可下载报告/聊天记录/槽位 JSON。

## 配置说明

### LLM 与 Embedding 配置

后端的绝大多数能力通过请求体显式传入模型配置（而不是从环境变量读密钥）。常见字段：

- `api_url`：兼容 OpenAI 风格的 Chat API 基地址（例如 `https://api.openai.com/v1`）
- `api_key`：模型服务密钥
- `model_name`：模型名称（例如 `gpt-4o-mini` 或你服务端定义的模型名）

Embedding 计算同样使用 `api_url/api_key/model_name`（见 `backend/routes/domain_experiences.py:129-165`）。

### 算法/策略阈值（可选环境变量）

后端 `backend/config.py` 支持用环境变量覆盖部分策略阈值（括号内为默认值）：

- `LENGTH_COEFFICIENT`（500）
- `ENTROPY_LENGTH_WEIGHT`（0.3）
- `ENTROPY_SEMANTIC_WEIGHT`（0.7）
- `ENTROPY_THRESHOLD`（0.6）
- `KC_TOPIC_WEIGHT`（0.5）
- `KC_SLOT_WEIGHT`（0.5）
- `KC_THRESHOLD`（0.2）
- `RETRIEVAL_COSINE_THRESHOLD`（0.7）
- `RETRIEVAL_TOP_K`（5）
- `OPERATION_SELECTION_THETA`（0.6）
- `STRATEGY_COMPLETION_LOW`（0.5）

## 接口速览（部分）

说明：以下为常用接口，完整以 `backend/routes/` 为准。

### 认证

- `POST /api/register`：注册（见 `backend/routes/auth.py:34-54`）
- `POST /api/login`：登录（见 `backend/routes/auth.py:20-33`）

### 项目与导出

- `GET /api/projects`：项目列表（见 `backend/routes/projects.py:53-72`）
- `POST /api/projects`：创建项目（仅创建不初始化框架，见 `backend/routes/projects.py:74-106`）
- `POST /api/projects/create-and-initialize`：创建并立即初始化框架（见 `backend/routes/projects.py:108-150`）
- `GET /api/projects/{project_id}/report/download`：下载报告 Markdown（见 `backend/routes/projects.py:218-228`）
- `GET /api/projects/{project_id}/chat/download`：下载聊天 JSON（见 `backend/routes/projects.py:230-256`）
- `GET /api/projects/{project_id}/slots/download`：下载槽位结构 JSON（见 `backend/routes/projects.py:258-292`）

### 访谈对话

- `POST /api/projects/{project_id}/initialize`：生成访谈框架（见 `backend/routes/interview_flow.py:40-52`）
- `POST /api/projects/{project_id}/interview/start`：开始访谈，返回第一条采访者消息（见 `backend/routes/interview_flow.py:54-153`）
- `POST /api/projects/{project_id}/interview/reply`：提交受访者回复，返回下一条采访者消息（见 `backend/routes/interview_flow.py:155-319`）
- `GET /api/projects/{project_id}/chat`：获取项目全量对话与当前主题（见 `backend/routes/interview_flow.py:321-365`）

### 领域经验（知识库）

- `GET /api/domain-experiences`：列表（支持 `user_id` 过滤，见 `backend/routes/domain_experiences.py:51-72`）
- `POST /api/domain-experiences`：创建（见 `backend/routes/domain_experiences.py:74-97`）
- `PATCH /api/domain-experiences/{domain_id}`：更新（见 `backend/routes/domain_experiences.py:98-118`）
- `DELETE /api/domain-experiences/{domain_id}`：删除（见 `backend/routes/domain_experiences.py:120-127`）
- `POST /api/domain-experiences/{domain_id}/embedding/recompute`：重算单条 embedding（见 `backend/routes/domain_experiences.py:129-145`）
- `POST /api/domain-experiences/ingest-create`：上传文件并自动生成领域经验 + embedding（见 `backend/routes/domain_experiences.py:167-293`）

## 数据与持久化

- 默认使用 SQLite 文件数据库：`database/database.db`（见 `database/database.py:8-12`）。
- 后端启动时会创建表并进行轻量级“增列迁移”（见 `database/database.py:17-43`）。

## 常见问题

### 1) 前端可以打开，但接口请求失败（CORS/代理）

- 确认后端在 `8800` 端口启动：`uvicorn backend.main:app --port 8800`。
- 确认前端是 `5500` 端口（`frontend/vite.config.ts`），且后端 CORS 允许 `http://localhost:5500`（`backend/main.py:13-19`）。

### 2) 上传文件提示 `multipart` 相关报错

- 安装 `python-multipart`：`pip install python-multipart`。

### 3) 上传 PDF 没有解析到文本

- 安装 `PyPDF2`：`pip install PyPDF2`。

### 4) 生成报告失败或卡住

- 报告生成逻辑会调用一个外部服务 `http://101.35.52.200:8033/generate-prd`（见 `backend/core/info_summarizer.py:92-111`）。
- 如果你本地/内网无法访问该地址，需要将该 URL 替换为你可用的报告生成服务，或改为本地生成逻辑。

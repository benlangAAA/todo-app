# Today Todo App

支持多用户数据隔离的待办事项与每日计划应用。

## 功能

- 待办事项增删改查、完成状态、筛选与搜索
- 今日推荐计划与拖拽排序
- 自然语言事项提取
- 邮箱和密码注册、登录
- Netlify Blob 云端存储，每个账户的数据独立保存
- 同一账户登录手机或电脑后自动获取自己的待办

## 给别人使用

打开共享网址，点击“注册”，填写邮箱和至少 6 位密码。注册后即可使用。以后在其他设备打开同一个网址，使用相同邮箱和密码登录即可同步数据。

## 项目结构

```text
.
├── index.html                 # 前端页面
├── netlify.toml               # Netlify 构建与 /api 路由配置
├── package.json               # Netlify Blob 依赖
└── netlify/functions/
    └── api.mjs                # 注册、登录与待办 API
```

## 部署配置

1. 将项目导入 Netlify，发布目录保持为项目根目录。
2. 在 Netlify 项目环境变量中创建 `JWT_SECRET`，填写一段足够长的随机字符串。
3. 触发一次新部署。

Netlify 会自动安装依赖、识别 `netlify/functions` 目录，并按照 `netlify.toml` 将 `/api/*` 转发到后端 Function。

## API

- `POST /api/register`
- `POST /api/login`
- `GET /api/todos`
- `POST /api/todos`
- `PUT /api/todos/:id`
- `DELETE /api/todos/:id`

密码会在浏览器中先做 SHA256 哈希，再发送到服务端。服务端保存的是哈希值，不保存明文密码。

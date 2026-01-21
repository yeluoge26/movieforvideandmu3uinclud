# 本地运行指南

## 前置要求

1. **Node.js** >= 20.19.0 ✅ (当前版本: v24.12.0)
2. **pnpm** >= 8.9.2 ✅ (已安装)
3. **MySQL** 8.x (需要运行中)
4. **Redis** (需要运行中)

## 步骤 1: 创建环境配置文件

在 `chunyu-cms-web` 目录下创建 `.env` 文件，内容如下：

```env
# 数据库配置
DATABASE_USERNAME=root
DATABASE_PASSWORD=你的MySQL密码
DATABASE_HOST=127.0.0.1
DATABASE_PORT=3306
DATABASE_DB=chunyu-cms-v2

# JWT配置
JWT_SECRET=chunyu-cms-v2

# Redis配置
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_USERNAME=
REDIS_PASSWORD=
REDIS_DB=0
REDIS_TTL=86400

# 应用配置
IS_DEMO_ENVIRONMENT=false
SERVER_HOST=http://localhost:3000
IMG_HOST=http://localhost:3000

# 邮箱配置 (可选)
FORM_USER_EMAIL=
FORM_USER_EMAIL_PASSWORD=
USER_EMAIL_SERVICE=QQ

# 微信支付配置 (可选)
WECHAT_PAY_APP_ID=
WECHAT_PAY_MCH_ID=
WECHAT_PAY_PUBLIC_KEY=
WECHAT_PAY_PRIVATE_KEY=
WECHAT_PAY_API_KEY=

# 百度统计ID (可选)
BAIDU_STATISTICS_ID=

# 反调试保护
ANTI_DEBUG_ENABLED=false
```

**重要**: 请根据你的实际MySQL和Redis配置修改 `.env` 文件中的相关参数。

## 步骤 2: 初始化数据库

1. 创建数据库：
   ```sql
   CREATE DATABASE `chunyu-cms-v2` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

2. 导入数据库文件：
   ```bash
   mysql -u root -p chunyu-cms-v2 < chunyu-cms-v2.sql
   ```

## 步骤 3: 安装依赖

```bash
cd chunyu-cms-v2/chunyu-cms-web
pnpm install
```

## 步骤 4: 启动开发服务器

```bash
pnpm dev
```

启动成功后，访问：http://localhost:3000

## 步骤 5: (可选) 清理数据库

如果需要清理数据库但保留基础类别，可以调用API：

```bash
# 使用curl
curl -X POST http://localhost:3000/api/admin/database/clean

# 或使用PowerShell
Invoke-WebRequest -Uri http://localhost:3000/api/admin/database/clean -Method POST
```

**注意**: 此操作会删除所有业务数据，只保留 `columns` 和 `genre` 表的数据。

## 常见问题

### 1. MySQL连接失败
- 检查MySQL服务是否运行
- 检查 `.env` 文件中的数据库配置是否正确
- 确认数据库 `chunyu-cms-v2` 已创建

### 2. Redis连接失败
- 检查Redis服务是否运行
- 检查 `.env` 文件中的Redis配置是否正确

### 3. 端口被占用
- 修改 `nuxt.config.ts` 中的端口配置
- 或使用 `pnpm dev --port 3001` 指定其他端口

## 管理端启动 (可选)

如果需要启动管理端：

```bash
cd chunyu-cms-v2/chunyu-cms-admin
pnpm install
pnpm dev
```

访问：http://localhost:4000
用户名：admin
密码：admin123

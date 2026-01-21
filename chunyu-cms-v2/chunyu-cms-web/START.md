# 快速启动指南

## ✅ 已完成
- [x] Node.js 已安装 (v24.12.0)
- [x] pnpm 已安装
- [x] 项目依赖已安装

## ⚠️ 需要完成

### 1. 创建 `.env` 文件

在 `chunyu-cms-web` 目录下创建 `.env` 文件（如果还没有），内容如下：

```env
DATABASE_USERNAME=root
DATABASE_PASSWORD=你的MySQL密码
DATABASE_HOST=127.0.0.1
DATABASE_PORT=3306
DATABASE_DB=chunyu-cms-v2

JWT_SECRET=chunyu-cms-v2

REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_USERNAME=
REDIS_PASSWORD=
REDIS_DB=0
REDIS_TTL=86400

IS_DEMO_ENVIRONMENT=false
SERVER_HOST=http://localhost:3000
IMG_HOST=http://localhost:3000

ANTI_DEBUG_ENABLED=false
```

### 2. 启动 MySQL 服务

**Windows:**
```powershell
# 如果MySQL作为Windows服务安装
net start MySQL80
# 或
net start MySQL

# 如果使用XAMPP/WAMP等
# 通过控制面板启动MySQL服务
```

**检查MySQL是否运行:**
```powershell
Test-NetConnection -ComputerName 127.0.0.1 -Port 3306
```

### 3. 启动 Redis 服务

**Windows (如果已安装Redis):**
```powershell
# 如果Redis作为Windows服务安装
net start Redis

# 或直接运行redis-server
redis-server
```

**如果没有安装Redis，可以:**
- 下载Windows版本: https://github.com/microsoftarchive/redis/releases
- 或使用Docker: `docker run -d -p 6379:6379 redis`

**检查Redis是否运行:**
```powershell
Test-NetConnection -ComputerName 127.0.0.1 -Port 6379
```

### 4. 初始化数据库

```sql
-- 1. 创建数据库
CREATE DATABASE `chunyu-cms-v2` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. 导入数据（在命令行执行）
mysql -u root -p chunyu-cms-v2 < chunyu-cms-v2.sql
```

### 5. 启动开发服务器

```powershell
cd chunyu-cms-v2\chunyu-cms-web
pnpm dev
```

启动成功后访问: http://localhost:3000

## 常见问题

### MySQL连接失败
- 确认MySQL服务已启动
- 检查 `.env` 中的 `DATABASE_PASSWORD` 是否正确
- 确认数据库 `chunyu-cms-v2` 已创建

### Redis连接失败
- 确认Redis服务已启动
- 如果Redis有密码，在 `.env` 中设置 `REDIS_PASSWORD`

### 端口被占用
- 修改 `nuxt.config.ts` 中的端口
- 或使用 `pnpm dev --port 3001`

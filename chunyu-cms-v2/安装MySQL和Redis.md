# MySQL 和 Redis 安装指南 (Windows)

## 方式一：使用安装包安装（推荐）

### 1. 安装 MySQL 8.0

#### 步骤 1: 下载 MySQL
1. 访问 MySQL 官网: https://dev.mysql.com/downloads/mysql/
2. 选择 **MySQL Community Server** → **Windows** → **MySQL Installer for Windows**
3. 下载 `mysql-installer-community-8.x.x.x.msi` (约400MB)

#### 步骤 2: 安装 MySQL
1. 运行安装程序
2. 选择 **Developer Default** 或 **Server only**
3. 点击 **Execute** 安装所需组件
4. 配置步骤：
   - **Type and Networking**: 保持默认端口 3306
   - **Authentication Method**: 选择 **Use Strong Password Encryption**
   - **Accounts and Roles**: 
     - Root Password: 设置一个强密码（**请记住这个密码，稍后需要用到**）
     - 可以添加一个普通用户（可选）
   - **Windows Service**: 
     - ✅ Windows Service Name: MySQL80
     - ✅ Start the MySQL Server at System Startup
   - 点击 **Execute** 完成配置

#### 步骤 3: 验证安装
打开 PowerShell 或 CMD，执行：
```powershell
mysql --version
```

如果显示版本号，说明安装成功。

#### 步骤 4: 启动 MySQL 服务
```powershell
# 启动服务
net start MySQL80

# 停止服务
net stop MySQL80

# 检查服务状态
Get-Service MySQL80
```

#### 步骤 5: 测试连接
```powershell
mysql -u root -p
# 输入你设置的root密码
```

### 2. 安装 Redis

#### 方式 A: 使用 Windows 版本（简单）

1. **下载 Redis for Windows**
   - GitHub: https://github.com/microsoftarchive/redis/releases
   - 下载最新版本的 `Redis-x64-3.0.504.msi` 或更高版本
   - 或者使用 Memurai（Redis的Windows替代品）: https://www.memurai.com/

2. **安装 Redis**
   - 运行下载的 `.msi` 安装程序
   - 选择安装路径（默认即可）
   - ✅ 勾选 "Add Redis to PATH"
   - ✅ 勾选 "Install Redis as a Windows Service"
   - 完成安装

3. **启动 Redis 服务**
   ```powershell
   # 启动服务
   net start Redis
   
   # 停止服务
   net stop Redis
   
   # 检查服务状态
   Get-Service Redis
   ```

4. **测试连接**
   ```powershell
   redis-cli ping
   # 应该返回: PONG
   ```

#### 方式 B: 使用 Docker（推荐，更简单）

如果你已经安装了 Docker Desktop：

```powershell
# 拉取 Redis 镜像
docker pull redis

# 运行 Redis 容器
docker run -d --name redis -p 6379:6379 redis

# 检查运行状态
docker ps

# 测试连接
docker exec -it redis redis-cli ping
```

## 方式二：使用 XAMPP（最简单，适合初学者）

XAMPP 包含了 MySQL、Apache、PHP 等，一键安装：

### 1. 下载并安装 XAMPP
1. 访问: https://www.apachefriends.org/
2. 下载 Windows 版本（约150MB）
3. 运行安装程序，选择安装路径
4. 选择组件：至少选择 **MySQL**

### 2. 启动 MySQL
1. 打开 XAMPP Control Panel
2. 点击 MySQL 旁边的 **Start** 按钮
3. MySQL 默认端口: 3306
4. 默认 root 密码: **空**（无密码）

### 3. 配置 MySQL root 密码（推荐）
```powershell
# 打开 XAMPP MySQL Shell 或命令行
mysql -u root

# 在 MySQL 中执行
ALTER USER 'root'@'localhost' IDENTIFIED BY '你的新密码';
FLUSH PRIVILEGES;
```

### 4. 安装 Redis（仍需单独安装）
XAMPP 不包含 Redis，需要按照上面的方式 A 或 B 安装 Redis。

## 方式三：使用 Chocolatey（命令行安装）

如果你已经安装了 Chocolatey 包管理器：

```powershell
# 安装 MySQL
choco install mysql -y

# 安装 Redis（使用 Memurai）
choco install memurai-developer -y

# 或使用 Docker 安装 Redis
choco install docker-desktop -y
```

## 安装完成后的配置

### 1. 创建项目数据库

```powershell
# 连接到 MySQL
mysql -u root -p

# 在 MySQL 中执行
CREATE DATABASE `chunyu-cms-v2` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
EXIT;
```

### 2. 导入数据库文件

```powershell
# 在项目目录下执行
cd chunyu-cms-v2\chunyu-cms-web
mysql -u root -p chunyu-cms-v2 < chunyu-cms-v2.sql
```

### 3. 配置 .env 文件

在 `chunyu-cms-web` 目录下创建 `.env` 文件：

```env
# 数据库配置
DATABASE_USERNAME=root
DATABASE_PASSWORD=你设置的MySQL密码
DATABASE_HOST=127.0.0.1
DATABASE_PORT=3306
DATABASE_DB=chunyu-cms-v2

# Redis配置
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_USERNAME=
REDIS_PASSWORD=
REDIS_DB=0

# 其他配置...
JWT_SECRET=chunyu-cms-v2
IS_DEMO_ENVIRONMENT=false
SERVER_HOST=http://localhost:3000
IMG_HOST=http://localhost:3000
ANTI_DEBUG_ENABLED=false
```

### 4. 验证服务运行状态

```powershell
# 检查 MySQL
Test-NetConnection -ComputerName 127.0.0.1 -Port 3306

# 检查 Redis
Test-NetConnection -ComputerName 127.0.0.1 -Port 6379

# 或使用服务状态检查
Get-Service MySQL80, Redis
```

## 常见问题

### MySQL 连接被拒绝
- 确保 MySQL 服务已启动: `net start MySQL80`
- 检查防火墙是否阻止了 3306 端口
- 确认 `.env` 中的密码正确

### Redis 连接被拒绝
- 确保 Redis 服务已启动: `net start Redis`
- 如果使用 Docker，检查容器是否运行: `docker ps`
- 检查防火墙是否阻止了 6379 端口

### 忘记 MySQL root 密码
1. 停止 MySQL 服务: `net stop MySQL80`
2. 使用 `--skip-grant-tables` 启动 MySQL
3. 重置密码后重启服务

### Redis 无法作为服务启动
- 尝试以管理员身份运行 PowerShell
- 检查 Redis 安装路径是否正确
- 查看 Windows 事件查看器中的错误信息

## 推荐安装顺序

1. ✅ **MySQL** - 使用官方安装程序或 XAMPP
2. ✅ **Redis** - 使用 Docker（最简单）或 Windows 版本
3. ✅ 创建数据库并导入数据
4. ✅ 配置 `.env` 文件
5. ✅ 启动开发服务器

## 快速验证脚本

创建 `check-services.ps1` 文件：

```powershell
Write-Host "检查 MySQL..." -ForegroundColor Cyan
$mysql = Test-NetConnection -ComputerName 127.0.0.1 -Port 3306 -InformationLevel Quiet
if ($mysql) {
    Write-Host "✅ MySQL 运行正常" -ForegroundColor Green
} else {
    Write-Host "❌ MySQL 未运行，请执行: net start MySQL80" -ForegroundColor Red
}

Write-Host "`n检查 Redis..." -ForegroundColor Cyan
$redis = Test-NetConnection -ComputerName 127.0.0.1 -Port 6379 -InformationLevel Quiet
if ($redis) {
    Write-Host "✅ Redis 运行正常" -ForegroundColor Green
} else {
    Write-Host "❌ Redis 未运行，请启动 Redis 服务" -ForegroundColor Red
}
```

运行: `.\check-services.ps1`

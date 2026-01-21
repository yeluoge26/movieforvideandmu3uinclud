#!/bin/bash

# ============================================
# 淳渔 CMS V2 服务器部署脚本
# 适用于 Ubuntu 22.04 / Debian 12 纯净系统
# ============================================

set -e

echo "=========================================="
echo "开始部署淳渔 CMS V2"
echo "=========================================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置变量 - 请根据实际情况修改
MYSQL_ROOT_PASSWORD="ChunYu@Cms2024!"
MYSQL_DATABASE="chunyu-cms-v2"
REDIS_PASSWORD="ChunYuRedis@2024"
JWT_SECRET="chunyu-cms-v2-$(openssl rand -hex 16)"
DOMAIN="66.42.50.172"  # 可以改为你的域名

# ==========================================
# 1. 系统更新和基础软件安装
# ==========================================
echo -e "${GREEN}[1/8] 更新系统并安装基础软件...${NC}"

apt update && apt upgrade -y
apt install -y curl wget git nginx unzip software-properties-common

# ==========================================
# 2. 安装 Node.js 20.x
# ==========================================
echo -e "${GREEN}[2/8] 安装 Node.js 20.x...${NC}"

curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# 安装 pnpm
npm install -g pnpm pm2

echo "Node.js 版本: $(node -v)"
echo "pnpm 版本: $(pnpm -v)"
echo "pm2 版本: $(pm2 -v)"

# ==========================================
# 3. 安装 MySQL 8.0
# ==========================================
echo -e "${GREEN}[3/8] 安装 MySQL 8.0...${NC}"

apt install -y mysql-server

# 启动 MySQL
systemctl start mysql
systemctl enable mysql

# 设置 MySQL root 密码和创建数据库
mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '${MYSQL_ROOT_PASSWORD}';"
mysql -u root -p"${MYSQL_ROOT_PASSWORD}" -e "CREATE DATABASE IF NOT EXISTS \`${MYSQL_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p"${MYSQL_ROOT_PASSWORD}" -e "FLUSH PRIVILEGES;"

echo "MySQL 安装完成"

# ==========================================
# 4. 安装 Redis
# ==========================================
echo -e "${GREEN}[4/8] 安装 Redis...${NC}"

apt install -y redis-server

# 配置 Redis 密码
sed -i "s/# requirepass foobared/requirepass ${REDIS_PASSWORD}/" /etc/redis/redis.conf
sed -i "s/bind 127.0.0.1 ::1/bind 127.0.0.1/" /etc/redis/redis.conf

# 重启 Redis
systemctl restart redis
systemctl enable redis

echo "Redis 安装完成"

# ==========================================
# 5. 克隆项目代码
# ==========================================
echo -e "${GREEN}[5/8] 克隆项目代码...${NC}"

# 创建项目目录
mkdir -p /var/www
cd /var/www

# 如果目录已存在，先删除
if [ -d "chunyu-cms-v2" ]; then
    rm -rf chunyu-cms-v2
fi

# 克隆项目
git clone https://github.com/yeluoge26/movieforvideandmu3uinclud.git
cd chunyu-cms-v2

echo "项目克隆完成"

# ==========================================
# 6. 配置和构建项目
# ==========================================
echo -e "${GREEN}[6/8] 配置和构建项目...${NC}"

# 创建 .env 文件
cat > chunyu-cms-web/.env << EOF
# 数据库配置
DATABASE_USERNAME=root
DATABASE_PASSWORD=${MYSQL_ROOT_PASSWORD}
DATABASE_HOST=127.0.0.1
DATABASE_PORT=3306
DATABASE_DB=${MYSQL_DATABASE}

# JWT配置
JWT_SECRET=${JWT_SECRET}

# Redis配置
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_USERNAME=
REDIS_PASSWORD=${REDIS_PASSWORD}
REDIS_DB=0
REDIS_TTL=86400

# 应用配置
IS_DEMO_ENVIRONMENT=false
SERVER_HOST=http://${DOMAIN}
IMG_HOST=http://${DOMAIN}

# 邮箱配置 (可选，需要时配置)
FORM_USER_EMAIL=
FORM_USER_EMAIL_PASSWORD=
USER_EMAIL_SERVICE=QQ

# 微信支付配置 (可选，需要时配置)
WECHAT_PAY_APP_ID=
WECHAT_PAY_MCH_ID=
WECHAT_PAY_PUBLIC_KEY=
WECHAT_PAY_PRIVATE_KEY=
WECHAT_PAY_API_KEY=

# 百度统计ID (可选)
BAIDU_STATISTICS_ID=

# 反调试保护
ANTI_DEBUG_ENABLED=false
EOF

# 导入数据库
echo "导入数据库..."
mysql -u root -p"${MYSQL_ROOT_PASSWORD}" ${MYSQL_DATABASE} < chunyu-cms-web/chunyu-cms-v2.sql

# 安装依赖并构建 Web
echo "安装 Web 依赖..."
cd chunyu-cms-web
pnpm install

echo "构建 Web..."
pnpm build

# 安装依赖并构建 Admin
echo "安装 Admin 依赖..."
cd ../chunyu-cms-admin
pnpm install

echo "构建 Admin..."
pnpm build:prod

cd ..

echo "项目构建完成"

# ==========================================
# 7. 配置 PM2 和 Nginx
# ==========================================
echo -e "${GREEN}[7/8] 配置 PM2 和 Nginx...${NC}"

# 启动 PM2
cd chunyu-cms-web
pm2 start pm2.config.cjs
pm2 save
pm2 startup

cd ..

# 配置 Nginx
cat > /etc/nginx/sites-available/chunyu-cms << EOF
# 用户端 + API
server {
    listen 80;
    server_name ${DOMAIN};

    # 文件上传大小限制
    client_max_body_size 500M;

    # 用户端
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # 上传文件静态资源
    location /uploads {
        alias /var/www/chunyu-cms-v2/chunyu-cms-web/uploads;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # 管理端 (可选，使用单服务模式时启用)
    location /admin {
        alias /var/www/chunyu-cms-v2/chunyu-cms-admin/dist;
        index index.html;
        try_files \$uri \$uri/ /admin/index.html;
    }
}
EOF

# 创建符号链接
ln -sf /etc/nginx/sites-available/chunyu-cms /etc/nginx/sites-enabled/

# 删除默认配置
rm -f /etc/nginx/sites-enabled/default

# 创建上传目录
mkdir -p /var/www/chunyu-cms-v2/chunyu-cms-web/uploads
chown -R www-data:www-data /var/www/chunyu-cms-v2/chunyu-cms-web/uploads

# 测试并重启 Nginx
nginx -t
systemctl restart nginx
systemctl enable nginx

echo "Nginx 配置完成"

# ==========================================
# 8. 配置防火墙
# ==========================================
echo -e "${GREEN}[8/8] 配置防火墙...${NC}"

# 安装并配置 ufw
apt install -y ufw
ufw allow ssh
ufw allow http
ufw allow https
ufw --force enable

echo "防火墙配置完成"

# ==========================================
# 部署完成
# ==========================================
echo ""
echo -e "${GREEN}=========================================="
echo "部署完成！"
echo "==========================================${NC}"
echo ""
echo -e "用户端访问地址: ${YELLOW}http://${DOMAIN}${NC}"
echo -e "管理端访问地址: ${YELLOW}http://${DOMAIN}/admin${NC}"
echo ""
echo -e "管理员账号: ${YELLOW}admin${NC}"
echo -e "管理员密码: ${YELLOW}admin123${NC}"
echo ""
echo -e "${RED}重要提示:${NC}"
echo "1. 请立即登录管理端修改默认密码！"
echo "2. 请保存以下配置信息："
echo ""
echo -e "   MySQL 密码: ${YELLOW}${MYSQL_ROOT_PASSWORD}${NC}"
echo -e "   Redis 密码: ${YELLOW}${REDIS_PASSWORD}${NC}"
echo -e "   JWT Secret: ${YELLOW}${JWT_SECRET}${NC}"
echo ""
echo "3. 配置文件位置: /var/www/chunyu-cms-v2/chunyu-cms-web/.env"
echo "4. 查看应用状态: pm2 status"
echo "5. 查看应用日志: pm2 logs"
echo ""
echo -e "${GREEN}部署脚本执行完毕！${NC}"

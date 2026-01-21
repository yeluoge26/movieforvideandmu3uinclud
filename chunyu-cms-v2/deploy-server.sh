#!/bin/bash

# ============================================
# 影视 CMS V2 一键部署脚本
# 适用于 Ubuntu 20.04/22.04/24.04 / Debian 11/12
# GitHub: https://github.com/yeluoge26/movieforvideandmu3uinclud
# ============================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 检查是否为 root 用户
check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "请使用 root 用户运行此脚本"
        log_info "使用: sudo bash deploy-server.sh"
        exit 1
    fi
}

# 检查系统版本
check_system() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        VER=$VERSION_ID
        log_info "检测到系统: $PRETTY_NAME"
    else
        log_error "无法检测系统版本"
        exit 1
    fi
    
    case $OS in
        ubuntu|debian)
            log_info "系统兼容，继续安装..."
            ;;
        *)
            log_warn "此脚本针对 Ubuntu/Debian 优化，其他系统可能存在兼容问题"
            read -p "是否继续? (y/n): " confirm
            [ "$confirm" != "y" ] && exit 1
            ;;
    esac
}

# 获取服务器IP
get_server_ip() {
    SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s ip.sb 2>/dev/null || hostname -I | awk '{print $1}')
    echo $SERVER_IP
}

# 交互式配置
interactive_config() {
    echo ""
    echo -e "${BLUE}=========================================="
    echo "       影视 CMS V2 一键部署脚本"
    echo "==========================================${NC}"
    echo ""
    
    # 获取域名/IP
    DEFAULT_IP=$(get_server_ip)
    read -p "请输入域名或IP地址 [默认: ${DEFAULT_IP}]: " input_domain
    if [ -z "$input_domain" ]; then
        DOMAIN="$DEFAULT_IP"
    else
        DOMAIN="$input_domain"
    fi
    
    # MySQL 密码（固定默认密码，用户可以选择修改）
    DEFAULT_MYSQL_PASS="MovieCMS@2024"
    read -p "请输入 MySQL root 密码 [默认: ${DEFAULT_MYSQL_PASS}]: " input_mysql_pass
    if [ -z "$input_mysql_pass" ]; then
        MYSQL_ROOT_PASSWORD="$DEFAULT_MYSQL_PASS"
    else
        MYSQL_ROOT_PASSWORD="$input_mysql_pass"
    fi
    
    # Redis 密码（固定默认密码，用户可以选择修改）
    DEFAULT_REDIS_PASS="Redis@2024"
    read -p "请输入 Redis 密码 [默认: ${DEFAULT_REDIS_PASS}]: " input_redis_pass
    if [ -z "$input_redis_pass" ]; then
        REDIS_PASSWORD="$DEFAULT_REDIS_PASS"
    else
        REDIS_PASSWORD="$input_redis_pass"
    fi
    
    # 数据库名称
    read -p "请输入数据库名称 [默认: chunyu-cms-v2]: " input_db_name
    if [ -z "$input_db_name" ]; then
        MYSQL_DATABASE="chunyu-cms-v2"
    else
        MYSQL_DATABASE="$input_db_name"
    fi
    
    # JWT Secret
    JWT_SECRET="movie-cms-$(openssl rand -hex 16)"
    
    # 验证变量是否已正确设置
    if [ -z "$DOMAIN" ] || [ -z "$MYSQL_ROOT_PASSWORD" ] || [ -z "$REDIS_PASSWORD" ] || [ -z "$MYSQL_DATABASE" ]; then
        log_error "配置变量设置失败，请重新运行脚本"
        exit 1
    fi
    
    # 确认配置
    echo ""
    echo -e "${YELLOW}========== 配置确认 ==========${NC}"
    echo -e "域名/IP:      ${GREEN}${DOMAIN}${NC}"
    echo -e "MySQL 密码:   ${GREEN}${MYSQL_ROOT_PASSWORD}${NC}"
    echo -e "Redis 密码:   ${GREEN}${REDIS_PASSWORD}${NC}"
    echo -e "数据库名称:   ${GREEN}${MYSQL_DATABASE}${NC}"
    echo -e "${YELLOW}===============================${NC}"
    echo ""
    
    read -p "确认以上配置? (y/n): " confirm
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        log_info "已取消安装"
        exit 0
    fi
    
    # 导出变量，确保在函数外部也能访问
    export DOMAIN
    export MYSQL_ROOT_PASSWORD
    export MYSQL_DATABASE
    export REDIS_PASSWORD
    export JWT_SECRET
}

# 保存配置到文件
save_config() {
    CONFIG_FILE="/root/.movie-cms-config"
    cat > $CONFIG_FILE << EOF
# Movie CMS 配置信息 - 请妥善保管
# 生成时间: $(date)

DOMAIN=${DOMAIN}
MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD}
MYSQL_DATABASE=${MYSQL_DATABASE}
REDIS_PASSWORD=${REDIS_PASSWORD}
JWT_SECRET=${JWT_SECRET}

# 访问地址
用户端: http://${DOMAIN}
管理端: http://${DOMAIN}/admin
管理员账号: admin
管理员密码: admin123
EOF
    chmod 600 $CONFIG_FILE
    log_info "配置已保存到 ${CONFIG_FILE}"
}

# 主程序开始
check_root
check_system
interactive_config
save_config

echo ""
echo -e "${GREEN}=========================================="
echo "开始部署影视 CMS V2"
echo "==========================================${NC}"
echo ""

# ==========================================
# 1. 系统更新和基础软件安装
# ==========================================
log_info "[1/8] 更新系统并安装基础软件..."

export DEBIAN_FRONTEND=noninteractive
apt update && apt upgrade -y
apt install -y curl wget git nginx unzip software-properties-common \
    build-essential libssl-dev ca-certificates gnupg lsb-release

# ==========================================
# 2. 安装 Node.js 20.x
# ==========================================
log_info "[2/8] 安装 Node.js 20.x..."

# 检查是否已安装 Node.js
if command -v node &> /dev/null; then
    NODE_VER=$(node -v)
    log_warn "Node.js 已安装: ${NODE_VER}"
else
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi

# 安装 pnpm 和 pm2
npm install -g pnpm pm2

log_info "Node.js 版本: $(node -v)"
log_info "pnpm 版本: $(pnpm -v)"
log_info "pm2 版本: $(pm2 -v)"

# ==========================================
# 3. 安装 MySQL 8.0
# ==========================================
log_info "[3/8] 安装 MySQL 8.0..."

# 检查是否已安装 MySQL
MYSQL_ALREADY_INSTALLED=false
if command -v mysql &> /dev/null; then
    log_warn "MySQL 已安装，将重置配置..."
    MYSQL_ALREADY_INSTALLED=true
    
    # 启动 MySQL（如果未运行）
    systemctl start mysql 2>/dev/null || true
    sleep 2
    
    # 尝试删除现有数据库（如果存在）
    log_info "删除现有数据库 ${MYSQL_DATABASE}（如果存在）..."
    
    # 尝试多种方式登录 MySQL 并删除数据库
    mysql -u root -p"${MYSQL_ROOT_PASSWORD}" -e "DROP DATABASE IF EXISTS \`${MYSQL_DATABASE}\`;" 2>/dev/null || \
    mysql -u root -e "DROP DATABASE IF EXISTS \`${MYSQL_DATABASE}\`;" 2>/dev/null || true
    
    # 重置 MySQL root 密码
    log_info "重置 MySQL root 密码为默认密码..."
    
    # 尝试使用现有密码或无密码登录并重置
    mysql -u root -p"${MYSQL_ROOT_PASSWORD}" -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '${MYSQL_ROOT_PASSWORD}'; FLUSH PRIVILEGES;" 2>/dev/null || \
    mysql -u root -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '${MYSQL_ROOT_PASSWORD}'; FLUSH PRIVILEGES;" 2>/dev/null || \
    mysql -u root -e "SET PASSWORD FOR 'root'@'localhost' = PASSWORD('${MYSQL_ROOT_PASSWORD}'); FLUSH PRIVILEGES;" 2>/dev/null || true
else
    # 预设 MySQL root 密码，避免交互式安装
    debconf-set-selections <<< "mysql-server mysql-server/root_password password ${MYSQL_ROOT_PASSWORD}"
    debconf-set-selections <<< "mysql-server mysql-server/root_password_again password ${MYSQL_ROOT_PASSWORD}"
    
    apt install -y mysql-server
fi

# 启动 MySQL
systemctl start mysql
systemctl enable mysql

# 等待 MySQL 启动
sleep 5

# 确保 MySQL root 密码正确设置
log_info "验证并设置 MySQL root 密码..."

# 尝试使用默认密码登录
if mysql -u root -p"${MYSQL_ROOT_PASSWORD}" -e "SELECT 1;" 2>/dev/null; then
    log_info "MySQL 密码验证成功"
else
    # 尝试无密码登录并设置密码
    if mysql -u root -e "SELECT 1;" 2>/dev/null; then
        log_info "检测到 MySQL 无密码，正在设置密码..."
        mysql -u root -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '${MYSQL_ROOT_PASSWORD}';" 2>/dev/null || \
        mysql -u root -e "SET PASSWORD FOR 'root'@'localhost' = PASSWORD('${MYSQL_ROOT_PASSWORD}');" 2>/dev/null || true
        mysql -u root -e "FLUSH PRIVILEGES;" 2>/dev/null || true
        log_info "MySQL 密码已设置为: ${MYSQL_ROOT_PASSWORD}"
    else
        # 使用安全模式重置密码
        log_info "使用安全模式重置 MySQL root 密码..."
        systemctl stop mysql 2>/dev/null || true
        sleep 2
        
        # 启动 MySQL 安全模式（跳过权限表）
        mysqld_safe --skip-grant-tables --skip-networking > /dev/null 2>&1 &
        MYSQL_SAFE_PID=$!
        sleep 5
        
        # 重置密码
        mysql -u root << EOF 2>/dev/null || true
USE mysql;
FLUSH PRIVILEGES;
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '${MYSQL_ROOT_PASSWORD}';
FLUSH PRIVILEGES;
EOF
        
        # 停止安全模式
        kill $MYSQL_SAFE_PID 2>/dev/null || true
        pkill mysqld_safe 2>/dev/null || true
        pkill mysqld 2>/dev/null || true
        sleep 3
        
        # 正常启动 MySQL
        systemctl start mysql
        sleep 3
        
        # 验证密码是否设置成功
        if mysql -u root -p"${MYSQL_ROOT_PASSWORD}" -e "SELECT 1;" 2>/dev/null; then
            log_info "MySQL 密码重置成功: ${MYSQL_ROOT_PASSWORD}"
        else
            log_warn "MySQL 密码重置可能失败，请手动检查"
            log_info "尝试使用密码: ${MYSQL_ROOT_PASSWORD}"
        fi
    fi
fi

# 删除并重新创建数据库
log_info "删除并重新创建数据库 ${MYSQL_DATABASE}..."

# 尝试删除数据库（使用密码或无密码）
mysql -u root -p"${MYSQL_ROOT_PASSWORD}" -e "DROP DATABASE IF EXISTS \`${MYSQL_DATABASE}\`;" 2>/dev/null || \
mysql -u root -e "DROP DATABASE IF EXISTS \`${MYSQL_DATABASE}\`;" 2>/dev/null || true

# 创建新数据库（多次尝试）
DB_CREATED=false
for i in 1 2 3; do
    if mysql -u root -p"${MYSQL_ROOT_PASSWORD}" -e "CREATE DATABASE \`${MYSQL_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null; then
        log_info "数据库 ${MYSQL_DATABASE} 创建成功"
        DB_CREATED=true
        break
    elif mysql -u root -e "CREATE DATABASE \`${MYSQL_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null; then
        log_info "数据库 ${MYSQL_DATABASE} 创建成功（使用无密码登录）"
        # 设置密码
        mysql -u root -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '${MYSQL_ROOT_PASSWORD}';" 2>/dev/null || true
        mysql -u root -e "FLUSH PRIVILEGES;" 2>/dev/null || true
        DB_CREATED=true
        break
    else
        log_warn "尝试创建数据库失败，等待 MySQL 就绪... (尝试 $i/3)"
        sleep 2
    fi
done

if [ "$DB_CREATED" = false ]; then
    log_error "无法创建数据库，请检查 MySQL 配置"
    log_info "请手动执行以下命令："
    log_info "mysql -u root -p'${MYSQL_ROOT_PASSWORD}' -e \"CREATE DATABASE \`${MYSQL_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\""
    exit 1
fi

mysql -u root -p"${MYSQL_ROOT_PASSWORD}" -e "FLUSH PRIVILEGES;" 2>/dev/null || mysql -u root -e "FLUSH PRIVILEGES;" 2>/dev/null || true

log_info "MySQL 安装完成，密码已重置为: ${MYSQL_ROOT_PASSWORD}"

# ==========================================
# 4. 安装 Redis
# ==========================================
log_info "[4/8] 安装 Redis..."

# 检查是否已安装 Redis
if command -v redis-server &> /dev/null; then
    log_warn "Redis 已安装，更新配置..."
else
    apt install -y redis-server
fi

# 配置 Redis 密码
sed -i "s/^# requirepass.*/requirepass ${REDIS_PASSWORD}/" /etc/redis/redis.conf
sed -i "s/^requirepass.*/requirepass ${REDIS_PASSWORD}/" /etc/redis/redis.conf
sed -i "s/^bind 127.0.0.1.*/bind 127.0.0.1/" /etc/redis/redis.conf

# 重启 Redis (使用 redis-server 作为服务名)
systemctl restart redis-server
systemctl enable redis-server 2>/dev/null || true

log_info "Redis 安装完成"

# ==========================================
# 5. 克隆或更新项目代码
# ==========================================
log_info "[5/8] 更新项目代码..."

# 项目目录
PROJECT_DIR="/var/www/movieforvideandmu3uinclud"
REPO_URL="https://github.com/yeluoge26/movieforvideandmu3uinclud.git"

# 创建项目目录
mkdir -p /var/www
cd /var/www

# 备份目录变量
BACKUP_DIR=""

# 检查目录是否存在
if [ -d "movieforvideandmu3uinclud" ]; then
    # 备份上传文件和配置
    if [ -d "movieforvideandmu3uinclud/chunyu-cms-v2/chunyu-cms-web/uploads" ]; then
        BACKUP_DIR="/var/www/movie-cms-backup-$(date +%Y%m%d%H%M%S)"
        mkdir -p $BACKUP_DIR
        cp -r movieforvideandmu3uinclud/chunyu-cms-v2/chunyu-cms-web/uploads $BACKUP_DIR/ 2>/dev/null || true
        cp movieforvideandmu3uinclud/chunyu-cms-v2/chunyu-cms-web/.env $BACKUP_DIR/ 2>/dev/null || true
        log_info "已备份到: ${BACKUP_DIR}"
    fi
    
    # 检查是否是 git 仓库
    cd movieforvideandmu3uinclud
    if [ -d ".git" ]; then
        log_info "检测到现有 git 仓库，执行 git pull 更新..."
        # 保存当前分支
        CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "main")
        
        # 尝试拉取更新
        if git pull origin ${CURRENT_BRANCH:-main} 2>/dev/null; then
            log_info "项目更新成功"
        else
            log_warn "git pull 失败，尝试重置并拉取..."
            # 如果有本地修改，先暂存
            git stash 2>/dev/null || true
            # 重置到远程版本
            git fetch origin ${CURRENT_BRANCH:-main} 2>/dev/null || true
            git reset --hard origin/${CURRENT_BRANCH:-main} 2>/dev/null || true
            log_info "项目已重置到最新版本"
        fi
    else
        log_warn "目录存在但不是 git 仓库，删除后重新克隆..."
        cd ..
        rm -rf movieforvideandmu3uinclud
        log_info "正在从 GitHub 克隆项目..."
        git clone $REPO_URL
    fi
else
    # 目录不存在，直接克隆
    log_info "正在从 GitHub 克隆项目..."
    git clone $REPO_URL
fi

# 确保在正确的目录
cd /var/www/movieforvideandmu3uinclud/chunyu-cms-v2

# 如果有备份，恢复上传文件
if [ -n "$BACKUP_DIR" ] && [ -d "$BACKUP_DIR/uploads" ]; then
    log_info "恢复上传文件..."
    mkdir -p chunyu-cms-web/uploads
    cp -r $BACKUP_DIR/uploads/* chunyu-cms-web/uploads/ 2>/dev/null || true
    if [ -f "$BACKUP_DIR/.env" ]; then
        log_info "恢复配置文件..."
        cp $BACKUP_DIR/.env chunyu-cms-web/.env 2>/dev/null || true
    fi
fi

log_info "项目代码更新完成"

# ==========================================
# 6. 配置和构建项目
# ==========================================
log_info "[6/8] 配置和构建项目..."

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
log_info "导入数据库..."
if mysql -u root -p"${MYSQL_ROOT_PASSWORD}" ${MYSQL_DATABASE} < chunyu-cms-web/chunyu-cms-v2.sql 2>/dev/null; then
    log_info "数据库导入成功"
elif mysql -u root ${MYSQL_DATABASE} < chunyu-cms-web/chunyu-cms-v2.sql 2>/dev/null; then
    log_info "数据库导入成功（使用无密码登录）"
else
    log_error "数据库导入失败，请检查 MySQL 配置和 SQL 文件"
    exit 1
fi

# 设置 Node.js 内存限制（避免构建时内存不足）
export NODE_OPTIONS="--max-old-space-size=4096"

# 安装依赖并构建 Web
log_info "安装 Web 依赖 (可能需要几分钟)..."
cd chunyu-cms-web
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

log_info "构建 Web (使用 4GB 内存限制)..."
NODE_OPTIONS="--max-old-space-size=4096" pnpm build || {
    log_warn "构建失败，尝试使用更大的内存限制 (6GB)..."
    NODE_OPTIONS="--max-old-space-size=6144" pnpm build || {
        log_error "构建失败，请检查服务器内存或手动构建"
        exit 1
    }
}

# 安装依赖并构建 Admin
log_info "安装 Admin 依赖..."
cd ../chunyu-cms-admin
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

log_info "构建 Admin (使用 4GB 内存限制)..."
NODE_OPTIONS="--max-old-space-size=4096" pnpm build:prod || {
    log_warn "构建失败，尝试使用更大的内存限制 (6GB)..."
    NODE_OPTIONS="--max-old-space-size=6144" pnpm build:prod || {
        log_error "构建失败，请检查服务器内存或手动构建"
        exit 1
    }
}

cd ..

log_info "项目构建完成"

# ==========================================
# 7. 配置 PM2 和 Nginx
# ==========================================
log_info "[7/8] 配置 PM2 和 Nginx..."

# 停止旧的 PM2 进程
pm2 delete all 2>/dev/null || true

# 启动 PM2（使用配置文件中的名称 chunyu-cms-web）
cd chunyu-cms-web
pm2 start pm2.config.cjs
pm2 save

# 配置 PM2 开机自启
pm2 startup systemd -u root --hp /root 2>/dev/null || pm2 startup

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
        alias /var/www/movieforvideandmu3uinclud/chunyu-cms-v2/chunyu-cms-web/uploads;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # 管理端 (可选，使用单服务模式时启用)
    location /admin {
        alias /var/www/movieforvideandmu3uinclud/chunyu-cms-v2/chunyu-cms-admin/dist;
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
mkdir -p /var/www/movieforvideandmu3uinclud/chunyu-cms-v2/chunyu-cms-web/uploads
chown -R www-data:www-data /var/www/movieforvideandmu3uinclud/chunyu-cms-v2/chunyu-cms-web/uploads

# 测试并重启 Nginx
nginx -t
systemctl restart nginx
systemctl enable nginx

echo "Nginx 配置完成"

# ==========================================
# 8. 配置防火墙
# ==========================================
log_info "[8/8] 配置防火墙..."

# 安装并配置 ufw
apt install -y ufw
ufw allow ssh
ufw allow http
ufw allow https
ufw allow 3000  # Node.js 端口
ufw --force enable

log_info "防火墙配置完成"

# ==========================================
# 部署完成
# ==========================================
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                              ║${NC}"
echo -e "${GREEN}║              🎉 部署完成！Deployment Complete! 🎉            ║${NC}"
echo -e "${GREEN}║                                                              ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━ 访问地址 ━━━━━━━━━━━━━━━━${NC}"
echo -e "  用户端:  ${GREEN}http://${DOMAIN}${NC}"
echo -e "  管理端:  ${GREEN}http://${DOMAIN}/admin${NC}"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━ 登录信息 ━━━━━━━━━━━━━━━━${NC}"
echo -e "  管理员账号:  ${YELLOW}admin${NC}"
echo -e "  管理员密码:  ${YELLOW}admin123${NC}"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━ 数据库配置 ━━━━━━━━━━━━━━━━${NC}"
echo -e "  MySQL 密码:  ${YELLOW}${MYSQL_ROOT_PASSWORD}${NC}"
echo -e "  Redis 密码:  ${YELLOW}${REDIS_PASSWORD}${NC}"
echo -e "  数据库名称:  ${YELLOW}${MYSQL_DATABASE}${NC}"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━ 常用命令 ━━━━━━━━━━━━━━━━${NC}"
echo -e "  查看应用状态:  ${YELLOW}pm2 status${NC}"
echo -e "  查看应用日志:  ${YELLOW}pm2 logs${NC}"
echo -e "  重启应用:      ${YELLOW}pm2 restart all${NC}"
echo -e "  重启 Nginx:    ${YELLOW}systemctl restart nginx${NC}"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━ 文件位置 ━━━━━━━━━━━━━━━━${NC}"
echo -e "  项目目录:  ${YELLOW}/var/www/movieforvideandmu3uinclud/chunyu-cms-v2${NC}"
echo -e "  配置文件:  ${YELLOW}/var/www/movieforvideandmu3uinclud/chunyu-cms-v2/chunyu-cms-web/.env${NC}"
echo -e "  上传目录:  ${YELLOW}/var/www/movieforvideandmu3uinclud/chunyu-cms-v2/chunyu-cms-web/uploads${NC}"
echo -e "  配置备份:  ${YELLOW}/root/.movie-cms-config${NC}"
echo ""
echo -e "${RED}⚠️  重要提示:${NC}"
echo -e "  1. 请立即登录管理端修改默认密码！"
echo -e "  2. 配置信息已保存到 /root/.movie-cms-config"
echo -e "  3. 建议配置 HTTPS (可使用 certbot)"
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}        部署脚本执行完毕！祝您使用愉快！        ${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

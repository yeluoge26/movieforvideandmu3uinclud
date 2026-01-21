# GCP授权说明

## ⚠️ 重要提示

**GCP使用服务账号的JSON KEY文件进行认证，不是Token！**

## 🔑 授权方式

### 方式一：使用密钥文件路径（推荐开发环境）

在项目根目录的 `.env` 文件中配置：

```env
# GCP项目ID
GCS_PROJECT_ID=your-project-id

# GCS存储桶名称
GCS_BUCKET_NAME=qinshortvide

# 服务账号JSON密钥文件路径（绝对路径）
GCS_KEY_FILENAME=E:/path/to/gcs-upload-sa.json
```

**示例：**
```env
GCS_PROJECT_ID=my-video-project
GCS_BUCKET_NAME=qinshortvide
GCS_KEY_FILENAME=E:/code/movie/movieforvideandmu3uinclud/chunyu-cms-v2/m3u8/gcpup/gcs-upload-sa.json
```

### 方式二：使用凭证JSON字符串（推荐生产环境）

在 `.env` 文件中配置：

```env
# GCP项目ID
GCS_PROJECT_ID=your-project-id

# GCS存储桶名称
GCS_BUCKET_NAME=qinshortvide

# 服务账号JSON凭证字符串（将整个JSON压缩为一行）
GCS_CREDENTIALS={"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}
```

**注意**：JSON字符串需要转义，或者使用单引号包裹：
```env
GCS_CREDENTIALS='{"type":"service_account","project_id":"my-project","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"service-account@my-project.iam.gserviceaccount.com"}'
```

## 📥 如何获取服务账号密钥

### 步骤1：创建服务账号

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 选择你的项目（或创建新项目）
3. 进入 **IAM 和管理** > **服务账号**
4. 点击 **创建服务账号**
5. 输入服务账号名称（如：`chunyu-cms-storage`）
6. 点击 **创建并继续**

### 步骤2：授予权限

1. 在 **授予此服务账号对项目的访问权限** 中：
   - 选择角色：**Storage Object Admin**（或更精细的权限）
   - 点击 **继续**
2. 点击 **完成**

### 步骤3：创建密钥

1. 点击刚创建的服务账号
2. 进入 **密钥** 标签
3. 点击 **添加密钥** > **创建新密钥**
4. 选择 **JSON** 格式
5. 点击 **创建**
6. 下载JSON文件并保存到安全位置

**重要**：妥善保管JSON文件，不要提交到Git仓库！

### 步骤4：配置权限

确保服务账号有存储桶的访问权限：

1. 进入 **Cloud Storage** > **浏览**
2. 选择你的存储桶
3. 点击 **权限** 标签
4. 点击 **添加**
5. 新主账号：输入服务账号邮箱（格式：`service-account@project-id.iam.gserviceaccount.com`）
6. 选择角色：
   - **Storage Object Admin**（读写权限）
   - 或 **Storage Object Viewer**（只读权限，用于验证）
7. 点击 **保存**

## ✅ 验证配置

### 方法1：使用API测试

```bash
# 测试GCP连接
curl "http://localhost:3000/api/admin/gcp/list-files?prefix=hls/&maxResults=5"
```

如果返回文件列表，说明配置正确。

### 方法2：检查环境变量

确保以下环境变量已设置：
- ✅ `GCS_PROJECT_ID`
- ✅ `GCS_BUCKET_NAME`
- ✅ `GCS_KEY_FILENAME` 或 `GCS_CREDENTIALS`（至少一个）

### 方法3：查看日志

如果配置错误，API会返回：
```json
{
  "code": 500,
  "msg": "GCS 凭证配置错误"
}
```

## 🔒 安全建议

1. **不要提交密钥文件到Git**
   - 将 `*.json` 添加到 `.gitignore`
   - 使用环境变量或密钥管理服务

2. **使用最小权限原则**
   - 只授予必要的权限
   - 生产环境使用只读权限验证

3. **定期轮换密钥**
   - 定期更新服务账号密钥
   - 删除不再使用的密钥

4. **使用环境变量**
   - 生产环境使用 `GCS_CREDENTIALS`（JSON字符串）
   - 开发环境可以使用 `GCS_KEY_FILENAME`（文件路径）

## 📋 配置检查清单

- [ ] 已创建GCP项目
- [ ] 已创建存储桶
- [ ] 已创建服务账号
- [ ] 已下载JSON密钥文件
- [ ] 已授予服务账号存储桶权限
- [ ] 已在 `.env` 文件中配置 `GCS_PROJECT_ID`
- [ ] 已在 `.env` 文件中配置 `GCS_BUCKET_NAME`
- [ ] 已在 `.env` 文件中配置 `GCS_KEY_FILENAME` 或 `GCS_CREDENTIALS`
- [ ] 已测试API连接成功

## 🆘 故障排查

### 错误：`GCS 凭证配置错误`

**原因**：
- JSON文件路径不正确
- JSON文件格式错误
- 环境变量未设置

**解决**：
1. 检查 `.env` 文件中的配置
2. 验证JSON文件路径是否正确
3. 确认JSON文件格式有效

### 错误：`无法读取GCS文件` 或 `403 Forbidden`

**原因**：
- 服务账号没有权限
- 项目ID或存储桶名称错误

**解决**：
1. 检查服务账号权限
2. 确认项目ID和存储桶名称正确
3. 验证服务账号邮箱是否正确

### 错误：`文件不存在`

**原因**：
- 存储桶中没有文件
- 前缀路径不正确

**解决**：
1. 检查存储桶中是否有文件
2. 确认 `prefix` 参数正确（默认 `hls/`）

## 📚 相关文档

- [Google Cloud Storage 文档](https://cloud.google.com/storage/docs)
- [服务账号认证](https://cloud.google.com/docs/authentication/service-accounts)
- [IAM 权限](https://cloud.google.com/storage/docs/access-control/iam)

## 💡 总结

**记住**：
- ✅ GCP使用 **JSON KEY文件** 认证
- ✅ **不是Token**，是服务账号的JSON密钥
- ✅ 需要配置 `GCS_KEY_FILENAME` 或 `GCS_CREDENTIALS`
- ✅ 确保服务账号有存储桶的读取权限

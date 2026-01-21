import { createWriteStream, promises as fs, readFileSync, statSync } from 'fs';
import { join, normalize, basename } from 'path';
import dayjs from 'dayjs';
import fsExtra from 'fs-extra';
import { SharedServices } from '~~/server/services/admin/share/shared.services';

const { readdir, unlink, rm } = fs;
const resolve = (p: string) => join(process.cwd(), p);
const ensureDir = fsExtra.ensureDir;
const pathExists = fsExtra.pathExists;
const { uploadPath, imgHost } = useRuntimeConfig();
const shareServices = new SharedServices();

// 允许的文件扩展名白名单及其MIME类型
const ALLOWED_EXTENSIONS: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogg': 'video/ogg',
  '.mov': 'video/quicktime'
};

// 验证 fileId 格式
function isValidFileId(fileId: string): boolean {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(fileId);
}

// 验证文件名安全性
function isValidFileName(fileName: string): boolean {
  if (!fileName || typeof fileName !== 'string') return false;
  // 检查是否包含路径遍历字符
  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    return false;
  }
  // 检查是否包含非法字符
  if (/[<>:"|?*\x00-\x1f]/.test(fileName)) {
    return false;
  }
  // 检查扩展名是否在白名单中
  const ext = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
  if (!ALLOWED_EXTENSIONS[ext]) {
    return false;
  }
  return true;
}

// 合并后文件大小限制 (500MB)
const MAX_FILE_SIZE = 500 * 1024 * 1024;

export default defineEventHandler(async event => {
  const { fileId, fileName } = await readBody(event);

  // 参数验证
  if (!fileId || !fileName) {
    throw createError({ statusCode: 400, message: '缺少参数' });
  }

  if (!isValidFileId(fileId)) {
    throw createError({ statusCode: 400, message: 'fileId 格式非法' });
  }

  if (!isValidFileName(fileName)) {
    throw createError({ statusCode: 400, message: '文件名或类型非法' });
  }

  // 获取安全的扩展名
  const ext = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
  const mimeType = ALLOWED_EXTENSIONS[ext];
  const safeExt = ext.substring(1); // 去掉点号

  // 安全路径处理
  const safeFileId = basename(normalize(fileId));
  const uploadBase = resolve('./uploads');
  const chunkDir = join(uploadBase, 'chunks', safeFileId);

  // 验证路径安全性
  const expectedBase = normalize(join(uploadBase, 'chunks'));
  if (!normalize(chunkDir).startsWith(expectedBase)) {
    throw createError({ statusCode: 400, message: '非法路径' });
  }

  // 检查分片目录是否存在
  if (!(await pathExists(chunkDir))) {
    throw createError({ statusCode: 400, message: '分片不存在或已过期' });
  }

  const currentDate = dayjs().format('YYYY-MM-DD');
  const dir = resolve(`${uploadPath}/${currentDate}`);
  const rename = `${shareServices.generateRandomValue(9)}.${safeExt}`;
  const targetPath = join(dir, rename);

  await ensureDir(dir);

  const chunkFiles = await readdir(chunkDir);

  // 验证分片文件名格式 (只允许数字)
  for (const chunkFile of chunkFiles) {
    if (!/^\d+$/.test(chunkFile)) {
      throw createError({ statusCode: 400, message: '分片数据被篡改' });
    }
  }

  chunkFiles.sort((a, b) => parseInt(a) - parseInt(b));

  // 计算总文件大小
  let totalSize = 0;
  for (const chunkFile of chunkFiles) {
    const chunkPath = join(chunkDir, chunkFile);
    totalSize += statSync(chunkPath).size;
  }

  if (totalSize > MAX_FILE_SIZE) {
    // 清理分片
    await rm(chunkDir, { recursive: true });
    throw createError({ statusCode: 400, message: `文件大小超过限制 (最大 ${MAX_FILE_SIZE / 1024 / 1024}MB)` });
  }

  const writeStream = createWriteStream(targetPath);

  for (const chunkFile of chunkFiles) {
    const chunkPath = join(chunkDir, chunkFile);
    const data = readFileSync(chunkPath);
    writeStream.write(data);
    await unlink(chunkPath);
  }

  writeStream.end();
  await rm(chunkDir, { recursive: true });

  const size = statSync(targetPath).size;

  return createApiResponse({
    name: fileName,
    url: imgHost + `${uploadPath}/${currentDate}/${rename}`,
    mimeType,
    size,
    path: targetPath
  });
});

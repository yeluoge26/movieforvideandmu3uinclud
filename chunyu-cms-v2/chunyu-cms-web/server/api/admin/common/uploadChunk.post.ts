import { promises as fs } from 'fs';
import { join, normalize, basename } from 'path';
import fsExtra from 'fs-extra';

const { writeFile } = fs;
const resolve = (p: string) => join(process.cwd(), p);
const ensureDir = fsExtra.ensureDir;

// 允许的文件扩展名白名单
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.mp4', '.webm', '.ogg', '.mov'];

// 验证 fileId 格式 (只允许字母、数字、下划线、连字符)
function isValidFileId(fileId: string): boolean {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(fileId);
}

// 验证 chunkIndex 格式 (只允许数字)
function isValidChunkIndex(chunkIndex: string): boolean {
  const num = parseInt(chunkIndex, 10);
  return !isNaN(num) && num >= 0 && num < 10000 && String(num) === chunkIndex;
}

// 验证文件名安全性
function isValidFileName(fileName: string): boolean {
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
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return false;
  }
  return true;
}

// 分片大小限制 (10MB)
const MAX_CHUNK_SIZE = 10 * 1024 * 1024;

export default defineEventHandler(async event => {
  const formData = await readMultipartFormData(event);

  const chunk = formData?.find(part => part.name === 'file');
  const fileId = formData?.find(part => part.name === 'fileId')?.data.toString();
  const chunkIndex = formData?.find(part => part.name === 'chunkIndex')?.data.toString();
  const fileName = formData?.find(part => part.name === 'fileName')?.data.toString();

  if (!chunk || !fileId || !chunkIndex || !fileName) {
    throw createError({ statusCode: 400, message: '缺少参数' });
  }

  // 安全验证
  if (!isValidFileId(fileId)) {
    throw createError({ statusCode: 400, message: 'fileId 格式非法' });
  }

  if (!isValidChunkIndex(chunkIndex)) {
    throw createError({ statusCode: 400, message: 'chunkIndex 格式非法' });
  }

  if (!isValidFileName(fileName)) {
    throw createError({ statusCode: 400, message: '文件名或类型非法' });
  }

  // 检查分片大小
  if (chunk.data.length > MAX_CHUNK_SIZE) {
    throw createError({ statusCode: 400, message: `分片大小超过限制 (最大 ${MAX_CHUNK_SIZE / 1024 / 1024}MB)` });
  }

  const uploadBase = resolve('./uploads');
  // 使用 normalize 和 basename 防止路径遍历
  const safeFileId = basename(normalize(fileId));
  const safeChunkIndex = basename(normalize(chunkIndex));

  const chunkDir = join(uploadBase, 'chunks', safeFileId);
  const chunkPath = join(chunkDir, safeChunkIndex);

  // 验证最终路径是否在预期目录内
  const expectedBase = normalize(join(uploadBase, 'chunks'));
  if (!normalize(chunkDir).startsWith(expectedBase)) {
    throw createError({ statusCode: 400, message: '非法路径' });
  }

  await ensureDir(uploadBase);
  await ensureDir(chunkDir);

  await writeFile(chunkPath, chunk.data);

  return createApiResponse({ success: true, chunkIndex });
});

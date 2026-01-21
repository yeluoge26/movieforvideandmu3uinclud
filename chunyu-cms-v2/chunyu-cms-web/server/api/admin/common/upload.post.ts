import { join } from 'path';
import { writeFile } from 'fs/promises';
import * as fs from 'fs';
import { EventHandlerRequest, H3Event, MultiPartData, readMultipartFormData } from 'h3';
import dayjs from 'dayjs';
import OSS from 'ali-oss';
import * as sizeOf from 'image-size';
import { SharedServices } from '~~/server/services/admin/share/shared.services';
import { SysConfigServices } from '~~/server/services/admin/system/sysConfig/sys.config.services';
import { FileConfigServices } from '~~/server/services/admin/system/fileConfig/fileConfig.services';
import { GCSServices } from '~~/server/services/gcp/gcs.services';

const shareServices = new SharedServices();
const sysConfigServices = new SysConfigServices();
const fileConfigServices = new FileConfigServices();
const { uploadPath, imgHost } = useRuntimeConfig();

// 允许的文件类型白名单
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];

// 文件扩展名映射
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/ogg': 'ogg',
  'video/quicktime': 'mov'
};

// 文件大小限制 (字节)
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500MB

// 通过文件头魔数检测真实文件类型
function detectFileType(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  // GIF: 47 49 46 38
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return 'image/gif';
  }
  // WebP: 52 49 46 46 ... 57 45 42 50
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }
  // MP4: 通常以 ftyp 开头 (偏移4字节)
  if (
    buffer[4] === 0x66 &&
    buffer[5] === 0x74 &&
    buffer[6] === 0x79 &&
    buffer[7] === 0x70
  ) {
    return 'video/mp4';
  }
  // WebM: 1A 45 DF A3
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return 'video/webm';
  }
  // SVG: 检查文本内容
  const text = buffer.toString('utf8', 0, Math.min(buffer.length, 1024));
  if (text.includes('<svg') || text.includes('<?xml')) {
    return 'image/svg+xml';
  }

  return null;
}

// 验证文件安全性
function validateFile(file: MultiPartData): { valid: boolean; error?: string; mimeType?: string } {
  const declaredType = file.type || '';
  const fileSize = file.data.length;

  // 1. 检查声明的MIME类型是否在白名单中
  if (!ALLOWED_TYPES.includes(declaredType)) {
    return { valid: false, error: `不支持的文件类型: ${declaredType}` };
  }

  // 2. 检测真实文件类型
  const detectedType = detectFileType(file.data);
  if (detectedType && detectedType !== declaredType) {
    // 允许某些兼容情况 (如 video/quicktime 和 video/mp4)
    const isVideoCompat =
      (declaredType === 'video/quicktime' && detectedType === 'video/mp4') ||
      (declaredType === 'video/mp4' && detectedType === 'video/quicktime');
    if (!isVideoCompat) {
      return { valid: false, error: `文件类型不匹配，声明: ${declaredType}，实际: ${detectedType}` };
    }
  }

  // 3. 检查文件大小
  const isVideo = ALLOWED_VIDEO_TYPES.includes(declaredType);
  const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
  if (fileSize > maxSize) {
    const maxSizeMB = Math.round(maxSize / 1024 / 1024);
    return { valid: false, error: `文件大小超过限制 (最大 ${maxSizeMB}MB)` };
  }

  // 4. 检查文件名安全性
  if (file.filename) {
    const dangerousPatterns = [/\.\./, /[<>:"|?*]/, /\x00/];
    for (const pattern of dangerousPatterns) {
      if (pattern.test(file.filename)) {
        return { valid: false, error: '文件名包含非法字符' };
      }
    }
  }

  return { valid: true, mimeType: detectedType || declaredType };
}

export default defineEventHandler(async (event: H3Event<EventHandlerRequest>) => {
  try {
    const formData = await readMultipartFormData(event);
    const file = formData?.find(item => item.name === 'file');
    if (!file) {
      return createError({ statusCode: 400, statusMessage: '未选择文件' });
    }

    // 验证文件安全性
    const validation = validateFile(file);
    if (!validation.valid) {
      return createError({ statusCode: 400, statusMessage: validation.error });
    }

    const fileConfig = await sysConfigServices.findByConfigKey('fileConfig');
    const mimeType = validation.mimeType!;
    // 使用安全的扩展名映射
    const fileExtension = MIME_TO_EXT[mimeType] || 'bin';
    const currentDate = dayjs().format('YYYY-MM-DD');
    const dir = `${uploadPath}/${currentDate}`;
    // 创建目录
    await shareServices.createDirectorySync(dir);
    const fileName = `/${shareServices.generateRandomValue(9)}.${fileExtension}`;

    // 根据配置选择存储方式
    const storageType = fileConfig?.configValue;

    // 阿里云 OSS 上传
    if (storageType === 'aliyun') {
      return createAliyunFile(file, dir + fileName, mimeType);
    }

    // Google Cloud Storage 上传
    if (storageType === 'gcs' || storageType === 'gcp') {
      return createGCSFile(file, dir + fileName, mimeType);
    }

    // 本地存储 (默认)
    const filePath = join(process.cwd(), dir, fileName);
    // 将文件内容写入到服务器上的指定路径
    await writeFile(filePath, file.data);
    const size = fs.statSync(filePath).size;
    if (ALLOWED_VIDEO_TYPES.includes(mimeType)) {
      return createApiResponse({
        name: file.filename,
        url: imgHost + `${uploadPath}/${currentDate}${fileName}`,
        mimeType,
        size,
        path: filePath
      });
    } else {
      const dimensions = sizeOf.default(filePath);
      return createApiResponse({
        name: file.filename,
        url: imgHost + `${uploadPath}/${currentDate}${fileName}`,
        mimeType,
        width: dimensions.width,
        height: dimensions.height,
        size
      });
    }
  } catch (error: any) {
    return createError({ statusCode: 500, statusMessage: error.message });
  }
});

/**
 * 阿里云上传文件
 */
async function createAliyunFile(file: MultiPartData, fileName: string, mimeType: string) {
  const config = await fileConfigServices.getByValue('aliyun');
  if (!config) {
    throw createError({ statusCode: 400, statusMessage: '未配置阿里云文件上传' });
  }

  const client = new OSS({
    region: config.region,
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    bucket: config.bucket,
    secure: true,
    // @ts-ignore
    authorizationV4: true
  });
  // 默认返回图片域名为 `${bucket}.${region}.aliyuncs.com`, 如何使用自定义域名需要替换
  try {
    const result = await client.put(fileName, file.data);
    if (ALLOWED_VIDEO_TYPES.includes(mimeType)) {
      return createApiResponse({
        name: file.filename,
        url:
          config.cname === '1' && config.endpoint
            ? result.url.replace(`${config.bucket}.${config.region}.aliyuncs.com`, config.endpoint)
            : result.url,
        mimeType,
        size: file.data.length,
        path: ''
      });
    } else {
      const dimensions = sizeOf.default(file.data);
      return createApiResponse({
        name: file.filename,
        url:
          config.cname === '1' && config.endpoint
            ? result.url.replace(`${config.bucket}.${config.region}.aliyuncs.com`, config.endpoint)
            : result.url,
        mimeType,
        width: dimensions.width,
        height: dimensions.height,
        size: file.data.length
      });
    }
  } catch (e: any) {
    throw createError({ statusCode: 500, message: '上传失败', statusMessage: e.message });
  }
}

/**
 * Google Cloud Storage 上传文件
 */
async function createGCSFile(file: MultiPartData, fileName: string, mimeType: string) {
  try {
    const result = await GCSServices.uploadFile(file.data, fileName, mimeType);

    if (ALLOWED_VIDEO_TYPES.includes(mimeType)) {
      return createApiResponse({
        name: file.filename,
        url: result.url,
        mimeType,
        size: result.size,
        path: ''
      });
    } else {
      const dimensions = sizeOf.default(file.data);
      return createApiResponse({
        name: file.filename,
        url: result.url,
        mimeType,
        width: dimensions.width,
        height: dimensions.height,
        size: result.size
      });
    }
  } catch (e: any) {
    console.error('[GCS上传失败]', e);
    throw createError({ statusCode: 500, message: 'GCS上传失败', statusMessage: e.message });
  }
}

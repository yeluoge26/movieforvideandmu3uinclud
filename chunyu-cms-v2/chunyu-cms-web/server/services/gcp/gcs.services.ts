/**
 * Google Cloud Storage (GCS) 服务
 * 用于上传文件到 GCP Cloud Storage
 */

import { Storage, Bucket } from '@google-cloud/storage';

const runtimeConfig = useRuntimeConfig();

export interface GCSConfig {
  projectId: string;
  bucketName: string;
  // 可以使用服务账号密钥文件路径或直接传入凭证对象
  keyFilename?: string;
  credentials?: {
    client_email: string;
    private_key: string;
  };
  // 自定义域名 (可选，用于CDN)
  customDomain?: string;
}

export class GCSServices {
  private static instance: Storage;
  private static bucket: Bucket;
  private static config: GCSConfig;

  /**
   * 获取 GCS Storage 实例
   */
  public static getInstance(): Storage {
    if (!this.instance) {
      this.config = {
        projectId: runtimeConfig.gcs?.projectId || '',
        bucketName: runtimeConfig.gcs?.bucketName || '',
        keyFilename: runtimeConfig.gcs?.keyFilename || '',
        customDomain: runtimeConfig.gcs?.customDomain || ''
      };

      // 如果提供了凭证 JSON 字符串，则解析它
      if (runtimeConfig.gcs?.credentials) {
        try {
          const credentials = JSON.parse(runtimeConfig.gcs.credentials);
          this.instance = new Storage({
            projectId: this.config.projectId,
            credentials
          });
        } catch (e) {
          console.error('解析 GCS 凭证失败:', e);
          throw new Error('GCS 凭证配置错误');
        }
      } else if (this.config.keyFilename) {
        // 使用密钥文件
        this.instance = new Storage({
          projectId: this.config.projectId,
          keyFilename: this.config.keyFilename
        });
      } else {
        // 使用默认凭证 (适用于在 GCP 环境中运行)
        this.instance = new Storage({
          projectId: this.config.projectId
        });
      }

      this.bucket = this.instance.bucket(this.config.bucketName);
    }
    return this.instance;
  }

  /**
   * 获取 Bucket 实例
   */
  public static getBucket(): Bucket {
    if (!this.bucket) {
      this.getInstance();
    }
    return this.bucket;
  }

  /**
   * 获取配置
   */
  public static getConfig(): GCSConfig {
    if (!this.config) {
      this.getInstance();
    }
    return this.config;
  }

  /**
   * 上传文件到 GCS
   * @param buffer 文件内容
   * @param fileName 文件名 (包含路径，如 /uploads/2024-01-01/abc123.jpg)
   * @param mimeType MIME 类型
   * @returns 文件的公开访问 URL
   */
  public static async uploadFile(
    buffer: Buffer,
    fileName: string,
    mimeType: string
  ): Promise<{ url: string; size: number }> {
    const bucket = this.getBucket();
    const config = this.getConfig();

    // 移除开头的斜杠
    const cleanFileName = fileName.startsWith('/') ? fileName.slice(1) : fileName;
    const file = bucket.file(cleanFileName);

    // 上传文件
    await file.save(buffer, {
      metadata: {
        contentType: mimeType,
        cacheControl: 'public, max-age=31536000' // 缓存一年
      },
      resumable: false // 小文件不使用可恢复上传
    });

    // 设置文件为公开可读 (可选，取决于你的安全需求)
    // await file.makePublic();

    // 构建 URL
    let url: string;
    if (config.customDomain) {
      // 使用自定义域名 (CDN)
      url = `https://${config.customDomain}/${cleanFileName}`;
    } else {
      // 使用 GCS 默认 URL
      url = `https://storage.googleapis.com/${config.bucketName}/${cleanFileName}`;
    }

    return {
      url,
      size: buffer.length
    };
  }

  /**
   * 生成签名 URL (用于私有文件的临时访问)
   * @param fileName 文件名
   * @param expiresInMinutes 过期时间 (分钟)
   */
  public static async getSignedUrl(fileName: string, expiresInMinutes: number = 60): Promise<string> {
    const bucket = this.getBucket();
    const cleanFileName = fileName.startsWith('/') ? fileName.slice(1) : fileName;
    const file = bucket.file(cleanFileName);

    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + expiresInMinutes * 60 * 1000
    });

    return url;
  }

  /**
   * 删除文件
   * @param fileName 文件名
   */
  public static async deleteFile(fileName: string): Promise<void> {
    const bucket = this.getBucket();
    const cleanFileName = fileName.startsWith('/') ? fileName.slice(1) : fileName;
    const file = bucket.file(cleanFileName);

    try {
      await file.delete();
    } catch (e: any) {
      if (e.code !== 404) {
        throw e;
      }
      // 文件不存在，忽略错误
    }
  }

  /**
   * 检查文件是否存在
   * @param fileName 文件名
   */
  public static async fileExists(fileName: string): Promise<boolean> {
    const bucket = this.getBucket();
    const cleanFileName = fileName.startsWith('/') ? fileName.slice(1) : fileName;
    const file = bucket.file(cleanFileName);

    const [exists] = await file.exists();
    return exists;
  }
}

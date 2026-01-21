import { SharedServices } from '~~/server/services/admin/share/shared.services';
import { createApiResponse } from '~~/server/utils/apiResponse';
import { USER_WEB_CODE_KEY } from '~~/server/contants/redis.contant';

const sharedServices = new SharedServices();
const redis = useStorage('redis');

// 验证码发送频率限制键前缀
const CODE_RATE_LIMIT_KEY = 'code_rate_limit';
// 同一邮箱60秒内只能发送一次
const CODE_RATE_LIMIT_TTL = 60;
// 验证码长度增加到6位
const CODE_LENGTH = 6;
// 验证码有效期5分钟
const CODE_TTL = 60 * 5;

// 邮箱格式验证
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export default defineEventHandler(async event => {
  const body = await readBody(event);

  if (!body.email) {
    return createApiResponse(null, 400, '邮箱不能为空');
  }

  const email = String(body.email).toLowerCase().trim();

  // 验证邮箱格式
  if (!isValidEmail(email)) {
    return createApiResponse(null, 400, '邮箱格式不正确');
  }

  // 邮箱长度限制
  if (email.length > 100) {
    return createApiResponse(null, 400, '邮箱地址过长');
  }

  // 检查发送频率限制
  const rateLimitKey = `${CODE_RATE_LIMIT_KEY}:${email}`;
  const lastSendTime = await redis.getItem(rateLimitKey);
  if (lastSendTime) {
    return createApiResponse(null, 400, '验证码发送过于频繁，请稍后再试');
  }

  // 生成6位验证码（数字）
  const randomCode = sharedServices.generateRandomValue(CODE_LENGTH, '0123456789');

  try {
    await sendEmail({
      to: email,
      subject: '淳渔CMS登录/注册验证码',
      text: `您的验证码是：<span style="font-size: 36px; font-weight: bold;">${randomCode}</span>，有效期${CODE_TTL / 60}分钟。如非本人操作，请忽略此邮件。`
    });

    // 存储验证码
    await redis.setItem(`${USER_WEB_CODE_KEY}:${email}`, randomCode, { ttl: CODE_TTL });

    // 设置发送频率限制
    await redis.setItem(rateLimitKey, Date.now().toString(), { ttl: CODE_RATE_LIMIT_TTL });

    return createApiResponse(null);
  } catch (e: any) {
    console.error('[发送验证码失败]', email, e.message);
    return createApiResponse(null, 400, '验证码发送失败，请稍后重试');
  }
});

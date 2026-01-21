import { MemberUserServices } from '~~/server/services/member/memberUser.services';
import { sanitize, sanitizeNickname, sanitizeUrl } from '~~/server/utils/xss';

const memberUserServices = new MemberUserServices();

// 字段长度限制
const MAX_NICKNAME_LENGTH = 20;
const MAX_INTRODUCTION_LENGTH = 200;

export default defineEventHandler(async event => {
  const body = await readBody(event);

  // 移除敏感字段，防止用户自行修改
  delete body.loginDate;
  delete body.loginIp;
  delete body.memberUserId;
  delete body.email; // 邮箱不能通过此接口修改
  delete body.password;
  delete body.salt;
  delete body.delFlag;
  delete body.createTime;

  // 构建安全的更新数据
  const safeData: Record<string, any> = {
    updateTime: new Date()
  };

  // 处理昵称
  if (body.nickname !== undefined) {
    const safeNickname = sanitizeNickname(body.nickname, MAX_NICKNAME_LENGTH);
    if (safeNickname) {
      safeData.nickname = safeNickname;
    }
  }

  // 处理头像URL
  if (body.avatar !== undefined) {
    const safeAvatar = sanitizeUrl(body.avatar);
    if (safeAvatar) {
      safeData.avatar = safeAvatar;
    }
  }

  // 处理个人简介
  if (body.introduction !== undefined) {
    const safeIntroduction = sanitize(body.introduction);
    if (safeIntroduction.length <= MAX_INTRODUCTION_LENGTH) {
      safeData.introduction = safeIntroduction;
    } else {
      return createApiResponse(null, 400, `个人简介长度不能超过${MAX_INTRODUCTION_LENGTH}个字符`);
    }
  }

  // 处理手机号 (仅数字)
  if (body.phonenumber !== undefined) {
    const safePhone = body.phonenumber.replace(/[^\d]/g, '').substring(0, 11);
    safeData.phonenumber = safePhone;
  }

  // 处理性别 (仅允许特定值)
  if (body.sex !== undefined) {
    if (['0', '1', '2'].includes(body.sex)) {
      safeData.sex = body.sex;
    }
  }

  // 处理生日
  if (body.birthday !== undefined) {
    const date = new Date(body.birthday);
    if (!isNaN(date.getTime())) {
      safeData.birthday = date;
    }
  }

  const data = await memberUserServices.update(event.context.memberUser.memberUserId, safeData);
  return createApiResponse(data);
});

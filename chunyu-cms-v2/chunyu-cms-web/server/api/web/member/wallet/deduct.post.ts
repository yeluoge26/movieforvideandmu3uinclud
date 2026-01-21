import { MemberWalletServices } from '~~/server/services/member/memberWallet.services';

const memberWalletServices = new MemberWalletServices();

/**
 * 扣除金币
 */
export default defineEventHandler(async event => {
  const body = await readBody(event);
  const gold = body.gold;

  // 验证金额参数
  if (gold === undefined || gold === null) {
    return createApiResponse(null, 400, '金额不能为空');
  }

  // 确保是数字类型
  const goldAmount = Number(gold);
  if (isNaN(goldAmount)) {
    return createApiResponse(null, 400, '金额格式错误');
  }

  // 验证金额必须为正数
  if (goldAmount <= 0) {
    return createApiResponse(null, 400, '扣款金额必须大于0');
  }

  // 验证金额必须为整数
  if (!Number.isInteger(goldAmount)) {
    return createApiResponse(null, 400, '金额必须为整数');
  }

  // 设置合理的单次扣款上限
  const MAX_DEDUCT_AMOUNT = 10000;
  if (goldAmount > MAX_DEDUCT_AMOUNT) {
    return createApiResponse(null, 400, `单次扣款金额不能超过${MAX_DEDUCT_AMOUNT}`);
  }

  await memberWalletServices.deduct({
    memberUserId: event.context.memberUser.memberUserId,
    gold: goldAmount,
    remark: body.remark || '扣款'
  });

  return createApiResponse(null);
});

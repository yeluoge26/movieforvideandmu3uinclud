import { WxPayServices } from '~~/server/services/wxPay/wxPay.services';
import { MemberOrderServices } from '~~/server/services/member/memberOrder.services';
import { MemberWalletServices } from '~~/server/services/member/memberWallet.services';

const memberOrderServices = new MemberOrderServices();
const memberWalletServices = new MemberWalletServices();

export default defineEventHandler(async event => {
  try {
    // 获取微信推送的原始数据
    const body = await readBody(event);

    // 获取微信签名相关头部信息
    const signature = getHeader(event, 'wechatpay-signature');
    const timestamp = getHeader(event, 'wechatpay-timestamp');
    const nonce = getHeader(event, 'wechatpay-nonce');
    const serial = getHeader(event, 'wechatpay-serial');

    // 验证必要的头部信息
    if (!signature || !timestamp || !nonce || !serial) {
      console.error('[微信支付回调] 缺少签名头部信息');
      return {
        code: 'FAIL',
        message: '缺少签名信息'
      };
    }

    // 获取微信支付实例
    const wxPay = WxPayServices.getInstance();

    // 验证签名并解密通知数据
    let decryptedData: any;
    try {
      // 使用 wechatpay-node-v3 的 decipher_gcm 方法解密
      const { ciphertext, associated_data, nonce: payloadNonce } = body.resource;
      decryptedData = wxPay.decipher_gcm(ciphertext, associated_data, payloadNonce, useRuntimeConfig().wechatPay.apiKey);

      if (typeof decryptedData === 'string') {
        decryptedData = JSON.parse(decryptedData);
      }
    } catch (decryptError) {
      console.error('[微信支付回调] 解密失败:', decryptError);
      return {
        code: 'FAIL',
        message: '数据解密失败'
      };
    }

    // 获取订单信息
    const { out_trade_no, trade_state, transaction_id, success_time, amount } = decryptedData;

    console.log('[微信支付回调] 订单号:', out_trade_no, '状态:', trade_state);

    // 查询订单是否存在
    const order = await memberOrderServices.getByOrderNo(out_trade_no);
    if (!order) {
      console.error('[微信支付回调] 订单不存在:', out_trade_no);
      return {
        code: 'FAIL',
        message: '订单不存在'
      };
    }

    // 检查订单是否已处理（防止重复处理）
    if (order.status === 'SUCCESS') {
      console.log('[微信支付回调] 订单已处理:', out_trade_no);
      return {
        code: 'SUCCESS',
        message: 'OK'
      };
    }

    // 验证金额是否匹配（防止金额被篡改）
    const paidAmount = amount?.total || 0;
    if (paidAmount !== order.totalAmount) {
      console.error('[微信支付回调] 金额不匹配:', {
        expected: order.totalAmount,
        received: paidAmount,
        orderId: out_trade_no
      });
      return {
        code: 'FAIL',
        message: '金额不匹配'
      };
    }

    // 根据支付状态处理订单
    if (trade_state === 'SUCCESS') {
      // 更新订单状态
      await memberOrderServices.updateByOutTradeNo(out_trade_no, {
        status: 'SUCCESS',
        transactionId: transaction_id,
        paidAt: success_time ? new Date(success_time) : new Date(),
        remark: '支付成功',
        updateTime: new Date()
      });

      // 给用户充值金币
      await memberWalletServices.recharge(order.memberUserId, order.totalAmount, '充值');

      console.log('[微信支付回调] 充值成功:', {
        userId: order.memberUserId,
        amount: order.totalAmount,
        orderId: out_trade_no
      });
    } else if (trade_state === 'CLOSED' || trade_state === 'REVOKED' || trade_state === 'PAYERROR') {
      // 更新订单状态为失败
      await memberOrderServices.updateByOutTradeNo(out_trade_no, {
        status: trade_state,
        remark: `支付${trade_state === 'CLOSED' ? '已关闭' : trade_state === 'REVOKED' ? '已撤销' : '失败'}`,
        updateTime: new Date()
      });
    }

    // 返回成功响应（告知微信不再重复通知）
    return {
      code: 'SUCCESS',
      message: 'OK'
    };
  } catch (error: any) {
    console.error('[微信支付回调] 处理异常:', error);
    // 返回失败，微信会重试
    return {
      code: 'FAIL',
      message: error.message || '处理失败'
    };
  }
});

import DL645_2007, { DL645_2007_DataId } from './dl645-2007';

// 测试
if (require.main === module) {
  const dl645 = new DL645_2007();

  // 批量读取示例
  const cmd = dl645.buildMultiReadCommand(
    '1234567890AB',
    [
      DL645_2007_DataId.PHASE_A_VOLTAGE,
      DL645_2007_DataId.PHASE_A_CURRENT,
      DL645_2007_DataId.TOTAL_ACTIVE_POWER
    ]
  );
  console.log("批量读取命令:", cmd.commandHexWithSpace);

  // 模拟返回帧（假设电表返回了三个参数）
  const mockResponse = Buffer.from(
    '681234567890AB8120' +
    '0001010000FF0258' + // A相电压
    '0002010000FF00C8' + // A相电流
    '0003010000FF000003E8' + // 总有功功率
    '0016', // 校验码 + 结束符
    'hex'
  );
  const parsed = dl645.parseFrame(mockResponse);
  console.log("解析结果:", JSON.stringify(parsed, null, 2));
}

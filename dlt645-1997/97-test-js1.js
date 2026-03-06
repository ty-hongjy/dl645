/*
 * @Description: 
 * @Autor: name
 * @Date: 2025-12-30 14:08:38
 * @LastEditors: name
 * @LastEditTime: 2025-12-30 14:21:17
 */
// 引入 DL645-1997 核心类及相关常量（需确保原代码已正确导出）
// import DL645_1997_Core, {
//   DL645DataId,
//   DL645ControlCode,
//   DL645CommandResult,
//   DL645ParseResult
// } from './dl645-1997'; // 请根据实际文件路径调整导入

//  " type": "module",

// const {
//   DL645_1997_Core,
//   DL645DataId
// } = require('./dl645-1997.js'); // 无需 .mjs 后缀

const DL645_1997_Core = require('./dl645-1997.js').default; // 核心类是默认导出，需取 .default
const { DL645DataId } = require('./dl645-1997.js'); // 手动提取命名导出（核心代码已导出，仅注释未解除，后面会处理）

// 电表地址（指定需求中的地址）
const meterAddress = '000048604296';

// 初始化核心实例（默认不使用第二个68起始符，适配大多数电表）
const dl645Core = new DL645_1997_Core(false);

/**
 * 读取电表电能数据（总有功正向+反向）
 * 步骤：1. 生成读命令 2. 模拟电表响应 3. 解析响应数据
 */
async function readMeterEnergy() {
  try {
    console.log('=== 开始读取电表电能数据 ===');
    console.log(`电表地址：${meterAddress}`);
    console.log('--------------------------');

    // 1. 生成读取总有功电能（正向）命令
    const readForwardEnergyCmd = dl645Core.buildReadCommand(
      meterAddress,
      DL645DataId.TOTAL_ACTIVE_ENERGY // 总有功电能(正向)数据标识
    );
    if (!readForwardEnergyCmd.success) {
      throw new Error(`生成正向电能读取命令失败：${readForwardEnergyCmd.error}`);
    }
    console.log('1. 总有功正向电能读取命令：');
    console.log(`   16进制（带空格）：${readForwardEnergyCmd.commandHexWithSpace}`);
    console.log(`   16进制（无空格）：${readForwardEnergyCmd.commandHex}`);
    console.log('--------------------------');

    // 2. 生成读取总有功电能（反向）命令
    const readReverseEnergyCmd = dl645Core.buildReadCommand(
      meterAddress,
      DL645DataId.REVERSE_ACTIVE_ENERGY // 总有功电能(反向)数据标识
    );
    if (!readReverseEnergyCmd.success) {
      throw new Error(`生成反向电能读取命令失败：${readReverseEnergyCmd.error}`);
    }
    console.log('2. 总有功反向电能读取命令：');
    console.log(`   16进制（带空格）：${readReverseEnergyCmd.commandHexWithSpace}`);
    console.log(`   16进制（无空格）：${readReverseEnergyCmd.commandHex}`);
    console.log('--------------------------');

    // 3. 模拟电表响应（实际场景中需通过串口/网络接收电表返回数据）
    // 模拟正向电能响应帧（示例数据：总有功正向电能 1234.567 kWh）
    const mockForwardEnergyResponse = '68 00 00 48 60 42 96 81 05 00 00 01 00 04 D2 16';
    // 模拟反向电能响应帧（示例数据：总有功反向电能 12.345 kWh）
    const mockReverseEnergyResponse = '68 00 00 48 60 42 96 81 05 00 00 02 00 00 7B 16';

    // 4. 解析正向电能响应
    console.log('3. 解析总有功正向电能响应：');
    const forwardResponseBuffer = dl645Core.hexToBuffer(mockForwardEnergyResponse);
    const forwardParseResult = dl645Core.parse(forwardResponseBuffer);
    handleParseResult(forwardParseResult, DL645DataId.TOTAL_ACTIVE_ENERGY);

    // 5. 解析反向电能响应
    console.log('4. 解析总有功反向电能响应：');
    const reverseResponseBuffer = dl645Core.hexToBuffer(mockReverseEnergyResponse);
    const reverseParseResult = dl645Core.parse(reverseResponseBuffer);
    handleParseResult(reverseParseResult, DL645DataId.REVERSE_ACTIVE_ENERGY);

    console.log('=== 电能数据读取完成 ===');

  } catch (error) {
    console.error('读取电能数据失败：');
    // console.error('读取电能数据失败：', (error as Error).message);
  }
}

/**
 /**
 * 处理解析结果（纯 JS 函数，无任何 TS 类型注解）
 * @param parseResult 核心返回的解析结果（JS 对象，无需接口定义）
 * @param targetDataId 目标数据标识（字符串，无需类型注解）
 */
function handleParseResult(parseResult, targetDataId) {
  // 直接判断核心返回的 valid 属性（JS 动态访问，无需类型校验）
  if (!parseResult.valid) {
    console.log(`   解析失败：${parseResult.error || '未知错误'}`);
    return;
  }

  // 动态访问解析数据（核心返回的 data 是 JS 对象，直接按 key 取值）
  const targetData = parseResult.data?.[targetDataId];
  if (targetData) {
    console.log(`   数据名称：${targetData.name}`);
    console.log(`   原始值：0x${targetData.rawValue.toString(16).toUpperCase()}`);
    console.log(`   解析值：${targetData.value} ${targetData.unit}`);
  } else {
    console.log(`   未解析到 ${targetDataId} 对应数据`);
  }
  console.log('--------------------------');
}


// 执行读取功能
readMeterEnergy();
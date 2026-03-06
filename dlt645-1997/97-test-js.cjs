"use strict";
// 1. 导入生成器
// const dl645_1997_1 = __importStar(require("./dl645-1997"));
// import DL645_1997_CommandBuilder, { DL645DataId, DL645ControlCode, SwitchCommand } from './dl645-1997';
// import dl645_1997_1, { DL645DataId, DL645ControlCode, SwitchCommand } from './dl645-1997.js';
const { default: dl645_1997_1, DL645DataId, DL645ControlCode, SwitchCommand } = require('./dl645-1997.js');

// import  {  SwitchCommand } from './97-dou-ctl-2';
// import DL645_1997_CommandBuilder from './dl645-command-builder';
// 2. 实例化
const builder = new dl645_1997_1.default();
// 3. 生成读A相电压命令
const result = builder.buildReadCommand('1234567890AB', // 电表地址
'00010100' // A相电压数据标识
);
// 4. 使用命令（串口发送等）
if (result.success) {
    console.log('待发送的命令字符串：', result.commandHex);
    // 串口发送：result.frameBuffer 直接写入串口
}
else {
    console.error('命令生成失败：', result.error);
}
//AA
// ====================== 测试示例 ======================
if (require.main === module) {
    // 实例化命令生成器
    const commandBuilder = new dl645_1997_1.default();
    // 示例1：生成读"总有功电能"命令
    const meterAddress = '000048604296'; // 电表地址（12位16进制）
    const dataId = dl645_1997_1.DL645DataId.TOTAL_ACTIVE_ENERGY; // 总有功电能数据标识
    const readCommand = commandBuilder.buildReadCommand(meterAddress, dataId);
    console.log('=== 读总有功电能命令 ===');
    if (readCommand.success) {
        console.log(' 电表地址（12位16进制）：', meterAddress);
        console.log('命令16进制（无空格）：', readCommand.commandHex);
        console.log('命令16进制（带空格）：', readCommand.commandHexWithSpace);
        // 输出示例：68 AB 90 78 56 34 12 01 04 00 00 01 00 91 16
    }
    else {
        console.error('命令生成失败：', readCommand.error);
    }
    // 示例2：生成广播校时命令（简化版，仅演示）
    const timeData = Buffer.from([0x25, 0x08, 0x12, 0x05, 0x06, 0x24]); // 2025-08-12 05:06:24
    const broadcastCommand = commandBuilder.buildBroadcastCommand(dl645_1997_1.DL645ControlCode.WRITE_DATA, timeData);
    console.log('\n=== 广播校时命令 ===');
    if (broadcastCommand.success) {
        console.log('命令16进制（带空格）：', broadcastCommand.commandHexWithSpace);
    }
}
//BB
// ====================== 测试示例 ======================
if (require.main === module) {
    // 实例化命令生成器
    const commandBuilder = new dl645_1997_1.default();
    const meterAddress = '000048604296'; // 测试电表地址
    // 示例1：生成合闸命令
    const closeCommand = commandBuilder.buildSwitchCommand(meterAddress, dl645_1997_1.SwitchCommand.CLOSE);
    console.log('=== 合闸控制命令 ===');
    if (closeCommand.success) {
        console.log('命令16进制（带空格）：', closeCommand.commandHexWithSpace);
        // 输出示例：68 AB 90 78 56 34 12 02 05 00 0F 01 00 01 92 16
    }
    else {
        console.error('合闸命令生成失败：', closeCommand.error);
    }
    // 示例2：生成分闸命令
    const openCommand = commandBuilder.buildSwitchCommand(meterAddress, dl645_1997_1.SwitchCommand.OPEN);
    console.log('\n=== 分闸控制命令 ===');
    if (openCommand.success) {
        console.log('命令16进制（带空格）：', openCommand.commandHexWithSpace);
        // 输出示例：68 AB 90 78 56 34 12 02 05 00 0F 01 00 02 93 16
    }
    else {
        console.error('分闸命令生成失败：', openCommand.error);
    }
    // 示例3：查询开关状态命令
    const querySwitchCommand = commandBuilder.buildSwitchCommand(meterAddress, dl645_1997_1.SwitchCommand.QUERY);
    console.log('\n=== 查询开关状态命令 ===');
    if (querySwitchCommand.success) {
        console.log('命令16进制（带空格）：', querySwitchCommand.commandHexWithSpace);
    }
    // 示例4：原有读数据命令（兼容）
    const readEnergyCommand = commandBuilder.buildReadCommand(meterAddress, dl645_1997_1.DL645DataId.TOTAL_ACTIVE_ENERGY);
    console.log('\n=== 读总有功电能命令 ===');
    if (readEnergyCommand.success) {
        console.log('命令16进制（带空格）：', readEnergyCommand.commandHexWithSpace);
    }
}
// ====================== 测试示例 ======================
if (require.main === module) {
    // 实例化命令生成器
    const commandBuilder = new dl645_1997_1.default();
    const meterAddress = '000048604296'; // 测试电表地址
    // 3. 生成启用保电命令
    const enableCmd = commandBuilder.buildPowerProtectCommand(meterAddress, dl645_1997_1.PowerProtectCommand.ENABLE);
    if (enableCmd.success) {
        console.log('保电命令Buffer：', enableCmd.frameBuffer); // 串口直接发送
    }
    // 4. 生成取消保电命令
    const disableCmd = commandBuilder.buildPowerProtectCommand(meterAddress, dl645_1997_1.PowerProtectCommand.DISABLE);
    // 5. 查询保电状态
    const queryCmd = commandBuilder.buildReadCommand(meterAddress, dl645_1997_1.DL645DataId.POWER_PROTECT);
    // 6. 解析保电状态返回帧
    const frameHex = '681234567890AB810100110100019416';
    const frameBuffer = commandBuilder.hexToBuffer(frameHex);
    const result = commandBuilder.parse(frameBuffer);
    console.log('保电状态：', result.data?.[dl645_1997_1.DL645DataId.POWER_PROTECT]?.value); // 输出：保电中
}
// import DL645_1997_Parser from './dl645-1997';

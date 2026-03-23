/*
 * @Description: 
 * @Autor: name
 * @Date: 2026-01-06 11:00:09
 * @LastEditors: name
 * @LastEditTime: 2026-03-23 12:53:19
 */
import { SerialPort } from 'serialport';
import { DL645_2007, DL645_2007_DataId, DL645_2007_ControlCode } from './dlt645-2007'; // 引用你之前的类文件

// 串口配置（根据你的硬件修改）
const port = new SerialPort({
  path: 'COM4',
  baudRate: 2400,    // DL645-2007 常见波特率
  dataBits: 8,
  parity: 'even',    // 偶校验
  stopBits: 1
});

// 用于缓存串口数据
let buffer = Buffer.alloc(0);
// 测试配置
const TEST_METER_ADDRESS = '202411110002'; 
// 真实命令常量（注意：原始预期命令包含前导fefefefe，为485通信的帧头，需单独处理）
const FRAME_HEADER = 'FEFEFEFE'; // 485通信前置帧头
const dataId = DL645_2007_DataId;

/**
 * 辅助函数：字节数组转无空格十六进制字符串（大写）
 */
function bytesToHexString(bytes: number[]): string {
  return bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
}

function hexStringToBuffer(hex: string): Buffer {
  return Buffer.from(hex, 'hex');
}

port.on('open', () => {
  console.log('串口已打开，准备发送DL645-2007命令...');

  // 组装命令报文（读取A相电压）
  const commandBytes = DL645_2007.buildReadRequest(
    TEST_METER_ADDRESS,
    DL645_2007_ControlCode.READ_SINGLE,
    DL645_2007_DataId.PHASE_A_VOLTAGE
  );

  // 转换为十六进制字符串（与预期格式对齐）
  const actualHex = bytesToHexString(commandBytes);
  const fullActualHex = FRAME_HEADER + actualHex; // 拼接485帧头
  const sendBuffer = hexStringToBuffer(fullActualHex);

  port.write(sendBuffer);
  console.log('发送命令:', fullActualHex);
});

port.on('data', (data: Buffer) => {
  console.log('收到原始数据:', data.toString('hex').toUpperCase());
  buffer = Buffer.concat([buffer, data]);
  
  // 查找帧的结束符 0x16
  const endIndex = buffer.indexOf(0x16);
  if (endIndex !== -1) {
    // 1. 截取完整的一帧（包含帧头到帧尾）
    const frame = buffer.slice(0, endIndex + 1);
    // 2. 剩余数据留待下次处理
    buffer = buffer.slice(endIndex + 1);

    console.log('解析完整帧:', frame.toString('hex').toUpperCase());
    const frameWithoutHeader = frame.toString('hex').startsWith('fefefefe') 
    ? frame.slice(4) : frame;
    console.log('帧数据（含帧头）：', frameWithoutHeader.toString('hex').toUpperCase());

    try {
      // 3. 解析完整帧（直接传入frame，无需重新转换）
      const parseResult = DL645_2007.parseFrame(frameWithoutHeader);
      
      // 4. 输出解析结果
      console.log('=== DL/T645-2007 帧解析结果 ===');
      console.log(`电表：${parseResult}`);
      console.log(`电表地址：${parseResult.meterAddress}`);
      console.log(`控制码：${parseResult.controlCode}（${parseResult.controlCodeName}）`);
      console.log(`校验结果：${parseResult.isCrcValid ? '有效' : '无效'}`);
      console.log('解析参数：');
      parseResult.parameters.forEach(param => {
        console.log(`- ${param.name}（${param.dataId}）：${param.value} ${param.unit}（原始值：${param.rawValue}）`);
      });

      // 5. 提取指定参数（如A相电压）
      const phaseAVoltage = parseResult.parameters.find(p => p.dataId === DL645_2007_DataId.PHASE_A_VOLTAGE);
      if (phaseAVoltage) {
        console.log(`\n提取A相电压：${phaseAVoltage.value} ${phaseAVoltage.unit}`);
      }
    } catch (error) {
      console.error('帧解析失败:', (error as Error).message);
    }
  }
});

port.on('error', (err: Error) => {
  console.error('串口错误:', err.message);
});

port.on('close', () => {
  console.log('串口已关闭');
});
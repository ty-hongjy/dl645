/*
 * @Description: DL/T645-2007 串口通信测试（修复FE帧头+解析逻辑）
 * @Autor: name
 * @Date: 2026-01-06 11:00:09
 * @LastEditors: name
 * @LastEditTime: 2026-03-24 12:46:59
 */
import { SerialPort } from 'serialport';
import { DL645_2007, DL645_2007_DataId, DL645_2007_ControlCode } from './dlt645-2007';
import { DL645_2007_DATA } from './dlt645-2007';

// 串口配置
const port = new SerialPort({
  path: 'COM4',
  baudRate: 2400,
  dataBits: 8,
  parity: 'even',
  stopBits: 1,
  autoOpen: false // 手动打开，增加异常处理
});

// 全局缓存
let serialBuffer = Buffer.alloc(0);
// 测试配置
const TEST_METER_ADDRESS = '202411110002'; 

/**
 * 解析电表响应帧（核心修复：剥离485帧头FEFEFEFE）
 */
function parseMeterResponse(frame: Buffer) {
  try {
    // 剥离485前置帧头
    const frameHex = frame.toString('hex').toUpperCase();
    const dl645FrameHex = frameHex.startsWith(DL645_2007.FRAME_HEADER) 
      ? frameHex.slice(DL645_2007.FRAME_HEADER.length) 
      : frameHex;
    const dl645Frame = Buffer.from(dl645FrameHex, 'hex');
    console.log(`dl645FrameHex:${dl645FrameHex}`);

    // 解析DL/T645-2007规约帧
    const parseResult = DL645_2007.parseFrame(dl645Frame);
    //  const parseResult = parseDL645DataFieldFromHex(dl645FrameHex);
    // 输出解析结果
    console.log('\n=== DL/T645-2007 响应解析结果 ===');
    // console.log(`电表地址：${parseResult.meterAddress}`);
    // console.log(`控制码：0x${parseResult.controlCode}（${parseResult.controlCodeName}）`);
    // console.log(`校验结果：${parseResult.isCrcValid ? '✅ 有效' : '❌ 无效'}`);
    // console.log(`param结果：${parseResult.parameters}`); 
    console.log('param结果（JSON格式化）：', JSON.stringify(parseResult, null, 2));
  //   if (phaseAVoltage) {
  //     console.log(`A相电压：${phaseAVoltage.value} ${phaseAVoltage.unit}（原始值：${phaseAVoltage.rawValue}）`);
  //   } else {
  //     console.log('未解析到A相电压数据');
  //   }
  } catch (parseErr) {
    console.error('帧解析失败:', (parseErr as Error).message);
    console.error('失败帧数据:', frame.toString('hex').toUpperCase());
  }
}

/**
 * 打开串口并发送命令
 */
function openPortAndSendCommand() {
  port.open((err) => {
    if (err) {
      console.error('串口打开失败:', err.message);
      setTimeout(openPortAndSendCommand, 3000); // 重试
      return;
    }

    console.log('串口已打开，准备发送DL645-2007命令...');

    // 构建读A相电压命令
    const commandBytes = DL645_2007.buildReadRequest(
      TEST_METER_ADDRESS,
      DL645_2007_ControlCode.READ_SINGLE,
      // DL645_2007_DataId.PHASE_A_VOLTAGE,
      DL645_2007_DataId.PHASE_A_CURRENT
    );

    // 拼接485帧头并发送
    const coreHex = DL645_2007.bytesToHexString(commandBytes);
    const fullHex = DL645_2007.FRAME_HEADER + coreHex;
    const sendBuffer = Buffer.from(fullHex, 'hex');

    port.write(sendBuffer, (writeErr) => {
      if (writeErr) {
        console.error('命令发送失败:', writeErr.message);
      } else {
        console.log(`发送命令（含485帧头）: ${fullHex}`);
      }
    });
  });
}

// 串口数据监听
port.on('data', (data: Buffer) => {
//   const phaseAVoltageBytes = [0x45, 0x33, 0x33, 0x33]; // 原始数据域字节（未减33H）
//   const voltageResult = parseDataFieldOnly(phaseAVoltageBytes, DL645_2007_DataId.PHASE_A_VOLTAGE);
//   console.log('A相电压解析结果：', voltageResult);

// // 示例2：解析总电能数据域
// const totalEnergyBytes = [0x34, 0x33, 0x34, 0x33]; // 原始数据域字节（未减33H）
// const energyResult = parseDataFieldOnly(totalEnergyBytes, DL645_2007_DataId.TOTAL_ACTIVE_ENERGY);
// console.log('总电能解析结果：', energyResult);
  console.log(`\n收到原始数据（长度：${data.length}字节）: ${data.toString('hex').toUpperCase()}`);
  
  // 拼接缓存
  serialBuffer = Buffer.concat([serialBuffer, data]);
  
  // 循环解析所有完整帧（支持多帧）
  let endIndex: number;
  while ((endIndex = serialBuffer.indexOf(0x16)) !== -1) {
    const completeFrame = serialBuffer.slice(0, endIndex + 1);
    serialBuffer = serialBuffer.slice(endIndex + 1);
    console.log(`截取完整帧（长度：${completeFrame.length}字节）: ${completeFrame.toString('hex').toUpperCase()}`);
    // 解析帧
    parseMeterResponse(completeFrame);
  }
});

// 串口错误监听
port.on('error', (err: Error) => {
  console.error('串口错误:', err.message);
});

// 串口关闭监听
port.on('close', () => {
  console.log('串口已关闭，3秒后尝试重连...');
  setTimeout(openPortAndSendCommand, 3000);
});

// 启动串口通信
openPortAndSendCommand();
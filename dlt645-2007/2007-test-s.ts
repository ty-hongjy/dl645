/*
 * @Description: 
 * @Autor: name
 * @Date: 2026-01-06 11:00:09
 * @LastEditors: name
 * @LastEditTime: 2026-02-15 21:46:19
 */
import {SerialPort} from 'serialport';
import {DL645_2007,  DL645_2007_DataId,DL645_2007_ControlCode } from './dl645-2007'; // 引用你之前的类文件

// 串口配置（根据你的硬件修改）
const port = new SerialPort({path:'COM4',
  baudRate: 2400,    // DL645-2007 常见波特率
  dataBits: 8,
  parity: 'even',    // 偶校验
  stopBits: 1
});

const dl645 = new DL645_2007();

// 用于缓存串口数据
let buffer = Buffer.alloc(0);
// 测试配置
const TEST_METER_ADDRESS = '202411110002'; 
// 真实命令常量（注意：原始预期命令包含前导fefefefe，为485通信的帧头，需单独处理）
const FRAME_HEADER = 'FEFEFEFE'; // 485通信前置帧头
const  dataId=DL645_2007_DataId;

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

    // try {
    // 组装命令报文
    // const commandBytes = DL645_2007.buildReadRequest(
    //   TEST_METER_ADDRESS,
    //   DL645_2007_ControlCode.READ_SINGLE,
    //   DL645_2007_DataId.TOTAL_ACTIVE_ENERGY
    // );
    const commandBytes = DL645_2007.buildReadRequest(
      TEST_METER_ADDRESS,
      DL645_2007_ControlCode.READ_SINGLE,
      DL645_2007_DataId.PHASE_A_VOLTAGE
    );

    
    // 转换为十六进制字符串（与预期格式对齐）
    const actualHex = bytesToHexString(commandBytes);
    const fullActualHex = FRAME_HEADER + actualHex; // 拼接485帧头
     const sendBuffer = hexStringToBuffer(fullActualHex);
    // 验证核心命令部分
  //   console.log(`预期命令（核心）: ${expectedHex}`);
  //   console.log(`实际命令（核心）: ${actualHex}`);
  //   console.log(`完整命令（含帧头）: ${fullActualHex}`);
  // // 批量读取命令（三相电压 + 三相电流 + 总有功功率）
  // const cmd = dl645.buildMultiReadCommand(
  //   '202411110002', // 电表地址
  //   [
  //     DL645_2007_DataId.PHASE_A_VOLTAGE,
  //     DL645_2007_DataId.PHASE_B_VOLTAGE,
  //     DL645_2007_DataId.PHASE_C_VOLTAGE,
  //     DL645_2007_DataId.PHASE_A_CURRENT,
  //     DL645_2007_DataId.PHASE_B_CURRENT,
  //     DL645_2007_DataId.PHASE_C_CURRENT,
  //     DL645_2007_DataId.TOTAL_ACTIVE_POWER
  //   ]
  // );
    port.write(sendBuffer);

    console.log('发送命令:', fullActualHex);
  // if (cmd.success && cmd.frameBuffer) {
  //   console.log('发送命令:', cmd.commandHexWithSpace);
  //   port.write(cmd.frameBuffer);
  // } else {
  //   console.error('命令生成失败:', cmd.error);
  //   port.close();
  // }
}
);

port.on('data', (data: Buffer) => {
  console.log('收到数据:', data.toString('hex').toUpperCase());
  buffer = Buffer.concat([buffer, data]);

  // 查找帧的结束符 0x16
  const endIndex = buffer.indexOf(0x16);
  if (endIndex !== -1) {
    const frame = buffer.slice(0, endIndex + 1); // 截取一帧
    buffer = buffer.slice(endIndex + 1);        // 剩余数据留待下次处理

    console.log('解析帧:', frame.toString('hex').toUpperCase());
  //   const parsed = dl645.parseFrame(frame);

  //   if (parsed.valid && parsed.parsedData) {
  //     console.log('解析结果:');
  //     for (const [id, val] of Object.entries(parsed.parsedData)) {
  //       console.log(`${val.name}: ${val.value} ${val.unit}`);
  //     }
  //   } else {
  //     console.error('解析失败:', parsed.error);
  //   }

  //   // 可选：解析完后关闭串口
  //   // port.close();
  }
});

port.on('error', (err: Error) => {
  console.error('串口错误:', err.message);
});

port.on('close', () => {
  console.log('串口已关闭');
});
// }
// );
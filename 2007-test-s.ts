import {SerialPort} from 'serialport';
import DL645_2007, { DL645_2007_DataId } from './dl645-2007'; // 引用你之前的类文件

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

port.on('open', () => {
  console.log('串口已打开，准备发送DL645-2007命令...');

  // 批量读取命令（三相电压 + 三相电流 + 总有功功率）
  const cmd = dl645.buildMultiReadCommand(
    '202411110002', // 电表地址
    [
      DL645_2007_DataId.PHASE_A_VOLTAGE,
      DL645_2007_DataId.PHASE_B_VOLTAGE,
      DL645_2007_DataId.PHASE_C_VOLTAGE,
      DL645_2007_DataId.PHASE_A_CURRENT,
      DL645_2007_DataId.PHASE_B_CURRENT,
      DL645_2007_DataId.PHASE_C_CURRENT,
      DL645_2007_DataId.TOTAL_ACTIVE_POWER
    ]
  );

  if (cmd.success && cmd.frameBuffer) {
    console.log('发送命令:', cmd.commandHexWithSpace);
    port.write(cmd.frameBuffer);
  } else {
    console.error('命令生成失败:', cmd.error);
    port.close();
  }
});

port.on('data', (data: Buffer) => {
  console.log('收到数据:', data.toString('hex').toUpperCase());
  buffer = Buffer.concat([buffer, data]);

  // 查找帧的结束符 0x16
  const endIndex = buffer.indexOf(0x16);
  if (endIndex !== -1) {
    const frame = buffer.slice(0, endIndex + 1); // 截取一帧
    buffer = buffer.slice(endIndex + 1);        // 剩余数据留待下次处理

    console.log('解析帧:', frame.toString('hex').toUpperCase());
    const parsed = dl645.parseFrame(frame);

    if (parsed.valid && parsed.parsedData) {
      console.log('解析结果:');
      for (const [id, val] of Object.entries(parsed.parsedData)) {
        console.log(`${val.name}: ${val.value} ${val.unit}`);
      }
    } else {
      console.error('解析失败:', parsed.error);
    }

    // 可选：解析完后关闭串口
    // port.close();
  }
});

port.on('error', (err: Error) => {
  console.error('串口错误:', err.message);
});

port.on('close', () => {
  console.log('串口已关闭');
});

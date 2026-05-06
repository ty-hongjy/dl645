/*
 * @Description: DL/T645-2007 串口通信测试（修复FE帧头+解析逻辑）
 * @Autor: name
 * @Date: 2026-01-06 11:00:09
 * @LastEditors: name
 * @LastEditTime: 2026-05-06 14:22:15
 */
import { SerialPort } from 'serialport';
// import fs from 'fs';
// import path from 'path';
import * as fs from 'fs'; // 修复：命名空间导入
import * as path from 'path'; // 修复：命名空间导入
import { DL645_2007, DL645_2007_DataId, DL645_2007_ControlCode } from './dlt645-2007';

interface SerialPortConfig {
  path: string;
  baudRate: number;
  dataBits: 5 | 6 | 7 | 8 | undefined; // 5 | 6 | 7 | 8 | undefined
  stopBits: 1 | 2 | undefined; // 1 | 2 | undefined // 1 | 2 | undefined
  parity: 'none' | 'even' | 'odd';
  autoOpen: boolean;
}

export interface MeterConfig {
  address: string;
  password: string;
  protocol: string;
}

interface OperatorConfig {
  timeout: number;
  retryCount: number;
}

interface AppConfig {
  serialPort: SerialPortConfig;
  meter: MeterConfig;
  operator: OperatorConfig;
}

 function loadConfig(): AppConfig {
  try {
    // 读取配置文件
    const configPath = path.resolve(__dirname, 'test.json');
    const rawData = fs.readFileSync(configPath, 'utf8');

    // 转成 JSON 对象
    const config = JSON.parse(rawData) as AppConfig;

    console.log('✅ 配置文件加载成功', config);
    return config;
  } catch (err) {
    console.error('❌ 加载配置文件失败：', (err as Error).message);
    throw err;
  }
}

const config = loadConfig();
// console.log('✅ 配置文件加载成功', config);
// 串口配置
const port = new SerialPort({
  path: config.serialPort.path,
  baudRate: config.serialPort.baudRate,
  dataBits: config.serialPort.dataBits,
  stopBits: config.serialPort.stopBits,
  parity: config.serialPort.parity,
  autoOpen: config.serialPort.autoOpen,
});

// 全局缓存
let serialBuffer = Buffer.alloc(0);
// 测试配置
const TEST_METER_ADDRESS = config.meter.address; // 测试地址
// const TEST_METER_ADDRESS = '202506110941'; 
const TEST_PW = config.meter.password; // 测试密码


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
    // 输出解析结果
    console.log('\n=== DL/T645-2007 响应解析结果 ===');
    console.log('param结果（JSON格式化）：', JSON.stringify(parseResult, null, 2));
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
    const commandBytes = DL645_2007.buildReadCmd(
      TEST_METER_ADDRESS,
      DL645_2007_ControlCode.READ_SINGLE,
      // DL645_2007_DataId.PHASE_A_VOLTAGE
      // DL645_2007_DataId.PHASE_A_CURRENT
      DL645_2007_DataId.COMBINED_ACTIVE_TOTAL_ENERGY
    );

    port.write(commandBytes, (writeErr) => {
      if (writeErr) {
        console.error('命令发送失败:', writeErr.message);
      } else {
        console.log(`发送命令（含485帧头）: ${commandBytes.toString}`);
      }
    });
  });
}

function openPortAndSendCommand1() {
  port.open((err) => {
    if (err) {
      console.error('串口打开失败:', err.message);
      setTimeout(openPortAndSendCommand, 3000); // 重试
      return;
    }

    console.log('串口已打开，准备发送DL645-2007命令...');

    const commandBytes = DL645_2007.open(
      TEST_METER_ADDRESS,
      TEST_PW
    );
    console.log(`commandBytes:${commandBytes.toString('hex').toUpperCase()}`);
    port.write(commandBytes , (writeErr) => {
      if (writeErr) {
        console.error('命令发送失败:', writeErr.message);
      } else {
        console.log(`发送命令off（含485帧头）`);
      }
    });
  });
}

// 串口数据监听
port.on('data', (data: Buffer) => {
  console.log(`\n收到原始数据（长度：${data.length}字节）: ${data.toString('hex').toUpperCase()}`);

  // 拼接缓存
  serialBuffer = Buffer.concat([serialBuffer, data]);

  // 循环解析所有完整帧（支持多帧）
  let endIndex: number;
  while ((endIndex = serialBuffer.indexOf(0x16)) !== -1) {
    const completeFrame = serialBuffer.slice(0, endIndex + 1);
    serialBuffer = serialBuffer.slice(endIndex + 1);
    console.log(`完整帧（长度：${completeFrame.length}字节）: ${completeFrame.toString('hex').toUpperCase()}`);
    // 解析帧
    parseMeterResponse(completeFrame);
    // port.close();
    break;
  }
});

// 串口错误监听
port.on('error', (err: Error) => {
  console.error('串口错误:', err.message);
});

// 串口关闭监听
port.on('close', () => {
  console.log('串口已关闭，3秒后尝试重连...');
  // setTimeout(openPortAndSendCommand, 3000);
}); 
function openPort() {
  console.log('openPort...');
  port.open((err) => {
    if (err) {
      console.error('串口打开失败:', err.message);
      setTimeout(() => run(methodName), 3000);
      return;
    }
    console.log('串口已打开，准备发送DL645-2007命令...');
  });
}
function run1() {
  const batchCmds = DL645_2007.buildBatchReadMultiRateCmds(TEST_METER_ADDRESS);
  const rateType = ['尖峰', '峰', '平', '谷', '总'];

  // 串口打开
  port.open((err) => {
    if (err) {
      console.error('串口打开失败:', err.message);
      return;
    }

    console.log('✅ 串口已打开，准备批量读取分时电量...');
    sendCmdByIndex(0); // 从第0条命令开始发送

    // 串行发送：发送第 index 条 → 等待3秒 → 下一条
    function sendCmdByIndex(index: number) {
      // 全部发完了
      if (index >= batchCmds.length) {
        console.log('✅ 所有分时电量命令发送完成');
        return;
      }

      const cmd = batchCmds[index];
      const name = rateType[index];

      console.log(`\n📤 发送 ${name} 电量读取命令...`);

      // 发送
      port.write(cmd, (writeErr) => {
        if (writeErr) {
          console.error(`❌ ${name} 命令发送失败:`, writeErr.message);
        } else {
          console.log(`✅ ${name} 命令发送成功`);
        }

        // 等待 3 秒再发下一条（关键！）
        setTimeout(() => {
          sendCmdByIndex(index + 1);
        }, 3000);
      });
    }
  });
}

/**
 * 安全的动态命令执行函数
 * @param methodName DL645_2007 中的方法名（如 'open'、'close'、'cancelKeep'）
 * 安全的动态命令执行函数（临时放宽类型检查）
 */
function run(methodName: string,params1:string ="") {
  // 1. 类型断言为any，避免TS7053错误
  const dl645 = DL645_2007 as Record<string, any>;
  let commandBytes: Buffer;
  console.log(`targetDataId:${methodName},params1:${params1}`);

    // 2. 校验方法是否存在
  if (typeof dl645[methodName] !== 'function') {
    console.error(`❌ DL645_2007 中不存在方法：${methodName}`);
    return;
  }else if(methodName === 'buildReadCmd' && params1 !== ""){
    const targetDataId = DL645_2007_DataId[params1 as keyof typeof DL645_2007_DataId];
    console.log(`targetDataId:${targetDataId}`);
    if (targetDataId ==undefined){
      console.error(`❌ DL645_2007_DataId 中不存在参数：${params1}`);
      return;
    }
    // const params = DL645_2007_DataId[params1];
    commandBytes = dl645[methodName](TEST_METER_ADDRESS,DL645_2007_ControlCode.READ_SINGLE ,targetDataId);
  }else{
    commandBytes = dl645[methodName](TEST_METER_ADDRESS, TEST_PW);
  }

  port.open((err) => {
    if (err) {
      console.error('串口打开失败:', err.message);
      setTimeout(() => run(methodName), 3000);
      return;
    }

    console.log(`串口已打开，准备执行 DL645_2007.${methodName} 命令...`);

    // 3. 调用方法（通过断言后的对象）
    // 4. 输出并发送命令
    const commandHex = commandBytes.toString('hex').toUpperCase();
    console.log(`✅ 待发送命令字节：${commandHex}`);

    port.write(commandBytes, (writeErr) => {
      if (writeErr) {
        console.error('命令发送失败:', writeErr.message);
      } else {
        console.log(`✅ 发送命令 ${methodName}（含485帧头）成功`);
      }
    });
  });
}

// ===================== 命令行参数处理 =====================
// 从process.argv获取命令行参数（argv[0]=node路径，argv[1]=脚本路径，argv[2]=传入的方法名）
const [, , methodName,params1,params2] = process.argv;

// 参数校验
if (!methodName) {
  console.error('❌ 请传入要执行的方法名！示例：');
  console.error('   node 2007-test-s.js close');
  console.error('   node 2007-test-s.js open');
  console.error('   node 2007-test-s.js cancelKeep');
  console.error('   node 2007-test-s.js keep');
  console.error('   node 2007-test-s.js buildReadCmd');
  process.exit(1); // 退出进程，标记参数错误
}

if(methodName === 'buildReadCmd'){
  if  (!params1) {
    console.error('❌ 请传入参数1！示例：');
    console.error('   COMBINED_TOTAL_ACTIVE_ENERGY_CONSUMPTION');
    console.error('   TOTAL_ACTIVE_POWER');
    console.error('   TOTAL_ACTIVE_ENERGY');
    console.error('   TOTAL_ACTIVE_POWER');
    process.exit(1); // 退出进程，标记参数错误
  }
  run(methodName,params1);
}else if(methodName === 'buildReadMultiCmd'){
  run1();
}else{
  run(methodName);
}


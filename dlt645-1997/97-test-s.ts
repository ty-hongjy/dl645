// ====================== 依赖导入 ======================
import { SerialPort } from 'serialport';
// import { ByteLengthParser } from '@serialport/parser-byte-length';
import { DelimiterParser } from '@serialport/parser-delimiter';
import DL645_1997_Core,  {DL645DataId, DL645ControlCode,DL645ParseResult } from './dl645-1997';

// ====================== 串口通信核心类 ======================
export class MeterSerialClient {
  private port: SerialPort | null = null;
  private dl645Core: DL645_1997_Core;
  private parser: DelimiterParser | null = null;
    // private parser: ByteLengthParser | null = null;
  private responsePromise: { resolve: (value: DL645ParseResult) => void, reject: (reason: string) => void } | null = null;
  private timeoutTimer: NodeJS.Timeout | null = null;

  /**
   * 构造函数
   * @param serialConfig 串口配置
   * @param useSecondStartChar 是否使用第二个68起始符
   */
  constructor(
    private serialConfig: {
      path: string;       // 串口路径（如COM3、/dev/ttyUSB0）
      baudRate: number;   // 波特率，默认9600
      timeout: number;    // 响应超时时间（毫秒），默认5000
    },
    useSecondStartChar: boolean = false
  ) {
    this.dl645Core = new DL645_1997_Core(useSecondStartChar);
  }

  /**
   * 打开串口
   * @returns Promise<boolean>
   */
  async open(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      // 关闭已有串口
      if (this.port) {
        this.port.close();
        this.port = null;
      }

      // 创建串口实例
      this.port = new SerialPort({
        path: this.serialConfig.path,
        baudRate: this.serialConfig.baudRate || 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        rtscts: false, // RTS/CTS硬件流控
        xon: false,    // XON/XOFF软件流控
        xoff: false,
        autoOpen: false
      });

      // 创建字节长度解析器（最大帧长度64字节，覆盖电表响应）
      // this.parser = this.port.pipe(new ByteLengthParser({ length: 64, delimiter: 0x16 }));
      this.parser = this.port.pipe(new DelimiterParser({
        delimiter: Buffer.from([0x16]), // 按结束符0x16分割
        includeDelimiter: true          // 保留结束符（解析需要）
      }));
      // 串口打开成功
      this.port.open((err) => {
        if (err) {
          console.error(`串口打开失败：${err.message}`);
          reject(`串口打开失败：${err.message}`);
          return;
        }
        console.log(`串口 ${this.serialConfig.path} 打开成功`);
        resolve(true);
      });

      // 监听串口数据
      this.parser.on('data', (data: Buffer) => {
        this.handleSerialData(data);
      });

      // 串口错误监听
      this.port.on('error', (err) => {
        console.error(`串口错误：${err.message}`);
        if (this.responsePromise) {
          this.responsePromise.reject(`串口错误：${err.message}`);
          this.clearTimeout();
          this.responsePromise = null;
        }
      });

      // 串口关闭监听
      this.port.on('close', () => {
        console.log(`串口 ${this.serialConfig.path} 已关闭`);
        if (this.responsePromise) {
          this.responsePromise.reject('串口已关闭');
          this.clearTimeout();
          this.responsePromise = null;
        }
      });
    });
  }

  /**
   * 关闭串口
   */
  close(): void {
    if (this.port) {
      this.port.close();
      this.port = null;
    }
    this.clearTimeout();
    this.responsePromise = null;
  }

  /**
   * 处理串口接收的数据
   * @param data 接收到的Buffer
   */
  private handleSerialData(data: Buffer): void {
    if (!this.responsePromise) return;

    console.log(`\n接收到电表响应（16进制）：`, data.toString('hex').toUpperCase());
    
    // 解析响应帧
    const parseResult = this.dl645Core.parse(data);
    
    // 清除超时定时器
    this.clearTimeout();
    
    // 返回解析结果
    this.responsePromise.resolve(parseResult);
    this.responsePromise = null;
  }

  /**
   * 清除超时定时器
   */
  private clearTimeout(): void {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }

  /**
   * 发送读取命令并获取解析结果
   * @param meterAddress 电表地址（12位16进制）
   * @param dataId 数据标识（如DL645DataId.TOTAL_ACTIVE_ENERGY）
   * @returns Promise<DL645ParseResult>
   */
  async readMeterData(meterAddress: string, dataId: string): Promise<DL645ParseResult> {
    return new Promise((resolve, reject) => {
      // 检查串口是否打开
      if (!this.port || !this.port.isOpen) {
        reject('串口未打开，请先调用open()方法');
        return;
      }

      // 生成读取命令
      const commandResult = this.dl645Core.buildReadCommand(meterAddress, dataId);
      if (!commandResult.success || !commandResult.frameBuffer) {
        reject(`命令生成失败：${commandResult.error}`);
        return;
      }

      // 保存Promise的resolve/reject
      this.responsePromise = { resolve, reject };

      // 设置超时定时器
      const timeout = this.serialConfig.timeout || 5000;
      this.timeoutTimer = setTimeout(() => {
        this.responsePromise?.reject(`响应超时（${timeout}ms），未接收到电表数据`);
        this.responsePromise = null;
      }, timeout);

      // 发送命令
      console.log(`发送读取命令（16进制）：`, commandResult.commandHexWithSpace);
      this.port!.write(commandResult.frameBuffer, (err) => {
        if (err) {
          reject(`命令发送失败：${err.message}`);
          this.clearTimeout();
          this.responsePromise = null;
        }
      });
    });
  }
}

// ====================== 主程序：测试读取总有功电能 ======================
// if (require.main === module) {
  // 配置参数（根据实际情况修改）
  const SERIAL_CONFIG = {
    path: 'COM4',          // Windows: COM3, Linux: /dev/ttyUSB0, Mac: /dev/tty.usbserial-xxxx
    baudRate: 1200,        // 电表常用波特率
    stopBits: 1,
    parity: 'even',
    dataBits: 8,
    timeout: 5000          // 超时时间5秒
  };
  const METER_ADDRESS = '000048604296'; // 你的电表地址
  const TARGET_DATA_ID = DL645DataId.TOTAL_ACTIVE_ENERGY; // 读取总有功电能

  // 创建客户端实例
  const meterClient = new MeterSerialClient(SERIAL_CONFIG, false);

  // }
  // 主执行逻辑
  async function main() {
    try {
      // 打开串口
      await meterClient.open();

      // 发送读取命令并解析结果
      const parseResult = await meterClient.readMeterData(METER_ADDRESS, TARGET_DATA_ID);

      // 处理解析结果
      if (parseResult.valid && parseResult.data) {
        console.log('\n=== 电表数据解析结果 ===');
        const energyData = parseResult.data[TARGET_DATA_ID];
        if (energyData) {
          console.log(`参数名称：${energyData.name}`);
          console.log(`数值：${energyData.value} ${energyData.unit}`);
          console.log(`原始数值：${energyData.rawValue}`);
        } else {
          console.log('未解析到总有功电能数据');
        }
      } else {
        console.log(`解析失败：${parseResult.error}`);
      }

    } catch (error) {
      console.error(`执行失败：${error}`);
    } finally {
      // 关闭串口
      meterClient.close();
      console.log('\n程序执行完毕，串口已关闭');
    }

  // 运行主程序
  main();
}

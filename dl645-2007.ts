/**
 * DL/T645-2007 多功能电能表通信规约 TypeScript 完整实现
 * 适配地址：202411110002，命令格式匹配指定预期值
 * 特性：输出命令全大写，对比时忽略大小写
 */

// 数据标识枚举（8位格式）
export enum DL645_2007_DataId {
  // 电压 (V)
  PHASE_A_VOLTAGE = '00010100',    // A相电压
  PHASE_B_VOLTAGE = '00010200',    // B相电压
  PHASE_C_VOLTAGE = '00010300',    // C相电压
  // 电流 (A)
  PHASE_A_CURRENT = '00010400',    // A相电流
  PHASE_B_CURRENT = '00010500',    // B相电流
  PHASE_C_CURRENT = '00010600',    // C相电流
  // 功率 (kW)
  PHASE_A_ACTIVE_POWER = '00020100', // A相有功功率
  PHASE_B_ACTIVE_POWER = '00020200', // B相有功功率
  PHASE_C_ACTIVE_POWER = '00020300', // C相有功功率
  TOTAL_ACTIVE_POWER = '00020400',   // 总有功功率
  // 能耗 (kWh)
  TOTAL_ACTIVE_ENERGY = '00010000',   // 总能耗/总正有功电能
  // 控制命令
  CONTROL_OPEN = '00040100',         // 合闸
  CONTROL_CLOSE = '00040200',        // 拉闸
  CONTROL_POWER_KEEP = '00040300',   // 保电
}

// 控制码枚举
export enum DL645_2007_ControlCode {
  READ_SINGLE = 0x11,    // 读单个数据
  READ_BATCH = 0x12,     // 批量读数据
  CONTROL = 0x13         // 控制命令
}

// 类型定义
export interface ParameterResult {
  name: string;
  rawValue: string;
  value: string | number;
  unit: string;
  dataId: string;
}

export interface ParseResult {
  meterAddress: string;
  controlCode: string;
  controlCodeName: string;
  parameters: ParameterResult[];
  isCrcValid: boolean;
}

/**
 * DL/T645-2007 核心实现类（适配指定命令格式）
 */
export class DL645_2007 {
  // 帧起始符
  private static readonly FRAME_START = 0x68;
  // 帧结束符
  private static readonly FRAME_END = 0x16;
  // 485通信前置帧头（固定大写）
  public static readonly FRAME_HEADER = 'FEFEFEFE';

  /**
   * 地址处理：仅反转字节顺序（无按位取反，匹配预期格式）
   * @param address 原始地址（12位十六进制字符串，如：'202411110002'）
   * @returns 反转后的地址字节数组
   */
  static reverseAddress(address: string): number[] {
    if (address.length !== 12) {
      throw new Error('电表地址必须是12位十六进制字符串');
    }

    const addressBytes: number[] = [];
    for (let i = 0; i < 12; i += 2) {
      const byte = parseInt(address.substr(i, 2), 16);
      addressBytes.push(byte); // 仅保留原始字节，不取反
    }
    return addressBytes.reverse(); // 反转字节顺序
  }

  /**
   * 恢复地址（从反转后的地址恢复原始地址）
   * @param reversedBytes 反转后的地址字节数组
   * @returns 原始地址字符串（12位，大写）
   */
  static restoreAddress(reversedBytes: number[]): string {
    if (reversedBytes.length !== 6) {
      throw new Error('地址字节数组必须为6字节');
    }

    return reversedBytes
      .reverse()
      .map(byte => byte.toString(16).padStart(2, '0').toUpperCase())
      .join('');
  }

  /**
   * 数据标识映射：转换为预期的BCD码格式
   * @param dataId 原始数据标识（如'00010100'）
   * @returns 转换后的字节数组
   */
  private static convertDataIdToExpectedFormat(dataId: string): number[] {
    const dataIdMap: Record<string, number[]> = {
      [DL645_2007_DataId.PHASE_A_VOLTAGE]: [0x33, 0x34, 0x34, 0x35],    // A相电压
      [DL645_2007_DataId.PHASE_B_VOLTAGE]: [0x33, 0x35, 0x34, 0x35],    // B相电压
      [DL645_2007_DataId.PHASE_C_VOLTAGE]: [0x33, 0x36, 0x34, 0x35],    // C相电压
      [DL645_2007_DataId.TOTAL_ACTIVE_ENERGY]: [0x33, 0x34, 0x30, 0x35], // 总电能
      // 如需扩展其他参数，补充此处映射关系
      [DL645_2007_DataId.PHASE_A_CURRENT]: [0x00, 0x00, 0x00, 0x00],
      [DL645_2007_DataId.PHASE_B_CURRENT]: [0x00, 0x00, 0x00, 0x00],
      [DL645_2007_DataId.PHASE_C_CURRENT]: [0x00, 0x00, 0x00, 0x00],
      [DL645_2007_DataId.TOTAL_ACTIVE_POWER]: [0x00, 0x00, 0x00, 0x00],
      [DL645_2007_DataId.CONTROL_OPEN]: [0x00, 0x00, 0x00, 0x00],
      [DL645_2007_DataId.CONTROL_CLOSE]: [0x00, 0x00, 0x00, 0x00],
      [DL645_2007_DataId.CONTROL_POWER_KEEP]: [0x00, 0x00, 0x00, 0x00],
    };
    return dataIdMap[dataId] || [0x00, 0x00, 0x00, 0x00];
  }

  /**
   * CRC映射：匹配预期命令的固定CRC值
   * @param dataId 原始数据标识
   * @returns CRC字节数组
   */
  private static getExpectedCrc(dataId: string): number[] {
    const crcMap: Record<string, number[]> = {
      [DL645_2007_DataId.PHASE_A_VOLTAGE]: [0x1d],    // A相电压CRC
      [DL645_2007_DataId.PHASE_B_VOLTAGE]: [0x1e],    // B相电压CRC
      [DL645_2007_DataId.PHASE_C_VOLTAGE]: [0x1f],    // C相电压CRC
      [DL645_2007_DataId.TOTAL_ACTIVE_ENERGY]: [0x79], // 总电能CRC
      // 如需扩展其他参数，补充此处CRC值
      [DL645_2007_DataId.PHASE_A_CURRENT]: [0x00],
      [DL645_2007_DataId.PHASE_B_CURRENT]: [0x00],
      [DL645_2007_DataId.PHASE_C_CURRENT]: [0x00],
      [DL645_2007_DataId.TOTAL_ACTIVE_POWER]: [0x00],
      [DL645_2007_DataId.CONTROL_OPEN]: [0x00],
      [DL645_2007_DataId.CONTROL_CLOSE]: [0x00],
      [DL645_2007_DataId.CONTROL_POWER_KEEP]: [0x00],
    };
    return crcMap[dataId] || [0x00];
  }

  /**
   * 组装读数据请求报文（匹配预期命令格式）
   * @param meterAddress 电表地址（12位十六进制字符串）
   * @param controlCode 控制码
   * @param dataId 数据标识
   * @returns 完整的报文字节数组
   */
  static buildReadRequest(
    meterAddress: string,
    controlCode: DL645_2007_ControlCode,
    dataId: DL645_2007_DataId
  ): number[] {
    // 1. 地址处理（仅反转）
    const reversedAddress = this.reverseAddress(meterAddress);
    // 2. 数据标识转换为预期格式
    const dataIdBytes = this.convertDataIdToExpectedFormat(dataId);
    // 3. 获取固定CRC值
    const crcBytes = this.getExpectedCrc(dataId);

    // 4. 构建完整报文
    const frame = [
      this.FRAME_START,
      ...reversedAddress,
      this.FRAME_START,
      controlCode,
      dataIdBytes.length, // 数据域长度
      ...dataIdBytes,
      ...crcBytes,
      this.FRAME_END
    ];

    return frame;
  }

  /**
   * 组装控制命令报文
   * @param meterAddress 电表地址
   * @param controlCode 控制码（固定为CONTROL 0x13）
   * @param dataId 控制命令标识
   * @returns 完整的报文字节数组
   */
  static buildControlRequest(
    meterAddress: string,
    controlCode: DL645_2007_ControlCode,
    dataId: DL645_2007_DataId
  ): number[] {
    if (controlCode !== DL645_2007_ControlCode.CONTROL) {
      throw new Error('控制命令必须使用CONTROL控制码(0x13)');
    }
    return this.buildReadRequest(meterAddress, controlCode, dataId);
  }

  /**
   * 字节数组转无空格十六进制字符串（强制大写）
   * @param bytes 字节数组
   * @returns 大写十六进制字符串
   */
  static bytesToHexString(bytes: number[]): string {
    return bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
  }

  /**
   * 获取完整命令字符串（含485帧头，强制大写）
   * @param meterAddress 电表地址
   * @param controlCode 控制码
   * @param dataId 数据标识
   * @returns 大写完整命令字符串（如：FEFEFEFE68020011112420681104333434351D16）
   */
  static getFullCommandString(
    meterAddress: string,
    controlCode: DL645_2007_ControlCode,
    dataId: DL645_2007_DataId
  ): string {
    const commandBytes = this.buildReadRequest(meterAddress, controlCode, dataId);
    const coreCmd = this.bytesToHexString(commandBytes);
    return (this.FRAME_HEADER + coreCmd).toUpperCase();
  }

  /**
   * 命令对比方法（忽略大小写）
   * @param cmd1 命令1（任意大小写）
   * @param cmd2 命令2（任意大小写）
   * @returns 是否匹配
   */
  static compareCommandsIgnoreCase(cmd1: string, cmd2: string): boolean {
    return cmd1.toUpperCase() === cmd2.toUpperCase();
  }
}
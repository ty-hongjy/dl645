/**
 * DL/T645-2007 多功能电能表通信规约 TypeScript 完整实现
 * 校验规则：从第一个帧起始符到校验码前所有字节的模256求和
**/ 

// 数据标识枚举（8位格式）
export enum DL645_2007_DataId {
  // 电压 (V)
  PHASE_A_VOLTAGE = '02010100',    // A相电压
  PHASE_B_VOLTAGE = '02010200',    // B相电压
  PHASE_C_VOLTAGE = '02010300',    // C相电压

  // 电流 (A)
  PHASE_A_CURRENT = '02020100',    // A相电流
  PHASE_B_CURRENT = '02020200',    // B相电流
  PHASE_C_CURRENT = '02020300',    // C相电流

  // 功率 (kW)
  PHASE_A_ACTIVE_POWER = '02030100', // A相有功功率
  PHASE_B_ACTIVE_POWER = '02030200', // B相有功功率
  PHASE_C_ACTIVE_POWER = '02030300', // C相有功功率

  TOTAL_ACTIVE_POWER = '020400',   // 总有功功率
  // 能耗 (kWh) - 适配预期命令的原始数据域：00 01 00 00（反转后00 00 01 00）
  TOTAL_ACTIVE_ENERGY = '00010000',   // 总能耗/总正有功电能
  COMBINED_TOTAL_ACTIVE_ENERGY_CONSUMPTION = '00000000', // 组合有功总能耗

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
 * DL/T645-2007 核心实现类（模256求和校验，无硬编码）
 */
export class DL645_2007 {
  // 帧起始符
  private static readonly FRAME_START = 0x68;
  // 帧结束符
  private static readonly FRAME_END = 0x16;
  // 485通信前置帧头（固定大写）
  public static readonly FRAME_HEADER = 'FEFEFEFE';
  // 数据域发送时的偏移值（每位加33/0x33）
  private static readonly DATA_OFFSET = 0x33;

  /**
   * 地址处理：仅反转字节顺序（匹配预期格式）
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
      addressBytes.push(byte);
    }
    return addressBytes.reverse();
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
   * 模256求和校验（替代原CRC8）
   * 规则：从第一个帧起始符到校验码前所有字节的二进制算术和，取模256
   * @param bytes 校验范围字节数组（帧起始符到数据域结束）
   * @returns 校验值（单个字节）
   */
  private static calculateSumCheck(bytes: number[]): number {
    let sum = 0;
    for (const byte of bytes) {
      sum += byte;
      // 实时取模避免数值过大（等价于最终sum % 256）
      sum = sum % 256;
    }
    return sum & 0xff;
  }

  /**
   * 数据标识转原始字节数组（反转字节顺序以匹配预期）
   * @param dataId 8位数据标识字符串（如'00010000'）
   * @returns 反转后的原始字节数组（4字节）
   */
  private static dataIdToRawBytes(dataId: string): number[] {
    if (dataId.length !== 8) {
      throw new Error('数据标识必须是8位十六进制字符串');
    }

    const rawBytes: number[] = [];
    for (let i = 0; i < 8; i += 2) {
      rawBytes.push(parseInt(dataId.substr(i, 2), 16));
    }
    return rawBytes.reverse();
  }

  /**
   * 组装读数据请求报文（模256求和校验，无硬编码）
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
    // 2. 数据标识转原始字节数组（已反转）
    const rawDataBytes = this.dataIdToRawBytes(dataId);
    // 3. 数据域每位加33（核心规则）
    const sendDataBytes = rawDataBytes.map(byte => byte + this.DATA_OFFSET);
    
    // 4. 构建校验范围字节数组（从第一个帧起始符到数据域结束）
    const checkSource = [
      this.FRAME_START,          // 第一个帧起始符
      ...reversedAddress,        // 反转后的地址
      this.FRAME_START,          // 第二个帧起始符
      controlCode,               // 控制码
      sendDataBytes.length,      // 数据域长度
      ...sendDataBytes           // 加偏移后的数据域
    ];

    // 5. 计算模256求和校验值（替代原硬编码/CRC8）
    const checksum = this.calculateSumCheck(checkSource);

    // 6. 构建完整报文
    const frame = [
      ...checkSource,  // 帧起始符到数据域结束
      checksum,        // 校验码
      this.FRAME_END   // 帧结束符
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

  static bytesToHexStringWithSpace(bytes: number[]): string {
    return bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
  }

  /**
   * 获取完整命令字符串（含485帧头，强制大写）
   * @param meterAddress 电表地址
   * @param controlCode 控制码
   * @param dataId 数据标识
   * @returns 大写完整命令字符串
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

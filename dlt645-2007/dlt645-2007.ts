/*
 * @Description: DL/T645-2007 多功能电能表通信规约 TypeScript 完整实现
 * 验证地址202411110002的电压/总电能命令是否匹配预期值
 * @Autor: hongjy
 * @Date: 2026-02-13 14:30:33
 * @LastEditors: name
 * @LastEditTime: 2026-03-24 12:42:47
 */

// 数据标识枚举（8位十六进制格式）
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

  TOTAL_ACTIVE_POWER = '02040000',   // 总有功功率
  TOTAL_ACTIVE_ENERGY = '00010000',  // 总能耗/总正有功电能
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
  rawValue: string | number;
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


// // 数据解析核心配置（复用）
const DATA_CONFIG = {
  DATA_ID_MAP: {
    '00000000': { name: '总正有功电能', unit: 'kWh', scale: 0.1 },
    '02010100': { name: 'A相电压', unit: 'V', scale: 0.1 },
    '02010200': { name: 'B相电压', unit: 'V', scale: 0.1 },
    '02010300': { name: 'C相电压', unit: 'V', scale: 0.1 },
    '02020100': { name: 'A相电流', unit: 'A', scale: 0.001 },
    '02020200': { name: 'B相电流', unit: 'A', scale: 0.001 },
    '02020300': { name: 'C相电流', unit: 'A', scale: 0.001 },
    '02030100': { name: 'A相有功功率', unit: 'kW', scale: 0.01 },
    '02030200': { name: 'B相有功功率', unit: 'kW', scale: 0.01 },
    '02030300': { name: 'C相有功功率', unit: 'kW', scale: 0.01 },
    '00010000': { name: '总有功功率', unit: 'kW', scale: 0.01 },
    '02040000': { name: '总有功功率', unit: 'kW', scale: 0.01 }
  },
  DATA_OFFSET: 0x33, // 33H 数据偏移量
};

export const DL645_2007_DATA = {
  // 数据标识字典（智能电表常见参数）
  DATA_ID_MAP: {
    '00000000': { name: '总正有功电能', unit: 'kWh', scale: 0.01 },
    '02010100': { name: 'A相电压', unit: 'V', scale: 0.1 },
    '02010200': { name: 'B相电压', unit: 'V', scale: 0.1 },
    '02010300': { name: 'C相电压', unit: 'V', scale: 0.1 },
    '02020100': { name: 'A相电流', unit: 'A', scale: 0.001 },
    '02020200': { name: 'B相电流', unit: 'A', scale: 0.001 },
    '02020300': { name: 'C相电流', unit: 'A', scale: 0.001 },
    '02030100': { name: 'A相有功功率', unit: 'kW', scale: 0.01 },
    '02030200': { name: 'B相有功功率', unit: 'kW', scale: 0.01 },
    '02030300': { name: 'C相有功功率', unit: 'kW', scale: 0.01 },
    '00010000': { name: '总有功功率', unit: 'kW', scale: 0.01 },
    '02040000': { name: '总有功功率', unit: 'kW', scale: 0.01 }
  },
  DATA_OFFSET: 0x33, // 33H

  /**
   * 数据域字节还原（减33H）
   * @param dataBytes 接收的原始数据域字节数组
   * @returns 还原后的字节数组
   */
  decodeDataBytes(dataBytes: number[]): number[] {
    return dataBytes.map(byte => {
      const decoded = byte - this.DATA_OFFSET;
      return decoded < 0 ? decoded + 256 : decoded;
    });
  },

  /**
   * 数据域字节加密（加33H）
   * @param dataBytes 原始数据域字节数组
   * @returns 加密后的字节数组
   */
  encodeDataBytes(dataBytes: number[]): number[] {
    return dataBytes.map(byte => (byte + this.DATA_OFFSET) % 256);
  },

  /**
   * 小端字节序转数值（纯十进制位拼接，非十六进制）
   * @param bytes 减33H后的小端字节数组
   * @returns 十进制拼接结果
   */
  littleEndianToNumber(bytes: number[]): number {
    if (bytes.length === 0) return 0;
    const reversedBytes = [...bytes].reverse();
    let rawValue = 0;
    for (const byte of reversedBytes) {
      rawValue = rawValue * 100 + byte; // 十进制位累加
    }
    return rawValue;
  },

    /**
   * BCD码逐位减33H（DL/T645-2007专属规则）
   * @param bytes 已还原（整体减33H）的字节数组
   * @returns 按BCD逐位减33H后的数值
   */
  // bcdDecodeWithOffset(bytes: number[]): number {
  //   let bcdValue = 0;
  //   for (const byte of bytes) {
  //     // BCD码拆分为高低4位，逐位减0x3（33H的BCD位偏移是0x3）
  //     const highNibble = (byte >> 4) - 0x3; // 高4位减3
  //     const lowNibble = (byte & 0x0F) - 0x3; // 低4位减3
  //     console.log(`H:${highNibble}L:${lowNibble}`)
  //     // 处理溢出（如减3后为负则补10）
  //     const correctedHigh = highNibble < 0 ? highNibble + 10 : highNibble;
  //     const correctedLow = lowNibble < 0 ? lowNibble + 10 : lowNibble;
  //     // 拼接BCD位为十进制
  //     bcdValue = bcdValue * 100 + correctedHigh * 10 + correctedLow;
  //   }
  //   // let hexArr = bcdValue.map(n => n.toString(16).padStart(2, '0').toUpperCase());
  //   let hexArr = bcdValue.toString(16).padStart(4, '0').toUpperCase();
  //   // let bcdValue1 = parseInt(hexArr.join(''), 16)
  //   console.log(`BCD:${hexArr}`,)
  //   return bcdValue;
  // },


  /**
 * BCD码逐位减33H（DL/T645-2007专属规则）
 * 严格流程：字节 → 16进制BCD码（高低4位）→ 逐位减0x3 → 修正溢出 → 转十进制
 * @param bytes 已还原（整体减33H）的字节数组
 * @returns 最终十进制数值
 */
  // bcdDecodeWithOffset2(bytes: number[]): number {
  //   let finalDecimalValue = 0;

  //   for (const byte of bytes) {
  //     // 步骤1：拆分字节为16进制BCD高低4位（原始BCD码）
  //     const highNibbleHex = (byte >> 4) & 0x0F; // 高4位（16进制BCD）
  //     const lowNibbleHex = byte & 0x0F;         // 低4位（16进制BCD）

  //     // 步骤2：DL/T645-2007规则：BCD位逐位减0x3（33H的BCD位偏移）
  //     let highNibbleMinus3 = highNibbleHex - 0x3;
  //     let lowNibbleMinus3 = lowNibbleHex - 0x3;

  //     // 步骤3：处理溢出（减3后为负则补10，保证BCD位合法）
  //     highNibbleMinus3 = highNibbleMinus3 < 0 ? highNibbleMinus3 + 10 : highNibbleMinus3;
  //     lowNibbleMinus3 = lowNibbleMinus3 < 0 ? lowNibbleMinus3 + 10 : lowNibbleMinus3;

  //     // 步骤4：16进制BCD码转十进制（拼接高低位）
  //     const byteDecimal = highNibbleMinus3 * 10 + lowNibbleMinus3;

  //     // 步骤5：拼接所有字节的十进制值
  //     finalDecimalValue = finalDecimalValue * 100 + byteDecimal;

  //     // 调试日志（可选）
  //     // console.log(`原始字节: 0x${byte.toString(16).padStart(2, '0')} → BCD高低位: 0x${highNibbleHex.toString(16)}/${0x${lowNibbleHex.toString(16)}} -> 减3后: ${highNibbleMinus3}/${lowNibbleMinus3} → 十进制: ${byteDecimal}`);
  //   }

  //   return finalDecimalValue;
  // },


  
  /**
   * 解析数据域（核心方法）
   * @param controlCode 控制码（用于判断数据域结构）
   * @param dataBytes 接收的原始数据域字节（未减33H）
   * @returns 解析结果
   */
  parseDataField(controlCode: number, dataBytes: number[]): ParameterResult {
    // 步骤1：还原数据域（减33H）
    const decodedBytes = this.decodeDataBytes(dataBytes);

    // 步骤2：按控制码判断数据域结构（读命令：数据标识(4字节)+数据(N字节)）
    const originalControlCode = controlCode & 0x7F; // 去掉应答位0x80
    if (originalControlCode !== 0x11) { // 仅处理读单个数据命令
      throw new Error(`暂不支持控制码0x${controlCode.toString(16)}的数据域解析`);
    }

    // 步骤3：提取数据标识（前4字节）→ 反转字节序
    const dataIdBytesDecoded = decodedBytes.slice(0, 4);
    const dataIdBytesReversed = [...dataIdBytesDecoded].reverse();
    const dataId = dataIdBytesReversed.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
    const dataIdConfig = this.DATA_ID_MAP[dataId] || { name: '未知参数', unit: '', scale: 1 };

  // 步骤4：提取数据（数据标识后所有字节），BCD格式逐位减33H + 十进制拼接
    const valueBytes = decodedBytes.slice(4);
    console.log('数据域字节（整体减33H后）：', valueBytes.reverse());
    let v1=valueBytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
    // let v2=v1.split('').map(b => parseInt(b, 16)).reverse();
    console.log('2数据域字节（逐位减33H后）：', v1);
    const rawValue = parseInt(v1);    // 单位换算（保留原有scale逻辑）
    const value = parseInt(v1) * dataIdConfig.scale;

    return {
      dataId,
      name: dataIdConfig.name,
      rawValue,
      value,
      unit: dataIdConfig.unit
    };
  }
};

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
   * 模256求和校验
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

  /**
   * 字节数组转带空格的十六进制字符串（强制大写）
   * @param bytes 字节数组
   * @returns 带空格的大写十六进制字符串
   */
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

  /**
   * 解析DL/T645-2007完整数据帧
   * @param frameBytes 完整帧字节数组（含帧头/帧尾，可传入Buffer或number[]）
   * @returns 解析结果（含地址、控制码、参数、CRC校验结果）
   */
  /**
 * 解析DL/T645-2007完整数据帧（终版修复）
 * @param frameBytes 完整帧字节数组（含帧头/帧尾，可传入Buffer或number[]）
 * @returns 解析结果（含地址、控制码、参数、CRC校验结果）
 */
/**
 * 解析DL/T645-2007完整数据帧
 * @param frameBytes 完整帧字节数组（含帧头/帧尾，可传入Buffer或number[]）
 * @returns 解析结果（含地址、控制码、参数、CRC校验结果）
 */
static parseFrame(frameBytes: Buffer | number[]): ParseResult { // 注意返回类型修正为ParseResult
  // 统一转换为number[]（兼容Buffer输入）
  const bytes = Array.isArray(frameBytes) ? frameBytes : Array.from(frameBytes);
  
  // 1. 基础帧结构校验
  if (bytes.length < 14) { // 最小帧长度：68 + 6地址 + 68 + 控制码 + 长度 + 数据 + 校验 + 16
    throw new Error('帧长度过短，不符合DL/T645-2007格式');
  }
  if (bytes[0] !== this.FRAME_START || bytes[7] !== this.FRAME_START) {
    throw new Error('帧起始符错误，必须以68开头且地址后紧跟68');
  }
  if (bytes[bytes.length - 1] !== this.FRAME_END) {
    throw new Error('帧结束符错误，必须以16结尾');
  }

  // 2. 提取核心字段
  const reversedAddressBytes = bytes.slice(1, 7); // 反转后的地址（6字节）
  const controlCode = bytes[8]; // 控制码（第9字节）
  const dataLen = bytes[9]; // 数据域长度（第10字节）
  const dataFieldBytes = bytes.slice(10, 10 + dataLen); // 原始数据域字节
  const checksum = bytes[10 + dataLen]; // 校验码
  const meterAddress = this.restoreAddress(reversedAddressBytes); // 恢复原始地址
  console.log('原始数据域字节：', dataFieldBytes);
  
  // 3. 校验码验证（模256求和）
  const checkSource = bytes.slice(0, 10 + dataLen); // 校验范围：从第一个68到数据域结束
  const calculatedChecksum = this.calculateSumCheck(checkSource);
  const isCrcValid = calculatedChecksum === checksum;

  // 4. 解析控制码名称（修复：兼容应答位0x80）
  let controlCodeName = '未知控制码';
  const originalControlCode = controlCode & 0x7F; // 去掉应答位0x80
  switch (originalControlCode) {
    case DL645_2007_ControlCode.READ_SINGLE:
      controlCodeName = '读单个数据';
      break;
    case DL645_2007_ControlCode.READ_BATCH:
      controlCodeName = '批量读数据';
      break;
    case DL645_2007_ControlCode.CONTROL:
      controlCodeName = '控制命令';
      break;
  }

  // 5. 解析数据域（删除错误的parseDL645DataFieldFromHex调用，恢复正确逻辑）
  const parameters: ParameterResult[] = [];
  if (dataLen > 0) {
    try {
      const dataFieldResult = DL645_2007_DATA.parseDataField(controlCode, dataFieldBytes);
      parameters.push(dataFieldResult);
    } catch (e) {
      console.warn('数据域解析失败：', (e as Error).message);
      parameters.push({
        name: '解析失败',
        rawValue: '',
        value: '',
        unit: '',
        dataId: ''
      });
    }
  }

  // 6. 返回解析结果（恢复正确返回逻辑）
  return {
    meterAddress: meterAddress,
    controlCode: controlCode.toString(16).padStart(2, '0').toUpperCase(),
    controlCodeName: controlCodeName,
    parameters: parameters,
    isCrcValid: isCrcValid
  };
}  }


// 类型定义
// export type DataId = keyof typeof DATA_CONFIG.DATA_ID_MAP;
export interface DL645ParseResult {
  dataId: string;        // 8位数据标识（十六进制）
  dataIdName: string;    // 数据标识名称
  rawBytes: number[];    // 原始输入字节（未减33H）
  decodedBytes: number[];// 减33H后的字节
  reversedBytes: number[];// 反转后的字节（核心）
  rawValue: number;      // 反转后原始数值（十进制）
  actualValue: number;   // 换算后实际值
  unit: string;          // 单位
  scale: number;         // 换算比例
}

/**
 * 单个字节减33H（处理负数溢出）
 * @param byte 原始字节
 * @returns 偏移后字节
 */
// // function decodeByte(byte: number): number {
// //   const decoded = byte - DATA_CONFIG.DATA_OFFSET;
  
// //   return decoded < 0 ? decoded + 256 : decoded;
// }


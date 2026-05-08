/*
 * @Description: DL/T645-2007 多功能电能表通信规约 TypeScript 完整实现
 * @Autor: hongjy
 * @Date: 2026-02-13 14:30:33
 * @LastEditors: name
 * @LastEditTime: 2026-05-08 14:56:11
 */
import * as dayjs from 'dayjs';
import type { Dayjs } from 'dayjs'

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

  // TOTAL_ACTIVE_POWER = '02040000',   // 总有功功率
  COMBINED_ACTIVE_TOTAL_ENERGY = '00000000', // 组合有功总电能
  COMBINED_ACTIVE_ENERGY_DATA_BLOCK = '0000FF00', // 组合有功总能耗数据块

  //正向有功多费率数据块（分时电量核心标识）
  // FORWARD_ACTIVE_MULTI_RATE = '00020000', // 正向有功多费率数据块（总+尖峰平谷）
  FORWARD_ACTIVE_TOTAL_ENERGY = '00010000',  // 正向有功总电能
  FORWARD_ACTIVE_PEAK = '00010100',       // 正向有功峰段电量
  FORWARD_ACTIVE_FLAT = '00010200',       // 正向有功平段电量
  FORWARD_ACTIVE_VALLEY = '00010300',     // 正向有功谷段电量
  FORWARD_ACTIVE_SUPER_PEAK = '00010400', // 正向有功尖段电量（超尖峰）
  FORWARD_ACTIVE_ENERGY_DATA_BLOCK = '0001FF00', // 正向有功总能耗数据块
 
  TIME_CALIBRATION = '00000000', // 时间校准专用数据标识
  
   // 控制命令
  CONTROL_OPEN = '1A00',         // 合闸
  CONTROL_CLOSE = '1C00',        // 拉闸
  CONTROL_POWER_KEEP = '3A00',   // 保电
  CONTROL_CANCEL_POWER_KEEP = '3B00', // 取消保电
}

// 控制码枚举
export enum DL645_2007_ControlCode {
  READ_SINGLE = 0x11,   // 读单个数据
  READ_BATCH = 0x12,    // 批量读数据
  // CONTROL = 0x13,    // 控制
  BROADCAST_WRITE = 0x14, // 广播写数据（校时专用）
  CONTROL = 0x1C        // 控制命令
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

/**
 * DLT645-2007 远程开合闸 返回帧解析
 * 输入：十六进制字符串 或 数字数组
 * 输出：解析结果（操作类型、是否成功、电表地址、原始信息）
 */
export interface ControlResult {
  success: boolean;
  operation: '合闸' | '开闸' | '未知操作';
  address: string;         // 表号（正序）
  rawData: number[];       // 原始数据域（4字节）
  // realData: number[];      // 减 0x33 后的真实数据
  isValidFrame: boolean;   // 是否是合法的控制应答帧
  message: string;         // 说明文字
}

// 控制命令应答状态枚举
export enum ControlStatus {
  SUCCESS = '执行成功',
  FAILED = '执行失败',
  INVALID_PASSWORD = '密码错误',
  INVALID_CMD = '无效命令',
  ACCESS_DENIED = '权限不足',
  UNKNOWN = '未知状态'
}

// 扩展控制命令解析结果类型
export interface ControlParseResult extends ParseResult {
  controlStatus: ControlStatus; // 控制命令执行状态
  controlCmdType: string; // 控制命令类型（合闸/拉闸/保电/取消保电）
}

// 扩展DL645_2007类的静态方法
// export class DL645_2007_Control_Extension {
//   // 控制命令码映射（反向解析用）
// }
/**
 * DL/T645-2007 核心实现类（模256求和校验，无硬编码）
 */
export class DL645_2007 {
  static readonly DATA_ID_MAP = {
    '00000000': { name: '组合总有功电能', unit: 'kWh', scale: 0.01 },

    '02010100': { name: 'A相电压', unit: 'V', scale: 0.1 },
    '02010200': { name: 'B相电压', unit: 'V', scale: 0.1 },
    '02010300': { name: 'C相电压', unit: 'V', scale: 0.1 },

    '02020100': { name: 'A相电流', unit: 'A', scale: 0.001 },
    '02020200': { name: 'B相电流', unit: 'A', scale: 0.001 },
    '02020300': { name: 'C相电流', unit: 'A', scale: 0.001 },

    '02030100': { name: 'A相有功功率', unit: 'kW', scale: 0.01 },
    '02030200': { name: 'B相有功功率', unit: 'kW', scale: 0.01 },
    '02030300': { name: 'C相有功功率', unit: 'kW', scale: 0.01 },
    // '00010000': { name: '总有功功率', unit: 'kW', scale: 0.01 },
    // '02040000': { name: '总有功功率', unit: 'kW', scale: 0.01 },

    // 分时电量配置
    '00010000': { name: '正向有功总电量', unit: 'kWh', scale: 0.01 },
    '00010100': { name: '正向有功峰段电量', unit: 'kWh', scale: 0.01 },
    '00010200': { name: '正向有功平段电量', unit: 'kWh', scale: 0.01 },
    '00010300': { name: '正向有功谷段电量', unit: 'kWh', scale: 0.01 },
    '00010400': { name: '正向有功尖段电量', unit: 'kWh', scale: 0.01 },
    '0001FF00': { name: '正向有功电量数据块', unit: 'kWh', scale: 0.01 }
  };

  static readonly CONTROL_CMD_MAP = {
    '1A00': { name: '拉闸', statusOffset: 0 },
    '1C00': { name: '合闸', statusOffset: 0 },
    '3A00': { name: '保电', statusOffset: 0 },
    '3B00': { name: '取消保电', statusOffset: 0 }
  };

  // 控制命令应答状态码映射（DL/T645-2007规约标准）
  static readonly CONTROL_STATUS_MAP = {
    0x00: ControlStatus.SUCCESS,
    0x01: ControlStatus.INVALID_PASSWORD,
    0x02: ControlStatus.ACCESS_DENIED,
    0x03: ControlStatus.INVALID_CMD,
    0xFF: ControlStatus.FAILED
  };

  // 帧起始符
  private static readonly FRAME_START = 0x68;
  // 帧结束符
  private static readonly FRAME_END = 0x16;
  // 485通信前置帧头（固定大写）
  public static readonly FRAME_HEADER = 'FEFEFEFE';
  // 数据域发送时的偏移值（每位加33/0x33）
  private static readonly DATA_OFFSET = 0x33;
  // 扩展控制相关常量
  private static readonly OPERATOR_CODE = '00000000';

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
    // let sum = 0;
    // for (const byte of bytes) {
    //   sum += byte;
    //   // 实时取模避免数值过大（等价于最终sum % 256）
    //   sum = sum % 256;
    // }
    // return sum & 0xff;
    return bytes.reduce((acc, byte) => (acc + byte) % 256, 0) & 0xff;
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
      // const byte = parseInt(dataId.substr(i, 2), 16);
      // console.log("dataIdToRawBytes:",byte,i,dataId.substr(i, 2));
      rawBytes.push(parseInt(dataId.substr(i, 2), 16));

      // if (byte > 0x100) {
      //   rawBytes.push(byte -0x100);
      // } else {
      // rawBytes.push(byte);
      // }
    }
    console.log("dataIdToRawBytes:",rawBytes,rawBytes.reverse().toString());
    return rawBytes.map(byte => (byte + this.DATA_OFFSET) & 0xff)
    // return rawBytes;
    // return rawBytes.reverse();
  }

  /**
   * 组装读数据请求报文（模256求和校验，无硬编码）
   * @param meterAddress 电表地址（12位十六进制字符串）
   * @param controlCode 控制码
   * @param dataId 数据标识
   * @returns 完整的报文字节数组
   */
  static buildReadCmd( meterAddress: string, controlCode: DL645_2007_ControlCode, dataId: DL645_2007_DataId): Buffer {
    // 1. 地址处理（仅反转）
    const reversedAddress = this.reverseAddress(meterAddress);
    // 2. 数据标识转原始字节数组（已反转）
    // const rawDataBytes = this.dataIdToRawBytes(dataId);
    // 3. 数据域每位加33（核心规则）
    // const sendDataBytes = rawDataBytes.map(byte => (byte + this.DATA_OFFSET) & 0xff);
    const sendDataBytes =  this.dataIdToRawBytes(dataId);

    console.log("sendDataBytes:",sendDataBytes);
    // for (let i = 0; i < rawDataBytes.length; i++) {
    //   console.log("sendDataBytes:",sendDataBytes[i]+this.DATA_OFFSET & 0xff,"sendDataBytes[i]+this.DATA_OFFSET & 0xff");
    // }

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

    const coreHex = this.bytesToHexString(frame);
    const fullHex = this.FRAME_HEADER + coreHex;
    const sendBuffer = Buffer.from(fullHex, 'hex');
    console.log("buildReadCmd:"+fullHex);
    // return frame;
    return sendBuffer;
  }

  /**
 * 读取分时电量（正向有功多费率数据）
 * @param meterAddress 电表地址（12位十六进制字符串）
 * @param rateType 费率类型（尖/平/谷/峰/总，默认读取总多费率数据）
 * @returns 完整的读命令Buffer（含485帧头）
 */
static buildReadMultiRateCmd(
  meterAddress: string,
  rateType: 'peak' | 'flat' | 'valley' | 'superPeak' | 'total' = 'total'
): Buffer {
  // 映射费率类型到数据标识
  const rateDataIdMap: Record<string, DL645_2007_DataId> = {
    total: DL645_2007_DataId.FORWARD_ACTIVE_TOTAL_ENERGY,
    peak: DL645_2007_DataId.FORWARD_ACTIVE_PEAK,
    flat: DL645_2007_DataId.FORWARD_ACTIVE_FLAT,
    valley: DL645_2007_DataId.FORWARD_ACTIVE_VALLEY,
    superPeak: DL645_2007_DataId.FORWARD_ACTIVE_SUPER_PEAK,
    data_block: DL645_2007_DataId.FORWARD_ACTIVE_ENERGY_DATA_BLOCK
  };
  // 映射到目标数据标识
  const targetDataId = rateDataIdMap[rateType];
  // 复用原有读命令构建逻辑
  return this.buildReadCmd(
    meterAddress,
    DL645_2007_ControlCode.READ_SINGLE,
    targetDataId
  );
}

/**
 * 批量读取所有分时电量（尖+平+谷+峰+总）
 * @param meterAddress 电表地址
 * @returns 批量读命令数组（按尖、平、谷、峰、总顺序）
 */
static buildBatchReadMultiRateCmds(meterAddress: string): Buffer[] {
  const rateTypes = ['peak', 'flat', 'valley', 'superPeak', 'total'] as const;
  return rateTypes.map(type => this.buildReadMultiRateCmd(meterAddress, type));
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
  // static getFullCommandString(
  //   meterAddress: string,
  //   controlCode: DL645_2007_ControlCode,
  //   dataId: DL645_2007_DataId
  // ): string {
  //   const commandBytes = this.buildReadRequest(meterAddress, controlCode, dataId);
  //   const coreCmd = this.bytesToHexString(commandBytes);
  //   return (this.FRAME_HEADER + coreCmd).toUpperCase();
  // }

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
   * 数据域字节还原（减33H）
   * @param dataBytes 接收的原始数据域字节数组
   * @returns 还原后的字节数组
   */
  static decodeDataBytes(dataBytes: number[]): number[] {
    return dataBytes.map(byte => {
      const decoded = byte - this.DATA_OFFSET;
      return decoded < 0 ? decoded + 256 : decoded;
    });
  }

  /**
   * 数据域字节加密（加33H）
   * @param dataBytes 原始数据域字节数组
   * @returns 加密后的字节数组
   */
  static encodeDataBytes(dataBytes: number[]): number[] {
    return dataBytes.map(byte => (byte + this.DATA_OFFSET) % 256);
  }

  /**
   * 解析数据域
   * @param controlCode 控制码（用于判断数据域结构）
   * @param dataBytes 接收的原始数据域字节（未减33H）
   * @returns 解析结果
   */
  // static parseDataField(controlCode: number, dataBytes: number[]): void {
  static parseDataField(controlCode: number, dataBytes: number[]): ParameterResult {
    // 步骤1：还原数据域（减33H）
    const decodedBytes = this.decodeDataBytes(dataBytes);

    // 步骤2：按控制码判断数据域结构（读命令：数据标识(4字节)+数据(N字节)）
    const originalControlCode = controlCode & 0x7F; // 去掉应答位0x80
    if (originalControlCode !== DL645_2007_ControlCode.READ_SINGLE) { // 仅处理读单个数据命令
      throw new Error(`暂不支持控制码0x${controlCode.toString(16)}的数据域解析`);
    }

    // 步骤3：提取数据标识（前4字节）→ 反转字节序
    const dataIdBytesDecoded = decodedBytes.slice(0, 4);
    const dataIdBytesReversed = [...dataIdBytesDecoded].reverse();
    const dataId = dataIdBytesReversed.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
    const dataIdConfig = this.DATA_ID_MAP[dataId] || { name: '未知参数', unit: '', scale: 1 };

    // 步骤4：提取数据（数据标识后所有字节），16进制BCD格式转为十进制整数
    let k=0;
    if (dataId===DL645_2007_DataId.COMBINED_ACTIVE_ENERGY_DATA_BLOCK){
      k=3;
    }else {k=1;
    }
    console.log('k:', k,"dataId:",dataId);
    let result: ParameterResult= {dataId,name: dataIdConfig.name, rawValue: 0, value: 0, unit: dataIdConfig.unit};

    for (let i = 0; i < k; i++) { 
      // const valueBytes = decodedBytes.slice(4,8);
      const valueBytes = decodedBytes.slice(4+8*i,8*i+8);
      console.log('数据域字节：', valueBytes.reverse());
      let v1 = valueBytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
      console.log('数据域字节10进制BCD：', v1);
      const rawValue = parseInt(v1);
      const value = rawValue * dataIdConfig.scale;
      result = {
        dataId,
        name: dataIdConfig.name,
        rawValue,
        value,
        unit: dataIdConfig.unit
      };
      console.log('解析结果：', result);
    }
    // const valueBytes = decodedBytes.slice(4+i,4+i+4);
    // console.log('数据域字节（整体减33H后）：', valueBytes.reverse());
    // let v1 = valueBytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
    // console.log('数据域字节10进制BCD：', v1);
    // const rawValue = parseInt(v1);
    // const value = rawValue * dataIdConfig.scale;
    // const result: ParameterResult = {
    //   dataId,
    //   name: dataIdConfig.name,
    //   rawValue,
    //   value,
    //   unit: dataIdConfig.unit
    // };
    return result;
    // return {
    //   dataId,
    //   name: dataIdConfig.name,
    //   rawValue,
    //   value,
    //   unit: dataIdConfig.unit
    // };
  }

  /**
   * 解析DL/T645-2007完整数据帧
   * @param frameBytes 完整帧字节数组（含帧头/帧尾，可传入Buffer或number[]）
   * @returns 解析结果（含地址、控制码、参数、CRC校验结果）
   */
  static parseFrame(frameBytes: Buffer | number[]) {
    // 统一转换为number[]（兼容Buffer输入）
    const bytes = Array.isArray(frameBytes) ? frameBytes : Array.from(frameBytes);

    if (bytes[0] !== this.FRAME_START || bytes[7] !== this.FRAME_START) {
      throw new Error('帧起始符错误，必须以68开头且地址后紧跟68');
    }

    if (bytes[bytes.length - 1] !== this.FRAME_END) {
      throw new Error('帧结束符错误，必须以16结尾');
    }
    // 1. 基础帧结构校验
    if (bytes.length < 14) { // 最小帧长度：68 + 6地址 + 68 + 控制码 + 数据 + 校验 + 16
      // throw new Error('帧长度过短，不符合DL/T645-2007格式');
      const Result = this.parseControlReply(bytes);
      return { ...Result };
    }else{
      const Result = this.parseReadResponse(bytes);
      return { ...Result, isValid: true };
    }
  }

  static parseReadResponse(frameBytes: number[]): ParseResult {
    const bytes = frameBytes;
    const reversedAddressBytes = bytes.slice(1, 7); // 反转后的地址（6字节）
    const controlCode = bytes[8]; // 控制码（第9字节）
    const dataLen = bytes[9]; // 数据域长度（第10字节）
    console.log('数据域长度:', dataLen);
    const dataFieldBytes = bytes.slice(10, 10 + dataLen); // 原始数据域字节
    console.log('原始数据域字节：', dataFieldBytes.toString().toUpperCase());
    console.log('原始数据域字节：', dataFieldBytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(''));
    const checksum = bytes[10 + dataLen]; // 校验码
    const meterAddress = this.restoreAddress(reversedAddressBytes); // 恢复原始地址
    // console.log('原始数据域字节：', dataFieldBytes);

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
      // case DL645_2007_ControlCode.CONTROL:
      //   controlCodeName = '控制命令';
      //   break;
      // case DL645_2007_ControlCode.CONTROL:
      //   controlCodeName = '控制命令';
      //   break;
    }

    // 5. 解析数据域
    const parameters: ParameterResult[] = [];
    if (dataLen > 0) {
      try {
        const dataFieldResult = this.parseDataField(controlCode, dataFieldBytes);
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

    // 6. 返回解析结果
    return {
      meterAddress: meterAddress,
      controlCode: controlCode.toString(16).padStart(2, '0').toUpperCase(),
      controlCodeName: controlCodeName,
      parameters: parameters,
      isCrcValid: isCrcValid
    };
  }

  /**
   * 数据编码（加33H偏移）
   * @param data 待编码的16进制字符串
   * @param isReverse 是否反转Buffer
   * @returns 编码后的Buffer
   */
  private static encodeData(data: string, isReverse = false): Buffer {
    let dataBuf = Buffer.from(data, 'hex');
    dataBuf = Buffer.from(dataBuf.map(byte => (byte + this.DATA_OFFSET) % 256));
    // 需要反转则处理
    if (isReverse) {
      dataBuf = Buffer.from(dataBuf.reverse());
    }
    return dataBuf;
  }

    /**
   * 构建扩展控制命令的核心方法
   * @param meterAddress 电表地址
   * @param controlCode 控制码（16进制字符串）
   * @param dataBuf 数据Buffer
   * @returns 完整命令Buffer
   */
  private static dataToHex(meterAddress: string, controlCode: number, dataBuf: Buffer): Buffer {

    // let csBuf = Buffer.from([0x00]);
    const lBuf = Buffer.from([dataBuf.length]);
    const controlCodeBuf = Buffer.from([controlCode]);
    const frameStartBuf = Buffer.from([this.FRAME_START]);
    const reversedAddressBuf = Buffer.from(this.reverseAddress(meterAddress));

    const csDataBuf = Buffer.concat([
      frameStartBuf,                // 帧起始符 0x68
      reversedAddressBuf,           // 反转后的地址
      frameStartBuf,                // 第二个帧起始符 0x68
      controlCodeBuf,               // 控制码
      lBuf,                         // 数据长度
      dataBuf                       // 数据域
    ]);

    const checksum = this.calculateSumCheck(Array.from(csDataBuf));
    const csBuf = Buffer.from([checksum]);
    console.log("Frame_HEADER:",this.FRAME_HEADER);
    console.log("Frame_HEADER:",Buffer.from(this.FRAME_HEADER, 'hex').toString('hex'));

    return Buffer.concat([
      Buffer.from(this.FRAME_HEADER, 'hex'),  // 前置帧头 FE FE FE FE
      csDataBuf,     // 核心数据（68+地址+68+控制码+长度+数据）
      csBuf,         // 校验和
      Buffer.from([this.FRAME_END])   // 帧结束符 0x16
    ]);
  }

  /**
   * 构建扩展控制命令（合闸/拉闸/保电等）
   * @param address 电表地址
   * @param password 密码（16进制字符串）
   * @param cmdCode 命令码（16进制字符串，如'1C00'合闸/'1A00'拉闸）
   * @param effectiveTime 生效时间（可选，默认次日生效）
   * @returns 完整控制命令Buffer
   */
  static buildControlCmd( address: string, password: string, cmdCode: string, effectiveTime?: string  ): Buffer {
    // const controlCode = '1C';
    // 处理生效时间，默认次日生效
    const effTime = dayjs().add(1, 'day').format('ssmmHHDDMMYY');
    // const effTime = effectiveTime || dayjs().add(1, 'day').format('ssmmHHDDMMYY');

    // 构建数据Buffer
    // const dataBuf = Buffer.concat([
    //   this.encodeDataBytes(Buffer.from(password, 'hex')), // 密码
    //   this.encodeDataBytes(this.OPERATOR_CODE),
    //   this.encodeDataBytes(cmdCode),
    //   this.encodeDataBytes(effTime),
    // ]);

    const dataBuf = Buffer.concat([
      this.encodeData(password),
      this.encodeData(this.OPERATOR_CODE),
      this.encodeData(cmdCode),
      this.encodeData(effTime),
    ]);

    return this.dataToHex(address, DL645_2007_ControlCode.CONTROL, dataBuf);
  }

  /**
   * 合闸命令
   * @param address 电表地址
   * @param password 密码（16进制字符串）
   * @returns 合闸命令Buffer
   */
  static close(address: string, password: string): Buffer {
    return this.buildControlCmd(address, password, DL645_2007_DataId.CONTROL_CLOSE);
  }

  /**
   * 拉闸/开闸命令
   * @param address 电表地址
   * @param password 密码（16进制字符串）
   * @returns 拉闸命令Buffer
   */
  static open(address: string, password: string): Buffer {
    return this.buildControlCmd(address, password, DL645_2007_DataId.CONTROL_OPEN);
  }

  /**
   * 保电命令
   * @param address 电表地址
   * @param password 密码（16进制字符串）
   * @returns 保电命令Buffer
   */
  static keep(address: string, password: string): Buffer {
    return this.buildControlCmd(address, password, DL645_2007_DataId.CONTROL_POWER_KEEP);
  }

  /**
   * 取消保电命令
   * @param address 电表地址
   * @param password 密码（16进制字符串）
   * @returns 取消保电命令Buffer
   */
  static cancelKeep(address: string, password: string): Buffer {
    return this.buildControlCmd(address, password, DL645_2007_DataId.CONTROL_CANCEL_POWER_KEEP);
  }

  /**
   * 解析 DLT645-2007 开合闸应答
   * @param frameBytes 十六进制字符串（如 "68 12 34 56 78 90 12 68 91 04 XX XX XX XX XX 16"）
   */
  static parseControlReply(frameBytes: number[]): ControlResult {
    let bytes: number[];
    bytes = frameBytes;

    // 默认失败结果
    const defaultResult: ControlResult = {
      success: false,
      operation: '未知操作',
      address: '',
      rawData: [],
      // realData: [],
      isValidFrame: false,
      message: '无效帧'
    };

    // 3. 帧格式校验
    const start1 = bytes[0];
    const start2 = bytes[7];
    const controlCode = bytes[8]-0x80;
    const dataLen = bytes[9];
    const end = bytes[bytes.length - 1];
    // console.log(`start1:${dataLen}`);
    // console.log(`start1:${bytes.length} `);

    // ..defaultResult, message: '帧起始符/结束符错误' };


    if (start1 !== this.FRAME_START || start2 !== this.FRAME_START || end !== this.FRAME_END) {
      return { ...defaultResult, message: '帧起始符/结束符错误' };
    }

    if (controlCode !== DL645_2007_ControlCode.CONTROL) {
      return { ...defaultResult, message: `非控制应答：控制码=${controlCode.toString(16)}` };
    }

    // 4. 解析表地址（6字节，倒序）
    // const addressBytes = bytes.slice(1, 7).reverse();
    // const address = addressBytes.map(b => b.toString(16).padStart(2, '0')).join('');
    const address = this.restoreAddress(bytes.slice(1, 7));

    // 5. 数据域（4字节）
    const rawData = bytes.slice(9, 10);
    const realData = rawData.map(b => b - 0x33);
        // const rawData = bytes[9];
    // const realData = rawData.map(b => b - 0x33);
    // 6. CRC校验（最后2字节）
    // const crc = bytes.slice(9 + dataLen, 9 + dataLen + 2);
    // const crcCheck = crc16(bytes.slice(0, 9 + dataLen));
    // if (crcCheck !== crc[0] || crcCheck !== crc[1]) {
    //   return { ...defaultResult, message: 'CRC校验失败' };
    // }

    // 6. 判断操作与结果
    let operation: '合闸' | '开闸' | '未知操作' = '未知操作';
    let success = false;
    let message = '';
    console.log(`结果${rawData}`);
    // console.log(` 测试${realData}`);

    const op = rawData[0];
    if (op === 0x00) {
      success = true;
    } else {
      success = false;
    }

    operation = this.CONTROL_STATUS_MAP[op].toString();
    // message = success ? `${operation}成功` : `${operation}失败`;

    return {
      success,
      operation,
      address,
      rawData,
      isValidFrame: true,
      message
    };
  }

  /**
   * 时间转BCD码字节数组（YY MM DD HH mm ss）
   * @param time 待校准的时间（Dayjs对象，默认当前时间）
   * @returns 6字节BCD码数组
   */
  private static timeToBCDBytes(time: Dayjs = dayjs()): number[] {
    // 提取时间字段（年份取后两位）
    const yy = time.year() % 100;
    const mm = time.month() + 1; // dayjs月份从0开始
    const dd = time.date();
    const hh = time.hour();
    const mi = time.minute();
    const ss = time.second();

    // 转BCD码（如 26 → 0x26，12 → 0x12）
    const toBCD = (num: number) => {
      if (num < 0 || num > 99) throw new Error(`时间字段超出范围：${num}`);
      return Math.floor(num / 10) * 16 + (num % 10);
    };

    return [toBCD(yy), toBCD(mm), toBCD(dd), toBCD(hh), toBCD(mi), toBCD(ss)];
  }

  /**
   * 构建广播校准时间命令
   * @param targetTime 校准目标时间（可选，默认当前系统时间）
   * @returns 完整的广播校时报文字节Buffer（含485帧头）
   */
  static buildBroadcastTimeCalibrationCmd(address: string, targetTime?: Dayjs): Buffer {
    // 1. 固定广播地址处理
    const reversedAddress = this.reverseAddress(address);

    // 2. 时间转BCD码并加0x33偏移
    const timeBCD = this.timeToBCDBytes(targetTime);
    const encodedTime = this.encodeDataBytes(timeBCD);

    // 3. 构建校验范围字节数组
    const checkSource = [
      this.FRAME_START,          // 第一个帧起始符
      ...reversedAddress,        // 反转后的广播地址
      this.FRAME_START,          // 第二个帧起始符
      DL645_2007_ControlCode.BROADCAST_WRITE, // 广播写控制码
      encodedTime.length,        // 数据域长度（固定6字节）
      ...encodedTime             // 加偏移后的时间数据
    ];

    // 4. 计算模256求和校验值
    const checksum = this.calculateSumCheck(checkSource);

    // 5. 构建完整报文
    const frame = [
      ...checkSource,
      checksum,        // 校验码
      this.FRAME_END   // 帧结束符
    ];

    // 6. 拼接485前置帧头并返回Buffer
    const coreHex = this.bytesToHexString(frame);
    const fullHex = this.FRAME_HEADER + coreHex;
    return Buffer.from(fullHex, 'hex');
  }

  /**
   * 快捷方法：广播校准为当前系统时间
   * @returns 广播校时命令Buffer
   */
  static broadcastCalibrateCurrentTime(meterAddress: string, targetTime?: Dayjs): Buffer {
    return this.buildBroadcastTimeCalibrationCmd(meterAddress,targetTime);
  }

  /**
   * 验证时间BCD码合法性（可选，用于校验输入时间）
   * @param time 待验证时间
   * @returns 是否合法
   */
  static validateCalibrationTime(time: Dayjs): boolean {
    try {
      this.timeToBCDBytes(time);
      // 额外验证时间合理性（如月份1-12，日期1-31等）
      return time.isValid();
    } catch (e) {
      return false;
    }
  }

}

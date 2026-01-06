/*
 * @Description: DL/T 645-1997 多功能电能表通信规约解析器+命令生成器
 * 通用版：支持保电/取消保电解析+命令生成、ABC相有功功率、电表余额、基础电参数
 * 核心功能：帧校验、地址还原、保电状态解析、保电控制命令生成
 * 支持省略第二个68的帧结构，生成和实际一致的命令
 * @Autor: hongjy
 * @Date: 2025-12-23 17:08:37
 * @LastEditors: name
 * @LastEditTime: 2026-01-06 10:53:09
 */


/**
 * DL/T 645-1997 多功能电能表通信规约解析器+命令生成器
 * 通用版：支持保电/取消保电解析+命令生成、ABC相有功功率、电表余额、基础电参数
 * 核心功能：帧校验、地址还原、保电状态解析、保电控制命令生成
 * 支持省略第二个68的帧结构，生成和实际一致的命令
 */

// ====================== 通用常量定义 ======================
// DL645-1997 数据标识映射（新增保电/取消保电）
export const DL645DataId = {
  // 基础电能参数
  TOTAL_ACTIVE_ENERGY: '00000100', // 总有功电能(正向)
  REVERSE_ACTIVE_ENERGY: '00000200', // 总有功电能(反向)
  // 电压参数
  PHASE_A_VOLTAGE: '00010100', // A相电压
  PHASE_B_VOLTAGE: '00010200', // B相电压
  PHASE_C_VOLTAGE: '00010300', // C相电压
  // 电流参数
  PHASE_A_CURRENT: '00020100', // A相电流
  PHASE_B_CURRENT: '00020200', // B相电流
  PHASE_C_CURRENT: '00020300', // C相电流
  // 有功功率参数
  TOTAL_ACTIVE_POWER: '00030100', // 总有功功率
  PHASE_A_ACTIVE_POWER: '00030200', // A相有功功率
  PHASE_B_ACTIVE_POWER: '00030300', // B相有功功率
  PHASE_C_ACTIVE_POWER: '00030400', // C相有功功率
  // 电表余额
  METER_BALANCE: '00100100', // 电表剩余金额
  // 保电控制（DL645-1997扩展通用标识）
  POWER_PROTECT: '00110100', // 保电控制/状态查询
  SWITCH_CONTROL: '000F0100' // 开关控制（合闸/分闸）

};

// 开合闸指令枚举（适配DL645开关控制数据域）
export enum SwitchCommand {
  CLOSE = 0x01, // 合闸（通电）
  OPEN = 0x02,   // 分闸（断电）
  QUERY = 0x00   // 查询开关状态
}

// 保电指令枚举（DL645-1997扩展通用规则）
export enum PowerProtectCommand {
  QUERY = 0x00,    // 查询保电状态
  ENABLE = 0x01,   // 启用保电（保电）
  DISABLE = 0x02,  // 取消保电
}

// 保电状态枚举（解析结果映射）
export enum PowerProtectStatus {
  UNKNOWN = '未知状态',
  ENABLED = '保电中',
  DISABLED = '未保电',
}

// 数据标识配置（解析规则）
const dataIdConfig: Record<string, { 
  name: string; 
  unit: string; 
  factor: number; 
  bytes: number;
  isReversed: boolean;
  parseFn?: (rawValue: number) => string | number; // 自定义解析函数（如保电状态）
}> = {
  [DL645DataId.TOTAL_ACTIVE_ENERGY]: { 
    name: '总有功电能(正向)', unit: 'kWh', factor: 0.001, bytes: 4, isReversed: true 
  },
  [DL645DataId.REVERSE_ACTIVE_ENERGY]: { 
    name: '总有功电能(反向)', unit: 'kWh', factor: 0.001, bytes: 4, isReversed: true 
  },
  [DL645DataId.PHASE_A_VOLTAGE]: { 
    name: 'A相电压', unit: 'V', factor: 0.1, bytes: 2, isReversed: true 
  },
  [DL645DataId.PHASE_B_VOLTAGE]: { 
    name: 'B相电压', unit: 'V', factor: 0.1, bytes: 2, isReversed: true 
  },
  [DL645DataId.PHASE_C_VOLTAGE]: { 
    name: 'C相电压', unit: 'V', factor: 0.1, bytes: 2, isReversed: true 
  },
  [DL645DataId.PHASE_A_CURRENT]: { 
    name: 'A相电流', unit: 'A', factor: 0.001, bytes: 2, isReversed: true 
  },
  [DL645DataId.PHASE_B_CURRENT]: { 
    name: 'B相电流', unit: 'A', factor: 0.001, bytes: 2, isReversed: true 
  },
  [DL645DataId.PHASE_C_CURRENT]: { 
    name: 'C相电流', unit: 'A', factor: 0.001, bytes: 2, isReversed: true 
  },
  [DL645DataId.TOTAL_ACTIVE_POWER]: { 
    name: '总有功功率', unit: 'kW', factor: 0.1, bytes: 4, isReversed: true 
  },
  [DL645DataId.PHASE_A_ACTIVE_POWER]: { 
    name: 'A相有功功率', unit: 'kW', factor: 0.1, bytes: 4, isReversed: true 
  },
  [DL645DataId.PHASE_B_ACTIVE_POWER]: { 
    name: 'B相有功功率', unit: 'kW', factor: 0.1, bytes: 4, isReversed: true 
  },
  [DL645DataId.PHASE_C_ACTIVE_POWER]: { 
    name: 'C相有功功率', unit: 'kW', factor: 0.1, bytes: 4, isReversed: true 
  },
  [DL645DataId.METER_BALANCE]: { 
    name: '电表剩余金额', unit: '元', factor: 0.01, bytes: 4, isReversed: true 
  },
  // 新增：保电控制解析规则
  [DL645DataId.POWER_PROTECT]: { 
    name: '保电状态', 
    unit: '', 
    factor: 1, 
    bytes: 1, 
    isReversed: false,
    parseFn: (rawValue: number) => {
      switch (rawValue) {
        case 0x01: return PowerProtectStatus.ENABLED;
        case 0x02: return PowerProtectStatus.DISABLED;
        default: return PowerProtectStatus.UNKNOWN;
      }
    }
  },
};

// DL645-1997 控制码定义
export enum DL645ControlCode {
  READ_DATA = 0x01,        // 读数据（主站→电表）
  READ_DATA_RESP = 0x81,   // 读数据响应（电表→主站）
  WRITE_DATA = 0x02,       // 写数据（主站→电表，含保电/取消保电）
  WRITE_DATA_RESP = 0x82,  // 写数据响应（电表→主站）
}

// ====================== 类型定义 ======================
// 帧结构定义
export interface DL645Frame {
  start: number;        // 起始符 0x68
  address: string;      // 电表地址（12位16进制）
  controlCode: number;  // 控制码
  dataLen: number;      // 数据域长度
  dataField: Buffer;    // 数据域
  checksum: number;     // 校验码
  end: number;          // 结束符 0x16
}

// 解析结果定义
export interface DL645ParseResult {
  valid: boolean;
  error?: string;
  frame?: DL645Frame;
  data?: Record<string, {
    name: string;
    unit: string;
    value: number | string; // 支持数值/字符串（如保电状态）
    rawValue: number;
  }>;
}

// 命令生成结果定义
export interface DL645CommandResult {
  success: boolean;
  error?: string;
  commandHex?: string;       // 16进制命令（无空格）
  commandHexWithSpace?: string; // 16进制命令（带空格）
  frameBuffer?: Buffer;      // 原始Buffer
}

// ====================== 核心类实现 ======================
//协议核心，负责命令生成、帧解析
class DL645_1997_Core {
  /**
   * 单个字节反码（DL645-1997 地址/数据反码规则）
   * @param byte 原始字节
   * @returns 反码字节
   */

   private useSecondStartChar: boolean;
  /**
   * 构造函数
   * @param useSecondStartChar 是否使用第二个68起始符（默认false，适配你的电表）
   */
  constructor(useSecondStartChar: boolean = false) {
    this.useSecondStartChar = useSecondStartChar;
  }

  private reverseByte(byte: number): number {
    return 0xFF - byte;
  }

  /**
   * 电表地址处理（6字节，逆序+反码）
   * @param address 12位16进制地址字符串
   * @returns 处理后的Buffer | null
   */
  private processAddress(address: string): Buffer | null {
    if (!/^[0-9A-Fa-f]{12}$/.test(address)) {
      console.error('地址格式错误，必须是12位16进制字符串');
      return null;
    }

    const segments = address.match(/.{2}/g) || [];
    if (segments.length !== 6) return null;

    // 逆序 + 反码
const reversedSegments = segments.reverse();
    const addressBytes = reversedSegments.map(seg => {
      const byte = parseInt(seg, 16);
      return this.reverseByte(byte);
    });

    return Buffer.from(addressBytes);
  }

  /**
   * 电表地址还原（反码+逆序）
   * @param addressBytes 6字节地址Buffer（反码）
   * @returns 12位16进制地址字符串
   */
  private restoreAddress(addressBytes: Buffer): string {
    if (addressBytes.length !== 6) return '';

    const segments: string[] = [];
    for (let i = 0; i < 6; i++) {
      const restored = this.reverseByte(addressBytes[i]);
      segments.push(restored.toString(16).padStart(2, '0').toUpperCase());
    }
    return segments.reverse().join('');
  }

  /**
   * 计算校验码（地址+控制码+数据长度+数据域 异或）
   * @param addressBuffer 处理后的地址Buffer
   * @param controlCode 控制码
   * @param dataField 数据域Buffer
   * @returns 校验码
   */
  private calculateChecksum(
    addressBuffer: Buffer,
    controlCode: number,
    dataLen: number,
    dataField: Buffer
  ): number {
    let checksum = 0;
    addressBuffer.forEach(byte => checksum ^= byte);
    checksum ^= controlCode;
    checksum ^= dataLen;
    dataField.forEach(byte => checksum ^= byte);
    return checksum;
  }

  /**
   * 数据标识转Buffer
   * @param dataId 8位16进制数据标识
   * @returns Buffer | null
   */
  private dataIdToBuffer(dataId: string): Buffer | null {
    if (!/^[0-9A-Fa-f]{8}$/.test(dataId)) {
      console.error('数据标识格式错误，必须是8位16进制字符串');
      return null;
    }

    const segments = dataId.match(/.{2}/g) || [];
    if (segments.length !== 4) return null;

    return Buffer.from(segments.map(seg => parseInt(seg, 16)));
  }

  /**
   * 解析多字节数值
   * @param valueBytes 数值Buffer
   * @param isReversed 是否逆序
   * @returns 原始数值
   */
  private parseMultiByteValue(valueBytes: Buffer, isReversed: boolean): number {
    let value = 0;
    const bytes = isReversed ? [...valueBytes].reverse() : [...valueBytes];
    for (const byte of bytes) {
      value = (value << 8) + byte;
    }
    return value;
  }

  // ====================== 命令生成相关方法 ======================
  /**
   * 生成读数据命令（如查询保电状态）
   * @param meterAddress 电表地址（12位16进制）
   * @param dataId 数据标识
   * @returns 命令结果
   */
  buildReadCommand(
    meterAddress: string,
    dataId: string
  ): DL645CommandResult {
    const addressBuffer = this.processAddress(meterAddress);
    if (!addressBuffer) {
      return { success: false, error: '电表地址格式错误' };
    }

    const dataIdBuffer = this.dataIdToBuffer(dataId);
    if (!dataIdBuffer) {
      return { success: false, error: '数据标识格式错误' };
    }

    // 组装帧
    const frameParts = [
      Buffer.from([0x68]),
      addressBuffer,
      Buffer.from([DL645ControlCode.READ_DATA]),
      Buffer.from([dataIdBuffer.length]),
      dataIdBuffer
    ];
    const dataLen = dataIdBuffer.length;

    // 计算校验码
    const checksum = this.calculateChecksum(
      addressBuffer,
      DL645ControlCode.READ_DATA,
      dataLen,
      dataIdBuffer
    );
    frameParts.push(Buffer.from([checksum]));
    frameParts.push(Buffer.from([0x16]));

    // 格式化输出
    const frameBuffer = Buffer.concat(frameParts as Uint8Array[]);
    const commandHex = frameBuffer.toString('hex').toUpperCase();
    const commandHexWithSpace = commandHex.match(/.{2}/g)?.join(' ') || '';

    return {
      success: true,
      commandHex,
      commandHexWithSpace,
      frameBuffer
    };
  }


parse(frameBuffer: Buffer): DL645ParseResult {
    // 基础校验
    if (frameBuffer.length < 13) {
      return { valid: false, error: '帧长度不足（最小13字节）' };
    }

    // 校验起始/结束符
    const start = frameBuffer[0];
    const end = frameBuffer[frameBuffer.length - 1];
    if (start !== 0x68 || end !== 0x16) {
      return { valid: false, error: '起始/结束符错误' };
    }

    // 解析帧结构
    const addressBytes = frameBuffer.slice(1, 7);
    const controlCode = frameBuffer[7];
    const dataLen = frameBuffer[8];
    const dataField = frameBuffer.slice(9, 9 + dataLen);
    const checksum = frameBuffer[9 + dataLen];
    const expectedLen = 9 + dataLen + 1 + 1;

    // 校验帧长度
    if (frameBuffer.length !== expectedLen) {
      return { valid: false, error: `帧长度不匹配，预期${expectedLen}字节，实际${frameBuffer.length}字节` };
    }

    // 校验码验证
    const calculatedChecksum = this.calculateChecksum(
      addressBytes,
      controlCode,
      dataLen,
      dataField
    );
    if (calculatedChecksum !== checksum) {
      return { valid: false, error: `校验码错误，预期0x${calculatedChecksum.toString(16)}，实际0x${checksum.toString(16)}` };
    }

    // 还原地址 + 解析数据域
    const address = this.restoreAddress(addressBytes);
    const data = this.parseDataField(dataField);

    return {
      valid: true,
      frame: {
        start,
        address,
        controlCode,
        dataLen,
        dataField,
        checksum,
        end
      },
      data
    };
  }

  
  // ====================== 解析相关方法 ======================
  /**
   * 解析数据域
   * @param dataField 数据域Buffer
   * @returns 解析后的参数
   */
  private parseDataField(dataField: Buffer): Record<string, {
    name: string;
    unit: string;
    value: number | string;
    rawValue: number;
  }> {
    const result: Record<string, {
      name: string;
      unit: string;
      value: number | string;
      rawValue: number;
    }> = {};
    let offset = 0;

    while (offset + 4 <= dataField.length) {
      // 解析数据标识
      const dataIdBytes = dataField.slice(offset, offset + 4);
      const dataId = Array.from(dataIdBytes)
        .map(byte => byte.toString(16).padStart(2, '0').toUpperCase())
        .join('');
      offset += 4;

      // 匹配配置
      const config = dataIdConfig[dataId];
      if (!config) {
        // offset += config?.bytes || 0;
        continue;
      }

      // 校验字节长度
      if (offset + config.bytes > dataField.length) break;

      // 解析数值
      const valueBytes = dataField.slice(offset, offset + config.bytes);
      offset += config.bytes;
      const rawValue = this.parseMultiByteValue(valueBytes, config.isReversed);
      
      // 处理自定义解析（如保电状态）
      let finalValue: number | string = rawValue * config.factor;
      if (config.parseFn) {
        finalValue = config.parseFn(rawValue);
      } else {
        finalValue = parseFloat(finalValue.toFixed(3));
      }

      result[dataId] = {
        name: config.name,
        unit: config.unit,
        rawValue,
        value: finalValue
      };
    }

    return result;
  }

  /**
   * 解析DL645-1997帧
   * @param frameBuffer 原始帧Buffer
   * @returns 解析结果
   */
  
  /**
   * 生成保电/取消保电控制命令
   * @param meterAddress 电表地址（12位16进制）
   * @param cmd 保电指令（ENABLE/DISABLE/QUERY）
   * @returns 命令结果
   */
  buildPowerProtectCommand(
    meterAddress: string,
    cmd: PowerProtectCommand
  ): DL645CommandResult {
    const addressBuffer = this.processAddress(meterAddress);
    if (!addressBuffer) {
      return { success: false, error: '电表地址格式错误' };
    }

    // 数据标识Buffer
    const dataIdBuffer = this.dataIdToBuffer(DL645DataId.POWER_PROTECT);
    if (!dataIdBuffer) {
      return { success: false, error: '保电数据标识格式错误' };
    }

    // 数据域：数据标识(4字节) + 指令(1字节)
    const cmdBuffer = Buffer.from([cmd]);
    const dataField = Buffer.concat([dataIdBuffer as Uint8Array , cmdBuffer as Uint8Array]);

    // 组装帧
    const frameParts = [
      Buffer.from([0x68]),
      addressBuffer,
      Buffer.from([DL645ControlCode.WRITE_DATA]),
      Buffer.from([dataField.length]),
      dataField
    ];

    const dataLen = dataIdBuffer.length;
    // dataLen
    // 计算校验码
    const checksum = this.calculateChecksum(
      addressBuffer,
      DL645ControlCode.WRITE_DATA,
      dataLen,
      dataField
    );
    frameParts.push(Buffer.from([checksum]));
    frameParts.push(Buffer.from([0x16]));

    // 格式化输出
    const frameBuffer = Buffer.concat(frameParts as Uint8Array[]);
    const commandHex = frameBuffer.toString('hex').toUpperCase();
    const commandHexWithSpace = commandHex.match(/.{2}/g)?.join(' ') || '';

    return {
      success: true,
      commandHex,
      commandHexWithSpace,
      frameBuffer
    };
  }

  /**
   * 辅助方法：16进制字符串转Buffer
   * @param hexStr 16进制字符串
   * @returns Buffer
   */
  hexToBuffer(hexStr: string): Buffer {
    return Buffer.from(hexStr.replace(/\s+/g, ''), 'hex');
  }

  buildSwitchCommand(
    meterAddress: string,
    switchCmd: SwitchCommand
  ): DL645CommandResult {
    // 开关控制的数据域值：1字节（0x00=查询，0x01=合闸，0x02=分闸）
    const switchValueBuffer = Buffer.from([switchCmd]);
    // 调用写数据命令生成逻辑（开关控制数据标识+指令值）
    return this.buildWriteCommand(
      meterAddress,
      DL645DataId.SWITCH_CONTROL,
      switchValueBuffer
    );
  }

  /**
   * 生成写数据命令帧（通用，含开合闸）
   * @param meterAddress 电表地址（12位16进制）
   * @param dataId 数据标识（8位16进制）
   * @param writeValue 待写入的值（Buffer格式）
   * @param controlCode 控制码（默认0x02：写数据）
   * @returns 命令生成结果
   */
  buildWriteCommand(
    meterAddress: string,
    dataId: string,
    writeValue: Buffer,
    controlCode: number = DL645ControlCode.WRITE_DATA
  ): DL645CommandResult {
    // 1. 处理电表地址
    const addressBuffer = this.processAddress(meterAddress);
    if (!addressBuffer) {
      return {
        success: false,
        error: `电表地址格式错误，需12位16进制字符串，当前：${meterAddress}`
      };
    }

    // 2. 处理数据标识
    const dataIdBuffer = this.dataIdToBuffer(dataId);
    if (!dataIdBuffer) {
      return {
        success: false,
        error: `数据标识格式错误，需8位16进制字符串，当前：${dataId}`
      };
    }

    // 3. 组装数据域：数据标识(4字节) + 写入值(N字节)
    const dataField = Buffer.concat([dataIdBuffer as Uint8Array, writeValue as Uint8Array]);

    // 4. 组装命令帧
    const frameParts: Buffer[] = [];
    frameParts.push(Buffer.from([0x68])); // 起始符
    frameParts.push(addressBuffer); // 地址
    frameParts.push(Buffer.from([controlCode])); // 控制码
    frameParts.push(Buffer.from([dataField.length])); // 数据域长度
    frameParts.push(dataField); // 数据域（标识+值）
    const dataLen = dataIdBuffer.length;

    // 计算校验码
    const checksum = this.calculateChecksum(addressBuffer, controlCode,dataLen, dataField);
    frameParts.push(Buffer.from([checksum])); // 校验码
    frameParts.push(Buffer.from([0x16])); // 结束符

    // 5. 合并Buffer并转换格式
    const frameBuffer = Buffer.concat(frameParts as Uint8Array[]);
    const commandHex = frameBuffer.toString('hex').toUpperCase();
    const commandHexWithSpace = frameBuffer.toString('hex').toUpperCase().match(/.{2}/g)?.join(' ') || '';

    return {
      success: true,
      commandHex,
      commandHexWithSpace,
      frameBuffer
    };
  }


  /**
     * 生成广播命令帧（如广播校时）
     * @param controlCode 控制码
     * @param dataField 广播数据域
     * @returns 命令生成结果
     */
    buildBroadcastCommand(
      controlCode: number,
      dataField: Buffer = Buffer.alloc(0)
    ): DL645CommandResult {
      // 广播地址：6字节0xFF（反码后为0x00）
      const broadcastAddress = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  
      // 组装帧
      const frameParts: Buffer[] = [];
      frameParts.push(Buffer.from([0x68])); // 起始符
      frameParts.push(broadcastAddress); // 广播地址
      frameParts.push(Buffer.from([controlCode])); // 控制码
      frameParts.push(Buffer.from([dataField.length])); // 数据长度
      frameParts.push(dataField); // 数据域
      // const dataLen = dataIdBuffer.length;
      const dataLen = 0x00;

      // 计算校验码
      const checksum = this.calculateChecksum(broadcastAddress, controlCode, dataLen,dataField);
      frameParts.push(Buffer.from([checksum])); // 校验码
      frameParts.push(Buffer.from([0x16])); // 结束符
  
      const frameBuffer = Buffer.concat(frameParts as Uint8Array[]);
      const commandHex = frameBuffer.toString('hex').toUpperCase();
      const commandHexWithSpace = frameBuffer.toString('hex').toUpperCase().match(/.{2}/g)?.join(' ') || '';
  
      return {
        success: true,
        commandHex,
        commandHexWithSpace,
        frameBuffer
      };
    }
  
}


// ====================== 测试示例 ======================
if (require.main === module) {
  const dl645Core = new DL645_1997_Core();
  const testMeterAddress = '1234567890AB';

  // 示例1：生成启用保电命令
  const enableProtectCmd = dl645Core.buildPowerProtectCommand(
    testMeterAddress,
    PowerProtectCommand.ENABLE
  );
  console.log('=== 启用保电命令 ===');
  if (enableProtectCmd.success) {
    console.log('16进制（带空格）：', enableProtectCmd.commandHexWithSpace);
  }

  // 示例2：生成取消保电命令
  const disableProtectCmd = dl645Core.buildPowerProtectCommand(
    testMeterAddress,
    PowerProtectCommand.DISABLE
  );
  console.log('\n=== 取消保电命令 ===');
  if (disableProtectCmd.success) {
    console.log('16进制（带空格）：', disableProtectCmd.commandHexWithSpace);
  }

  // 示例3：生成查询保电状态命令
  const queryProtectCmd = dl645Core.buildReadCommand(
    testMeterAddress,
    DL645DataId.POWER_PROTECT
  );
  console.log('\n=== 查询保电状态命令 ===');
  if (queryProtectCmd.success) {
    console.log('16进制（带空格）：', queryProtectCmd.commandHexWithSpace);
  }

  // 示例4：解析保电状态返回帧
  // 测试帧：68 12 34 56 78 90 AB 81 01 00 11 01 00 01 94 16
  const protectStatusFrame = '681234567890AB810100110100019416';
  const frameBuffer = dl645Core.hexToBuffer(protectStatusFrame);
  const parseResult = dl645Core.parse(frameBuffer);
  console.log('\n=== 保电状态解析结果 ===');
  if (parseResult.valid) {
    console.log('保电状态：', parseResult.data?.[DL645DataId.POWER_PROTECT]?.value);
  }
}

export default DL645_1997_Core;
// export { PowerProtectCommand, PowerProtectStatus, DL645DataId, DL645ControlCode };
// export type { DL645CommandResult, DL645ParseResult };

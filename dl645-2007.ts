/**
 * DL/T 645-2007 多功能电能表通信规约
 * 命令生成 + 帧解析 + 数据域解析 + 批量读取
 */

export enum DL645_2007_ControlCode {
  READ_DATA = 0x01,        // 读数据
  READ_DATA_RESP = 0x81,   // 读数据响应
  WRITE_DATA = 0x02,       // 写数据
  WRITE_DATA_RESP = 0x82,  // 写数据响应
  BROADCAST = 0x08,        // 广播命令
  CONTROL = 0x0F,          // 控制命令（保电、开合闸等）
  READ_PARAM = 0x03,       // 读参数
  READ_PARAM_RESP = 0x83,  // 读参数响应
  WRITE_PARAM = 0x04,      // 写参数
  WRITE_PARAM_RESP = 0x84, // 写参数响应
}

/**
 * 常用数据标识（6字节，对应DL645-2007规约）
 */
export const DL645_2007_DataId = {
  TOTAL_ACTIVE_ENERGY: '0000010000FF', // 总有功电能(正向)
  TOTAL_ACTIVE_ENERGY_REV: '0000020000FF', // 总有功电能(反向)

  PHASE_A_VOLTAGE: '0001010000FF', // A相电压
  PHASE_B_VOLTAGE: '0001020000FF', // B相电压
  PHASE_C_VOLTAGE: '0001030000FF', // C相电压

  PHASE_A_CURRENT: '0002010000FF', // A相电流
  PHASE_B_CURRENT: '0002020000FF', // B相电流
  PHASE_C_CURRENT: '0002030000FF', // C相电流

  TOTAL_ACTIVE_POWER: '0003010000FF', // 总有功功率

  PHASE_A_ACTIVE_POWER: '0004010000FF', // A相有功功率
  PHASE_B_ACTIVE_POWER: '0004020000FF', // B相有功功率
  PHASE_C_ACTIVE_POWER: '0004030000FF', // C相有功功率

  PHASE_A_REACTIVE_POWER: '0005010000FF', // A相无功功率
  PHASE_B_REACTIVE_POWER: '0005020000FF', // B相无功功率
  PHASE_C_REACTIVE_POWER: '0005030000FF', // C相无功功率

  PHASE_A_APPARENT_POWER: '0006010000FF', // A相视在功率
  PHASE_B_APPARENT_POWER: '0006020000FF', // B相视在功率
  PHASE_C_APPARENT_POWER: '0006030000FF', // C相视在功率

  PHASE_A_POWER_FACTOR: '0007010000FF', // A相功率因数
  PHASE_B_POWER_FACTOR: '0007020000FF', // B相功率因数
  PHASE_C_POWER_FACTOR: '0007030000FF', // C相功率因数

  FREQUENCY: '0008010000FF', // 电网频率
};

// 数据标识解析配置
const dataIdConfig: Record<string, { name: string; unit: string; factor: number; bytes: number }> = {
  '0000010000FF': { name: '总有功电能(正向)', unit: 'kWh', factor: 0.001, bytes: 4 },
  '0000020000FF': { name: '总有功电能(反向)', unit: 'kWh', factor: 0.001, bytes: 4 },

  '0001010000FF': { name: 'A相电压', unit: 'V', factor: 0.1, bytes: 2 },
  '0001020000FF': { name: 'B相电压', unit: 'V', factor: 0.1, bytes: 2 },
  '0001030000FF': { name: 'C相电压', unit: 'V', factor: 0.1, bytes: 2 },

  '0002010000FF': { name: 'A相电流', unit: 'A', factor: 0.001, bytes: 2 },
  '0002020000FF': { name: 'B相电流', unit: 'A', factor: 0.001, bytes: 2 },
  '0002030000FF': { name: 'C相电流', unit: 'A', factor: 0.001, bytes: 2 },

  '0003010000FF': { name: '总有功功率', unit: 'kW', factor: 0.1, bytes: 4 },

  '0004010000FF': { name: 'A相有功功率', unit: 'kW', factor: 0.1, bytes: 4 },
  '0004020000FF': { name: 'B相有功功率', unit: 'kW', factor: 0.1, bytes: 4 },
  '0004030000FF': { name: 'C相有功功率', unit: 'kW', factor: 0.1, bytes: 4 },

  '0005010000FF': { name: 'A相无功功率', unit: 'kVar', factor: 0.1, bytes: 4 },
  '0005020000FF': { name: 'B相无功功率', unit: 'kVar', factor: 0.1, bytes: 4 },
  '0005030000FF': { name: 'C相无功功率', unit: 'kVar', factor: 0.1, bytes: 4 },

  '0006010000FF': { name: 'A相视在功率', unit: 'kVA', factor: 0.1, bytes: 4 },
  '0006020000FF': { name: 'B相视在功率', unit: 'kVA', factor: 0.1, bytes: 4 },
  '0006030000FF': { name: 'C相视在功率', unit: 'kVA', factor: 0.1, bytes: 4 },

  '0007010000FF': { name: 'A相功率因数', unit: '', factor: 0.001, bytes: 2 },
  '0007020000FF': { name: 'B相功率因数', unit: '', factor: 0.001, bytes: 2 },
  '0007030000FF': { name: 'C相功率因数', unit: '', factor: 0.001, bytes: 2 },

  '0008010000FF': { name: '电网频率', unit: 'Hz', factor: 0.01, bytes: 2 },
};

interface DL645_2007_CommandResult {
  success: boolean;
  error?: string;
  commandHex?: string;
  commandHexWithSpace?: string;
  frameBuffer?: Buffer;
}

interface DL645_2007_ParsedFrame {
  valid: boolean;
  error?: string;
  address?: string;
  controlCode?: number;
  dataField?: Buffer;
  checksum?: number;
  parsedData?: Record<string, { value: number; unit: string; name: string }>;
}

class DL645_2007 {
  private reverseByte(byte: number): number {
    return 0xFF - byte;
  }

  private processAddress(address: string): Buffer | null {
    if (!/^[0-9A-Fa-f]{12}$/.test(address)) return null;
    const parts = address.match(/.{2}/g) || [];
    if (parts.length !== 6) return null;
    return Buffer.from(parts.reverse().map(p => this.reverseByte(parseInt(p, 16))));
  }

  private restoreAddress(addrBytes: Buffer): string {
    const restored = Array.from(addrBytes).map(b => this.reverseByte(b));
    return restored.reverse().map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
  }

  private calculateChecksum(addrBuf: Buffer, controlCode: number, dataField: Buffer): number {
    let checksum = 0;
    addrBuf.forEach(b => checksum ^= b);
    checksum ^= controlCode;
    checksum ^= dataField.length;
    dataField.forEach(b => checksum ^= b);
    return checksum;
  }

  private dataIdToBuffer(dataId: string): Buffer | null {
    if (!/^[0-9A-Fa-f]{12}$/.test(dataId)) return null;
    const parts = dataId.match(/.{2}/g) || [];
    if (parts.length !== 6) return null;
    return Buffer.from(parts.map(p => parseInt(p, 16)));
  }

  /** 生成读数据命令 */
  buildReadCommand(meterAddress: string, dataId: string): DL645_2007_CommandResult {
    const addrBuf = this.processAddress(meterAddress);
    if (!addrBuf) return { success: false, error: "无效的电表地址" };

    const dataIdBuf = this.dataIdToBuffer(dataId);
    if (!dataIdBuf) return { success: false, error: "无效的数据标识" };

    const frameParts: Buffer[] = [];
    frameParts.push(Buffer.from([0x68])); // 起始符
    frameParts.push(addrBuf);             // 地址
    frameParts.push(Buffer.from([DL645_2007_ControlCode.READ_DATA])); // 控制码
    frameParts.push(Buffer.from([dataIdBuf.length])); // 数据长度
    frameParts.push(dataIdBuf);           // 数据域

    const checksum = this.calculateChecksum(addrBuf, DL645_2007_ControlCode.READ_DATA, dataIdBuf);
    frameParts.push(Buffer.from([checksum])); // 校验码
    frameParts.push(Buffer.from([0x16])); // 结束符

    const frameBuffer = Buffer.concat(frameParts);
    const hex = frameBuffer.toString('hex').toUpperCase();
    return {
      success: true,
      commandHex: hex,
      commandHexWithSpace: hex.match(/.{2}/g)?.join(' ') || '',
      frameBuffer
    };
  }

  /** 生成批量读取命令 */
  buildMultiReadCommand(meterAddress: string, dataIds: string[]): DL645_2007_CommandResult {
    const addrBuf = this.processAddress(meterAddress);
    if (!addrBuf) return { success: false, error: "无效的电表地址" };

    const dataBuffers: Buffer[] = [];
    for (const id of dataIds) {
      const buf = this.dataIdToBuffer(id);
      if (!buf) return { success: false, error: `无效的数据标识: ${id}` };
      dataBuffers.push(buf);
    }

    const dataField = Buffer.concat(dataBuffers);

    const frameParts: Buffer[] = [];
    frameParts.push(Buffer.from([0x68])); // 起始符
    frameParts.push(addrBuf);             // 地址
    frameParts.push(Buffer.from([DL645_2007_ControlCode.READ_DATA])); // 控制码
    frameParts.push(Buffer.from([dataField.length])); // 数据长度
    frameParts.push(dataField);           // 数据域

    const checksum = this.calculateChecksum(addrBuf, DL645_2007_ControlCode.READ_DATA, dataField);
    frameParts.push(Buffer.from([checksum])); // 校验码
    frameParts.push(Buffer.from([0x16])); // 结束符

    const frameBuffer = Buffer.concat(frameParts);
    const hex = frameBuffer.toString('hex').toUpperCase();
    return {
      success: true,
      commandHex: hex,
      commandHexWithSpace: hex.match(/.{2}/g)?.join(' ') || '',
      frameBuffer
    };
  }

  /** 生成广播命令 */
  buildBroadcastCommand(controlCode: number, dataField: Buffer = Buffer.alloc(0)): DL645_2007_CommandResult {
    const addrBuf = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00]); // 广播地址
    const frameParts: Buffer[] = [];
    frameParts.push(Buffer.from([0x68]));
    frameParts.push(addrBuf);
    frameParts.push(Buffer.from([controlCode]));
    frameParts.push(Buffer.from([dataField.length]));
    frameParts.push(dataField);

    const checksum = this.calculateChecksum(addrBuf, controlCode, dataField);
    frameParts.push(Buffer.from([checksum]));
    frameParts.push(Buffer.from([0x16]));

    const frameBuffer = Buffer.concat(frameParts);
    const hex = frameBuffer.toString('hex').toUpperCase();
    return {
      success: true,
      commandHex: hex,
      commandHexWithSpace: hex.match(/.{2}/g)?.join(' ') || '',
      frameBuffer
    };
  }

  /** 生成保电控制命令 */
  buildPowerGuardCommand(meterAddress: string, enable: boolean): DL645_2007_CommandResult {
    const addrBuf = this.processAddress(meterAddress);
    if (!addrBuf) return { success: false, error: "无效的电表地址" };

    const dataField = Buffer.from([enable ? 0x01 : 0x00]);
    const frameParts: Buffer[] = [];
    frameParts.push(Buffer.from([0x68]));
    frameParts.push(addrBuf);
    frameParts.push(Buffer.from([DL645_2007_ControlCode.CONTROL]));
    frameParts.push(Buffer.from([dataField.length]));
    frameParts.push(dataField);

    const checksum = this.calculateChecksum(addrBuf, DL645_2007_ControlCode.CONTROL, dataField);
    frameParts.push(Buffer.from([checksum]));
    frameParts.push(Buffer.from([0x16]));

    const frameBuffer = Buffer.concat(frameParts);
    const hex = frameBuffer.toString('hex').toUpperCase();
    return {
      success: true,
      commandHex: hex,
      commandHexWithSpace: hex.match(/.{2}/g)?.join(' ') || '',
      frameBuffer
    };
  }

  /** 生成开合闸控制命令 */
  buildSwitchCommand(meterAddress: string, close: boolean): DL645_2007_CommandResult {
    const addrBuf = this.processAddress(meterAddress);
    if (!addrBuf) return { success: false, error: "无效的电表地址" };

    const dataField = Buffer.from([close ? 0x01 : 0x00]);
    const frameParts: Buffer[] = [];
    frameParts.push(Buffer.from([0x68]));
    frameParts.push(addrBuf);
    frameParts.push(Buffer.from([DL645_2007_ControlCode.CONTROL]));
    frameParts.push(Buffer.from([dataField.length]));
    frameParts.push(dataField);

    const checksum = this.calculateChecksum(addrBuf, DL645_2007_ControlCode.CONTROL, dataField);
    frameParts.push(Buffer.from([checksum]));
    frameParts.push(Buffer.from([0x16]));

    const frameBuffer = Buffer.concat(frameParts);
    const hex = frameBuffer.toString('hex').toUpperCase();
    return {
      success: true,
      commandHex: hex,
      commandHexWithSpace: hex.match(/.{2}/g)?.join(' ') || '',
      frameBuffer
    };
  }

  /** 解析数据域 */
  private parseDataField(dataField: Buffer): Record<string, { value: number; unit: string; name: string }> {
    const result: Record<string, { value: number; unit: string; name: string }> = {};
    let offset = 0;
    while (offset + 6 <= dataField.length) {
      const idBytes = dataField.slice(offset, offset + 6);
      const dataId = Array.from(idBytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
      offset += 6;

      const config = dataIdConfig[dataId];
      if (!config) {
        offset += config?.bytes || 0;
        continue;
      }

      const valueBytes = dataField.slice(offset, offset + config.bytes);
      offset += config.bytes;

      let value = 0;
      for (let i = valueBytes.length - 1; i >= 0; i--) {
        value = (value << 8) + valueBytes[i];
      }
      value *= config.factor;

      result[dataId] = {
        name: config.name,
        unit: config.unit,
        value: parseFloat(value.toFixed(3))
      };
    }
    return result;
  }

  /** 解析返回帧 */
  parseFrame(frameBuffer: Buffer): DL645_2007_ParsedFrame {
    if (frameBuffer.length < 14) return { valid: false, error: "帧长度不足" };
    if (frameBuffer[0] !== 0x68 || frameBuffer[frameBuffer.length - 1] !== 0x16) {
      return { valid: false, error: "起始符或结束符错误" };
    }

    const addrBytes = frameBuffer.slice(1, 7);
    const controlCode = frameBuffer[7];
    const dataLen = frameBuffer[8];
    const dataField = frameBuffer.slice(9, 9 + dataLen);
    const checksum = frameBuffer[9 + dataLen];

    const expectedLen = 1 + 6 + 1 + 1 + dataLen + 1 + 1;
    if (frameBuffer.length !== expectedLen) {
      return { valid: false, error: `帧长度不匹配，预期${expectedLen}，实际${frameBuffer.length}` };
    }

    const calculatedChecksum = this.calculateChecksum(addrBytes, controlCode, dataField);
    if (calculatedChecksum !== checksum) {
      return { valid: false, error: `校验码错误，预期0x${calculatedChecksum.toString(16)}，实际0x${checksum.toString(16)}` };
    }

    return {
      valid: true,
      address: this.restoreAddress(addrBytes),
      controlCode,
      dataField,
      checksum,
      parsedData: this.parseDataField(dataField)
    };
  }
}

// 测试
if (require.main === module) {
  const dl645 = new DL645_2007();

  // 批量读取示例
  const cmd = dl645.buildMultiReadCommand(
    '1234567890AB',
    [
      DL645_2007_DataId.PHASE_A_VOLTAGE,
      DL645_2007_DataId.PHASE_A_CURRENT,
      DL645_2007_DataId.TOTAL_ACTIVE_POWER
    ]
  );
  console.log("批量读取命令:", cmd.commandHexWithSpace);

  // 模拟返回帧（假设电表返回了三个参数）
  const mockResponse = Buffer.from(
    '681234567890AB8120' +
    '0001010000FF0258' + // A相电压
    '0002010000FF00C8' + // A相电流
    '0003010000FF000003E8' + // 总有功功率
    '0016', // 校验码 + 结束符
    'hex'
  );
  const parsed = dl645.parseFrame(mockResponse);
  console.log("解析结果:", JSON.stringify(parsed, null, 2));
}

export default DL645_2007;
export type { DL645_2007_CommandResult, DL645_2007_ParsedFrame };
/*
 * @Description: 
 * @Autor: name
 * @Date: 2026-02-13 14:30:33
 * @LastEditors: name
 * @LastEditTime: 2026-02-13 15:06:30
 */
/**
 * DL/T645-2007 命令验证测试程序
 * 验证地址202411110002的电压/总电能命令是否匹配预期值
 */
import { DL645_2007, DL645_2007_ControlCode, DL645_2007_DataId } from './dl645-2007-14';

// 测试配置
const TEST_METER_ADDRESS = '202411110002'; 
// 真实命令常量（注意：原始预期命令包含前导fefefefe，为485通信的帧头，需单独处理）
const FRAME_HEADER = 'FEFEFEFE'; // 485通信前置帧头
const EXPECTED_COMMANDS = {
  A_VOLTAGE: '68020011112420681104333434351D16', // 剔除帧头后的A相电压命令
  B_VOLTAGE: '68020011112420681104333534351E16', // B相电压
  C_VOLTAGE: '68020011112420681104333634351F16', // C相电压
  TOTAL_ENERGY: '68020011112420681104333430357916' // 总电能
};

/**
 * 辅助函数：字节数组转无空格十六进制字符串（大写）
 */
function bytesToHexString(bytes: number[]): string {
  return bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
}

/**
 * 测试单个命令是否匹配预期值
 */
function testCommandMatch(
  dataId: DL645_2007_DataId,
  paramName: string,
  expectedHex: string
) {
  console.log(`\n=== 测试【${paramName}】命令 ===`);
  
  try {
    // 组装命令报文
    const commandBytes = DL645_2007.buildReadRequest(
      TEST_METER_ADDRESS,
      DL645_2007_ControlCode.READ_SINGLE,
      dataId
    );
    
    // 转换为十六进制字符串（与预期格式对齐）
    const actualHex = bytesToHexString(commandBytes);
    const fullActualHex = FRAME_HEADER + actualHex; // 拼接485帧头
    
    // 验证核心命令部分
    console.log(`预期命令（核心）: ${expectedHex}`);
    console.log(`实际命令（核心）: ${actualHex}`);
    console.log(`完整命令（含帧头）: ${fullActualHex}`);
    
    // 结果判断
    if (actualHex === expectedHex) {
      console.log(`✅ ${paramName}命令匹配成功`);
    } else {
      console.log(`❌ ${paramName}命令不匹配`);
      console.log(`   预期完整命令: ${FRAME_HEADER + expectedHex}`);
      console.log(`   实际完整命令: ${fullActualHex}`);
    }
  } catch (error) {
    console.error(`❌ ${paramName}命令生成失败: ${(error as Error).message}`);
  }
}

/**
 * 执行所有命令验证测试
 */
function runCommandTests() {
  console.log(`开始验证电表【${TEST_METER_ADDRESS}】的命令生成`);
  
  // 依次测试各命令
  testCommandMatch(
    DL645_2007_DataId.PHASE_A_VOLTAGE,
    'A相电压',
    EXPECTED_COMMANDS.A_VOLTAGE
  );
  
  testCommandMatch(
    DL645_2007_DataId.PHASE_B_VOLTAGE,
    'B相电压',
    EXPECTED_COMMANDS.B_VOLTAGE
  );
  
  testCommandMatch(
    DL645_2007_DataId.PHASE_C_VOLTAGE,
    'C相电压',
    EXPECTED_COMMANDS.C_VOLTAGE
  );
  
  testCommandMatch(
    DL645_2007_DataId.TOTAL_ACTIVE_ENERGY,
    '总电能',
    EXPECTED_COMMANDS.TOTAL_ENERGY
  );
  
  console.log('\n=== 所有命令验证完成 ===');
}

// 启动测试
runCommandTests();
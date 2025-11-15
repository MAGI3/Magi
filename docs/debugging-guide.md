# Magi 调试指南

本文档为 AI 辅助编程提供 Magi 项目的调试参考，包含日志配置、测试调试和常见问题排查。

## 日志系统架构

### 核心实现

Magi 使用 `electron-log` 库进行日志管理，核心配置文件位于 `packages/main/src/utils/logger.ts`。

**日志传输通道 (Transports):**
- **Console Transport**: 输出到控制台，适合开发和测试
- **File Transport**: 输出到文件，适合生产环境和长期调试

**日志级别 (按详细程度排序):**
1. `silly` - 最详细的调试信息
2. `debug` - 调试信息（包含 CDP 协议交互详情）
3. `verbose` - 详细信息
4. `info` - 一般信息
5. `warn` - 警告信息
6. `error` - 错误信息

### 环境变量配置

#### `LOG_LEVEL`
控制日志输出级别。

**用法:**
```bash
# 输出所有调试信息（推荐用于开发和测试）
export LOG_LEVEL=debug

# 仅输出重要信息（默认）
export LOG_LEVEL=info

# 输出所有信息（最详细）
export LOG_LEVEL=silly
```

**影响范围:**
- Console transport 的日志级别
- File transport 的日志级别（如果启用）

#### `DISABLE_FILE_LOG`
禁用文件日志输出，仅输出到控制台。

**用法:**
```bash
# 禁用文件日志（推荐用于测试环境）
export DISABLE_FILE_LOG=true

# 启用文件日志（默认，生产环境）
unset DISABLE_FILE_LOG
```

**效果:**
- `true`: 完全禁用文件日志，所有日志仅输出到控制台
- 未设置或其他值: 正常输出到文件

## Playwright 集成测试调试

### 测试架构

Magi 使用 Playwright 进行集成测试，测试配置文件：
- `playwright.config.ts` - Playwright 主配置
- `tests/global-setup.ts` - 全局启动脚本（启动 Electron 应用）
- `tests/global-teardown.ts` - 全局清理脚本（关闭 Electron 应用）

### 运行测试并查看所有调试日志

#### 方法 1: 使用配置好的 npm 脚本（推荐）

测试启动脚本已在 `tests/global-setup.ts` 中配置好环境变量：

```bash
# 运行所有集成测试
npx playwright test

# 运行特定测试文件
npx playwright test tests/integration/cdp.spec.ts

# 调试模式运行（带 Playwright Inspector）
npx playwright test --debug
```

**自动生效的配置:**
- `DISABLE_FILE_LOG=true` - 禁用文件日志
- `LOG_LEVEL=debug` - 输出所有调试信息

#### 方法 2: 临时覆盖环境变量

如果需要更详细的日志或自定义配置：

```bash
# 使用 silly 级别（最详细）
LOG_LEVEL=silly npx playwright test tests/integration/cdp.spec.ts

# 同时启用文件日志（用于保存测试日志）
DISABLE_FILE_LOG=false LOG_LEVEL=debug npx playwright test
```

### 控制台输出示例

正确配置后，控制台会显示类似如下的调试日志：

```
14:30:45.123 [debug] CDP message received: {"method":"Browser.getVersion","id":1}
14:30:45.125 [debug] Sending CDP message to browser 12345: {"method":"Browser.getVersion","id":1}
14:30:45.128 [info] Browser.getVersion requested, returning mock version
14:30:45.130 [debug] CDP response sent: {"id":1,"result":{"product":"Chrome/120.0.0.0"}}
```

## 开发调试技巧

### 1. CDP 协议调试

**关键日志源:**
- `packages/main/src/cdp/CdpGateway.ts` - CDP 网关日志
- `packages/main/src/cdp/CdpSessionManager.ts` - 会话管理日志
- `packages/main/src/fleet/ManagedBrowser.ts` - 浏览器管理日志

**调试步骤:**
```bash
# 1. 设置 debug 级别
export LOG_LEVEL=debug

# 2. 运行测试
npx playwright test tests/integration/cdp.spec.ts

# 3. 查看 CDP 消息交互日志
# 日志会显示完整的 CDP 消息内容
```

### 2. 浏览器实例调试

**日志关键字:**
- `BrowserFleetManager` - 浏览器舰队管理
- `ManagedBrowser` - 单个浏览器实例
- `ManagedPage` - 页面管理

**示例:**
```bash
# 查看浏览器创建和销毁流程
LOG_LEVEL=debug pnpm dev
```

### 3. 缩略图生成调试

**相关文件:**
- `packages/main/src/fleet/ThumbnailScheduler.ts`

**调试命令:**
```bash
# 启用 debug 日志查看缩略图生成详情
LOG_LEVEL=debug pnpm dev
```

## 常见问题排查

### 问题 1: 控制台看不到日志

**症状:** 运行测试时控制台没有任何日志输出

**排查步骤:**
1. 检查 `LOG_LEVEL` 是否设置正确
   ```bash
   echo $LOG_LEVEL  # 应该显示 debug 或 info
   ```

2. 检查日志代码是否使用正确的级别
   ```typescript
   // ❌ 错误：LOG_LEVEL=info 时不会显示
   logger.debug('Debug message');
   
   // ✅ 正确：LOG_LEVEL=info 及以上都会显示
   logger.info('Info message');
   ```

3. 验证环境变量是否传递到 Electron 进程
   ```typescript
   // 在 packages/main/src/utils/logger.ts 添加临时日志
   console.log('LOG_LEVEL:', process.env.LOG_LEVEL);
   console.log('DISABLE_FILE_LOG:', process.env.DISABLE_FILE_LOG);
   ```

### 问题 2: 日志仍然输出到文件

**症状:** 设置了 `DISABLE_FILE_LOG=true` 但仍在生成日志文件

**解决方案:**
1. 确认环境变量拼写正确（区分大小写）
2. 检查 `tests/global-setup.ts` 中的 env 配置：
   ```typescript
   env: { 
     ...process.env,
     DISABLE_FILE_LOG: 'true',  // 确保此行存在
     LOG_LEVEL: 'debug'
   }
   ```

3. 重启测试进程（环境变量在进程启动时读取）

### 问题 3: CDP 消息看不到详细内容

**症状:** 日志只显示 "CDP message received" 但看不到消息内容

**解决方案:**
1. 确保 `LOG_LEVEL=debug`（而不是 `info`）
2. 检查 `CdpGateway.ts` 中的日志代码：
   ```typescript
   logger.debug('CDP message received', {
     method: message.method,
     id: message.id,
     params: message.params  // 参数详情
   });
   ```

3. 如果日志被截断，可能需要调整 electron-log 的格式配置

### 问题 4: 测试环境和开发环境日志行为不一致

**原因:** 测试环境通过 `global-setup.ts` 设置环境变量，开发环境需要手动设置

**解决方案:**

**开发环境 (pnpm dev):**
```bash
# 方法 1: 临时设置
DISABLE_FILE_LOG=true LOG_LEVEL=debug pnpm dev

# 方法 2: 创建 .env 文件（需要添加 dotenv 支持）
echo "DISABLE_FILE_LOG=true" >> .env
echo "LOG_LEVEL=debug" >> .env
```

**测试环境 (自动配置):**
```bash
# 无需额外配置，直接运行
npx playwright test
```

## 生产环境日志配置

### 默认行为

未设置环境变量时（生产环境）：
- **Console**: `LOG_LEVEL=info`，输出 info 及以上级别
- **File**: 启用，最大 10MB，自动轮转

### 生产环境日志文件位置

```bash
# macOS
~/Library/Logs/Magi/main.log

# Windows
%USERPROFILE%\AppData\Roaming\Magi\logs\main.log

# Linux
~/.config/Magi/logs/main.log
```

### 生产环境调试建议

如需在生产环境调试，建议：
1. 临时启用 debug 级别文件日志：
   ```bash
   LOG_LEVEL=debug /path/to/Magi.app
   ```

2. 收集日志文件后分析
3. 完成调试后恢复默认设置

## 日志最佳实践

### 1. 使用合适的日志级别

```typescript
// ✅ 正确使用
logger.debug('CDP websocket connected', { url, browserId });  // 调试信息
logger.info('Browser launched successfully', { browserId });   // 重要事件
logger.warn('Page navigation timeout', { url, timeout });     // 警告
logger.error('Failed to launch browser', { error });          // 错误

// ❌ 避免
logger.info('Processing pixel at (123, 456)');  // 太详细，应该用 debug 或 silly
logger.error('Button clicked');                 // 不是错误，应该用 info 或 debug
```

### 2. 提供上下文信息

```typescript
// ✅ 好的日志
logger.debug('CDP message received', {
  method: message.method,
  browserId: this.browserId,
  timestamp: Date.now()
});

// ❌ 差的日志
logger.debug('Message received');  // 缺少上下文
```

### 3. 敏感信息处理

```typescript
// ✅ 正确处理敏感信息
logger.debug('User authenticated', {
  userId: user.id,
  // ❌ 不要记录密码: password: user.password
});
```

## AI 辅助编程建议

### 阅读日志时的关注点

1. **时间戳**: 了解事件发生顺序
2. **日志级别**: 区分问题严重程度
3. **上下文信息**: browserId, pageId, targetId 等关键标识符
4. **错误堆栈**: 定位问题源头

### 调试工作流

```
1. 设置环境变量
   ↓
2. 运行测试/启动应用
   ↓
3. 查看控制台日志
   ↓
4. 识别问题模式
   ↓
5. 修改代码
   ↓
6. 验证修复（重复步骤 2-4）
```

### 快速定位问题的技巧

```bash
# 使用 grep 过滤特定类型的日志
npx playwright test | grep -i error

# 查看特定组件的日志
npx playwright test | grep "CdpGateway"

# 保存日志用于分析
npx playwright test > debug.log 2>&1
```

## 总结

- ✅ 测试环境默认配置已优化，可直接运行查看所有调试日志
- ✅ 使用 `LOG_LEVEL` 和 `DISABLE_FILE_LOG` 控制日志行为
- ✅ Debug 级别日志包含完整的 CDP 协议交互细节
- ✅ 生产环境自动使用文件日志，避免控制台污染

如有其他调试需求，请参考本文档相关章节或查看源代码注释。

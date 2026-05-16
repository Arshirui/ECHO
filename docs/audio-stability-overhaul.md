# ECHO-Next 音频稳定性大修 — Implementation Prompt

> 这是一份**交给工程师 / Agent 执行**的工作说明书。读者收到这份文档应能不再追问、直接动手。
> 目标:把 Windows 上的"莫名其妙被占用 / 卡死 / 静音"从用户视角彻底压平。

---

## 角色与上下文

你是 ECHO-Next 音频引擎的资深工程师。ECHO-Next 是基于 **Electron + JUCE + WASAPI/ASIO** 的 Hi-Fi 音乐播放器:
- 主进程 TypeScript 负责状态机、采样率策略、降级编排
- 原生 C++ host (`echo-audio-host.exe`) 作为子进程,经 stdin PCM + stdout JSON 通信,真正驱动音频设备

### 代码地图

| 路径 | 职责 |
|------|------|
| `src/main/audio/AudioSession.ts` (~3400 行) | 状态机 + 降级编排 + watchdog |
| `src/main/audio/NativeOutputBridge.ts` | host 子进程生命周期 |
| `src/main/audio/DeviceService.ts` | 设备枚举 |
| `src/main/audio/AudioCore.test.ts` (~4700 行) | 主进程音频测试 |
| `native/audio-host/src/main.cpp` | host 主入口 + JUCE 输出 |
| `native/audio-host/src/wasapi_shared.cpp` | 原生 WASAPI shared 后端 |
| `native/audio-host/src/wasapi_exclusive.cpp` | 原生 WASAPI exclusive 后端 |
| `native/audio-host/src/asio_host.cpp` | ASIO 后端 |
| `src/main/integrations/smtc/` | Windows SMTC host bridge |
| `src/renderer/components/player/audioErrorFormat.ts` | 前端错误文案 |

### 触发本次大修的真实故障日志(必读)

```
[echo-audio-host] device->open(44100 Hz, 2 ch, buffer=8192) completed in 10 ms
[echo-audio-host] Open failed at 44100 Hz, buffer=8192: Couldn't open the output device!
[echo-audio-host] Backend Windows Audio (Low Latency Mode) failed for
  数字音频接口 (4- TEAC USB AUDIO DEVICE (Isoch))
[AudioSession] output start failed: ... -buffer 8192 ... mode="shared"; elapsedMs=522
[AudioSession] JUCE shared output failed on selected device; trying default shared
[AudioSession] safe shared fallback failed: ... exit_code_4294967295 ... elapsedMs=9271
[SMTC] Windows SMTC host exited unexpectedly code: 4294967295
```

根因(已分析):
1. **Low Latency Mode + buffer=8192 是矛盾配置** — JUCE verify 阶段必拒
2. **TEAC "Isoch" 端点被 TEAC USB 驱动 reserve** — WASAPI shared 拿不到
3. **`IAudioClient::Initialize` 同步 hang 9 秒**才被外部 watchdog 杀掉
4. **SMTC host 没有优雅退出**,被 TerminateProcess 顺手干掉

---

## 总体目标与红线

### 目标(怎样算"最稳定最舒服")

- **3 秒上限**:任何设备打开失败 → 3 秒内清洁失败 + 准确的用户可读原因
- **< 500ms 切换感**:设备被抢/被拔/默认设备切换 → 用户感知 < 500ms,无报错弹窗
- **0 矛盾配置**:不可能配置出 lowLatency + 8192 frames 这种组合传到 host
- **诚实兜底**:UI 上提供"重启音频引擎"(软)+"重启 Windows 音频服务"(硬,UAC)两个按钮

### 红线(不允许)

- 静默吞掉错误 — 任何 recoverable error 必须经过 `reportRecoverableAudioError`
- 改测试断言时不增加等量的新测试 — 测试覆盖只能升不能降
- 引入新的英文正则匹配错误 — 错误分类必须基于结构化 HRESULT 字段
- 改动 EQ / decoder / database 这些与音频输出链无关的模块

---

## P0 — 当前故障的直接修复

### Fix 1 · 阻止 lowLatency + 大 buffer 的矛盾组合

**改动位置:** `src/main/audio/AudioSession.ts` 中的 `createNativeOutputStartOptions`(全文 grep 函数名)

**做什么:**
- 在组装 startOptions 时检查:`latencyProfile === 'lowLatency'` 且 `bufferSizeFrames > 2048` 时,clamp 到 `undefined`(让 host 用设备 default)
- `logger` 输出 `[AudioSession] low-latency profile with buffer=N invalid; clamping to device default`
- `addPendingOutputWarning('low_latency_buffer_clamped')`
- 顺手做:若 `bufferSizeFrames` 不是 2 的幂 或 < 64,也 clamp 并 warning

**测试:** `AudioCore.test.ts` 新增 case — `lowLatency + 8192 → host args 不含 -buffer + outputWarnings 含 low_latency_buffer_clamped`

---

### Fix 2 · WASAPI Initialize / Start 调用加 3 秒超时

**改动位置:**
- `native/audio-host/src/wasapi_shared.cpp` 中 `wasapi_shared_start`
- `native/audio-host/src/wasapi_exclusive.cpp` 中 `wasapi_exclusive_start`

**做什么:**
- 把 `IAudioClient::Initialize()` 和 `IAudioClient::Start()` 包到 `std::async(std::launch::async, ...)`
- 主线程 `future.wait_for(std::chrono::seconds(3))`
- 超时则:
  - **不 join**(避免主线程也卡死),`future.~future()` 让它自行腐烂
  - 注意悬挂引用 — 传入 async 的指针必须是堆分配的 owned 数据,主线程不能在 timeout 后释放
  - 通过 `stderr` 输出 `[echo-audio-host] WASAPI Initialize timed out after 3000ms phase=initialize`
  - 进程以新退出码 `-3` 退出,代表 `device_initialize_timeout`
- 一次 `Activate` / `Initialize` / `Start` 链路总预算 3 秒,不是每段各 3 秒

**TS 侧联动:**
- `NativeOutputBridge.ts` 把 exit code `-3` 翻译成 `device_initialize_timeout`(参考已有 `-2 → exclusive_denied` 模式)
- `AudioSession.ts` 看到 `device_initialize_timeout` 不再重试同设备,直接 fallback 链下一档

**测试:** mock host 模拟 exit code -3 → 验证状态机不重试相同设备 + 走到正确 fallback

---

### Fix 3 · SMTC host 优雅退出

**改动位置:** `src/main/integrations/smtc/` 下的 host bridge(grep `echo-smtc-host` 找)

**做什么:**
- 仿照 `NativeOutputBridge.stopGracefully`:
  1. 发停止信号(stdin 写 `\x00\n` 或类似协议)
  2. `setTimeout(1000)` 等优雅退出
  3. 超时再 `proc.kill('SIGKILL')`
- 主进程退出时(`app.before-quit`)主动调一次

**测试:** `src/main/integrations/smtc/*.test.ts` 加 case(若无测试文件,创建)

---

## P1 — 根因预防(真正改变游戏)

### Fix 4 · 注册 IMMNotificationClient + IAudioSessionEvents

> 这是单点收益最大的改动。完成后用户感受的"莫名其妙"事件 70% 消失。

**改动位置:**
- 新建 `native/audio-host/src/wasapi_notifications.cpp/.h`
- `wasapi_shared.cpp` / `wasapi_exclusive.cpp` 启动时注册、退出时反注册
- `main.cpp` 增加 JSON event 输出路径

**做什么:**

**1. `class DeviceNotificationSink : public IMMNotificationClient`**
   - `OnDefaultDeviceChanged(flow, role, deviceId)` → 输出 `{"event":"default_device_changed","flow":"render","role":"console","deviceId":"..."}`
   - `OnDeviceStateChanged(deviceId, newState)` → `{"event":"device_state_changed","deviceId":"...","newState":N}`
   - `OnDeviceAdded` / `OnDeviceRemoved` → 同上
   - 注意:这些回调在 MMDevice API 线程,**不能在回调里做重活**,只能把消息塞 lock-free 队列 + SetEvent,让 main 线程取出来 fputs

**2. `class SessionNotificationSink : public IAudioSessionEvents`**
   - `OnSessionDisconnected(DisconnectReason)` → 把 reason 翻译成字符串:
     - `DisconnectReasonExclusiveModeOverride` → `"exclusive_mode_override"`
     - `DisconnectReasonDeviceRemoval` → `"device_removal"`
     - `DisconnectReasonServerShutdown` → `"server_shutdown"`
     - `DisconnectReasonFormatChanged` → `"format_changed"`
     - 其他对应
   - `OnStateChanged(state)` → debug 日志,不必上抛 stdout
   - 当前激活的 `IAudioClient::GetService(IID_PPV_ARGS(&IAudioSessionControl))` 拿到 session,然后 `RegisterAudioSessionNotification`
   - **特别注意** session events 的 callback 不能在 audio engine 线程 hang,否则会破坏 render

**3. 启动流程:**
   ```cpp
   enumerator->RegisterEndpointNotificationCallback(deviceSink);
   // ... 打开设备 ...
   audioClient->GetService(IID_PPV_ARGS(&sessionControl));
   sessionControl->RegisterAudioSessionNotification(sessionSink);
   ```
   退出前 `Unregister*` 后再释放对象。

**TS 侧联动:** `NativeOutputBridge.ts` 中 `handleStdoutLine` 增加新 event types 解析,emit `'device-event'`。`AudioSession.ts` 监听:
- `session_disconnected: exclusive_mode_override` → **立刻** fallback shared(跳过 watchdog),pendingOutputWarnings 加 `exclusive_yielded_to_other`,记录 `exclusiveYieldedToOther = true`(Fix 8 会用)
- `session_disconnected: device_removal` → 直接走 device-gone 路径,fallback 到默认设备
- `default_device_changed` 且当前用户没显式选设备 → 重启 host 切到新默认
- `device_state_changed: notPresent` 且就是当前设备 → fallback

**测试:** 单独写 `wasapi_notifications.test.ts`(C++ 端通过 mock 注入事件)+ AudioCore.test.ts 加 event-driven fallback 的覆盖

---

### Fix 5 · `AUDCLNT_E_DEVICE_INVALIDATED` 软恢复

**问题:** render 线程里 `GetBuffer` / `ReleaseBuffer` 失败直接 break + 退出整个进程,代价 1-2 秒。Roon 同样场景能在 200ms 内原地复活。

**改动位置:**
- `native/audio-host/src/wasapi_shared.cpp` render 循环(约 506-541 行)
- `native/audio-host/src/wasapi_exclusive.cpp` render 循环(约 572-595 行)

**做什么:**
- render 循环里检测 `hr == AUDCLNT_E_DEVICE_INVALIDATED`(共享)或独占等价错误
- 不立刻 break,改为调 `rebuild_audio_client(runtime)`:
  1. `Stop` + `Release` 当前 audioClient / renderClient
  2. 重新 `enumerate` 拿 default 或原 device ID 的新句柄
  3. `IsFormatSupported` → `Initialize` → `GetService` → `Start`(注意这条链也走 Fix 2 的超时!)
  4. 通过 stdout 发 `{"event":"device_rebuilt","durationMs":N,"reason":"device_invalidated"}`
  5. `continue` render 循环
- 失败上限 3 次(用 `runtime->rebuildAttempts` 计数),3 次都失败才 `renderFailed = 1; break;`
- 重建期间 callback 必须收到 silence(否则下游 PCM stream 会堆积),由 main thread 通过 telemetry 告知 TS 侧

**TS 侧:** `AudioSession.ts` 监听 `device_rebuilt` event → outputWarning `device_rebuilt_in_place`,不触发 watchdog recovery

---

### Fix 6 · 结构化 HRESULT 错误上抛,扔掉英文正则

**问题:** `AudioSession.ts:332-348` 的 `outputDeviceStartRefusedPatterns` / `asioUnavailablePatterns` 是英文正则匹配,JUCE 版本变化或 Windows 升级就废。

**改动位置:**
- `native/audio-host/src/main.cpp` 错误输出路径
- `native/audio-host/src/wasapi_*.cpp` 中 `set_error` 函数
- 新建 `src/main/audio/audioHostErrorClassifier.ts`
- 重构 `AudioSession.ts:isOutputDeviceStartRefused` / `isAsioDeviceUnavailableError`

**做什么:**

**1. C++ 端结构化输出:** 所有 error report 路径增加 JSON line:
```
{"phase":"open_exclusive","hresult":"0x88890004","hresultName":"AUDCLNT_E_DEVICE_IN_USE","message":"...","deviceId":"...","sampleRate":44100,"channels":2,"bufferFrames":8192}
```
这一行**先于** stderr 文本输出。

**2. TS 端 classifier:**
```ts
// src/main/audio/audioHostErrorClassifier.ts
export type AudioErrorClass =
  | 'exclusive_denied'
  | 'device_gone'
  | 'device_initialize_timeout'
  | 'format_unsupported'
  | 'driver_error'
  | 'unknown';

const HRESULT_EXCLUSIVE_DENIED = new Set([
  '0x88890004', // AUDCLNT_E_DEVICE_IN_USE
  '0x8889000B', // AUDCLNT_E_EXCLUSIVE_MODE_NOT_ALLOWED
  '0x88890017', // AUDCLNT_E_ENDPOINT_CREATE_FAILED
]);
const HRESULT_DEVICE_GONE = new Set([
  '0x88890026', // AUDCLNT_E_DEVICE_INVALIDATED
  '0x8889000A', // AUDCLNT_E_DEVICE_INVALIDATED (legacy)
]);
const HRESULT_FORMAT_UNSUPPORTED = new Set([
  '0x88890008', // AUDCLNT_E_UNSUPPORTED_FORMAT
]);

export function classifyHostError(details: HostErrorDetails | null, fallbackMessage: string): AudioErrorClass { ... }
```

**3. 替换 isOutputDeviceStartRefused / isAsioDeviceUnavailableError:** 仍保留旧正则作为 fallback(旧版 host 兼容),但优先用 HRESULT

**4. error.details:** `NativeOutputBridge` 把 JSON 解析后挂到 error 对象的 details 字段上

**测试:** classifier 单元测试覆盖每个 HRESULT 映射 + 一个 fallback 到正则的 case

---

## P2 — 体验抛光

### Fix 7 · 独占启动指数微重试

**问题:** USB DAC 刚被释放但还没空闲时立即开 → `DEVICE_IN_USE`。等 300-500ms 就好。

**改动位置:** `AudioSession.ts:startOutputBridgeForProbe` 的 exclusive 失败 catch 分支

**做什么:**
- 仅当 `outputMode === 'exclusive'` 且 Fix 6 的 classifier 返回 `exclusive_denied`
- 重试 3 次,间隔 **200ms / 500ms / 1000ms**(setTimeout)
- 每次重试前 `addPendingOutputWarning('exclusive_retry_attempt:' + n)`
- 全部失败才走 fallback
- 重试期间不重新 spawn host — 复用 bridge(若 host 已退出则重新 spawn)

---

### Fix 8 · 独占被抢后自动夺回

**改动位置:** `AudioSession.ts`

**做什么:**

1. 新增内部状态 `exclusiveYieldedToOther: boolean` + `exclusiveYieldedConfig: OutputSettings | null`
2. `fallbackExclusiveToSharedForInstability` 或 Fix 4 的 `exclusive_mode_override` event 触发 fallback 时:
   - set `exclusiveYieldedToOther = true`
   - 记录原 exclusive 配置
3. 设一个**自适应定时器**:
   - 初始 30s
   - 每次失败 → 翻倍(60s / 120s / ... 上限 5 min)
   - 成功 → 重置 30s
4. 定时器 tick 时:
   - 仅在 shared 模式稳定运行(无 underrun delta)期间
   - 尝试重新 `start` exclusive
   - 成功 → 切回 + `addOutputWarning('exclusive_reclaimed')`
   - 失败 → 静默 + 延长等待
5. **优先级:** Fix 4 的 `session_disconnected` 反向事件("有别的 session 释放了")到达时,**立刻**尝试夺回,不等定时器

---

### Fix 9 · Watchdog 动态阈值

**问题:** 杀毒扫描 / 防作弊启动那一刻 render 卡 200-400ms 会被误判 stall。

**改动位置:** `AudioSession.ts:checkWatchdog`(约行 1490)

**做什么:**
- 默认 `watchdogStallChecks` 保持 4(250ms × 4 = 1s)
- 检测到 native telemetry `underrunCallbacks` delta > 0 → 临时放宽到 8(250ms × 8 = 2s)
- 维持 3 个 watchdog cycle 后恢复
- 连续 30s 无新 underrun → 保持紧凑阈值
- 在 status 中暴露 `watchdogThresholdAdjusted: boolean` 给前端诊断面板

---

### Fix 10 · 设备 metadata 智能识别

**改动位置:** `src/main/audio/DeviceService.ts`

**做什么:**

1. 枚举设备时通过 `IPropertyStore::GetValue` 拿:
   - `PKEY_Device_DeviceDesc`
   - `PKEY_Device_InstanceId` (含 USB VID/PID)
   - `PKEY_AudioEndpoint_FormFactor`
2. Device 类型增加字段:
   ```ts
   recommendedMode?: 'asio' | 'exclusive' | 'shared';
   recommendationReason?: string;
   ```
3. 启发式规则(优先级从高到低):
   - 名字含 `ASIO` / instance id 含 `KSCATEGORY_AUDIO\\` 但有同名 ASIO 驱动 → `asio`
   - 名字含 `Isoch` / `XMOS` / `Combo384` / `Amanero` → `asio` (reason: `manufacturer_recommends_asio`)
   - USB VID 在白名单(TEAC `0644`, iFi `1852`, Topping `152a`, S.M.S.L `25C4`, Chord `2DC1`)→ `exclusive`
   - 名字含 `Realtek` / `内置` / `内建` / `Internal` → `shared` (reason: `internal_device`)
   - 蓝牙 form factor → `shared` (reason: `bluetooth_no_exclusive`)
4. 不更改默认行为,仅作为元数据暴露给前端

---

## P3 — 用户可见的兜底

### Fix 11 · "重启音频引擎"软按钮

**改动位置:**
- `src/main/audio/AudioSession.ts` 加 `forceRestart(reason: string): Promise<void>`
- `src/main/ipc/` 新增 IPC handler `audio:force-restart`
- `src/renderer/components/settings/` 或新建故障排除面板加按钮

**做什么:**

`AudioSession.forceRestart`:
1. 停掉当前播放(`stopResourcesGracefully('force-restart')`)
2. kill + 等待 bridge 完全退出
3. `DeviceService.refresh()` 重新枚举设备
4. 清空 `unavailableAsioDevices` cache
5. reset `sharedStabilityTier` / `watchdogRecoveries`
6. 不自动续播 — emit `'session-reset'` 让 UI 提示

UI:
- 设置 → 音频 → 故障排除 → 按钮"重启音频引擎"
- 副文案:"如果声音卡住或设备列表不正常,点这里。不会影响其他应用。"
- 副作用:无(只影响 ECHO 自己)

---

### Fix 12 · "重启 Windows 音频服务"硬按钮

**改动位置:**
- 新建 `src/main/audio/WindowsAudioServiceManager.ts`
- 同样的设置面板加第二个按钮(高级)

**做什么:**

**MVP(每次 UAC):**
```ts
async function restartWindowsAudioService(): Promise<void> {
  const script = [
    'net stop /y audiosrv',
    'net stop /y AudioEndpointBuilder',
    'net start AudioEndpointBuilder',
    'net start audiosrv',
  ].join(' & ');
  const proc = spawn('powershell', [
    '-NoProfile', '-Command',
    `Start-Process cmd -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList '/c "${script}"'`
  ], { windowsHide: true });
  await waitForExit(proc);
  await waitForServiceRunning('AudioEndpointBuilder', 10_000);
  await waitForServiceRunning('audiosrv', 10_000);
}

async function waitForServiceRunning(name: string, timeoutMs: number): Promise<void> {
  // 轮询 `sc query <name>` 检查 STATE = RUNNING,500ms 间隔
}
```

调用流程:
1. UI 弹确认对话框:**"这会中断所有应用的声音(Chrome、游戏、通话),并需要管理员权限。是否继续?"**(必须诚实告知!)
2. 用户确认 → `AudioSession.stopResources()`(停自己)
3. `restartWindowsAudioService()` 调用 + 轮询服务状态
4. 完成后 `AudioSession.forceRestart()`(Fix 11)
5. UI toast "Windows 音频服务已恢复,你可以重新开始播放"

**长期方案(TODO,不在本次 scope):**
- 安装期注册 `echo-audio-helper.exe` 为 Windows 服务(LocalSystem)
- 主程序通过 named pipe 让 helper 代为执行
- 用户只在安装时点一次 UAC,之后零摩擦
- 参考 Roon 的 `RAATServer` + `RoonAppliance` 模式

---

### Fix 13 · 前端错误文案 + 设备 chip

**改动位置:**
- `src/renderer/components/player/audioErrorFormat.ts`
- 设备 dropdown 组件(grep `OutputDeviceSelect` 或类似)

**做什么:**

**1. audioErrorFormat 接收新的 `errorClass`(来自 Fix 6 的 classifier):**
```ts
const messages: Record<AudioErrorClass, string> = {
  exclusive_denied: '设备正被其它应用独占。等待该应用退出,或在设置里切换到共享模式。',
  device_gone: '音频设备已断开。请检查 USB / 蓝牙连接,或点"重启音频引擎"。',
  device_initialize_timeout: '设备驱动响应过慢,可能是 USB DAC 异常。建议重新插拔 USB,或点"重启音频引擎"。',
  format_unsupported: '当前采样率 / 位深不被设备支持。请在设置里调整输出格式。',
  driver_error: '音频驱动报错。可能需要更新驱动或重启 Windows 音频服务。',
  unknown: error.message,
};
```

**2. session_disconnected 事件 toast:**
- `exclusive_mode_override` → "其它应用接管了独占,已自动切到共享模式继续播放。"
- `device_removal` → "设备已断开,已切换到默认输出。"

**3. 设备 dropdown 旁加 chip:**
- 用 Fix 10 的 `recommendedMode` 字段
- chip 文案:`建议 ASIO` / `建议独占` / `仅共享` / `内置设备`
- 颜色:推荐 = 蓝,警告 = 黄,信息 = 灰

---

## 工作流要求

1. **每个 Fix 一个 commit**,commit message 用 `audio: ...` 前缀,例如 `audio: clamp low-latency profile buffer (#1)`
2. **每个 commit 必须带测试** — `npm run test` 必须全绿,新增测试覆盖新逻辑
3. **改 .cpp 后必须本地 build 验证** — 跑 `electron-app/tools` 下的原生构建脚本(看 package.json)
4. **PR 描述** 必须引用本文档对应 Fix 编号 + 关联日志 / before-after 行为说明
5. **scope 锁死在音频输出链** — 不允许顺手改 EQ / decoder / database / UI 主题
6. **日志风格保持中文 prefix** — `[AudioSession]` / `[echo-audio-host]` 与现有 logger 一致

---

## 验收清单

按这个清单逐项实测(最好录屏或日志归档):

- [ ] **Fix 1**: TEAC USB DAC + Low Latency 模式 + 历史 buffer=8192 设置 → 自动 clamp,正常启动,outputWarnings 含 `low_latency_buffer_clamped`
- [ ] **Fix 2**: 制造 Initialize hang(可以用 mock 驱动 / sleep)→ 3 秒内清洁失败 + 错误文案"设备驱动响应过慢"
- [ ] **Fix 3**: 主进程退出时 SMTC host 干净退出(无 4294967295 日志)
- [ ] **Fix 4-a**: 默认设备从 USB DAC 切到内置扬声器 → ECHO 在 500ms 内静默切过去
- [ ] **Fix 4-b**: 拔掉 USB DAC → ECHO 不崩,2 秒内 fallback 到默认设备
- [ ] **Fix 4-c**: 另开 foobar 抢独占 → ECHO 立刻切 shared + toast 说明
- [ ] **Fix 5**: 模拟 `AUDCLNT_E_DEVICE_INVALIDATED` → 同进程内复活 < 300ms,无 host respawn
- [ ] **Fix 6**: 翻 AudioSession 代码,确认 `isOutputDeviceStartRefused` 优先走 HRESULT 分类,正则只是 fallback
- [ ] **Fix 7**: 模拟独占启动连续失败 → 看到日志中 `exclusive_retry_attempt:1/2/3` + 间隔 200/500/1000ms
- [ ] **Fix 8**: foobar 退出后 → ECHO 30 秒内自动夺回独占 + toast `exclusive_reclaimed`
- [ ] **Fix 9**: 跑杀毒全盘扫描 → 不再触发误判 stall recovery
- [ ] **Fix 10**: 设置里设备 dropdown 显示 chip(TEAC `建议 ASIO`、Realtek `内置设备`)
- [ ] **Fix 11**: 设置里"重启音频引擎"按钮 → 设备列表刷新 + Chrome 视频继续正常播放
- [ ] **Fix 12**: 设置里"重启 Windows 音频服务"按钮 → UAC 弹窗 → 服务确实重启 + ECHO 恢复
- [ ] **Fix 13**: 上述各场景的 toast / chip 文案符合规格
- [ ] **总体**:`npm run test` 全绿;`npm run lint` 全绿;原生 build 全绿

---

## 执行顺序建议

如果不能一次全做完,按这个顺序(每行约 0.5-1 天):

1. **Day 1**: Fix 1 + Fix 2 + Fix 3 — 立刻解决当前 TEAC 故障
2. **Day 1.5**: Fix 11 — 给用户立即可用的兜底
3. **Day 2-4**: Fix 4 + Fix 5 + Fix 6 — 真正改变游戏的部分
4. **Day 5-6**: Fix 7 + Fix 8 + Fix 9 + Fix 10 — 抛光
5. **Day 7**: Fix 12 + Fix 13 — 收尾

---

## 出错协议

如果实施过程中遇到:
- **无法在 Windows 上测试某条 fallback 链** → 写单元测试覆盖,标 TODO 等真机验证,**不要**为了通过编译而删功能
- **C++ 改动引入 build 失败** → 不要 commit,先恢复;在 PR 上说明并请教
- **现有测试断言变化** → 必须能解释为什么旧断言是错的,并新增等量测试覆盖新行为
- **范围超出预期(发现新坑)** → 在文档末尾"附录"section 追加,不要默默扩张 scope

---

## 附录:HRESULT 速查(Fix 6 参考)

| HRESULT | 名字 | 含义 | 建议分类 |
|---------|------|------|----------|
| `0x88890001` | AUDCLNT_E_NOT_INITIALIZED | 客户端未初始化 | driver_error |
| `0x88890002` | AUDCLNT_E_ALREADY_INITIALIZED | 重复初始化 | driver_error |
| `0x88890003` | AUDCLNT_E_WRONG_ENDPOINT_TYPE | 端点类型不匹配 | driver_error |
| `0x88890004` | AUDCLNT_E_DEVICE_IN_USE | 独占被占 | exclusive_denied |
| `0x88890005` | AUDCLNT_E_BUFFER_OPERATION_PENDING | 缓冲操作未完成 | driver_error |
| `0x88890006` | AUDCLNT_E_THREAD_NOT_REGISTERED | MMCSS 未注册 | driver_error |
| `0x88890008` | AUDCLNT_E_UNSUPPORTED_FORMAT | 格式不支持 | format_unsupported |
| `0x8889000A` | AUDCLNT_E_DEVICE_INVALIDATED (legacy) | 设备失效 | device_gone |
| `0x8889000B` | AUDCLNT_E_EXCLUSIVE_MODE_NOT_ALLOWED | 独占被禁 | exclusive_denied |
| `0x8889000D` | AUDCLNT_E_BUFFDURATION_PERIOD_NOT_EQUAL | buffer 不匹配 period | format_unsupported |
| `0x88890017` | AUDCLNT_E_ENDPOINT_CREATE_FAILED | 端点创建失败 | exclusive_denied |
| `0x88890018` | AUDCLNT_E_SERVICE_NOT_RUNNING | 音频服务没启动 | driver_error |
| `0x88890026` | AUDCLNT_E_DEVICE_INVALIDATED | 设备失效 | device_gone |
| `0x88890021` | AUDCLNT_E_RAW_MODE_UNSUPPORTED | RAW 模式不支持 | format_unsupported |

---

*文档版本:1.0 · 来源:基于 TEAC USB AUDIO DEVICE (Isoch) 故障日志的根因分析*

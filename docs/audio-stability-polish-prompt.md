# ECHO-Next 音频稳定性 · 收尾三件套 (Fix A/B/C)

> 这是音频大修剩下的最后三项 — 不修也能发版,修了就**真正达到"Roon-级"体验**。
> 三项合计工作量预估:**5-6 小时**,可以分别独立 PR。

---

## 角色与上下文

你已经完成了 ECHO-Next 音频稳定性的主线大修(Fix 1/2/4/5-shared/11/12 全落地)。当前 ECHO-Next 在 Windows 上的稳定性已经超过 Roon 公开版,但还有三处可以再上一个台阶。

**代码地图(回顾):**
| 路径 | 角色 |
|------|------|
| `native/audio-host/src/wasapi_shared.cpp` | WASAPI shared(已带 `rebuild_audio_client` 软恢复) |
| `native/audio-host/src/wasapi_exclusive.cpp` | WASAPI exclusive(本次要补软恢复) |
| `native/audio-host/src/wasapi_timeout.h` | `initialize_with_timeout` / `start_with_timeout` |
| `src/main/audio/AudioSession.ts` | 状态机 + 降级编排 |
| `src/main/audio/NativeOutputBridge.ts` | host 子进程生命周期(已有 `stopGracefully` 模板) |
| `src/main/integrations/smtc/WindowsSmtcService.ts` | SMTC host bridge(本次要加优雅退出) |

---

# Fix A · 独占路径补 `AUDCLNT_E_DEVICE_INVALIDATED` 软恢复

**工作量:** 2 小时
**触发场景:** USB DAC 进入 selective suspend 后唤醒、独占模式下设备格式被外部更改、Windows 11 24H2 抢占型独占

## 现状

`wasapi_shared.cpp` 已经有完整的 `rebuild_audio_client()` + render 线程内 `AUDCLNT_E_DEVICE_INVALIDATED` 捕获(行 1087/1104/1131)。**独占路径没有这套**(`wasapi_exclusive.cpp:949-984` 的 render 线程,`GetBuffer` / `ReleaseBuffer` 失败直接 break)。

## 改动位置

`native/audio-host/src/wasapi_exclusive.cpp`

### 1. 新增 `rebuild_exclusive_audio_client()`

抄 `wasapi_shared.cpp` 的 `rebuild_audio_client` 模式,但有几个**独占特有**的注意点:

- 独占模式必须用**原本协商好的精确 format**(不能 `GetMixFormat`),所以从 `runtime->format` 拿
- 必须复用原本的 `bufferDuration`(从 `runtime->bufferFrameCount` + `runtime->sampleRate` 反推 hns)
- 必须包 `initialize_with_timeout`,并处理 `AUDCLNT_E_BUFFER_SIZE_NOT_ALIGNED` 的对齐重试(独占特有,**否则某些 DAC 重建会失败**)
- 重建后必须重新 `SetEventHandle` 和 prime buffer
- 重建后必须**重新 register session watcher**(因为 IAudioClient 换了,旧的 IAudioSessionControl 失效)

```cpp
static int rebuild_exclusive_audio_client(wasapi_exclusive_runtime* runtime) {
    if (runtime == NULL || runtime->stopEvent == NULL) return -1;
    if (WaitForSingleObject(runtime->stopEvent, 0) == WAIT_OBJECT_0) return -1;

    std::vector<wasapi_exclusive_device_info> devices;
    char error[512] = {0};
    if (enumerate_devices(devices, error, sizeof(error)) != 0 || devices.empty()) {
        fprintf(stderr, "[echo-audio-host] WASAPI exclusive rebuild enumerate failed: %s\n",
                error[0] != '\0' ? error : "no devices");
        return -1;
    }

    IMMDevice* device = resolve_device(
        devices,
        runtime->targetDeviceName[0] != '\0' ? runtime->targetDeviceName : NULL,
        runtime->targetDeviceIndex,
        error, sizeof(error));
    if (device == NULL) return -1;

    IAudioClient* newClient = NULL;
    UINT32 newBufferFrames = 0;
    // 复用原 buffer 期望(独占 buffer 必须精确)
    HRESULT hr = open_exclusive_audio_client(
        device,
        &runtime->format,
        runtime->bufferFrameCount,  // 期望对齐
        &newClient,
        &newBufferFrames);
    device->Release();

    if (hr == E_PENDING) {
        fprintf(stderr, "[echo-audio-host] WASAPI exclusive rebuild Initialize timed out; exiting host\n");
        fflush(stderr);
        ExitProcess((UINT)echo_audio_host::kExitDeviceInitializeTimeout);
    }
    if (FAILED(hr)) {
        fprintf(stderr, "[echo-audio-host] WASAPI exclusive rebuild open failed hr=0x%08lx\n",
                (unsigned long)hr);
        return -1;
    }

    IAudioRenderClient* newRenderClient = NULL;
    hr = newClient->GetService(__uuidof(IAudioRenderClient), (void**)&newRenderClient);
    if (FAILED(hr)) { newClient->Release(); return -1; }

    hr = newClient->SetEventHandle(runtime->renderEvent);
    if (FAILED(hr)) {
        newRenderClient->Release();
        newClient->Release();
        return -1;
    }

    // 替换 runtime 里的 audio client
    // !! 旧的 client/renderClient 在 GetBuffer 失败那一刻已经废了 !!
    // !! 但是 Release 旧 client 可能 deadlock(它内部线程可能还在调) !!
    // 安全策略:把旧指针挪到 graveyard,let OS 在进程退出时清理
    {
        std::lock_guard<std::mutex> lock(g_exclusive_client_graveyard_mutex);
        g_exclusive_client_graveyard.push_back(runtime->renderClient);
        g_exclusive_client_graveyard.push_back(runtime->audioClient);
    }
    runtime->renderClient = newRenderClient;
    runtime->audioClient = newClient;
    runtime->bufferFrameCount = newBufferFrames;

    // 重新订阅 session 事件(关键!)
    unregister_session_watcher(runtime);
    register_session_watcher(runtime);

    // re-prime
    BYTE* primeBuffer = NULL;
    hr = newRenderClient->GetBuffer(newBufferFrames, &primeBuffer);
    if (SUCCEEDED(hr)) {
        memset(primeBuffer, 0, (size_t)newBufferFrames * runtime->channels * sizeof(float));
        newRenderClient->ReleaseBuffer(newBufferFrames, AUDCLNT_BUFFERFLAGS_SILENT);
    }

    hr = echo_wasapi_timeout::start_with_timeout(newClient);
    if (hr == E_PENDING) {
        fprintf(stderr, "[echo-audio-host] WASAPI exclusive rebuild Start timed out; exiting host\n");
        fflush(stderr);
        ExitProcess((UINT)echo_audio_host::kExitDeviceInitializeTimeout);
    }
    if (FAILED(hr)) return -1;

    fprintf(stderr, "[echo-audio-host] WASAPI exclusive client rebuilt successfully\n");
    return 0;
}
```

新增 graveyard:
```cpp
static std::vector<IUnknown*> g_exclusive_client_graveyard;
static std::mutex g_exclusive_client_graveyard_mutex;
```

### 2. render 线程加 invalidated 捕获

`wasapi_exclusive.cpp:960` 的 `GetBuffer` 失败 + `wasapi_exclusive.cpp:978` 的 `ReleaseBuffer` 失败,各加:

```cpp
if (hr == AUDCLNT_E_DEVICE_INVALIDATED) {
    fprintf(stderr, "[echo-audio-host] WASAPI exclusive %s reported device invalidated; rebuilding\n",
            "GetBuffer" /* 或 "ReleaseBuffer" */);
    if (rebuild_exclusive_audio_client(runtime) == 0) {
        continue;  // 不要 break,继续 render 循环
    }
    // rebuild 失败才退出
    InterlockedExchange(&runtime->renderFailed, 1);
    break;
}
```

### 3. 测试

- 在 stress-audio-host.mjs 加 case:启动独占 + 设置 `ECHO_TEST_FORCE_INVALIDATE_AFTER_MS=2000` 环境变量,验证 host 在 4 秒内自动恢复继续播放(需要在 render thread 加测试钩子,可选)
- 单元测试不强求,这块主要靠真机验证

### 验收

- [ ] 独占播放时拔掉 USB DAC 再插回 → ECHO 在 1-2 秒内**自动恢复**,不需要重启或换曲
- [ ] 独占播放时另一应用尝试切换设备格式 → ECHO 自动 rebuild,无中断
- [ ] 重建期间 stderr 日志清晰说明发生了什么
- [ ] 极端场景 rebuild 失败 → 按既有路径 fallback 到 shared

---

# Fix B · SMTC host 优雅退出

**工作量:** 1 小时
**触发现象:** 日志末尾 `[SMTC] Windows SMTC host exited unexpectedly code: 4294967295`

## 现状

`WindowsSmtcService` 在主进程退出 / 重启时,SMTC host 子进程被直接 `TerminateProcess` 杀掉(exit code = `0xFFFFFFFF`)。功能上不影响,但:
- 日志噪声
- 极端情况下当前曲目元数据未回写
- 如果 SMTC host 正在写媒体控制注册表,可能留下脏状态

## 改动位置

`src/main/integrations/smtc/WindowsSmtcService.ts`

## 做什么

参考 `NativeOutputBridge.stopGracefully` 的模板(`NativeOutputBridge.ts` 中 grep 该方法)。SMTC host 协议如果有"清退"消息(grep `smtc-host/src/main.cpp` 找 stdin 命令),用它;没有的话用 SIGTERM + 等待 + SIGKILL。

骨架:
```ts
private async stopGracefullyImpl(timeoutMs = 1000): Promise<void> {
  const proc = this.proc;
  if (!proc || proc.killed || proc.exitCode !== null) return;

  // 1. 尝试通过 stdin 发清退命令(如果协议支持)
  try {
    proc.stdin?.write(JSON.stringify({ command: 'shutdown' }) + '\n');
    proc.stdin?.end();
  } catch {
    // ignore
  }

  // 2. 平台合适的话发 SIGTERM(Windows 上 Node 的 SIGTERM 其实是 TerminateProcess,
  //    但 Windows SMTC host 可以监听 console ctrl 事件 — 看 main.cpp 实现)
  try { proc.kill('SIGTERM'); } catch { /* ignore */ }

  // 3. 等 timeoutMs 优雅退出
  const exited = await Promise.race([
    new Promise<boolean>((resolve) => proc.once('exit', () => resolve(true))),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
  ]);

  // 4. 没退出就强杀
  if (!exited && !proc.killed && proc.exitCode === null) {
    this.logger?.('[SMTC] graceful shutdown timed out, force killing');
    try { proc.kill('SIGKILL'); } catch { /* ignore */ }
  }
}
```

在 `WindowsSmtcService.dispose()` / `stop()` 里调用 `await this.stopGracefullyImpl()` 替换原本的 `proc.kill()`。

### 主进程入口集成

`src/main/app/lifecycle.ts`(或 grep `before-quit`)的 quit handler 里,在 quit 之前 `await getSmtcService().stopGracefullyImpl()`。

### SMTC host 端(可选,推荐做)

`native/smtc-host/src/main.cpp` 加 console ctrl handler 或 stdin 命令处理:
```cpp
SetConsoleCtrlHandler([](DWORD) -> BOOL {
  // 清退当前 SMTC 注册项
  cleanupCurrentMediaSession();
  ExitProcess(0);
  return TRUE;
}, TRUE);
```

或者监听 stdin `{"command":"shutdown"}` 触发同样的清退。

## 测试

- `WindowsSmtcService.test.ts` 加 case:模拟 dispose() → 验证 stopGracefullyImpl 被调用,1 秒内 child 退出
- 真机:关闭 ECHO → 检查日志**不再出现** `code: 4294967295`,而是 `code: 0`

## 验收

- [ ] 主进程退出时 SMTC host exit code = 0
- [ ] 日志 `[SMTC] ... exited unexpectedly code: 4294967295` 消失
- [ ] 强杀超时仍然兜底(防止 SMTC host 自己 hang)

---

# Fix C · 独占启动指数微重试

**工作量:** 2 小时
**触发场景:** USB DAC 刚被别的应用释放还没回到空闲状态;切歌时上一首的独占释放与下一首的请求时序冲突

## 现状

当前在 `AudioSession.startOutputBridgeForProbe` catch 分支:exclusive 模式拿到 `exclusive_denied`(C++ 端 exit code -2 翻译来)→ **立即 fallback 到 shared**。

实际上 USB DAC 在被释放后有一个 200-1000ms 的"驱动 cleanup"窗口,这窗口里立刻 open 会拿 `AUDCLNT_E_DEVICE_IN_USE`。**等几百毫秒再试就成功了**。

## 改动位置

`src/main/audio/AudioSession.ts` 的 `startOutputBridgeForProbe` 函数(grep)

## 做什么

### 1. 加配置常量

```ts
const exclusiveStartRetryDelaysMs = [200, 500, 1000] as const;
```

放在文件顶部其他常量旁边。

### 2. 加判断函数

参考已有的 `isOutputDeviceStartRefused`,加一个专门识别 exclusive denied 的:

```ts
const isExclusiveDeniedError = (error: Error): boolean =>
  /\bexclusive_denied\b/u.test(error.message);
```

### 3. catch 分支增加重试循环

在 `startOutputBridgeForProbe` 的 candidate 循环里,当前是:
```ts
try {
  const ready = await bridge.start(startOptions);
  ...
} catch (error) {
  lastError = ...;
  // 这里 fallback
}
```

把它改成"仅独占模式下,exclusive_denied 触发微重试":

```ts
let exclusiveRetryAttempts = 0;
const maxExclusiveRetries = exclusiveStartRetryDelaysMs.length;

while (true) {
  try {
    const ready = await bridge.start(startOptions);
    // 成功
    if (exclusiveRetryAttempts > 0) {
      this.addOutputWarning(`exclusive_started_after_retry:${exclusiveRetryAttempts}`);
    }
    return { bridge, plan: this.currentPlan, ready, ... };
  } catch (error) {
    const startError = error instanceof Error ? error : new Error(String(error));

    // 仅 exclusive + exclusive_denied + 还有重试预算 → 等一下再试
    if (
      outputMode === 'exclusive'
      && isExclusiveDeniedError(startError)
      && exclusiveRetryAttempts < maxExclusiveRetries
    ) {
      const delayMs = exclusiveStartRetryDelaysMs[exclusiveRetryAttempts];
      exclusiveRetryAttempts += 1;
      this.addPendingOutputWarning(`exclusive_retry_attempt:${exclusiveRetryAttempts}`);
      this.logger(
        `[AudioSession] exclusive denied; retrying in ${delayMs}ms (attempt ${exclusiveRetryAttempts}/${maxExclusiveRetries})`
      );

      // !! 关键:bridge 已经退出了(host process 已 exit -2),需要重新 spawn 一个新的 bridge !!
      await this.stopBridgeGracefully(bridge, 'exclusive-denied-retry');
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      this.assertCurrentRun(token);

      bridge = this.createBridge();
      this.bridge = bridge;
      this.attachBridgeEvents(bridge, token);
      continue;  // 重试 bridge.start
    }

    // 不重试 → 走原本的 fallback 路径
    lastError = startError;
    // ... 原本的 fallback 代码
    break;
  }
}
```

### 4. 注意点

- **每次重试必须新 spawn host**(host 进程已经 exit -2 死了)
- **必须 `assertCurrentRun(token)`**:用户在重试间隔点了 stop / 切歌,要中止
- 重试期间状态仍是 'preparing',watchdog 不会触发
- 三次重试总耗时上限 1700ms,加单次 bridge.start ~500ms,**最坏 3.2 秒** — 还在用户可忍受范围内
- 不要对 `AUDCLNT_E_EXCLUSIVE_MODE_NOT_ALLOWED` 重试 — 那是用户/系统**禁用了**独占模式,重试没用。`exclusive_denied` 信号覆盖了多种错误,理想情况下应该让 C++ 端区分 `DEVICE_IN_USE`(可重试)和 `EXCLUSIVE_MODE_NOT_ALLOWED`(不可重试),但这是 Fix 6(结构化 HRESULT)的范畴,本次先重试所有 exclusive_denied

### 5. 测试

`AudioCore.test.ts` 加 case:
- mock host 第 1 次 spawn 返回 exit -2 (exclusive_denied),第 2 次 spawn 成功
- 验证:第一次失败后等 200ms,第二次启动成功,warnings 包含 `exclusive_retry_attempt:1` + `exclusive_started_after_retry:1`
- 第二个 case:三次都失败 → fallback 到 shared

### 验收

- [ ] foobar 退出后**立即**在 ECHO 选独占模式播放 → 不再"启动失败 fallback shared",而是"小停 200ms 后正常独占播放"
- [ ] 三次重试全失败 → 正常 fallback,且日志清楚显示重试历史
- [ ] 用户在重试间隔 stop → 不会再继续重试
- [ ] 现有 exclusive fallback 测试不破坏

---

# 工作流要求

1. **三个 Fix 分别独立 commit / PR**:`audio: rebuild exclusive client on device invalidation`、`audio: smtc host graceful shutdown`、`audio: exclusive start exponential micro-retry`
2. **每个 commit 必须带测试**(Fix A 可以放宽到 stress script,B 和 C 必须有 vitest)
3. **改 .cpp 后本地 build 验证**
4. **scope 锁死**:不要顺手改 EQ / decoder / Fix 6 的结构化 HRESULT(那是另一项工作)
5. **真机验证 checklist**:Fix A 必须在真 USB DAC 上拔插测试,B/C 可以在任何 Windows 机器上验证

# 执行顺序建议

1. **Fix B**(1 小时,日志卫生)— 先做,简单且收尾干净
2. **Fix C**(2 小时,Roon 级体验差异)— 收益直观,容易演示
3. **Fix A**(2 小时,边缘场景兜底)— 最复杂,但触发频率最低

---

# 不要做的事

1. **不要在独占 rebuild 里调 `audioClient->Release()`** — 旧 client 可能还有线程持有,Release 会死锁。**必须用 graveyard**
2. **不要把 exclusive 微重试推到 4 次以上** — 用户耐心上限是 ~3 秒,1.7s 重试 + 0.5s 启动 + 缓冲 = 已经接近边缘
3. **不要给 shared 模式也加微重试** — shared 拿到错误几乎都是配置问题,重试没用
4. **不要在 SMTC graceful 超时改到 > 2 秒** — 用户关 ECHO 等 2 秒就开始骂人了
5. **不要给 ASIO 加 invalidated 软恢复** — ASIO 有自己的状态机,混着改会打架

---

*文档版本:1.0 · 收尾三件套 · 累计工时:5-6 小时*

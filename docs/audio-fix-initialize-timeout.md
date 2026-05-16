# ECHO-Next 音频稳定性 · 下一刀 (Fix 2)

> 这是 13 项音频大修里**还没完成且唯一会真正咬人的那一项**。
> 完成它之后,Hi-Fi 用户在 Windows 上遇到"驱动 hang 死"的场景将从 9 秒卡死变成 3 秒清洁失败。
> 工作量预估:**半天**(C++ 约 80 行,TS 约 30 行,测试 50 行)。

---

## 为什么这一项最重要

### 当前状态(已完成的工作背景)

13 项大修里,已完成的 5 项(Fix 1/4/11/12/邻近 underrun 升级)解决了:
- 配置矛盾导致的启动失败(lowLatency + 大 buffer)
- 设备被抢/切换的主动感知(IMMNotificationClient + IAudioSessionEvents)
- 用户兜底操作(软/硬两级重启按钮)

**剩下没做的 8 项里,只有一项还会让用户卡 9 秒**——就是 Fix 2。其他都是"锦上添花"。

### 真实失败日志(必读)

```
[echo-audio-host] device->open(48000 Hz, 2 ch, buffer=8192) completed in 12 ms
[echo-audio-host] Open failed at 48000 Hz, buffer=8192: Couldn't open the output device!
... (fallback chain) ...
[NativeOutputBridge] spawn: echo-audio-host.exe -sr 48000 ... -shared-backend windows ...
[echo-audio-host] EQ control listener ready on port 45213
[AudioSession] safe shared fallback failed: ... exit_code_4294967295 ... elapsedMs=9271
```

stderr 停在 `EQ control listener ready` 后面什么都没有 — `IAudioClient::Initialize` 或 `Start` **进去就没回来**,9 秒后被外部 `readyTimer` 用 TerminateProcess 杀掉(`exit_code_4294967295 = 0xFFFFFFFF` 是 Terminate 的典型返回值)。

### 这种事什么时候发生

- **TEAC / Combo384 / XMOS / Amanero 等 USB DAC 驱动**在某些状态下 Initialize 会同步 hang
- USB 设备进入 selective suspend 又被唤醒时,头几次 Initialize 不响应
- 蓝牙编解码切换那一瞬间 Initialize 拿不到锁
- Windows Audio 服务被第三方驱动(Realtek HD Audio Manager / Nahimic)半挂起时

这些场景下用户的感受是:**点播放 → loading 转 9 秒 → 报"启动失败"**。这是 ECHO 当前最丢人的体验,因为 Roon / Audirvana 也会失败,但它们 1-2 秒就 fail 出来切设备。

---

## 角色与上下文

你是 ECHO-Next 音频引擎的工程师。你需要修改:
- C++ 原生 host:`native/audio-host/src/wasapi_shared.cpp` 和 `wasapi_exclusive.cpp`
- TS 主进程桥接:`src/main/audio/NativeOutputBridge.ts`
- TS 主进程编排:`src/main/audio/AudioSession.ts`(只是错误分类相关的小改)
- 测试:`src/main/audio/AudioCore.test.ts` 加 case

**不要碰** ASIO 路径(`asio_host.cpp`)— ASIO 有自己的 sample rate wait 逻辑,不在本次 scope。

---

## 解决方案总览

把 `IAudioClient::Initialize()` 和 `IAudioClient::Start()` 两个**同步阻塞** COM 调用包到 `std::async(std::launch::async, ...)` 里,主线程用 `future.wait_for(3s)` 设上限。

超时时:
1. **不要 join** 那个 future(会把主线程也卡死)
2. **不要 detach** thread(`std::future` 不支持,且会让 destructor 同步等待)
3. 把 future **move 到一个 static 'graveyard' 容器**里养老 — 让它的析构不发生在当前栈帧
4. **不要**主动释放 `IAudioClient*` 或其他 COM 对象 — 后台线程可能正在持有,释放就 UAF
5. host 进程**直接退出**,退出码 `-3` 表示 `device_initialize_timeout`,OS 帮我们回收所有泄漏

这是"以进程为代价换毫秒级 fail-fast"的设计。完全 OK,因为:
- ECHO 已经是 process-per-session 模型 — 失败时本来就要重 spawn
- 我们只是把"失败"从 9 秒缩短到 3 秒
- 泄漏的 COM 对象会在进程退出时被 OS 一并回收

---

## C++ 端实现

### 1. 新建一个超时包装器(放在 wasapi 共用 header 里更优雅,直接放 wasapi_shared.cpp/wasapi_exclusive.cpp 顶部 anonymous namespace 也行)

```cpp
#include <future>
#include <vector>
#include <mutex>
#include <chrono>

namespace {

// 超时后被遗弃的 future 收容所 — 永远不让它在栈上析构,
// 因为 std::async(std::launch::async, ...) 返回的 future 析构会同步等待任务完成。
static std::vector<std::future<HRESULT>> g_initFutureGraveyard;
static std::mutex g_initFutureGraveyardMutex;

constexpr int WASAPI_INIT_TIMEOUT_MS = 3000;

// 返回值约定:
//   S_OK / 其它 HRESULT → Initialize 正常返回的值(可能成功,也可能 fail)
//   E_PENDING (0x8000000A) → 超时,调用方应放弃这个 audioClient 并让进程退出
HRESULT initialize_with_timeout(IAudioClient* client,
                                AUDCLNT_SHAREMODE shareMode,
                                DWORD streamFlags,
                                REFERENCE_TIME hnsBufferDuration,
                                REFERENCE_TIME hnsPeriodicity,
                                const WAVEFORMATEX* format,
                                LPCGUID audioSessionGuid) {
    // 把所有参数 copy 进 lambda,避免 lifetime 问题
    auto future = std::async(std::launch::async,
        [client, shareMode, streamFlags, hnsBufferDuration, hnsPeriodicity, format, audioSessionGuid]() -> HRESULT {
            // 这个线程不能持有 STA;Initialize 是 MTA-safe,直接调
            return client->Initialize(shareMode, streamFlags, hnsBufferDuration,
                                       hnsPeriodicity, format, audioSessionGuid);
        });

    auto status = future.wait_for(std::chrono::milliseconds(WASAPI_INIT_TIMEOUT_MS));
    if (status == std::future_status::timeout) {
        fprintf(stderr,
            "[echo-audio-host] WASAPI Initialize timed out after %dms phase=initialize\n",
            WASAPI_INIT_TIMEOUT_MS);

        // 把 future 移到 graveyard,这样它的析构不会发生在这里(会同步等)
        std::lock_guard<std::mutex> lock(g_initFutureGraveyardMutex);
        g_initFutureGraveyard.push_back(std::move(future));
        return E_PENDING;
    }

    return future.get();
}

// Start 是同理但更简单的一份
HRESULT start_with_timeout(IAudioClient* client) {
    auto future = std::async(std::launch::async, [client]() -> HRESULT {
        return client->Start();
    });

    auto status = future.wait_for(std::chrono::milliseconds(WASAPI_INIT_TIMEOUT_MS));
    if (status == std::future_status::timeout) {
        fprintf(stderr,
            "[echo-audio-host] WASAPI Start timed out after %dms phase=start\n",
            WASAPI_INIT_TIMEOUT_MS);
        std::lock_guard<std::mutex> lock(g_initFutureGraveyardMutex);
        g_initFutureGraveyard.push_back(std::move(future));
        return E_PENDING;
    }

    return future.get();
}

} // namespace
```

### 2. 替换 wasapi_shared.cpp 中的 Initialize 调用

找到 `wasapi_shared_start` 里的 `audioClient->Initialize(...)`(grep 几个位置都要换),替换为 `initialize_with_timeout(audioClient, ...)`。Start 同理。

特别处理 `E_PENDING` 返回:
```cpp
hr = initialize_with_timeout(audioClient, AUDCLNT_SHAREMODE_SHARED, ...);
if (hr == E_PENDING) {
    set_error(error, errorLen, "WASAPI Initialize timed out", S_OK);
    result = -3;  // 新的退出码意义
    // !! 不要 audioClient->Release() !! 后台线程可能还在 Initialize 里
    // 让 host 进程自然走 cleanup 路径,但跳过对 audioClient 的释放
    runtime->audioClientLeakedOnTimeout = true;  // 见下文
    goto done;
}
if (FAILED(hr)) {
    /* 走原有的 HRESULT 错误处理 */
}
```

### 3. 给 runtime 加一个 leak 标记,避免清理时去 Release 泄漏的指针

`wasapi_shared.h` / `wasapi_exclusive.h` 中的 runtime struct 加字段:
```cpp
bool audioClientLeakedOnTimeout = false;
```

`wasapi_shared_stop` 释放路径里:
```cpp
if (runtime->audioClient != nullptr && !runtime->audioClientLeakedOnTimeout) {
    runtime->audioClient->Release();
}
// 不管哪种情况都 nullptr 化指针,只是不调 Release
runtime->audioClient = nullptr;
```

`renderClient` / `deviceWatcher` / `sessionWatcher` 同理 — **任何被卡在 Initialize 调用里的 COM 对象都不能 Release**。保守起见,timeout 路径下把 runtime 里的所有 COM 指针都置 `leaked = true`。

### 4. 同样修 wasapi_exclusive.cpp

代码模式一样,但独占的 Initialize 调用更多(因为有 `AUDCLNT_E_BUFFER_SIZE_NOT_ALIGNED` 后重新 Initialize 的逻辑,grep `IsFormatSupported` 附近 `Initialize` 调用)。**每一处都要包**。

### 5. main.cpp 中的退出码路径

找到 host 主流程根据 wasapi_*_start 返回值决定退出码的地方,把 `-3` 这个返回值映射成进程退出码 `-3`。如果已有 enum 化的退出码,加一个 `kExitDeviceInitializeTimeout = -3`。

---

## TS 端联动

### 1. `NativeOutputBridge.ts`

找到现有的 exit code 翻译逻辑(应该在 `proc.on('exit')` 附近,行号约 480-510),已经处理 `-2 → exclusive_denied`,加一个分支:

```ts
const reason =
  code === -2
    ? 'exclusive_denied'
    : code === -3
    ? 'device_initialize_timeout'
    : code != null ? `exit_code_${code}` : `exit_signal_${signal ?? '?'}`;
```

### 2. `AudioSession.ts`

在错误分类辅助函数附近(`isOutputDeviceStartRefused` 周围,行号约 332-348),加一个新分类:

```ts
const deviceInitializeTimeoutPatterns = [
  /\bdevice_initialize_timeout\b/u,
];

const isDeviceInitializeTimeoutError = (error: Error): boolean =>
  deviceInitializeTimeoutPatterns.some((pattern) => pattern.test(error.message));
```

在 `startOutputBridgeForProbe` 的 catch 分支(行号约 2290 附近)增加专门处理:
```ts
if (isDeviceInitializeTimeoutError(lastError)) {
  // 不要在同一设备上重试 — 驱动卡死了重试也没用
  this.addPendingOutputWarning('device_initialize_timeout');
  this.logger(`[AudioSession] device initialize timed out; skipping retry on same device`);
  // 直接 break 当前 candidate 循环,走 fallback 链
  break;
}
```

### 3. `audioErrorFormat.ts` (renderer)

新增分支:
```ts
if (/\bdevice_initialize_timeout\b/.test(error)) {
  return '设备驱动响应过慢,可能是 USB DAC 异常。建议重新插拔 USB,或在设置里点"重启音频引擎"。';
}
```

---

## 测试

### `AudioCore.test.ts` 加 case

```ts
it('treats device_initialize_timeout as non-retryable and falls back without re-trying same device', async () => {
  // mock host 退出码返回 -3
  // 验证:
  //  1. error message 含 'device_initialize_timeout'
  //  2. outputWarnings 含 'device_initialize_timeout'
  //  3. 同一 device 不再被重试
  //  4. 走 fallback 链到 safe shared
});
```

### Native 端冒烟测试

`scripts/smoke-audio-host.mjs` 加一个用例:用一个 mock 的 hang-on-initialize 测试驱动(或者直接 sleep 5 秒的 stub),验证 host 进程 **3.5 秒内**退出且退出码为 -3。

---

## 验收清单

- [ ] **C++ build 通过**:`cd electron-app/tools && npm run build:native:windows`(或对应脚本)
- [ ] **超时退出时间 < 3.5 秒**:从 host spawn 到 exit code -3 总耗时 < 3.5s
- [ ] **无 crash**:超时退出后 host 进程**正常**退出,不是 access_violation。退出码必须是 `-3` 而不是 `0xC0000005` 这种段错误
- [ ] **fallback 链工作**:遇到 timeout 后正确 fallback 到 safe shared(或更深降级),最终能播放
- [ ] **TS 单元测试新增的 case 全绿**
- [ ] **现有测试全部不破坏**:`npm run test`
- [ ] **错误文案对**:UI 上显示"设备驱动响应过慢"那条而不是 generic 错误

---

## 不要做的事(踩坑名单)

1. **不要尝试 cancel 那个后台线程** — Windows COM 没有可移植的取消机制,`TerminateThread` 会破坏进程状态
2. **不要在 timeout 后 release COM 对象** — UAF + 可能死锁
3. **不要把 future 留在栈上** — `std::async` 的 future 析构会同步等待,等于没设超时
4. **不要复用 audioClient 指针** — 一次 timeout 后这个指针就废了,后续重试必须重新 `Activate` 出新的
5. **不要在 ASIO 路径加同样的逻辑** — ASIO 已经有自己的 `wait_for_asio_sample_rate` 机制,不要互相干扰
6. **不要把超时调到 < 2 秒** — 某些慢启动的设备(高端 DSD DAC 切换码率)合法 Initialize 时间 1-2 秒,过严会误杀

---

## 附录:为什么 std::async 的 future 析构会卡

C++ 标准 `[futures.async]/5`:`std::async(std::launch::async, ...)` 返回的 `future`,在它的析构函数里会**同步等待** shared state 变 ready。所以:

```cpp
{
    auto f = std::async(std::launch::async, hang_forever);
    // 离开作用域时 f.~future() 会同步等 hang_forever 完成 → 永久卡死
}
```

这是 C++ 委员会争议很多年的"feature"。绕开方法只有一种:把 future move 到一个**比当前栈帧活得长**的容器里,让它在那里慢慢等(或永远等)。所以才有"graveyard"模式。

---

*文档版本:1.0 · 适用范围:Fix 2 单项落地 · 预估工时:半天*

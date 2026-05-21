# ECHO-Next 功能性评估与行动指南

> 生成日期：2026-05-20
> 基于代码静态分析

---

## 功能完成度总览

| 模块 | 完成度 | 状态 |
|------|--------|------|
| 播放引擎 | 98% | 核心完整，DFF 格式缺流式管线 |
| 曲库管理 | 92% | 扫描器缺错误隔离 |
| 搜索 | 90% | 日语罗马字搜索缺失 |
| 歌词 | 85% | Musixmatch/Genius 为空壳 |
| 流媒体 | 95% | 完整，Spotify 无直接音频解析 |
| EQ/DSP | 100% | 完整 |
| 集成（Discord/Last.fm/SMTC） | 100% | 完整 |
| UI 页面 | 100% | 无占位页面 |
| 网络元数据 | 95% | 完整 |
| 播放列表 | 100% | 完整 |
| 下载 | 100% | 完整 |
| 国际化 | 100% | 4 语言全覆盖 |

**总体功能完成度：约 95%**

---

## 需要修复的功能缺陷

### 缺陷 A：`normalizeDuplicateMode` 永远返回 strict

**影响：** 用户设置的 lenient 重复检测模式完全无效
**风险：** 无 — 一行逻辑修复
**行动：** 直接修

---

### 缺陷 B：扫描器无目录级错误隔离

**影响：** 单个目录 `readdir` 失败（权限问题/网络断开）会导致整个扫描中止
**风险：** 低 — 加 try/catch 不影响正常路径
**行动：** 在 `TsFileScanner.ts` 的递归遍历中为每个子目录加 try/catch，失败时 log + skip

---

### 缺陷 C：Musixmatch / Genius 歌词提供者为空壳

**影响：** 用户以为有这两个源但实际不会返回任何结果
**风险：** 无
**行动：** 两个选择——实现它们，或从 UI 中移除/标记为"即将推出"

---

## 功能性差距分析

### 差距 1：DFF (DSDIFF) 无流式播放管线

**现状：** DSF 格式完整支持（DoP24LE 输出），DFF 仅有探测/识别，无法实际播放
**用户影响：** 拥有 DFF 文件的 HiFi 用户无法播放
**实现难度：** 中 — 需要参考 DSF 管线写 DFF 解析器
**风险：** 低 — 新增代码，不影响现有 DSF 路径

**你该怎么做：**
1. 参考 `DsdDopPipeline.ts` 的 DSF 实现
2. 实现 DFF 文件头解析（DSD chunk + property chunk）
3. 复用现有 DoP 编码逻辑
4. 加 feature flag 先做内测
5. 测试文件：用 foobar2000 转换一个 DSF 为 DFF 作为测试素材

---

### 差距 2：日语罗马字搜索

**现状：** 日语文本以 CJK n-gram 索引，输入 "kimi" 搜不到 "君"
**用户影响：** 日语用户无法用罗马字搜索
**实现难度：** 中 — 需要集成 kuroshiro（项目已有依赖）
**风险：** 低 — 仅扩展 search_terms 字段内容

**你该怎么做：**
1. 在 `SearchIndexTokens.ts` 中为日语文本调用 kuroshiro 转罗马字
2. 将罗马字结果加入 search_terms
3. 注意：kuroshiro 初始化是异步的，需要在扫描启动时预加载字典
4. 增量更新：已有曲目需要重建 search_terms（可做一次性迁移）
5. 测试：搜索 "kimi" 应匹配含 "君" 的曲目

---

### 差距 3：Musixmatch / Genius 歌词提供者

**现状：** 已注册但返回空结果
**用户影响：** 减少歌词覆盖率，尤其英文歌曲
**实现难度：** 高（法律风险）
**风险：** **高 — Musixmatch 和 Genius 的 API 均有严格使用限制**

**你该怎么做：**
- **选项 A（推荐）：** 从 provider 列表中移除，或在 UI 标注"暂不可用"
- **选项 B：** 实现 Musixmatch 的 usertoken API（非官方，可能被封）
- **选项 C：** 申请 Genius 官方 API key（需要审核）

> 建议选 A。LrcLib + Netease + QQMusic 已经覆盖了绝大多数中日韩英歌曲。

---

## 各模块详细评估

### 播放引擎 — 98%

**已完成：**
- Gapless 播放（4 种 automix 引擎 + fallback）
- AutomixAnalyzer 头尾分析 + 24h 缓存
- DSF 完整 DoP 管线
- ASIO 一等公民支持 + 30s 冷却回退
- WASAPI Exclusive / Shared
- 稳定性分级自适应缓冲
- 帧计数器时钟（抗漂移）
- 变速播放
- AirPlay/RAOP 输出

**缺失：**
- DFF 流式播放管线
- Native ASIO DSD 仍为实验性

---

### 曲库管理 — 92%

**已完成：**
- 异步生成器目录遍历
- 增量扫描（mtime + size 指纹）
- 重复检测系统
- 文件移动检测与路径修复
- NCM 格式转换
- WebDAV / Subsonic / MediaServer 远程源
- 元数据字段来源追踪

**缺失：**
- 扫描器无 per-directory 错误隔离
- 无目录级 mtime 优化

---

### 搜索 — 90%

**已完成：**
- FTS5 全文搜索 + unicode61 分词
- CJK n-gram（1-3 字符）
- 拼音全拼 + 首字母 + 滑动窗口
- 中文简繁体互搜（opencc-js 8 种转换）
- 标点/空格归一化

**缺失：**
- 日语罗马字搜索（kuroshiro 已安装但未接入 SearchIndexTokens）

---

### 歌词 — 85%

**已完成：**
- LrcLib / Netease / QQMusic 提供者（完整实现）
- 本地 LRC/TXT sidecar 文件
- 逐字时间轴（Netease word-timing）
- 歌词罗马化（日语/中文）
- 自定义 LRC 上传
- SQLite 持久化 + 损坏自修复

**缺失：**
- Musixmatch 空壳
- Genius 空壳

---

### 流媒体 — 95%

**已完成：**
- Netease / QQMusic / SoundCloud / Spotify / M3u8
- 速率限制（maxConcurrent: 2, minInterval: 150ms）
- 两级缓存（内存 + SQLite）
- 播放列表导入（支持 20000 曲目）
- 喜欢同步
- BPM 分析
- MV 支持

**缺失：**
- Spotify 无直接音频 URL 解析（仅元数据）

---

## 行动计划：你该怎么做

按照风险从低到高、收益从高到低排列。每一步都可以独立完成和发布。

---

### 第一阶段：零风险修复（1-2 天）

这些改动不可能影响任何用户，放心做。

#### 1. 修复 normalizeDuplicateMode

```
文件：src/main/ipc/libraryIpc.ts
改动：1 行
测试：加一个单元测试验证 'lenient' 和 'strict' 输入
风险：无
```

#### 2. 移除或标注空壳歌词提供者

```
文件：歌词 provider 注册处
改动：注释掉 musixmatch/genius 注册，或在 UI 标注"暂不可用"
测试：确认歌词搜索不再显示这两个源
风险：无 — 它们本来就不返回结果
```

#### 3. 添加 SQLite 性能 pragma

```
文件：src/main/database/createDatabase.ts
改动：4 行 pragma
测试：npm run benchmark:library 对比前后
风险：无 — 不改数据库格式，不改查询逻辑
```

---

### 第二阶段：低风险改进（3-5 天）

这些改动范围稍大但仍然安全。

#### 4. 扫描器错误隔离

```
文件：src/main/library/TsFileScanner.ts
改动：为递归遍历的每个子目录加 try/catch
失败时：log 错误 + 跳过该目录 + 继续扫描
测试：模拟一个无权限目录，确认扫描不中止
风险：低 — 只加了容错，不改正常路径
```

#### 5. getStatus() 热路径优化

```
文件：src/main/audio/AudioSession.ts
改动：缓存上次 status，shallow compare 后决定是否重建
测试：播放时观察 GC 频率（DevTools Performance 面板）
风险：极低 — 不改对外接口
注意：确保状态变化时仍能正确推送
```

#### 6. CoverCacheManager 分批加载

```
文件：src/main/library/CoverCacheManager.ts
改动：SELECT 改为 LIMIT/OFFSET 分批，每批 500 行
测试：用 5000+ 专辑库测试路径迁移
风险：低 — 逻辑等价
```

---

### 第三阶段：中等工作量功能补全（1-2 周）

这些是新功能开发，需要更多测试。

#### 7. 日语罗马字搜索

```
文件：src/main/library/SearchIndexTokens.ts
改动：为日语文本调用 kuroshiro 生成罗马字并加入 search_terms
依赖：kuroshiro + kuroshiro-analyzer-kuromoji（已安装）
测试：搜索 "kimi" 匹配 "君"，搜索 "sakura" 匹配 "桜"
风险：低 — 仅扩展索引内容
注意：
  - kuroshiro 初始化是异步的，需预加载字典
  - 已有曲目需要一次性重建 search_terms（迁移脚本）
  - 字典加载约 50MB 内存，确认不影响启动时间
```

#### 8. DFF 流式播放管线

```
参考：src/main/audio/DsdDopPipeline.ts（DSF 实现）
改动：新增 DffStreamPipeline
测试：用 DFF 测试文件验证播放
风险：低 — 新增代码，不影响现有 DSF 路径
注意：
  - DFF 文件结构与 DSF 不同（IFF 容器 vs 自定义头）
  - 先支持 DSD64 stereo，再扩展到多声道
  - 建议加 feature flag 先内测
```

---

### 第四阶段：较大改动（按需）

#### 9. 远程封面 Worker 线程池

```
文件：src/main/library/CoverService.ts
改动：新增 WorkerPool 类，替换 new Worker() 调用
测试：100+ 专辑并发封面获取，观察内存/CPU
风险：低 — 封面获取独立于播放
注意：
  - 池大小建议 4-8（可配置）
  - 需要优雅关闭逻辑
  - 单 worker 崩溃不应影响整个池
```

#### 10. IPC 批处理（最后做）

```
文件：src/main/ipc/libraryIpc.ts + src/preload/index.ts
改动：为高频操作增加 batch 版本
测试：批量添加 500 首歌到播放列表
风险：中 — 接口变更，需要 renderer 配合
注意：
  - 保留旧接口兼容
  - 逐个操作迁移，不要一次全改
  - 每个 batch 设上限（1000）
```

---

## 安全性评估

### 整体安全架构：良好

| 维度 | 状态 | 说明 |
|------|------|------|
| 进程隔离 | 通过 | contextBridge 沙箱，无 nodeIntegration |
| IPC 输入校验 | 通过 | preload 层统一 sanitize |
| SQL 注入 | 通过 | 全部使用 prepared statements |
| 路径遍历 | 通过 | sanitizePathList 过滤 |
| 密钥存储 | 通过 | RemoteSourceSecretStore 独立管理 |
| 依赖安全 | 需关注 | 见下方 |

### 需要关注的安全点

#### 1. Worker `eval: true` 模式

```typescript
const worker = new Worker(remoteCoverWorkerSource, { eval: true, ... });
```

**风险：** `eval: true` 意味着 worker 源码是字符串编译执行。如果 `remoteCoverWorkerSource` 的内容被污染（虽然当前是硬编码的），可能导致代码注入。

**建议：** 改为从文件路径加载 worker，消除 eval 风险。

**对用户的影响：** 当前无实际风险（源码硬编码），但属于不良实践。

---

#### 2. 流媒体 API 密钥管理

**现状：** Netease/QQMusic/Spotify 的认证信息通过 RemoteSourceSecretStore 管理。

**建议：** 确认密钥存储使用了操作系统级加密（Windows Credential Manager / macOS Keychain），而非明文 JSON。

---

#### 3. yt-dlp 命令注入风险

**位置：** 下载功能调用 yt-dlp

**风险：** 如果用户粘贴的 URL 包含 shell 特殊字符，可能导致命令注入。

**建议：** 确认 URL 参数传递使用数组形式（`spawn(cmd, [args])`）而非字符串拼接。

---

#### 4. 远程源（WebDAV/Subsonic）的 TLS 验证

**建议：** 确认 HTTPS 连接不会跳过证书验证（不要设置 `rejectUnauthorized: false`）。

---

## 给你的总结建议

### 心态

你的项目功能完成度已经非常高（95%），性能工程也是 A- 水平。现在不需要大刀阔斧的重构，而是做精细化打磨。

### 最重要的三件事（本周就能做完）

1. **修 normalizeDuplicateMode** — 1 分钟，零风险
2. **加 SQLite pragma** — 5 分钟，零风险，性能立竿见影
3. **处理空壳歌词 provider** — 10 分钟，从 UI 移除或标注

### 不要急着做的事

- IPC 批处理重构 — 改动面大，当前性能对大多数用户够用
- DFF 支持 — 用户群体极小（大部分 DSD 用户用 DSF）
- Musixmatch/Genius 实现 — 法律风险高，收益不确定

### 发布前检查清单

- [ ] `npm test` 全部通过
- [ ] `npm run typecheck` 无错误
- [ ] 在 1000+ 首歌的库上完整使用一轮
- [ ] 测试 WASAPI Exclusive + ASIO 播放
- [ ] 测试 Gapless 连续播放 3+ 首歌
- [ ] 测试中文/日文搜索
- [ ] 测试歌词显示（本地 LRC + 在线）
- [ ] 测试 Discord RPC 显示
- [ ] 测试播放列表导入/导出
- [ ] 确认下载功能（yt-dlp 可用时）

---

*此文档由代码静态分析生成，建议配合实际运行测试验证。*

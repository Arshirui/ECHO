# ECHO Next 终极完整分析报告

日期：2026-05-20  
范围：当前工作区 `D:\ECHONext\ECHO-Next`。本文里的 ECHO 默认指 ECHO Next 当前版本。  
目标：完整分析现有功能、功能缺口、性能缺口、低风险高回报事项、未来路线，并对比 Roon 与 foobar2000。  
执行方式：静态代码与文档分析为主，结合近期本仓库维护记录，以及 Roon / foobar2000 官方页面做对标。本文没有运行测试、没有改业务代码、没有触碰数据库或用户数据。

## 0. 结论总览

ECHO Next 现在已经不是一个普通播放器壳子。它已经具备一套较完整的桌面音乐播放器架构：Electron 桌面壳、SQLite 本地资料库、扫描与封面缓存、FTS 搜索、播放队列、原生音频桥、WASAPI / ASIO / System / DirectSound 兼容路径、歌词、MV、流媒体账号、下载、Connect、插件、设置、诊断、数据库保护与恢复等。

它当前最强的方向不是“成为更轻的 foobar2000”，也不是“复制 Roon”。ECHO 更像一个面向 Windows、本地音乐、中文/日文音乐资料、歌词/MV、第三方平台混合播放、HiFi 输出、下载与诊断的一体化播放器。这个方向是有价值的，因为 Roon 和 foobar2000 都没有把这些东西以中文用户习惯整合到一个产品里。

但当前 ECHO 距离“成熟产品”还有明显差距。核心问题不是功能数量不够，而是功能已经很多，产品统一性、入口一致性、性能预算、后台任务边界、插件生态、跨设备架构、竞品级音频工具链还没有完全收敛。

最应该马上做的不是大改音频核心，也不是继续堆新功能，而是把已有功能“变成可靠产品”：

1. 修正设置归一化里 `duplicateTracksMode` 只保留 `strict` 的问题，避免 UI/类型支持 `balanced/aggressive` 但保存后丢失。
2. 把假入口处理掉：`audio-settings`、`lyrics-settings`、`import-file` 这类 Placeholder 路由要么跳到真实功能，要么隐藏，要么实现。
3. 把封面缓存路径迁移里的全量 `.all()` 改成分页/迭代，降低大库内存风险。
4. 给播放状态/音频状态做 push/diff/throttle，减少 500ms 轮询与大对象状态传输。
5. 做一个发布包资源体检脚本，验证 `ffmpeg`、`yt-dlp`、NCMConverter、audio host、SMTC host、AirPlay helper、native modules 在 packaged app 里真实可用。
6. 对中文文案、路由、设置、locales 做一次 UTF-8 / 渲染抽检，尤其是终端里读到乱码的位置。
7. 把诊断/实验/Library Lab 类功能继续保持默认折叠，不让实验面板变成普通用户的噪音。
8. 不要马上重写播放核心，不要默认切 DirectSound，不要为了“全能”引入高风险 provider 播放路径。

一句话路线：短期补产品破口，中期收敛性能与设置/诊断，长期再做 Roon 级的多房间/服务端/远程控制和 foobar 级插件/DSP/组件生态。

## 1. 分析方法与证据等级

### 1.1 本报告看过的主要本地范围

主要参考当前仓库这些类型的文件：

- 项目配置：`package.json`
- 架构与路线文档：`docs/ECHO_NEXT_ARCHITECTURE.md`、`docs/ECHO_NEXT_ROADMAP.md`、`docs/ECHO_NEXT_AUDIO_CORE.md`、`docs/ECHO_NEXT_LIBRARY_CORE.md`、`docs/PERFORMANCE_ISSUES.md`、`docs/FUNCTIONAL_EVALUATION.md`
- 数据库：`src/main/database/createDatabase.ts`、`src/main/database/schema.ts`
- 资料库扫描/搜索/封面：`src/main/library/workers/TsFileScanner.ts`、`src/main/library/SearchIndexTokens.ts`、`src/main/library/CoverService.ts`、`src/main/library/CoverCacheManager.ts`
- 播放与音频：`src/main/audio/AudioSession.ts`、`src/main/audio/DeviceService.ts`、`src/main/audio/DsdProbe.ts`、`src/main/audio/DsdDopPipeline.ts`、`src/shared/types/audio.ts`
- 设置：`src/main/app/appSettings.ts`、`src/renderer/pages/SettingsPage.tsx`
- UI 路由和歌曲页：`src/renderer/app/routes.tsx`、`src/renderer/pages/SongsPage.tsx`
- 下载与流媒体：`src/main/downloads/DownloadService.ts`、`src/main/streaming/StreamingService.ts`、`src/main/ipc/playbackIpc.ts`

### 1.2 外部对标来源

Roon 对标参考官方页面：

- [Roon: How Roon works](https://roon.app/en/how-roon-works)
- [Roon: Multi-room audio](https://roon.app/en/multi-room)

foobar2000 对标参考官方页面：

- [foobar2000 Overview](https://www.foobar2000.org/?page=Overview)
- [foobar2000 Audio Formats](https://www.foobar2000.org/formats)
- [foobar2000 Components Repository](https://www.foobar2000.org/components/)

### 1.3 证据等级

- A：当前代码直接可见。
- B：当前仓库文档或近期维护记录可见，但可能有轻微时效风险。
- C：官方外部页面确认。
- D：基于代码结构和产品经验的推断，需要后续验证。

本文会尽量区分“已经确定的问题”和“应该验证的风险”。

### 1.4 重要限制

这次没有跑性能 benchmark，没有启动 app，没有打开 packaged 版本，没有扫描用户真实音乐库。因此性能判断主要来自代码结构、任务模型、已存在 benchmark 脚本和风险路径，不等于实测结论。

当前工作区存在大量未提交修改和未跟踪文件。本文只做分析，不判定这些修改是谁做的，也不覆盖任何现有改动。

## 2. 当前 ECHO 的真实产品定位

### 2.1 ECHO 已经具备的产品骨架

ECHO 现在的核心不是“播放一个文件”，而是一个桌面音乐中心：

- 本地资料库管理。
- 文件夹扫描、增量变化、封面、专辑、艺术家、播放历史。
- SQLite + FTS 搜索。
- 原生音频输出和多种 Windows 输出模式。
- 歌词、多语种、翻译、偏移、字体。
- MV 搜索、绑定、质量选择、外部播放 fallback。
- NetEase / QQMusic / SoundCloud / Spotify / M3U8 等流媒体整合。
- 下载、转码、导入资料库。
- AirPlay / Connect 类能力。
- 插件系统。
- 设置、诊断、数据库保护、恢复。

这说明 ECHO 的上限不是“播放器”，而是“音乐操作系统”。问题是音乐操作系统必须非常克制，否则功能越多，越容易拖慢播放、污染 UI、增加崩溃面。

### 2.2 ECHO 最值得坚持的差异化

ECHO 最有价值的差异化不是单点技术，而是组合：

- Windows 本地优先。
- 中文用户路径优先。
- 本地音乐与国内常用平台混合。
- 歌词和 MV 是一等功能，不是插件补丁。
- HiFi 输出与播放稳定性被放在核心位置。
- 数据库保护、恢复、诊断已经开始产品化。
- 对网易云/QQ/哔哩哔哩/YouTube/SoundCloud/Spotify 等不同平台采取不同策略，而不是假装所有平台都能一样播放。

这个方向应该保留。不要因为 Roon 很强就把 ECHO 做成重服务端，不要因为 foobar 很强就把 ECHO 做成纯插件播放器。ECHO 应该吸收它们的强项，但不失去自己的用户路径。

## 3. 当前功能完整盘点

### 3.1 桌面壳与基础运行时

当前能力：

- Electron 37 + React 18 + TypeScript + Vite/electron-vite。
- Windows 打包脚本、native host 构建脚本、SMTC host、audio host。
- `electron-builder` 配置里包含 `echo-audio-host.exe`、`echo-smtc-host.exe`、AirPlay helper、ffmpeg、yt-dlp、NCMConverter 等资源。
- native modules 做了 asar unpack 配置，包括 `better-sqlite3`、`sharp`、`taglib-wasm`、`node-libraop` 等。
- 具备 dev、build、typecheck、test、audio host smoke、SMTC smoke、scan/library benchmark 等脚本。

优点：

- 不是纯 Web 壳，已经有真正的 native 能力。
- 打包资源意识较强，知道 packaged 和 dev 有区别。
- Windows 音频路径和系统集成已经进入产品核心。

缺点：

- packaged 资源可用性仍然是高风险区域。历史上已经出现过 packaged 与 dev 行为不同的问题。
- helper 和 native resources 多，任何一个资源路径、asar unpack、ABI、权限问题都会导致“开发时正常，安装包不正常”。
- 当前需要一个统一的 release runtime verifier，而不是每次出事手动查。

优先级：

- P0/P1：做发布包资源体检脚本。
- P2：把 packaged/dev 差异诊断也放进设置里的诊断导出。

### 3.2 本地资料库与数据库

当前能力：

- SQLite 资料库，schema 很丰富。
- 表覆盖 folders、tracks、covers、albums、album_tracks、artists、artist_image_cache、scan_jobs、scan_directory_snapshots、inbox、playback_history、playlists、lyrics、duplicates、MV、remote_sources、remote_tracks、streaming_tracks 等。
- FTS5 支持 tracks / remote_tracks。
- 索引较多，说明已经考虑大库查询性能。
- `createDatabase.ts` 已有 runtime pragma profile：
  - `busy_timeout=5000`
  - `journal_mode=WAL`
  - `synchronous=FULL`
  - `cache_size=-32768`
  - `temp_store=MEMORY`
  - `mmap_size=268435456`
- 数据库健康检查、保护、归档、恢复、degraded startup 已经是设计重点。
- `LibraryDatabaseManager` 已经成为正式 DB 访问和维护窗口的 choke point。

优点：

- 对用户资料库保护意识强。
- WAL + busy_timeout + health check + recovery 是正确方向。
- schema 不再是临时 demo，已经支撑较复杂产品。
- 对 corruption 的处理开始从“崩溃/删除”变成“保护原件、归档、降级运行”。

缺点：

- schema 广而深，后续 migration 风险高。
- 大库下维护任务必须非常小心，不能随便全量 `.all()` 到内存。
- 很多功能都依赖同一个 SQLite，后台分析、封面、歌词、MV、流媒体缓存、扫描如果调度不好，会互相抢资源。
- `synchronous=FULL` 安全性强，但写入吞吐会更保守；不应该轻易改，但要知道它会影响大量写入阶段。

马上值得做：

- 把 DB 大操作都按“分页/迭代/事务/可取消/可恢复”原则审计。
- `CoverCacheManager.updateCoverPathsInDatabase` 这类全量 covers `.all()` 是低风险高回报优化点。
- 新增数据库维护任务必须走 `LibraryDatabaseManager.runExclusiveMaintenance(...)`，不能各服务自己乱开 DB。

不要马上做：

- 不要为了性能把 `synchronous=FULL` 全局改成 `NORMAL`。这会牺牲用户数据保护，必须先 benchmark，而且最多考虑非关键缓存库。
- 不要自动删除或替换用户 DB。
- 不要把“修复数据库”与“删除数据库”混成一个按钮。

### 3.3 扫描、导入与资料库更新

当前能力：

- `TsFileScanner` 具备目录扫描、文件 stat、目录快照、错误隔离。
- per-directory / per-file error isolation 已经存在，扫描不应该因为一个坏目录直接全局失败。
- 目录 snapshot 可按 directory mtime / entries 做重放。
- `SongsPage` 支持分页、虚拟列表、搜索 debounce、scan polling、preserve scroll。
- 删除、标签编辑、reload embedded tags 等路径近期已经重视滚动位置保留。

优点：

- 用户浏览位置保护已经被当成真实产品 bug 处理。
- 扫描性能不再是纯全量重扫。
- 错误隔离比早期版本成熟。

缺点：

- snapshot replay 仍然可能对大量文件做 stat，超大库下仍需 benchmark。
- scan job、library changed、renderer refresh、SongsPage hydration 之间仍有 UI 抖动风险。
- 删除/编辑/重载等自触发操作如果未来新增入口，必须继续带 `preserveScroll` 语义。
- 大库下专辑/艺术家聚合如果仍全量刷新，会成为后续瓶颈。

马上值得做：

- 给 scan 结束后的 UI 更新建立统一事件语义：哪些是 full refresh，哪些是 patch，哪些必须 preserve scroll。
- 加一个“扫描性能预算”文档或测试记录：10k、50k、100k 曲库时扫描、搜索、首页刷新、专辑页打开的目标时间。

### 3.4 搜索与多语种

当前能力：

- FTS5。
- `SearchIndexTokens.ts` 已有 CJK grams、拼音 token、日文 romanization。
- 使用 `kuroshiro` / `kuroshiro-analyzer-kuromoji` 动态 import，带 cache 和 preload。
- 搜索不是只匹配英文文件名，已经面向中文/日文音乐库。

优点：

- 这是 ECHO 对 foobar/Roon 的潜在优势之一。
- 对 CJK 用户来说，拼音、假名、罗马字、中文分词/grams 很重要。

缺点：

- advanced query 还不明显，比如布尔、字段搜索、范围、格式、码率、采样率、播放次数、最近添加等组合筛选。
- 搜索 token 扩展会增加 DB 尺寸和重建成本。
- 日文 romanizer 依赖动态加载，冷启动或首次搜索要控制。

路线建议：

- P1：保持当前多语种搜索稳定，不做大改。
- P2：做高级筛选 UI，不一定做复杂 query language，先做字段 facet。
- P3：把搜索结果解释和 smart playlist 结合。

### 3.5 封面、艺术家图与远程元数据

当前能力：

- 本地封面表与缓存路径。
- remote cover worker pool。
- `sharpConcurrency: 1`，worker 数有上下限，任务有 timeout，worker 可退休/替换。
- network metadata 默认关闭，避免后台网络任务默认打扰。

优点：

- 已经有 worker pool，不是全部压主进程。
- 默认关闭网络 metadata 是稳定优先。
- 封面和资料库分离，具备缓存迁移基础。

缺点：

- `RemoteCoverWorkerPool` 当前以 eval string worker 的方式启动，维护性和安全边界不如独立 worker 文件。
- `CoverCacheManager.updateCoverPathsInDatabase` 仍有全量 `.all()` 迁移路径，大库下容易吃内存。
- 远程图片下载、sharp 解码、DB 写入、UI 刷新是典型后台压力链。

马上值得做：

- P1：封面路径迁移分页/迭代。
- P2：把 eval worker 改成真实 worker 文件。
- P2：给 remote cover pipeline 加最大输入尺寸、最大响应体、mime 校验、重试退避指标。

### 3.6 播放核心与音频输出

当前能力：

- 原生音频 host。
- 输出模式包括 `shared`、`exclusive`、`asio`、`system`。
- shared backend 包括 `auto`、`windows`、`directsound`。
- JUCE output 默认开启，JUCE decode 默认关闭。
- ASIO、WASAPI、System audio、DirectSound 手动兼容路径。
- ReplayGain、gapless、automix、watchdog、稳定层级、fallback、telemetry。
- DSD/DSF probe、DoP/native DSD 相关路径。
- 设备缓存、ASIO cache、shared cache、ASIO control panel。

优点：

- Windows HiFi 能力是 ECHO 的核心资产。
- 已经知道 DirectSound 应该是手动兼容模式，而不是静默默认 fallback。
- System audio path 已经通过协议/预加载路径被认真验证过。
- 对 access violation、helper crash、stderr/ready chain 等问题已经有现实经验。

缺点：

- `AudioSession.ts` 很大，状态字段很多，维护成本高。
- 播放状态对象很重，频繁 `getStatus` / IPC / UI polling 容易造成额外负担。
- DFF 目前看起来能 probe sample rate，但 DoP/native stream pipeline 更偏 DSF，DFF 完整播放链仍是缺口。
- 原生 DSD、ASIO native DSD 等处在实验/谨慎状态。
- DSP 能力距离 Roon/foobar 还远：没有成熟插件 DSP、VST、卷积、房间校正、crossfeed、响度管理矩阵。
- bit-perfect 证明链还不完整，用户看到“独占/ASIO”不等于有完整信号路径可解释。

马上值得做：

- P1：播放状态 push/diff/throttle，减少频繁大对象轮询。
- P1：保持 DirectSound 手动，不做自动默认 fallback。
- P1：发布包资源体检必须覆盖 audio host。
- P2：建立音频输出矩阵：设备类型、输出模式、格式、采样率、独占/共享、fallback、错误文案、可恢复策略。
- P2：DFF 完整播放链。

不要马上做：

- 不要重写 AudioSession。
- 不要把所有 fallback 自动化到用户无感，因为音质/独占/设备选择可能被悄悄改变。
- 不要把实验性 native DSD 当默认卖点。

### 3.7 歌词

当前能力：

- 本地歌词、LRCLIB、网易云、QQMusic，配置里也有 Musixmatch/Genius 相关 provider 位置。
- 歌词偏移、全局 offset、单曲 offset。
- 歌词字体独立设置，不污染全局字体。
- 歌词翻译、罗马音/音译等方向已有基础。

优点：

- 歌词是 ECHO 的一等功能，不是播放器角落里的文本框。
- 已经知道“轻微延迟”优先用显示层 offset，而不是动音频核心。
- 歌词字体独立是正确产品设计。

缺点：

- provider 可用性会受网络、API、版权、cookie、格式差异影响。
- Musixmatch/Genius 如果只是占位或默认不启用，就不应该在 UI 上给用户过高期待。
- local `.lrc` encoding、时间轴、翻译行匹配、逐字歌词、双语歌词仍然是长期细节战。

马上值得做：

- P1：确认歌词 provider UI 是否准确表达“可用/未配置/实验/不可用”。
- P1：UTF-8 / 本地 LRC 编码适配继续坚持 app-side，不要求用户改源文件。
- P2：歌词质量评分和手动纠错保存。

### 3.8 MV

当前能力：

- Bilibili / YouTube / 本地 MV。
- MV 质量、FPS、codec-aware fallback。
- Bilibili 4K/120fps 相关路径近期已经增强。
- HEVC / Dolby Vision 等浏览器不友好 codec 可外部播放 fallback。
- MV 与 track 绑定、缓存、track_videos / streams 表。
- DB 不可用时有 ephemeral MV 降级播放思路。

优点：

- MV 是 ECHO 的强差异化。
- 能区分 qn、FPS、codec，而不是只看“最高质量”。
- 外部 fallback 是现实方案。

缺点：

- MV provider 易受平台策略和 cookie 影响。
- 浏览器内播放能力受 codec / CORS / URL 时效影响。
- MV 数据库与资料库耦合，DB 不可用时必须继续降级。
- MV UI 如果过度自动加载，会影响播放页性能。

马上值得做：

- P1：继续保持 codec-aware，不能让 HEVC/Dolby Vision 覆盖可播放 in-app path。
- P2：MV provider 质量矩阵与失败原因可视化。
- P2：MV 加载按需，不影响歌曲播放。

### 3.9 流媒体与远程来源

当前能力：

- provider 包括 mock、NetEase、QQMusic、SoundCloud、Spotify、M3U8。
- 搜索缓存、详情缓存、播放缓存。
- provider timeout、rate limiter。
- playlist import page size、max 20k。
- NetEase / QQMusic liked songs sync。
- NetEase / QQMusic / Spotify playlist import。
- playback resolver 要求 provider 返回 playable URL。
- Spotify playback 明确不进入 native audio session，而走官方/Web Playback 语义。

优点：

- 不是盲目接平台，已经有 direct-play contract。
- 缓存、限流、timeout 都有。
- 对 Spotify/TIDAL 类服务没有假装“可以像网易云/QQ 一样直接播”，这是诚实产品边界。

缺点：

- provider URL 时效、cookie、版权、地区限制会导致体验不稳定。
- direct playable URL contract 决定了有些服务不适合低风险接入。
- imported playlist hydration 很容易丢质量、丢 provider metadata，之前已经出现过 Hi-Res 变 320kbps 的问题。
- provider 失败如果变成全局 popup，会打扰播放体验。

马上值得做：

- P1：所有 provider UI 都要明确：可原生播放、只能导入 metadata、只能外部打开、需要登录、不可用。
- P1：质量选择必须贯穿 Search -> Playlist -> Cache -> LibraryTrack -> Playback。
- P2：provider health 页面，显示登录、cookie、速率限制、最近错误、可播放性。

不要马上做：

- 不要承诺 TIDAL 这类服务“像网易云/QQ 那样直接搜到就播”，除非能合法稳定拿到真实 playable stream URL。
- 不要把 Spotify 强塞进 native audio。

### 3.10 下载、转码与导入

当前能力：

- YouTube、Bilibili、SoundCloud、osu、direct audio。
- yt-dlp、ffmpeg、NCMConverter。
- import-to-library。
- 下载后绑定 MV。
- `spawn(..., { shell: false, windowsHide: true })`。
- headers/output name/extensions 有清理。
- command output capped。
- progress emit 500ms。
- Spotify 下载/播放类路径被 policy block。

优点：

- 安全意识比很多 downloader 强，不走 `shell: true`。
- 下载与导入资料库/MV 绑定形成闭环。

缺点：

- 外部工具链版本、路径、权限、杀软、平台策略都会影响。
- 500ms progress emit 如果多个任务并发可能造成 UI churn。
- 下载功能天然容易带来合规与用户期望风险。

马上值得做：

- P1：发布包资源体检覆盖 yt-dlp、ffmpeg、NCMConverter。
- P2：下载任务并发、输出大小、日志导出、失败原因分类。
- P2：下载 UI 不应该阻塞播放页或全局播放状态。

### 3.11 Connect / AirPlay / 多设备

当前能力：

- AirPlay / RAOP helper。
- 近期已经从单网卡假设转为绑定 `0.0.0.0` 并跨多个真实 LAN IPv4 广播。
- 过滤虚拟/VPN adapter。

优点：

- 已经抓住 Windows 设备上多网卡/虚拟网卡这个真实问题。
- Connect 功能是未来差异化入口。

缺点：

- 这还不是 Roon 的 RAAT / zone sync / endpoint ecosystem。
- AirPlay discovery 和 receiver 是平台脆弱区。
- 多房间同步、分组播放、延迟校准、跨设备控制还不是完整体系。

路线：

- P1：保持 AirPlay 可靠发现和清晰错误。
- P2：Connect diagnostics：列出绑定 IP、广播接口、端口、helper 状态。
- P3：多输出/多设备同步 proof-of-concept。
- P4：真正 Roon-like zone architecture。

### 3.12 插件

当前能力：

- 已有插件页面、插件 docs、设置跳转入口。
- 本地插件能力开始形成。

优点：

- 这是追 foobar 长期生态的入口。
- 插件如果做对，可以把实验功能从主线剥离，降低核心风险。

缺点：

- 距离 foobar component ecosystem 还很远。
- 需要 API version、权限、沙箱、事件、UI extension、设置页、日志、安装/卸载/更新、签名、兼容性、示例插件、开发文档。
- 插件如果没有权限模型，会变成安全风险。
- 插件如果能直接碰播放核心，会变成稳定风险。

路线：

- P1：插件系统先定义“不允许做什么”。
- P2：插件 API v1，只开放低风险事件和只读资料。
- P2：示例插件：歌词 provider、metadata provider、简单 UI panel。
- P3：插件市场/签名/版本兼容。
- P4：DSP/decoder/output 类高风险插件必须晚做。

### 3.13 设置与诊断

当前能力：

- `SettingsPage.tsx` 功能非常多，覆盖播放、歌词、MV、资料库、网络 metadata、数据库保护、备份、诊断、插件入口等。
- ReplayGain 和 BPM 已经改成更低压力的 on-play / manual 方向。
- 数据库恢复 UI 已经保护原件。
- 诊断面板正在增强。

优点：

- 设置不是假壳，很多设置有真实 backend。
- 近期已经多次补齐“功能存在但设置页找不到”的问题。
- 数据库危险操作有更好的保护意识。

缺点：

- `SettingsPage.tsx` 过大，接近“所有产品状态的黑洞”。
- 搜索 alias 需要手动维护，容易漂移。
- 设置页若一次挂载太多 panel，会拖慢设置打开和重渲染。
- 路由中仍有 placeholder settings 页，容易造成“看起来有入口，进去是假的”。

马上值得做：

- P1：处理 placeholder routes。
- P1：设置归一化 bug。
- P2：拆 SettingsPage，但不要为了拆而大重构。先按 section lazy mount 或局部组件化。
- P2：设置搜索 alias 加测试。

## 4. 现在最明显的功能缺点

### 4.1 假入口和重复入口

当前路由里存在 `PlaceholderPage`：

- Audio Settings route。
- Lyrics Settings route。
- Import File route。

问题：

- 真实功能可能已经在 SettingsPage 或 drawer 里，但路由还是假页。
- 用户会认为功能没做完。
- 这类问题对产品信任伤害很大，修复成本低。

建议：

- 如果已有真实设置：路由直接 redirect 到 Settings 对应 section 或打开 drawer。
- 如果只是菜单项：暂时隐藏。
- 如果应该是独立页面：快速做一个真实最小页面。

优先级：P0/P1。

风险：低。

回报：高。

### 4.2 设置保存与类型不一致

当前代码里有一个高价值低风险点：

`appSettings.ts` 的 `normalizeSettings` 对 `duplicateTracksMode` 的处理看起来只保留 `strict`，否则回到默认值。但类型和 IPC 已经支持：

- `strict`
- `balanced`
- `aggressive`

影响：

- 用户可能选择 balanced/aggressive 后保存失效。
- UI、IPC、类型、业务逻辑不一致。
- 这是典型“功能存在但不可信”的 bug。

建议：

- 用 `Set(['strict', 'balanced', 'aggressive'])` 校验。
- 或如果产品只想保留 strict，就移除 UI/类型里的其它项。但当前更合理是保留三个模式。

优先级：P0/P1。

风险：低。

回报：高。

验证：

- 只跑 `appSettings` 相关 focused test，或新增一个 normalize 单测。
- 不需要全量测试。

### 4.3 插件看起来有，但生态还没有

当前插件系统已经有入口和文档，但与 foobar 的 component ecosystem 不是一个层级。

缺口：

- 权限声明。
- API version。
- 生命周期。
- 设置 schema。
- UI extension point。
- provider extension point。
- 日志与崩溃隔离。
- 插件升级/禁用/回滚。
- 示例插件。
- 插件签名或信任模型。

建议：

- 插件 v1 只开放低风险能力：只读资料库查询、菜单动作、metadata provider、lyrics provider、普通 UI panel。
- 不要一开始就开放 decoder/output/DSP。
- 插件必须默认不能阻塞播放。

优先级：P2。

### 4.4 高级资料库能力不足

ECHO 有资料库，但还没有 Roon 级音乐知识图谱，也没有 foobar 级 power user 工具。

缺口：

- Smart playlist / dynamic playlist。
- 高级筛选：格式、采样率、bit depth、codec、文件夹、rating、播放次数、最近添加、缺封面、缺歌词。
- 批量标签编辑能力还不够像 foobar。
- ReplayGain 批量扫描工作流不够完整。
- DR meter / 音频完整性校验 / ABX 等专业工具缺失。
- 专辑版本、曲目版本、duplicate representative 手动选择仍有 TODO。

建议：

- P1/P2：先做 smart filters，不急着做完整 query language。
- P2：补手动 duplicate representative。
- P2：批量 tag/edit/replaygain workflow 逐步增强。
- P3：专业工具插件化。

### 4.5 多设备与远程控制不足

与 Roon 相比，ECHO 当前 Connect 还在初级阶段。

缺口：

- 没有 Roon Server/Core 模型。
- 没有手机/平板 Remote 作为一等控制端。
- 没有 ARC 类外网访问。
- 没有多房间 zone grouping。
- 没有跨设备同步播放和延迟校准。
- 没有 Roon Ready / RAAT 式认证设备生态。

建议：

- 短期不要硬追。
- 中期先做本机多输出/远程控制 API。
- 长期再做 server-core 与 endpoint。

### 4.6 DSP 与专业音频工具链不足

ECHO 已有输出模式和基础 EQ / ReplayGain / gapless / automix，但还没到 Roon/foobar 的 DSP 生态。

缺口：

- 卷积。
- 房间校正。
- Crossfeed。
- Loudness compensation。
- VST adapter。
- DSP chain 可视化。
- Signal path 可解释。
- ABX / DR meter / audio integrity。
- HDCD / SACD ISO / obscure game music formats 等 foobar 生态能力。

建议：

- P2：先做 signal path 可视化与输出验证。
- P3：做 DSP chain 架构。
- P4：插件化 DSP / VST。

### 4.7 Provider 真实可播放性不足

ECHO 的流媒体集成有清晰现实约束：provider 必须能返回可播放 URL 才能进入 native playback。

缺口：

- TIDAL 等服务不适合在当前 direct-play contract 下低风险接入。
- Spotify 不能当作 native audio source。
- 平台 cookie / API / 版权限制会导致“能搜到但不能播”。

建议：

- UI 上明确区分：
  - 可原生播放。
  - 只可导入歌单/metadata。
  - 只可外部播放。
  - 需要登录。
  - 当前 provider 不可用。

这比假装都能播更重要。

## 5. 当前性能缺点与风险

### 5.1 播放状态与 UI 轮询压力

风险路径：

- `AudioSession` 状态字段很多。
- `AudioStatus` 包含大量 telemetry、device、format、fallback、analysis 字段。
- PlayerBar / UI 如果 500ms polling 或频繁 IPC 取大对象，会造成稳定的后台开销。

为什么重要：

- 音乐播放器最怕“看起来只是 UI 刷新，但每半秒都打扰主进程”。
- 当播放、扫描、封面、歌词、MV、下载同时存在时，小的轮询会叠加。

建议：

- 改成主进程 push 状态变化。
- 状态对象 diff 化。
- 高频字段和低频字段拆开。
- 波形/进度/电平这类高频状态走轻量 channel。
- 设备列表、输出能力、fallback 这类低频状态缓存并按需刷新。

优先级：P1。

风险：中低。只要保持旧 IPC fallback，可渐进。

### 5.2 SettingsPage 过大

风险路径：

- `SettingsPage.tsx` 非常大，功能集中。
- 搜索、导航、各种 panel、diagnostics、provider state 都堆在一起。

影响：

- 设置页打开慢。
- 改一处容易影响另一处。
- 测试困难。
- 搜索 alias 容易漂移。
- 功能 discoverability 依赖人工维护。

建议：

- 不做大重写。
- 先按 section 抽出低风险组件。
- Dev/lab/diagnostics panel lazy mount。
- Search index 用结构化 section registry 生成，不再完全手写 alias。

优先级：P2。

### 5.3 封面路径迁移全量读取

风险路径：

- `CoverCacheManager.updateCoverPathsInDatabase` 读取 covers 全量 rows 后循环。

影响：

- 大资料库内存尖峰。
- C 盘迁移、cache directory 改动、重装恢复时风险高。

建议：

- 用 `iterate()` 或 LIMIT/OFFSET/keyset paging。
- 每批 transaction。
- 每批可记录进度。
- 失败可重试，不污染已完成数据。

优先级：P1。

风险：低。

回报：高。

### 5.4 远程封面 worker 用 eval string

风险路径：

- worker 通过 eval source 启动。

影响：

- 安全边界和维护性不如独立 worker 文件。
- 打包、source map、错误定位不理想。

建议：

- 改成真实 worker 文件。
- 保留当前 worker pool 行为。
- 不改变业务逻辑。

优先级：P2。

### 5.5 搜索 token 与 FTS 体积增长

风险路径：

- CJK grams、拼音、日文 romanization 都会增加 token 数量。
- 大库下 FTS rebuild 可能昂贵。

建议：

- 记录 FTS size。
- FTS rebuild 做可取消任务。
- 日文 romanization cache 限制容量。
- Search index migration 不要阻塞播放。

优先级：P2。

### 5.6 MV / wallpaper /视觉层 compositor 成本

风险路径：

- 视频壁纸、MV 背景、动态视觉层都可能让 GPU/compositor 忙。
- 播放器的视觉功能如果不克制，会影响音频稳定。

当前已有好方向：

- route switch 不卸载 video node，hidden/blur 暂停。
- `will-change` 只在 loaded visible media 使用。

建议：

- 继续给动态视觉层设性能预算。
- 在电池模式、后台、窗口隐藏、低端 GPU 下自动降级。
- 不让 MV/wallpaper 与播放音频争资源。

优先级：P2。

### 5.7 下载/转码任务与播放争资源

风险路径：

- yt-dlp、ffmpeg、NCMConverter 都可能占 CPU、磁盘、网络。
- 多任务下载 + 转码 + 导入 + 扫描会与播放抢资源。

建议：

- 下载/转码并发默认保守。
- 播放中降低转码优先级。
- 任务进度节流。
- 下载日志和失败原因可导出。

优先级：P2。

### 5.8 SQLite `synchronous=FULL` 的性能代价

当前设置更偏数据安全，这符合用户资料库保护目标。

风险：

- 大量写入时比 `NORMAL` 慢。

建议：

- 不要全局改。
- 只可以对非关键缓存做受控实验。
- 用 benchmark-library 比较，不凭感觉改。

优先级：P3。

## 6. 低风险高回报事项清单

### 6.1 P0/P1：马上做

#### 1. 修正 `duplicateTracksMode` 设置归一化

问题：

- 类型/IPC 支持 `strict|balanced|aggressive`。
- `normalizeSettings` 看起来只保留 `strict`。

做法：

- 用 set 校验三个合法值。
- 增加 focused test。

收益：

- 立即修复用户设置不可信问题。

风险：

- 极低。

验证：

- 只测 appSettings normalize。

#### 2. 处理 Placeholder 路由

问题：

- Audio Settings / Lyrics Settings / Import File 仍是 placeholder。

做法：

- Audio Settings 跳转到 Settings playback/audio section。
- Lyrics Settings 跳转到 Settings lyrics section 或打开 Lyrics drawer。
- Import File 调用现有导入文件逻辑，或实现最小真实页。

收益：

- 消除“假功能”观感。

风险：

- 低。

验证：

- 打开三个入口，确认不会进入 placeholder。

#### 3. 封面路径迁移分页化

问题：

- 全量读取 covers。

做法：

- `iterate()` 或 keyset paging。
- batch transaction。

收益：

- 大库迁移稳定性提升明显。

风险：

- 低。

验证：

- 只测 CoverCacheManager 路径迁移。

#### 4. 发布包资源体检脚本

问题：

- packaged/dev 差异是高频风险。

做法：

- 脚本检查：
  - audio host exe。
  - SMTC host exe。
  - ffmpeg。
  - yt-dlp。
  - NCMConverter。
  - AirPlay helper。
  - better-sqlite3 native module。
  - sharp native module。
  - taglib wasm。
  - node-libraop optional 状态。
- 输出 JSON + 人类可读 summary。

收益：

- 用户报“安装包不行”时能快速定位。

风险：

- 低。

验证：

- 本地 build resources 下跑一次，不需要全量应用测试。

#### 5. 播放状态 push/diff/throttle 设计与第一步落地

问题：

- 大状态频繁 polling。

做法：

- 先保留旧 `getStatus`。
- 新增 `audio:status-changed` diff event。
- PlayerBar 订阅新事件，失败时 fallback。

收益：

- 降低播放时主进程/renderer IPC 压力。

风险：

- 中低。

验证：

- 播放状态 UI focused test + 一次手动播放观察。

#### 6. UTF-8 / 文案渲染抽检

问题：

- 当前终端读取部分中文出现乱码。可能只是终端编码，也可能是文件局部编码问题。

做法：

- 对 routes、locales、SettingsPage、README、docs 做 UTF-8 检查。
- 用 app 渲染或文本解码确认，不直接假定源文件损坏。
- 如要修复，先备份。

收益：

- 防止中文用户第一眼看到乱码。

风险：

- 检查低风险；修复需谨慎。

#### 7. Provider 能力标签

问题：

- 用户容易以为“能搜到就能播”。

做法：

- 每个 provider 显示能力：
  - 搜索。
  - 歌单导入。
  - 原生播放。
  - 外部播放。
  - 需要登录。
  - 受限/实验。

收益：

- 减少误解和 bug 报告。

风险：

- 低。

### 6.2 P2：短期做

#### 8. Smart filters / smart playlist 第一版

做法：

- 先做 UI facet：
  - 格式。
  - 采样率。
  - bit depth。
  - 是否缺封面。
  - 是否缺歌词。
  - 最近添加。
  - 文件夹。
  - 播放次数。
  - 收藏。

收益：

- 提升资料库可用性，靠近 Roon/foobar power user。

#### 9. Duplicate 手动代表版本

做法：

- 在 duplicate version panel 里允许用户指定 representative。

收益：

- 用户能控制重复曲目展示。

#### 10. DFF 完整播放链

做法：

- 已有 DFF probe 基础时，补 DoP/native/PCM fallback 流程。

收益：

- 完善 DSD 叙事。

风险：

- 中。必须不影响 DSF。

#### 11. Plugin API v1

做法：

- 固定 manifest。
- 权限模型。
- 只读资料库 API。
- provider extension API。
- 插件日志。
- 示例插件。

收益：

- 为长期生态打基础。

#### 12. SettingsPage section 化

做法：

- 不重写。
- 按稳定 section 提取组件。
- Dev/diagnostics lazy mount。

收益：

- 降低维护成本。

#### 13. Connect 诊断页

做法：

- 显示 AirPlay helper 状态。
- 绑定地址。
- 广播接口。
- mDNS 状态。
- 端口。
- 最近错误。

收益：

- 排查“搜不到”更快。

### 6.3 P3/P4：中长期做

#### 14. Roon-like Core / Remote / Endpoint 架构

这是长期战略，不适合马上做。

需要：

- 常驻 server。
- 手机/平板 remote。
- endpoint protocol。
- zone grouping。
- 多房间同步。
- 外网访问。
- 用户权限。

#### 15. DSP chain 与信号路径

需要：

- DSP pipeline。
- 每一步 sample rate / bit depth / gain / resampler 可视化。
- 卷积、crossfeed、loudness、VST。

#### 16. 专业工具插件生态

需要：

- ABX。
- DR meter。
- Audio MD5 / integrity。
- Masstagger 类批处理。
- Converter profiles。
- Columns/layout 类 UI 插件。

## 7. P0/P1 马上行动路线

### 7.1 第 1 天：修产品信任破口

任务：

1. 修 `duplicateTracksMode` normalize。
2. 处理 placeholder routes。
3. 检查设置页和路由中文渲染。

验证：

- focused unit/component test。
- 手动打开相关入口。

不做：

- 不跑全量测试。
- 不动音频核心。

### 7.2 第 2-3 天：修大库低风险性能点

任务：

1. CoverCacheManager path migration 分页化。
2. 加一个小 benchmark 或 mock 大量 covers 的 focused test。
3. scan/library changed 事件语义记录成文档。

验证：

- CoverCacheManager focused test。
- 可选跑 `benchmark:library` 的相关小场景。

### 7.3 第 4-5 天：补发布可靠性

任务：

1. release runtime verifier。
2. packaged resource paths 输出 summary。
3. Settings diagnostics 里可导出 verifier 结果。

验证：

- dev resources 一次。
- packaged resources 一次。

### 7.4 第 6-7 天：降低播放 UI 背景压力

任务：

1. 设计 status diff event。
2. PlayerBar 先接入非破坏式 event。
3. 保留旧 polling fallback。

验证：

- focused renderer test。
- 手动播放观察 CPU/IPC。

## 8. 未来路线图

### 8.1 0-7 天：稳定产品面

目标：把已有功能从“能用”推进到“可信”。

重点：

- 修设置归一化。
- 清理假入口。
- 资源体检。
- 封面迁移分页。
- 文案/编码抽检。
- provider 能力标签。
- 保持诊断/实验功能默认折叠。

成功标准：

- 用户不会点到假页面。
- 设置保存不丢。
- packaged 资源缺失能立即发现。
- 大库缓存迁移没有明显内存尖峰。

### 8.2 2-4 周：资料库与播放状态收敛

目标：降低长期维护成本，提高大库体验。

重点：

- Playback/audio status push。
- Smart filters v1。
- Real Import File page。
- Duplicate representative。
- SettingsPage section 化。
- Provider health 页面。
- AirPlay diagnostics。
- Download/convert task resource policy。

成功标准：

- 资料库常用操作更快。
- 播放页不依赖重轮询。
- 设置页更容易维护。
- provider 失败原因清楚。

### 8.3 1-3 个月：专业音频与资料库增强

目标：开始接近 power-user 产品。

重点：

- 音频输出验证矩阵。
- Signal path 第一版。
- DFF 完整链路。
- ReplayGain 批处理工作流。
- Smart playlist。
- Batch tagging。
- FTS / search benchmark。
- Plugin API v1。

成功标准：

- 用户能理解当前播放链路是否 bit-perfect / 是否 fallback。
- 大库筛选和整理能力明显提升。
- 插件开始能承担低风险扩展。

### 8.4 3-6 个月：Roon/Foobar 差距收缩

目标：选择性吸收竞品强项。

重点：

- Roon-like discovery 页面：艺术家、credits、版本、相似音乐。
- 本地 metadata graph。
- 多设备 remote control proof。
- 多输出/zone proof。
- DSP chain 架构。
- 插件权限与 marketplace 雏形。

成功标准：

- ECHO 不只是“播放和列表”，而是能帮助探索音乐。
- 初步支持跨设备控制。
- 插件不是摆设。

### 8.5 6-12 个月：生态与平台化

目标：从应用变成平台。

重点：

- Server/Core 模式。
- 手机 Remote。
- Endpoint。
- 多房间同步。
- 外网访问。
- 插件市场。
- DSP/VST/专业工具。
- 数据迁移/备份/恢复成熟化。

成功标准：

- ECHO 有自己的生态路线，不依赖不断堆内置功能。

## 9. ECHO vs Roon

### 9.1 Roon 当前核心强项

根据 Roon 官方说明，Roon 是典型 Core/Server + Apps + Audio Devices 架构：

- Roon Server 管理音乐、流媒体服务和音频设备。
- Roon Remote 在手机、平板、电脑上控制 Roon Server。
- Roon ARC 支持外出访问。
- Roon 可向 Roon Ready、AirPlay、Chromecast、SONOS、Bluetooth、USB、HDMI 等设备播放。
- Roon Multi-room 强调分组播放、全屋同步、设备兼容。
- Roon 强调 rich metadata：artist bios、liner notes、lyrics、credits、images、music discovery。
- Roon 强调 bit-perfect、高规格 PCM、signal transparency、advanced DSP。

### 9.2 ECHO 已经比 Roon 更贴近的方向

ECHO 的优势不是全屋生态，而是本地 Windows + 中文音乐场景：

- 中文/日文搜索、拼音、假名、歌词、本地 LRC 更贴近国内用户。
- 网易云/QQMusic/哔哩哔哩/YouTube/SoundCloud 等混合能力更贴近当前用户真实来源。
- MV 是核心功能，Roon 不是以 MV 为主。
- 下载、导入、转码、绑定 MV 更像本地音乐整理工具。
- 数据库保护和恢复可以按本地用户习惯做得更直接。
- 开源/可定制潜力更高。

### 9.3 ECHO 和 Roon 还差什么

#### 差距 1：Core/Server 架构

Roon 有中心 Server 管理全部音乐和设备。ECHO 当前更像单机桌面应用。

ECHO 要补：

- 常驻 core。
- 本机 UI 与 core 解耦。
- 多客户端控制。
- core 状态同步。
- headless / NAS / mini PC 部署。

优先级：P4。

#### 差距 2：Remote / ARC

Roon 有手机/平板 Remote 和 ARC 外出访问。

ECHO 要补：

- 手机控制端。
- 局域网 remote API。
- 安全认证。
- 外网访问策略。
- 转码/带宽控制。

优先级：P4。

#### 差距 3：多房间与设备生态

Roon 的 multi-room 是核心卖点。ECHO 目前 AirPlay/Connect 只是起点。

ECHO 要补：

- zone model。
- group playback。
- latency calibration。
- endpoint capability negotiation。
- device certification 或兼容清单。

优先级：P3/P4。

#### 差距 4：音乐发现与 metadata graph

Roon 的强项是 rich metadata 和探索。

ECHO 要补：

- 艺术家 biography。
- credits。
- album version。
- performer / composer / producer。
- 相似艺术家/专辑。
- 本地 listening graph。
- metadata provider priority 与冲突解决。

优先级：P3。

#### 差距 5：Signal path 与 DSP 信任感

Roon 会让用户理解播放链路和 DSP。

ECHO 要补：

- 当前文件格式。
- decode path。
- output mode。
- sample rate conversion。
- ReplayGain。
- EQ/DSP。
- fallback 是否发生。
- 是否 bit-perfect。
- 为什么不是 bit-perfect。

优先级：P2/P3。

### 9.4 不建议照抄 Roon 的地方

不要马上做：

- 强制 server 化。
- 强制账号/订阅。
- 为多房间重写播放核心。
- 为 discovery 引入大量后台网络抓取。

原因：

- ECHO 当前最重要是播放稳定、资料库保护、本地体验。
- 过早 Roon 化会放大架构复杂度。

## 10. ECHO vs foobar2000

### 10.1 foobar2000 当前核心强项

根据 foobar2000 官方 Overview / Audio Formats / Components：

- 主流格式开箱即播。
- 额外 decoder components 支持更多格式。
- Gapless playback。
- 本地网络串流/控制其它播放器。
- Windows/macOS 可高度自定义 UI layout。
- 高级 tagging。
- Audio CD ripping。
- 转码所有支持格式。
- Full ReplayGain。
- 自定义快捷键。
- 内建 DSP，组件可扩展 DSP。
- Windows 可通过 VST adapter 加载 VST。
- Internet radio。
- 开放 component 架构。
- 官方组件仓库覆盖 decoder、DSP、tagging、output、ReplayGain、search、SQL、remote control、lyrics、visualization 等很多类别。
- 无 telemetry / no data collection。

### 10.2 ECHO 已经比 foobar 更现代/集成的方向

ECHO 的优势：

- UI 更现代。
- 歌词、MV、流媒体、下载、资料库、诊断内置整合。
- 中文用户路径更友好。
- 本地数据库与封面/艺术家/MV/lyrics 结构更适合做现代资料库。
- 设置和恢复可以做成产品化，而不是依赖用户拼组件。
- Windows HiFi 输出正在变成核心体验。

### 10.3 ECHO 和 foobar2000 还差什么

#### 差距 1：组件生态

foobar 最大护城河之一是多年组件生态。

ECHO 要补：

- 插件 API version。
- 插件权限。
- 插件安装/卸载/更新。
- 组件仓库。
- 示例和文档。
- 插件崩溃隔离。
- 插件兼容性测试。

优先级：P2-P4。

#### 差距 2：专业格式和 decoder breadth

foobar 通过组件支持大量 obscure formats。

ECHO 要补：

- DFF 完整链。
- SACD ISO / DST 视需求。
- HDCD。
- TAK / WavPack / Monkey's Audio / module/game music formats 视用户群。
- Decoder plugin seam。

优先级：P2-P4。

#### 差距 3：批量标签与文件操作

foobar 的高级 tagging / Masstagger 类能力很强。

ECHO 要补：

- 批量 tag editor。
- 文件名模板重命名。
- tag from filename。
- filename from tag。
- 外部 tag sidecar。
- non-taggable formats 的数据库标签。
- 批量封面写入/提取。

优先级：P2/P3。

#### 差距 4：转换与 ReplayGain 工作流

foobar 的 converter / ReplayGain 是成熟 power-user 工具。

ECHO 要补：

- 转码 preset。
- ReplayGain album/track 批量分析。
- 防 clipping 策略。
- 转码后自动导入。
- 转码任务 CPU 策略。

优先级：P2/P3。

#### 差距 5：DSP/VST/ABX/DR 等专业工具

ECHO 现在更像现代体验播放器，foobar 更像音频工具箱。

ECHO 要补：

- DSP chain。
- VST adapter。
- ABX comparator。
- DR meter。
- Audio integrity / checksum。
- Crossfeed / convolution / resampler 可配置。

优先级：P3/P4。

#### 差距 6：轻量与稳定口碑

foobar 的优势是轻、稳、可预测。

ECHO 的挑战：

- Electron + React + SQLite + native host + provider + MV/lyrics/download 天然更重。
- 所以 ECHO 不能靠“比 foobar 更轻”取胜。
- ECHO 必须靠“集成体验更强，同时播放不被拖累”取胜。

## 11. 功能优先级总表

| 优先级 | 项目 | 类型 | 风险 | 回报 | 备注 |
|---|---|---:|---:|---:|---|
| P0/P1 | 修 `duplicateTracksMode` normalize | 功能正确性 | 低 | 高 | 设置可信度 |
| P0/P1 | Placeholder route 处理 | 产品完整性 | 低 | 高 | 去掉假入口 |
| P0/P1 | Cover cache 路径迁移分页 | 性能/稳定 | 低 | 高 | 大库高价值 |
| P0/P1 | 发布包资源体检 | 发布稳定 | 低 | 高 | packaged/dev 差异 |
| P0/P1 | 播放状态 push/diff | 性能 | 中低 | 高 | 保留 fallback |
| P0/P1 | UTF-8/中文渲染抽检 | 产品可信 | 低 | 中高 | 修复前先备份 |
| P1 | Provider 能力标签 | 产品诚实 | 低 | 高 | 减少误解 |
| P1 | 诊断/实验默认折叠 | UX/稳定 | 低 | 中 | 避免干扰 |
| P2 | Smart filters | 资料库 | 中 | 高 | 先 facet |
| P2 | Real Import File 页面 | 产品完整 | 中低 | 中高 | 可复用现有逻辑 |
| P2 | Duplicate representative | 资料库 | 中 | 中 | 用户控制 |
| P2 | DFF 播放链 | 音频格式 | 中 | 中 | 不影响 DSF |
| P2 | Plugin API v1 | 生态 | 中 | 高 | 先低风险 API |
| P2 | Settings section 化 | 可维护 | 中 | 中高 | 不大重写 |
| P2 | AirPlay diagnostics | Connect | 中低 | 中 | 排查搜不到 |
| P3 | Signal path | HiFi 信任 | 中 | 高 | Roon 差距 |
| P3 | DSP chain | 音频专业 | 中高 | 高 | 先架构 |
| P3 | Batch tagging | Power user | 中 | 高 | foobar 差距 |
| P4 | Core/Remote/Endpoint | 架构 | 高 | 很高 | 长期路线 |
| P4 | 多房间同步 | 架构 | 高 | 很高 | Roon 级目标 |

## 12. 不建议现在做的事情

### 12.1 不要现在重写音频核心

原因：

- 当前音频路径已经复杂。
- 播放稳定比结构美观更重要。
- 大重构容易引入 stutter、fallback、设备兼容问题。

正确做法：

- 只做状态推送、诊断、fallback 文案、输出矩阵这类外围增强。

### 12.2 不要默认启用 DirectSound fallback

原因：

- DirectSound 应该是手动兼容模式。
- 静默 fallback 会破坏用户对输出模式/音质的信任。

### 12.3 不要盲目接 TIDAL 或类似服务

原因：

- 当前架构需要 playable URL。
- 如果 provider 只能提供 metadata/search，不适合承诺原生播放。

### 12.4 不要让网络 metadata 默认激进后台跑

原因：

- 会影响扫描、DB、网络、UI。
- 也会让用户感觉 app 不可控。

### 12.5 不要把开发/实验面板暴露成默认体验

原因：

- 普通用户会以为未完成。
- 也可能误触高风险操作。

### 12.6 不要为了“完整测试”乱跑全量测试

原因：

- 当前用户明确要求快准狠。
- 多工作区并行时，重测试可能干扰其它工作。

正确做法：

- 改什么测什么。
- 只有发布、核心音频、DB migration、大范围 refactor 才考虑更广测试。

## 13. 测试与验证策略

### 13.1 低风险修复的测试原则

规则：

- 文档：不测。
- 设置 normalize：只测 normalize。
- 路由入口：只测对应 route/component，必要时手动打开。
- DB/cache migration：只测对应 manager。
- 音频状态 push：只测 status event + 手动播放。
- 发布资源：只跑 verifier，不跑全量 app。

### 13.2 什么时候需要更重测试

需要更重测试的情况：

- 改 `AudioSession` 核心播放状态机。
- 改 DB schema/migration。
- 改 scanner worker。
- 改 packaged resource path。
- 改 provider playback resolver。
- 改 preload IPC contract。

但即便如此，也应该先 focused，再 typecheck，再 smoke，不要一上来全量。

### 13.3 建议测试矩阵

| 改动 | 最小验证 | 需要时追加 |
|---|---|---|
| appSettings normalize | appSettings 单测 | 设置页手动保存 |
| placeholder route | route/component 测试 | 浏览器手动点击 |
| cover cache paging | CoverCacheManager 单测 | 小 benchmark |
| audio status push | IPC/status 单测 | 手动播放 5 分钟 |
| packaged verifier | 脚本输出 | packaged 安装后运行 |
| provider 能力标签 | provider metadata 单测 | 手动搜索/导入 |
| DFF chain | DSD/DFF focused test | 实机设备 smoke |
| plugin API | manifest/API 单测 | 示例插件 smoke |

## 14. 下一版 Definition of Done

如果下一版想从“功能很多”变成“产品可信”，建议满足：

1. 所有侧边栏/设置入口都不是 placeholder。
2. 设置页可见的选项都能保存、重启后保持。
3. Provider UI 明确显示能力与限制。
4. 发布包资源体检通过。
5. 播放状态不依赖高频大对象 polling。
6. 大库封面路径迁移不会全量加载到内存。
7. 数据库危险操作继续保护原件。
8. DirectSound 仍是手动兼容模式。
9. 诊断/实验功能默认折叠。
10. 文案没有明显乱码。

## 15. 最终建议排序

### 必须马上做

1. `duplicateTracksMode` normalize。
2. Placeholder routes。
3. Cover cache path migration paging。
4. Release runtime verifier。
5. Provider capability labels。

### 应该马上设计，分阶段做

1. Audio status push/diff。
2. SettingsPage section registry。
3. Smart filters。
4. Plugin API v1。
5. Signal path。

### 暂时不要动

1. 音频核心重写。
2. 默认 DirectSound fallback。
3. 无 playable URL 的 provider 原生播放。
4. 全局 SQLite 安全参数激进调优。
5. Roon-like server 架构。

## 16. 一句话战略

ECHO 不应该短期追求“比 Roon 更 Roon”或“比 foobar 更 foobar”。正确路线是：

先把已有功能做实，保证播放不被任何功能拖慢；再补资料库整理、设置可信、发布体检、状态推送；然后用插件和 signal path 逐步靠近 foobar 的专业工具能力；最后在架构足够稳定后，再做 Roon 级 Core/Remote/Multi-room。

ECHO 的胜点应该是：Windows 本地优先、中文/日文音乐体验强、歌词/MV/流媒体/下载/HiFi 输出一体化，同时足够稳定，不打扰播放。

## 17. 附录：当前源码观察到的关键风险点

### 17.1 `appSettings.ts`

风险：

- `duplicateTracksMode` normalize 与类型/IPC 可能不一致。

建议：

- P0/P1 修。

### 17.2 `routes.tsx`

风险：

- Placeholder route 造成假入口。

建议：

- P0/P1 修。

### 17.3 `CoverCacheManager.ts`

风险：

- covers 路径迁移全量读取。

建议：

- P1 分页化。

### 17.4 `AudioSession.ts`

风险：

- 状态对象复杂，频繁轮询/emit 可能影响性能。

建议：

- P1/P2 push/diff/throttle。

### 17.5 `SettingsPage.tsx`

风险：

- 文件巨大，设置、诊断、provider、搜索耦合。

建议：

- P2 section 化，不大重写。

### 17.6 `StreamingService.ts`

风险：

- provider 能力差异大，用户期望容易错位。

建议：

- P1 provider capability labels。

### 17.7 `DownloadService.ts`

风险：

- 外部工具链、下载并发、转码资源占用。

建议：

- P1 release verifier，P2 resource policy。

### 17.8 `DsdDopPipeline.ts`

风险：

- DSF 路径更完整，DFF 完整流式播放链可能不足。

建议：

- P2 补 DFF，不影响 DSF。

## 18. 附录：竞品差距压缩路线

### 18.1 对 Roon 的压缩路线

短期：

- Signal path。
- Provider capability。
- Metadata quality。
- AirPlay diagnostics。

中期：

- Metadata graph。
- Remote control API。
- Zone model proof。

长期：

- Core/Server。
- Mobile Remote。
- ARC-like remote access。
- Multi-room sync。

### 18.2 对 foobar2000 的压缩路线

短期：

- Batch filters。
- ReplayGain workflow。
- Duplicate version control。

中期：

- Batch tagging。
- Converter presets。
- Plugin API v1。
- More decoders。

长期：

- DSP chain。
- VST adapter。
- ABX/DR/integrity tools。
- Component marketplace。

## 19. 最短可执行任务包

如果只允许做 5 个任务，建议按这个顺序：

1. 修 `duplicateTracksMode` normalize。
2. 清掉 Placeholder routes。
3. Cover cache migration 分页化。
4. Release runtime verifier。
5. Provider capability labels。

这 5 个任务共同特点：

- 风险低。
- 不动音频核心。
- 不碰用户真实数据。
- 不要求大重构。
- 对产品可信度提升很大。

如果只允许做 1 个任务：

- 先修 Placeholder routes 或 `duplicateTracksMode` normalize。前者影响第一眼产品完整度，后者影响设置可信度。两者都很小，都值得马上做。


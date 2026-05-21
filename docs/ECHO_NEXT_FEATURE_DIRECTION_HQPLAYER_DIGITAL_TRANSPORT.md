# ECHO Next 功能大方向建议：专业播放器、HQPlayer 与数播生态

日期：2026-05-20  
范围：`D:\ECHONext\ECHO-Next` 的中长期产品与工程方向建议。  
定位：这不是立即开工清单，而是一份“ECHO 要成为最好的播放器”时可长期对照的功能蓝图。

## 0. 总结

ECHO Next 的目标不应该只是“播放器功能很多”，而应该是：

> 做一个以本地音乐库和稳定播放为核心，覆盖专业 HiFi 输出、强资料库、歌词/MV、插件、远程控制、HQPlayer、数播和多设备生态的中文优先音乐系统。

一句话：

> 专业播放器有的，ECHO 要逐步补齐；他们没有的，ECHO 要靠中文音乐体验、歌词/MV、混合来源、诊断、插件和设备生态做出自己的优势。

但这件事不能靠乱堆功能。ECHO 的红线是：

- 播放热路径必须永远优先。
- 任何后台任务都不能让播放卡顿。
- 任何实验能力都不能伪装成稳定能力。
- 任何新入口都必须能被用户找到，并且是真的功能。
- 数据库、缓存、设置、播放链路都要可恢复、可诊断、可关闭。

如果做得好，ECHO 的上限不是“另一个 foobar”或“另一个 Roon”，而是一个更适合中文用户、本地音乐、HiFi、歌词、MV、下载、远程控制和数播设备的桌面音乐中心。

## 1. 产品大方向

### 1.1 我们要吸收专业播放器的能力

专业播放器常见优势大概分为几类：

- 音频输出专业：WASAPI Exclusive、ASIO、bit-perfect、DSD、DoP、gapless、ReplayGain、DSP、参数均衡、卷积、房间校正。
- 资料库强：大曲库、智能播放列表、高级搜索、标签批量编辑、重复检测、CUE、文件整理、播放统计。
- 可定制强：插件、脚本、自定义 UI、快捷键、组件生态。
- 网络音频强：UPnP/DLNA/OpenHome、AirPlay、Chromecast、Roon-like endpoint、多房间、远程控制。
- 诊断强：输出格式、设备状态、缓冲、丢帧、重采样、错误日志可见。

ECHO 要逐步补齐这些，不是为了“参数表好看”，而是为了让真正的用户可以放心把它当主播放器。

### 1.2 我们要做专业播放器没有做好的东西

ECHO 的差异化不应该只在音频参数上卷。真正可以赢的地方是组合能力：

- 中文、日文、罗马音、拼音、假名搜索和歌词体验比传统播放器更好。
- 本地音乐、MV、歌词、第三方平台、下载、封面、艺人图、播放历史放在一个产品里。
- 用户不需要懂很多专业术语，也能看懂当前输出是不是 bit-perfect、是不是经过 DSP、为什么不能独占、为什么外部数播不可用。
- 数据库坏了、缓存迁移、C 盘爆了、打包资源缺失、音频 host 崩了时，ECHO 能给出清楚恢复路径，而不是让用户猜。
- 插件不是为了炫技，而是让实验功能、歌词 provider、metadata provider、远程控制、外部播放器接入从主线剥离。
- ECHO 可以既是播放器，也可以是控制器，也可以是本机 endpoint，也可以成为家庭数播系统的一部分。

### 1.3 大方向顺序

建议按这个顺序推进，不要一口吃成胖子：

1. 先把已有功能做实：设置入口、播放状态、诊断、数据库保护、打包资源体检。
2. 补齐专业播放器基础能力：高级搜索、标签编辑、智能播放列表、信号路径、DSP 矩阵、输出验证。
3. 做 HQPlayer 接入：先控制和交接，不急着硬接音频流。
4. 做数播生态：先发现、控制、推送，再做 ECHO Endpoint 和多房间。
5. 做插件生态：先低权限、只读、provider 类插件，再开放更高风险能力。
6. 做 ECHO Core / Remote / Endpoint：真正进入 Roon-like 架构，但保持 ECHO 自己的产品路线。

## 2. 绝对红线：播放稳定优先

ECHO 可以野心很大，但播放热路径必须保守。

### 2.1 新功能不能影响播放

所有新功能默认都按这个原则设计：

- 不在 audio render thread 做网络、数据库、图片、歌词、MV、插件逻辑。
- 不在播放状态高频事件里传大对象。
- 不让封面、歌词、MV、metadata、下载、插件抢占音频 host 的 CPU 和 IO。
- 后台任务必须有队列、优先级、并发上限、取消、暂停和状态导出。
- 播放中默认降低非关键任务优先级。
- 大库操作必须分页、迭代、事务化，不允许随便 `.all()` 全量进内存。
- 网络 provider 失败不能变成全局弹窗轰炸。

### 2.2 所有专业能力都要有“信号路径说明”

ECHO 的专业感不只是功能多，而是把真实路径讲清楚：

- 当前输出设备。
- 当前输出模式：System / Shared / Exclusive / ASIO / DirectSound / HQPlayer / UPnP endpoint。
- 当前源格式：采样率、位深、声道、编码、DSD rate。
- 当前是否重采样。
- 当前是否经过 DSP。
- 当前是否 ReplayGain。
- 当前是否 EQ、卷积、crossfeed。
- 当前是否 bit-perfect。
- 当前是否外部播放器接管。
- 当前是否网络 endpoint，实际延迟是多少。

实现思路：

- 增加统一 `SignalPathService` 或 `PlaybackSignalPathSnapshot`。
- AudioSession、DSP、ReplayGain、外部输出、HQPlayer bridge、数播输出都只上报自己的 segment。
- Renderer 只展示 snapshot，不直接推断。
- 信号路径变化用 diff/throttle 推送，避免 UI 轮询大对象。

## 3. 专业播放器基础能力建议

### 3.1 输出与 HiFi 能力

建议目标：

- WASAPI Shared / Exclusive。
- ASIO。
- DirectSound 继续作为手动兼容模式。
- bit-perfect 状态可见。
- 自动采样率切换。
- DSD native / DoP 状态可见。
- Gapless。
- ReplayGain track / album / smart 模式。
- 输出设备能力探测。
- 输出格式验证。
- 音频 host crash recovery。
- 独占失败、设备断开、初始化超时、驱动异常都有可读错误。

实现思路：

- 不大改 AudioSession，先把状态字段收敛成可展示的 signal path。
- 输出能力探测做成只读诊断，不自动改用户选择。
- 设备切换和 fallback 必须明确告知用户，尤其 DirectSound 不能静默变成默认。
- 对 DSD、DoP、ASIO native 这种高风险能力先做“实验标识 + 诊断导出 + 设备白名单/黑名单”。
- 输出验证可以先做内部测试工具：播放固定采样率文件，记录 host 实际打开格式、设备格式、是否被系统 mixer 接管。

### 3.2 DSP 能力

专业播放器用户会期待这些：

- 10-band EQ 只是开始。
- Parametric EQ。
- Preamp。
- Auto gain。
- Limiter / clipping protection。
- Convolution / FIR。
- Room correction profile。
- Headphone crossfeed。
- Balance / channel matrix。
- Mono / stereo tools。
- Phase invert。
- A/B profile。
- Per-device profile。
- Per-headphone profile。
- Per-album 或 per-track DSP override。

实现思路：

- 建立 DSP graph，而不是把所有 DSP 塞进一个设置对象。
- 每个 DSP node 都有 enabled、latency、bitPerfectBreaks、cpuCost、safeDefault。
- Renderer 显示“启用 DSP 后 bit-perfect 关闭”。
- DSP 配置写入 settings，但实际 DSP graph 在 native/audio bridge 侧编译。
- 重 DSP 只允许在播放前或安全切换点重建，避免播放中频繁改 graph。
- EQ 滑块实时变化要节流，只取最后一次，避免 UI 高频拖动打爆 host。
- 卷积文件导入要限制大小、格式、采样率，并在后台预解析，不在播放开始时卡住。

### 3.3 资料库与标签能力

专业播放器不能只靠扫描文件夹。建议补齐：

- 批量标签编辑。
- 自动大小写、全半角、繁简、艺人分隔符规范化。
- Album Artist / Artist / Composer / Conductor / Genre / Mood / Label / Catalog Number。
- 多值标签。
- CUE 内嵌与 sidecar CUE。
- 多碟专辑、Disc Subtitle。
- Classical mode：作品、乐章、指挥、乐团、独奏者。
- 文件重命名和目录整理。
- 重复曲目检测。
- 缺失文件检测。
- 小于指定时长音频检测。
- 低码率、损坏文件、异常采样率检测。
- 手动合并专辑。
- 手动分裂错误专辑。
- metadata 写回策略：只改数据库、写 sidecar、写入源文件，三种要分开。

实现思路：

- 先做数据库层编辑，不急着写回源文件。
- 写回源文件必须先备份或至少提供 dry-run 和变更预览。
- 大批量操作走 job queue，有暂停、取消、失败重试。
- 所有“自动整理”先输出计划，不直接动文件。
- 标签规则引擎可以做成可测试纯函数，避免 UI 里堆规则。

### 3.4 搜索、筛选与智能播放列表

建议做成 ECHO 的强项：

- 拼音、假名、罗马音、CJK grams。
- 高级字段筛选。
- 智能播放列表。
- 保存搜索。
- 动态队列。
- 相似歌曲。
- 最近新增、最近播放、很久没听、从未播放。
- 码率、采样率、格式、年份、评分、播放次数、来源过滤。
- “中文用户真实输入”容错，比如简繁、空格、符号、全半角、feat.、日文假名。

实现思路：

- 不急着发明复杂 query language，先做 UI facet。
- Smart playlist 规则保存成 JSON AST。
- 查询编译成 SQLite 条件，禁止直接拼接 SQL。
- 大库结果必须分页。
- 搜索索引重建作为后台 job，不能阻塞播放。

### 3.5 播放队列与播放行为

建议补齐：

- 多队列。
- 播放历史日历。
- 队列快照。
- 队列恢复。
- 下一首预加载。
- 弱网或慢盘下一首预热。
- 队列规则：专辑连续、随机但不重复、按评分加权、按最近未听优先。
- Crossfade / Automix 但默认关闭。
- 睡眠定时。
- 闹钟播放。
- 当前播放上下文可追溯：来自专辑、歌单、搜索、远程来源、数播推送。

实现思路：

- QueueService 独立于 UI。
- 队列项必须包含 source context，不然远程来源、HQPlayer、数播回放会丢信息。
- 下一首预加载要受播放状态、网络、磁盘、CPU 预算限制。
- Crossfade 不能破坏 gapless 专辑模式，专辑模式默认 gapless 优先。

### 3.6 可视化与监听体验

可以做，但要克制：

- 频谱。
- VU meter。
- Waveform seekbar。
- Dynamic background。
- Lyrics cinema mode。
- MV companion mode。
- Listening room mode。

实现思路：

- 可视化必须从低频 level / FFT snapshot 来，不从音频热路径同步推 UI。
- 所有视觉效果都有性能等级：低、中、高。
- 播放中如果检测到掉帧或 CPU 高，自动降级视觉效果，但不能改音频设置。
- 壁纸、动态背景、MV 不能抢占歌词和播放控制。

## 4. HQPlayer 接入建议

### 4.1 先讲清楚 HQPlayer 的合理边界

HQPlayer 的核心价值是：

- 高质量升采样。
- 高阶滤波器。
- DSD / PCM 处理。
- 外部 NAA endpoint。
- 作为专业音频处理和输出引擎。

ECHO 不应该一开始就试图“替代 HQPlayer 的音频引擎”。更合理的策略是：

> ECHO 负责资料库、搜索、歌词、MV、队列、中文体验和统一控制；HQPlayer 负责高阶 DSP、升采样和最终输出。

这样风险最低，价值也最清楚。

官方资料里，HQPlayer Desktop 本身是 Server，HQPlayer Client 是控制应用，两者可以在不同电脑上；Desktop 也可以被 Roon 或 HQPDcontrol 这类控制应用使用。Signalyst 下载页还提供 HQPlayer SDK/control API 相关资源，并提供 Network Audio Daemon 下载入口。这说明 ECHO 最安全的接入起点应是“控制和交接”，不是直接逆向或重做 NAA。

### 4.2 HQPlayer 接入分四级

#### Level 1：HQPlayer 外部播放器模式

目标：

- 用户在 ECHO 里选择“用 HQPlayer 播放”。
- ECHO 把当前曲目或队列交给 HQPlayer。
- ECHO 保留资料库、歌词、MV、历史记录。
- HQPlayer 负责播放和输出。

实现思路：

- 设置里增加 HQPlayer 路径、host、port、连接状态。
- 支持本机 Desktop 与远程 Embedded/Desktop。
- 本机模式先支持启动/唤起 HQPlayer。
- 交接方式优先走官方 control API 或 CLI 工具。
- 如果 control API 不满足队列写入，再考虑本机 URI/file handoff。
- ECHO 只显示“外部播放器接管”，不要伪装成 native AudioSession。

优点：

- 风险最低。
- 不碰音频热路径。
- 用户马上能用 HQPlayer 的输出能力。

风险：

- HQPlayer 是否能直接访问 ECHO 的本地路径取决于同机/远程。
- 远程 HQPlayer 不能访问本机磁盘时，需要 ECHO 提供本地 HTTP media server。

#### Level 2：ECHO Library 到 HQPlayer Control

目标：

- ECHO 继续作为主资料库。
- HQPlayer 作为播放/输出后端。
- ECHO 可以控制播放、暂停、上一首、下一首、seek、音量或 profile。

实现思路：

- 新增 `ExternalPlaybackBackend` 抽象。
- backend 类型包括 `native`、`system`、`hqplayer`、`upnp`、`openhome` 等。
- HQPlayer backend 只负责控制 API、状态同步和错误分类。
- 本地文件如果要给远程 HQPlayer 播放，ECHO 开只读 HTTP media server，生成临时 URL。
- URL 要有 token、过期时间、range request、content-type、只读路径白名单。
- 不把用户整个音乐目录暴露到局域网。

关键点：

- HQPlayer 播放时，ECHO 的 AudioSession 不应该同时占用设备。
- 播放状态 UI 要明确显示“HQPlayer 输出”。
- Lyrics/MV 可以继续跟随 ECHO 队列时钟，但时钟源要来自 HQPlayer 状态，不能假装本地 audio clock。

#### Level 3：HQPlayer Profile 与 Signal Path 管理

目标：

- ECHO 可以选择 HQPlayer filter、modulator、output mode、NAA endpoint 或 preset。
- 用户可以为设备、耳机、采样率、DSD/PCM 设置 profile。

实现思路：

- ECHO 不直接复刻 HQPlayer 所有参数 UI。
- 先做 preset 选择和只读状态展示。
- 高阶参数留给 HQPlayer 自己。
- ECHO 只保存“此设备/此场景使用哪个 HQPlayer preset”。
- 如果 control API 支持更多参数，再逐步开放。

风险：

- HQPlayer 参数复杂，贸然复刻 UI 会很难维护。
- 参数名和能力可能随版本变化，必须做 capability discovery。

#### Level 4：深度音频桥接，暂缓

目标可能是：

- ECHO 解码或读取 PCM，再送进 HQPlayer 做处理。
- 或 ECHO 把 HQPlayer 当实时 DSP engine。

建议：

- 暂时不要作为近期路线。
- 风险高、收益不一定比 control/handoff 高。
- 容易破坏播放稳定性。
- 容易和 HQPlayer 官方能力边界冲突。

只有在官方 API 清楚支持实时输入、队列控制、状态回传、错误处理，并且 ECHO 有足够测试设备时，再考虑。

### 4.3 HQPlayer 与 NAA 的关系

建议不要一开始做“ECHO 自己实现 NAA”。

更合理：

- HQPlayer 负责输出到 NAA。
- ECHO 负责控制 HQPlayer。
- ECHO 可以显示 HQPlayer 当前选择的 NAA endpoint。
- ECHO 可以提供“打开 HQPlayer 设置”或“检查 Network Audio Daemon”。
- 本机安装 Network Audio Daemon 时，ECHO 可以做状态检测和启动管理，但不要捆绑成 ECHO 内置核心。

原因：

- NAA 是 HQPlayer 生态里的专门 endpoint。
- 官方已经提供 Network Audio Daemon。
- ECHO 直接实现 NAA 风险大，协议兼容和长期维护成本高。
- 用户真正想要的是“ECHO 能接 HQPlayer 和数播”，不是 ECHO 必须重写 NAA。

### 4.4 HQPlayer UI 建议

设置页：

- HQPlayer 开关。
- 连接模式：本机 Desktop、远程 Desktop/Embedded。
- Host / Port。
- Control API 状态。
- 本机可执行文件路径。
- 是否允许 ECHO 启动 HQPlayer。
- 是否启用 ECHO 本地只读 media server。
- media server 端口、绑定网卡、访问 token 状态。
- 默认播放后端：ECHO Native / HQPlayer / 询问。
- Profile 选择。
- NAA endpoint 只读展示。

播放栏：

- 输出 chip：`HQPlayer`。
- 当前 profile。
- 当前 endpoint。
- 当前源格式和 HQPlayer 输出格式，如果 API 能拿到。
- 外部播放错误入口。

诊断页：

- HQPlayer 版本。
- 连接状态。
- 最近控制请求。
- 最近错误。
- media server 访问日志摘要。
- range request 是否正常。
- 远程 HQPlayer 是否能访问 ECHO URL。

### 4.5 HQPlayer 最小可行版本

MVP 建议只做：

1. 设置 host/port。
2. 测试连接。
3. 当前曲目交给 HQPlayer。
4. 播放/暂停/停止/上一首/下一首。
5. 状态同步。
6. 本机路径不可访问时给出清楚提示。
7. 不碰 native AudioSession，不碰 DSP，不碰 NAA 实现。

验收标准：

- ECHO 播放本地 FLAC，选择 HQPlayer 后，HQPlayer 能接管播放。
- ECHO UI 能显示外部输出状态。
- 停止 HQPlayer 或断开网络时，ECHO 不崩溃，不误报本地音频错误。
- 切回 ECHO Native 后，本地播放正常。
- 播放中歌词/MV 不因为外部输出变成全局弹窗问题。

## 5. 数播接入建议

### 5.1 先定义“数播”

用户说的“数播”不是一个单一协议，通常可能包括：

- UPnP/DLNA Renderer。
- OpenHome Renderer。
- AirPlay 设备。
- Chromecast Audio 或类似 Cast 设备。
- Roon Ready / RAAT endpoint。
- HQPlayer NAA。
- 自研 Raspberry Pi / Linux endpoint。
- 带 DAC 的网络播放器。
- NAS 上的音乐服务。

所以 ECHO 的数播路线不能写成“支持数播”四个字，应该拆成：

- ECHO 作为控制器：发现设备，推送播放。
- ECHO 作为媒体服务器：把本地曲库安全地提供给局域网 endpoint。
- ECHO 作为 Renderer：手机或其他控制器可以推送到 ECHO。
- ECHO 作为 Core：统一管理曲库、队列、多房间、endpoint。
- ECHO 作为 Endpoint：轻量版本运行在小主机/数播盒子上。

### 5.2 数播接入分层

#### 第一层：设备发现与诊断

目标：

- 发现局域网里的 UPnP/DLNA/OpenHome/AirPlay/HQPlayer/NAA 相关设备。
- 显示 IP、协议、名称、能力、最近错误。
- 不急着播放，先把发现做稳定。

实现思路：

- DiscoveryService 独立进程或 utility process。
- 每种协议独立 backend。
- 后端失败不能拖垮其它协议。
- 多网卡枚举，过滤 VPN/虚拟网卡。
- 显示绑定地址、广播地址、端口、SSDP/mDNS 状态。
- 发现结果写轻量缓存，避免 UI 频繁重渲染。

为什么先做诊断：

- Windows 上数播发现最容易被防火墙、多网卡、VPN、虚拟网卡影响。
- 用户看到“没发现设备”时，需要知道是协议、网卡、防火墙还是设备问题。

#### 第二层：ECHO 推送到数播设备

目标：

- 用户在 ECHO 里选择一个数播设备作为输出。
- ECHO 把本地曲目或队列推送给 endpoint。
- endpoint 自己拉取音频，ECHO 负责控制和状态。

实现思路：

- 本地 HTTP media server 作为基础设施。
- 支持 Range request。
- URL 带短期 token。
- 只允许访问当前播放队列需要的文件。
- content-type 根据文件实际格式返回。
- 支持 seek。
- 支持封面 URL，但封面也要 token 和尺寸限制。
- 设备端无法播放格式时，先提示，不默认转码。

协议路线：

- DLNA/UPnP：覆盖面广，但 gapless 和队列体验不稳定。
- OpenHome：更适合音频播放器，支持设备侧 playlist/gapless 的可能性更好。
- AirPlay：适合 Apple 生态，但协议和延迟限制要清楚展示。
- Chromecast：如果要做，放在后面，Windows 桌面播放器内维护成本不低。
- HQPlayer：通过 control API 接，而不是直接把 NAA 当普通数播协议。

#### 第三层：OpenHome 优先增强

OpenHome 相比普通 UPnP/DLNA，更适合“像播放器一样”的网络音频体验。它建立在 UPnP 基础上，并强调更稳健的音频播放、设备侧 playlist、gapless、多房间同步等方向。

建议：

- 如果 ECHO 要认真做数播，OpenHome 应该排在普通 DLNA 之后、Roon-like 自研之前。
- 不要只做“投一个 URL 过去能响”。
- 要做队列、状态、gapless、设备侧 playlist、错误恢复。

实现思路：

- `NetworkAudioEndpoint` 抽象：
  - id
  - name
  - protocol
  - address
  - capabilities
  - transportState
  - volumeState
  - queueMode
  - supportedFormats
  - latency
  - lastError
- UPnP/OpenHome backend 适配成同一接口。
- UI 不直接关心协议细节，只显示设备能力和限制。

#### 第四层：ECHO Renderer

目标：

- ECHO 自己可以被手机、平板、其它控制器发现。
- 手机可以把音乐推给 ECHO 播放。
- ECHO 变成一台“电脑数播”。

实现思路：

- 先做 DLNA Renderer 或 OpenHome Renderer 的实验版本。
- Receiver 和 Sender 完全隔离。
- Receiver 收到外部播放请求时，进入独立 external session。
- 用户必须能一键退出外部控制。
- 外部控制不能覆盖本地队列，除非用户允许。
- 外部来源的 metadata、cover、lyrics 只进临时 session，不污染本地资料库。

风险：

- 外部控制来源复杂，容易打断当前播放。
- 必须有权限提示和来源展示。

#### 第五层：ECHO Endpoint

目标：

- 做一个轻量 ECHO Endpoint，可以跑在小主机、NUC、树莓派、Linux 数播盒。
- 桌面 ECHO 作为 Core/Controller。
- Endpoint 只负责输出、设备、状态和少量缓存。

实现思路：

- 抽离 Audio Host + Control Agent。
- 用 WebSocket 或 gRPC 做控制通道。
- Endpoint 不需要完整 Electron UI。
- Endpoint 配置通过桌面 ECHO 或 Web UI。
- 支持 WASAPI/ASIO 的 Windows endpoint，支持 ALSA/PipeWire/JACK 的 Linux endpoint。
- Endpoint 只接收播放命令和媒体 URL，不保存全量曲库。
- 支持局域网认证和配对码。

这是长期路线，不要短期硬上。

#### 第六层：ECHO Core / Remote / Multi-room

目标：

- ECHO Core 管理曲库和队列。
- ECHO Remote 手机/平板控制。
- 多个 ECHO Endpoint 分区播放。
- 支持同步、多房间、分组、延迟校准。

实现思路：

- 先把本机 QueueService、LibraryService、PlaybackService 的边界整理好。
- 再设计 Core API。
- 每个 zone 有独立 queue、volume、transport、signal path。
- Multi-room 必须有时钟同步、缓冲策略和延迟校准。
- 初期可以只做“多设备控制”，不要承诺 sample-accurate sync。

## 6. ECHO 自己可以创新的方向

### 6.1 中文音乐资料库增强

很多专业播放器在中文/日文音乐上并不好用。ECHO 可以做：

- 中文名、外文名、别名统一。
- 艺人别名库。
- 专辑版本识别：普通版、初回、限定、Remaster、Hi-Res、Live。
- 歌词语言自动识别。
- 翻译歌词和罗马音质量评分。
- 同一歌曲多个版本合并视图。
- 动漫/游戏/影视原声模式。
- Vocaloid / 同人音乐 metadata 模式。
- 日文假名、罗马音、中文翻译混合搜索。

实现思路：

- 不直接改源文件。
- 先建 ECHO 自己的 metadata overlay。
- 用户确认后才写入标签。
- overlay 可导出和备份。
- provider 分数和来源透明显示。

### 6.2 歌词成为一等体验

建议：

- 逐字歌词。
- 双语歌词。
- 罗马音。
- 翻译质量对比。
- 本地歌词编码自动适配。
- 歌词时间轴编辑器。
- 歌词来源评分。
- 歌词和 MV 联动。
- 歌词字体、描边、行距、滚动曲线独立设置。
- 卡拉 OK 模式。
- 歌词导出和 sidecar 写入。

实现思路：

- 歌词渲染与音频同步只读播放时钟，不反向影响播放。
- 歌词编辑器保存到 overlay 或本地 `.lrc` 前要预览。
- provider 失败只影响歌词面板，不弹全局错误。
- 本地 `.lrc` 适配继续 app-side 解决，不要求用户改文件。

### 6.3 MV 成为音乐资料的一部分

建议：

- MV 自动候选。
- MV 手动绑定。
- Live / Official / Cover / Dance / Lyric Video 分类。
- MV 质量矩阵：分辨率、FPS、codec、HDR、是否浏览器可播。
- MV 外部播放器 fallback。
- MV 与歌词同步。
- 专辑页显示相关 MV。
- 歌曲页显示官方视频、现场版、翻唱版。

实现思路：

- MV provider 只做候选，不自动污染主数据。
- codec-aware 继续保留，HEVC/Dolby Vision 不要强塞 in-app。
- MV 加载按需，不影响音频。
- MV DB 不可用时仍可 ephemeral 播放。

### 6.4 音乐健康体检

这是 ECHO 很适合做的差异化：

- 文件丢失。
- 文件损坏。
- 重复歌曲。
- 小于 35 秒或用户设定阈值的异常音频。
- 低码率。
- 异常采样率。
- 标签缺失。
- 封面缺失。
- 歌词缺失。
- MV 缺失。
- 专辑拆分错误。
- 同一专辑不同编码混乱。
- CUE 指向失效。
- 外置歌词时间轴明显错位。

实现思路：

- HealthCheckService 只做分析，不自动修。
- 结果分页写入数据库。
- 每个问题提供“忽略、稍后、修复建议、手动修复”。
- 大库分析必须可暂停、可取消、可限速。
- 播放中只跑低优先级或暂停。

### 6.5 ECHO Assistant：诊断而不是聊天噱头

可以做一个“诊断助手”，但不要变成空泛聊天：

- 解释为什么不能独占。
- 解释为什么 bit-perfect 关闭。
- 解释为什么 HQPlayer 连不上。
- 解释为什么数播发现不到设备。
- 解释为什么某首歌没有歌词/MV。
- 解释为什么数据库进入 degraded mode。
- 一键复制诊断报告。

实现思路：

- 所有建议基于真实诊断 snapshot。
- 不猜测用户环境。
- 只给低风险操作。
- 高风险修复必须先备份并确认。

### 6.6 插件市场

插件可以让 ECHO 拥有“他们没有的”扩展力，但要先安全：

第一阶段插件：

- 歌词 provider。
- metadata provider。
- 封面 provider。
- 小面板 UI。
- 导出工具。
- 播放统计工具。

第二阶段插件：

- 远程控制。
- 数播协议适配。
- 外部播放器 bridge。
- 智能歌单规则。

第三阶段插件：

- DSP。
- Decoder。
- Output。

第三阶段必须很晚做，因为风险最大。

实现思路：

- 插件权限声明。
- 插件 API version。
- 插件签名或可信来源。
- 插件进程隔离。
- 插件日志独立。
- 插件失败不能拖垮主进程和播放。
- 插件不能直接访问用户全盘路径。

## 7. 外部输出统一架构

为了同时支持 HQPlayer、数播、AirPlay、UPnP、OpenHome，建议设计一个统一概念：

```ts
type PlaybackBackendKind =
  | 'native'
  | 'system'
  | 'hqplayer'
  | 'upnp'
  | 'openhome'
  | 'airplay'
  | 'echo-endpoint';

interface ExternalPlaybackBackend {
  kind: PlaybackBackendKind;
  id: string;
  displayName: string;
  capabilities: {
    canPlayLocalFile: boolean;
    canPullHttpUrl: boolean;
    canSeek: boolean;
    canGapless: boolean;
    canSetVolume: boolean;
    canReportPosition: boolean;
    canReportOutputFormat: boolean;
    requiresMediaServer: boolean;
  };
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  play(request: ExternalPlaybackRequest): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  getStatus(): Promise<ExternalPlaybackStatus>;
}
```

注意：

- 这只是方向，不是要马上加代码。
- 关键是建立统一心智：本地播放是一种 backend，HQPlayer 和数播也是 backend。
- UI 展示统一，但每个 backend 的能力和限制透明显示。
- 不能因为某个 backend 不支持 gapless，就影响 native gapless。

## 8. 本地 HTTP Media Server 建议

如果要接远程 HQPlayer、UPnP/OpenHome 数播，ECHO 很可能需要一个只读 media server。

### 8.1 能力

- 只读。
- 只服务当前队列或用户允许的库。
- 支持 Range request。
- 支持 HEAD。
- 正确 content-type。
- 短期 token。
- 可限制局域网 IP。
- 可绑定指定网卡。
- 可关闭。
- 播放结束后 URL 过期。
- 访问日志摘要进入诊断。

### 8.2 不要做的事

- 不要默认把整个音乐目录公开到局域网。
- 不要无 token 长期暴露文件。
- 不要在用户没开数播/HQPlayer 时启动 server。
- 不要在 server 请求里做重型 metadata 解析。
- 不要默认转码。

### 8.3 转码策略

数播设备可能不支持某些格式。转码要晚一点做。

第一阶段：

- 不支持就提示。
- 告诉用户设备不支持当前格式。
- 给出“用 ECHO Native 播放”或“外部播放器”选择。

第二阶段：

- 用户显式开启“兼容转码”。
- ffmpeg 转码进独立进程。
- 有 CPU 上限、并发上限、失败隔离。
- 播放中高负载时自动警告。

不要一开始默认转码，否则很容易影响播放稳定性。

## 9. 竞品能力压缩路线

### 9.1 对 foobar2000 的路线

foobar 强在：

- 格式支持。
- 组件生态。
- 标签和资料库工具。
- DSP。
- 高度自定义。

ECHO 压缩路线：

- 先补高级标签、智能播放列表、信号路径、PEQ、卷积。
- 插件先做 provider 和工具，不急着做 decoder/output。
- 保留现代 UI、歌词、MV、中文搜索，这是 ECHO 的优势。

### 9.2 对 Roon 的路线

Roon 强在：

- Core / Remote / Endpoint。
- metadata。
- 多房间。
- 信号路径。
- 端点生态。

ECHO 压缩路线：

- 先做 signal path。
- 再做 external backend。
- 再做 media server。
- 再做 ECHO Endpoint。
- 最后做 Core/Remote/Multi-room。
- 不要短期硬做 Roon 级同步，否则会拖垮主线。

### 9.3 对 Audirvana/JPLAY 类 HiFi 播放器的路线

这类播放器强在：

- 声音路径简单。
- 外部 DAC/数播/HQPlayer。
- HiFi 用户心智。

ECHO 压缩路线：

- HQPlayer integration。
- 数播 endpoint。
- bit-perfect 证明。
- 输出设备 profile。
- 极简 HiFi mode：关闭 MV/动态背景/后台任务，只保留播放、队列、歌词和诊断。

### 9.4 ECHO 自己要赢的地方

- 中文和日文搜索。
- 歌词/MV 一等功能。
- 本地与国内常用平台混合体验。
- 数据库保护和修复。
- 打包资源体检。
- 诊断助手。
- 插件隔离。
- HQPlayer + 数播 + 本地播放统一控制。

## 10. 优先级建议

### P0/P1：先做产品可信度

- 清掉假入口。
- 设置页发现性补齐。
- 播放状态 push/diff/throttle。
- Signal Path 第一版。
- 发布包资源体检。
- 数据库大操作分页化。
- Provider 状态和错误分类。
- 诊断导出更完整。

原因：

- 这些不性感，但决定用户信任。
- 不先做这些，后面接 HQPlayer/数播只会制造更多不可诊断问题。

### P2：专业能力补齐

- 高级搜索/facet。
- 智能播放列表。
- 标签编辑 overlay。
- 重复/缺失/异常音频体检。
- Parametric EQ。
- Per-device DSP profile。
- Output capability matrix。
- Bit-perfect proof view。

原因：

- 这些是专业播放器用户真正会用的。
- 对播放热路径影响可控。

### P3：HQPlayer 与数播 MVP

- HQPlayer control/handoff。
- 本地只读 media server。
- UPnP/DLNA/OpenHome discovery。
- 推送到一个 endpoint。
- endpoint 能力展示。
- 外部播放 signal path。

原因：

- 这是 ECHO 进入 HiFi 生态的关键。
- 先做控制和交接，不直接碰复杂音频桥。

### P4：生态化

- ECHO Endpoint。
- ECHO Remote。
- OpenHome 更完整队列。
- 多设备 zone。
- 插件市场。
- Provider 插件。
- 远程控制 API。

原因：

- 这是长期护城河，但需要前面基础稳定。

### P5：高风险专业扩展

- DSP 插件。
- Decoder 插件。
- Output 插件。
- 多房间同步。
- 实时转码。
- HQPlayer 深度音频桥。

原因：

- 这些很强，但也是最容易影响稳定性的。
- 必须等架构和测试体系更稳。

## 11. 建议的工程模块划分

### 11.1 Core Services

- `PlaybackBackendRegistry`
- `SignalPathService`
- `ExternalPlaybackService`
- `MediaServerService`
- `NetworkAudioDiscoveryService`
- `EndpointCapabilityService`
- `HealthCheckService`
- `SmartPlaylistService`
- `MetadataOverlayService`

### 11.2 Backend Adapters

- `NativePlaybackBackend`
- `HqPlayerBackend`
- `UpnpPlaybackBackend`
- `OpenHomePlaybackBackend`
- `AirPlayPlaybackBackend`
- `EchoEndpointBackend`

### 11.3 UI Surfaces

- Settings > Playback：输出模式、外部后端、HQPlayer、数播。
- Settings > Network Audio：发现、media server、权限。
- Now Playing：signal path、backend chip、endpoint status。
- Diagnostics：backend 状态、media server、发现日志、错误分类。
- Library Health：资料库体检。
- Plugins：provider 和工具插件。

### 11.4 测试策略

只测改动点，别动不相关工作区。

- 纯逻辑：单元测试。
- media server：range/token/path whitelist 单测。
- backend adapter：mock server 单测。
- discovery：协议 parser 和网卡过滤单测。
- UI：只测入口和状态展示。
- 真机数播/HQPlayer：手动 smoke checklist，不放进普通 CI。

## 12. 风险清单

### 12.1 HQPlayer 风险

- Control API 能力不够。
- 版本差异。
- 远程文件访问。
- 状态同步延迟。
- 用户期望 ECHO 完全控制 HQPlayer 所有参数。

应对：

- MVP 只做连接、交接、基础控制、状态。
- 高级参数先只读或 preset。
- 所有失败都有清楚文案。

### 12.2 数播风险

- Windows 防火墙。
- 多网卡/VPN/虚拟网卡。
- endpoint 格式支持差异。
- DLNA gapless 不稳定。
- UPnP 设备实现不一致。
- URL 过期和 range 支持。

应对：

- 先 discovery diagnostics。
- backend 能力矩阵。
- media server 最小权限。
- 不默认转码。
- OpenHome 作为中期重点。

### 12.3 性能风险

- 后台扫描、封面、歌词、MV、下载、数播 server 同时跑。
- UI 高频状态更新。
- 插件不受控。
- 转码 CPU 过高。

应对：

- 全局后台任务调度器。
- 播放中降级策略。
- 每个任务有预算和取消。
- signal path diff/throttle。
- 插件权限和隔离。

### 12.4 产品风险

- 功能入口太多，用户找不到。
- 实验功能看起来像正式功能。
- 专业设置吓到普通用户。
- 外部播放器/数播失败被误认为 ECHO 播放坏了。

应对：

- 普通模式和专家模式。
- 实验功能折叠。
- 诊断页解释真实原因。
- Settings 搜索和入口统一。
- 错误文案区分 native、HQPlayer、UPnP、OpenHome、AirPlay。

## 13. 一年路线草案

### 13.1 近期：1 到 2 个月

目标：可信产品。

- 清假入口。
- Signal Path v1。
- 发布包资源体检。
- 播放状态推送优化。
- 设置页整理。
- 资料库体检 v1。
- 高级搜索/facet v1。
- 标签 overlay v1。

### 13.2 中期：3 到 6 个月

目标：专业播放器能力成型。

- Parametric EQ。
- DSP profile。
- Smart playlist。
- 批量标签编辑。
- 重复检测。
- 输出能力矩阵。
- Bit-perfect proof。
- HQPlayer MVP。
- media server MVP。

### 13.3 后期：6 到 12 个月

目标：数播生态和扩展能力。

- UPnP/DLNA/OpenHome discovery。
- 推送到 endpoint。
- OpenHome 队列增强。
- ECHO Renderer 实验版。
- 插件 API v1。
- Provider 插件。
- Remote control API。

### 13.4 长期：12 个月以后

目标：ECHO 音乐系统。

- ECHO Endpoint。
- ECHO Core / Remote。
- 多 zone。
- 多房间同步。
- 插件市场。
- HQPlayer profile 深度集成。
- 可选转码。
- 高风险 DSP/decoder/output 插件。

## 14. 立刻可以写进 Roadmap 的 20 个方向

1. Signal Path 视图。
2. 发布包资源体检。
3. 高级搜索和 facet。
4. 智能播放列表。
5. 标签 overlay。
6. 批量标签编辑。
7. 资料库健康体检。
8. 重复歌曲检测。
9. 小于指定时长音频检测。
10. Parametric EQ。
11. 卷积/房间校正实验。
12. Per-device playback profile。
13. HQPlayer control/handoff。
14. 只读 HTTP media server。
15. UPnP/DLNA discovery diagnostics。
16. OpenHome endpoint support。
17. ECHO Renderer 实验。
18. ECHO Endpoint 轻量 agent。
19. 插件 API v1。
20. Provider 插件市场。

## 15. 不建议现在做的事

- 不要现在重写 AudioSession。
- 不要把 DirectSound 做成静默默认 fallback。
- 不要立刻实现 NAA。
- 不要默认开启转码。
- 不要默认开放整个音乐目录给局域网。
- 不要把 HQPlayer 高阶参数全部复制进 ECHO UI。
- 不要让插件直接碰播放热路径。
- 不要把实验数播失败做成全局弹窗。
- 不要承诺所有流媒体都能像本地文件一样直接播。
- 不要让 MV、封面、歌词、下载和数播任务抢播放资源。

## 16. 最终建议

ECHO 要做最好的播放器，路线不是“所有功能都马上塞进去”，而是：

1. 播放核心稳定，永远第一。
2. 专业能力补齐，但每个能力都有信号路径和诊断。
3. 中文音乐、歌词、MV、混合来源做成 ECHO 的独特优势。
4. HQPlayer 先做控制和交接，让 ECHO 站进高端 HiFi 工作流。
5. 数播先做发现、诊断、推送，再做 Renderer、Endpoint、Core。
6. 插件先做低风险 provider 和工具，再逐步开放高风险能力。
7. 所有大功能都要能关闭、能诊断、能降级、能恢复。

这样 ECHO 才不是“功能表很长但不稳”的播放器，而是一个真正能长期作为主力的音乐系统。

## 17. 外部参考

- Signalyst HQPlayer Quickstart：说明 HQPlayer Desktop/Server、Client/control、远程控制和 library 工作方式。  
  https://signalyst.com/quickstart-guide/
- Signalyst Downloads：包含 HQPlayer Desktop、Network Audio Daemon、HQPlayer SDK/control API 相关下载入口。  
  https://signalyst.com/downloads/
- OpenHome Developer Overview：说明 OpenHome 基于 UPnP 并面向网络音频 renderer/control/pipeline。  
  https://openhome.org/pages/develop/overview
- OpenHome Platform：说明 OpenHome 对网络音频、设备侧 playlist、gapless、多房间同步等方向的定位。  
  https://openhome.org/pages/about/platform.html

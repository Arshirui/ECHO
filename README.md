# ECHO NEXT

[Moekotori/ECHO](https://github.com/Moekotori/ECHO) 的 fork，初步完成了 AppImage 包的构建

## Nix 环境构建 (Linux x64)

需要安装 Nix 并启用 Flakes 实验特性

推荐使用 [Determinate Nix](https://docs.determinate.systems/)，默认已启用 Flakes 和 nix CLI，无需手动开启 

项目提供 `flake.nix`，可进入隔离的开发环境进行构建，依赖不会污染系统

```bash
# 1. 克隆仓库
git clone https://github.com/Arshirui/ECHO
cd ECHO

# 2. 进入 Nix 开发环境
nix develop

# 3. 安装 Node 依赖
npm ci

# 4. 验证 FFmpeg
npm run verify:ffmpeg

# 5. 构建 Linux 包 (产出 dist/*.AppImage)
npm run build:linux
```

### 环境依赖 (由 flake.nix 自动提供)

- Node.js 22、CMake、GCC、pkg-config
- ALSA、JACK2、FreeType、Fontconfig、X11
- FFmpeg（由 shellHook 在进入 nix develop 时自动复制到 `electron-app/tools-linux/` 并计算和填入 sha256）
- patchelf（自动修复 fpm/sharp 库链接）

## TODO
- 修复托盘图标透明问题
- 使用 nix 打包
- 待补充

## 相关文档(由原仓库提供 仅供参考)

- [用户教程](./docs/USER_GUIDE.md)
- [Linux 构建指南](./docs/ECHO_NEXT_LINUX_BUILD.md)
- [总体架构](./docs/ECHO_NEXT_ARCHITECTURE.md)
- [音频核心](./docs/ECHO_NEXT_AUDIO_CORE.md)

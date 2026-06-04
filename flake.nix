{
  description = "Environment For Build ECHO NEXT";

  # 输入源：指定使用的 nixpkgs 分支
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  # 输出：至少包含 devShells
  outputs = { self, nixpkgs }:
    let
      # 定义要支持的系统，按需增减
      systems = [ "x86_64-linux" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
      pkgsFor = system: import nixpkgs { inherit system; };
    in
    {
      devShells = forAllSystems (system:
        let
          pkgs = pkgsFor system;
        in
        {
          default = pkgs.mkShell {
            # 构建依赖（等同于经典 nix-shell 的 buildInputs）
            buildInputs = [
              # Basic Build Tools
              pkgs.coreutils
              pkgs.cmake
              pkgs.gnumake
              pkgs.gcc
              pkgs.pkg-config
              pkgs.fakeroot
              pkgs.dpkg
              pkgs.rpm
              pkgs.binutils
              # Build Dependencies
              pkgs.nodejs_22
              # Audio Dependencies
              pkgs.alsa-lib
              pkgs.libjack2
              pkgs.libxft # X FreeType library
              pkgs.fontconfig
              pkgs.libx11
              pkgs.libxcomposite
              pkgs.libxcursor
              pkgs.libxext
              pkgs.libxinerama
              pkgs.libxrandr
              pkgs.libxrender
              pkgs.fuse2
              pkgs.freetype
              pkgs.ffmpeg
              # Other Dependencies
              pkgs.yt-dlp
              # Electron Desktop Runtime Dependencies
              pkgs.gtk3
              pkgs.nss
              pkgs.libxscrnsaver
              pkgs.libxtst
              pkgs.libdrm
              pkgs.mesa
              # patchelf: fix fpm binary for .deb packaging
              pkgs.patchelf
              pkgs.libxcrypt
            ];

            # 可选：进入环境时自动执行的环境变量或提示
            shellHook = let
                getLicenseStr = l: l.spdxId or l.shortName or l.fullName or "Unknown";
                getLicense = str:
                  if builtins.isList str
                  then builtins.concatStringsSep ", " (builtins.map getLicenseStr str)
                  else getLicenseStr str;
                ffmpegLicense = getLicense pkgs.ffmpeg.meta.license;
            in ''
              # Patch fpm binary for libcrypt.so.1 -> libcrypt.so.2 compatibility
              FPM_BIN="$HOME/.cache/electron-builder/fpm@2.1.4/fpm@2.1.4-fpm-1.17.0-ruby-3.4.3-linux-amd64/fpm"
              if [ -f "$FPM_BIN" ]; then
                patchelf --replace-needed libcrypt.so.1 libcrypt.so.2 "$FPM_BIN" 2>/dev/null || true
              fi
              # Patch sharp .node with RPATH so it can find libvips inside AppImage
              SHARP_NODE="node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64.node"
              if [ -f "$SHARP_NODE" ]; then
                patchelf --set-rpath '$ORIGIN/../../sharp-libvips-linux-x64/lib' "$SHARP_NODE" 2>/dev/null || true
              fi
              # Copy ffmpeg from buildInputs
              cp --force ${pkgs.ffmpeg}/bin/ffmpeg electron-app/tools-linux/ffmpeg 2>/dev/null || true
              cp --force ${pkgs.yt-dlp}/bin/ffmpeg electron-app/tools-linux/yt-dlp 2>/dev/null || true
              chmod +x electron-app/tools-linux/ffmpeg
              chmod +x electron-app/tools-linux/yt-dlp
              # Get medadata and sha256 of ffmpeg
              FFMPEG_VERSION=$(./electron-app/tools-linux/ffmpeg -hide_banner -version | head --lines=1)
              FFMPEG_SHA256=$(sha256sum ./electron-app/tools-linux/ffmpeg | cut -d ' ' -f1)
              FFMPEG_LICENSE="${ffmpegLicense}"
              # Update manifest
              cat > "./electron-app/tools-linux/ffmpeg-manifest.json" << EOF
              {
                "name": "ffmpeg",
                "version": "''${FFMPEG_VERSION}",
                "source": "nixpkgs",
                "sourceUrl": "https://github.com/NixOS/nixpkgs/blob/nixos-unstable/pkgs/development/libraries/ffmpeg/",
                "downloadPage": "",
                "artifact": "electron-app/tools-linux/ffmpeg",
                "sha256": "''${FFMPEG_SHA256}",
                "requiresSoxr": true,
                "requiredFilters": ["aresample"],
                "licenseFamily": "''${FFMPEG_LICENSE}"
              }
              EOF
            '';
          };
        }
      );
    };
}

import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        /*
        node-libraop 只在 AirPlay 2 的 ALAC 解码场景中通过动态 import() 加载，
        而 AirPlay 接收器本身在 Linux 上不会激活。即便 import() 抛错，也会被外
        层 try/catch 兜住，不影响主流程。
        */
        external: ['@lox-audioserver/node-libraop'], 
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
        },
        output: {
          footer: '\nimport "node:module";\n',
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          devConsole: resolve(__dirname, 'src/preload/devConsole.ts'),
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
  },
});

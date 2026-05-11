import { registerAppLifecycle } from './app/lifecycle';
import { registerIpc } from './ipc/registerIpc';

registerIpc();
registerAppLifecycle();

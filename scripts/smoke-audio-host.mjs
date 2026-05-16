import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(scriptPath), '..');
const hostPath = join(projectRoot, 'electron-app', 'build', process.platform === 'win32' ? 'echo-audio-host.exe' : 'echo-audio-host');

const fail = (message) => {
  console.error(`[smoke:audio-host] ${message}`);
  process.exit(1);
};

if (!existsSync(hostPath)) {
  fail(`Missing host binary: ${hostPath}. Run "npm run build:audio-host" first.`);
}

const runList = (args) => spawnSync(hostPath, args, {
  cwd: projectRoot,
  encoding: 'utf8',
});

const parseDeviceLines = (stdout) => stdout
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

const parseJsonLines = (stdout) => stdout
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  })
  .filter(Boolean);

const framedMagic = 'ECNP';
const framedVersion = 1;
const frameTypeBeginSession = 1;
const frameTypePcmF32Le = 2;
const frameTypeEndSession = 3;
const frameTypeShutdown = 4;

const normalizeExitCode = (code) =>
  typeof code === 'number' && code > 0x7fffffff ? code - 0x1_0000_0000 : code;

const createFrameHeader = (type, sessionId, payloadBytes) => {
  const header = Buffer.alloc(16);
  header.write(framedMagic, 0, 'ascii');
  header.writeUInt8(framedVersion, 4);
  header.writeUInt8(type, 5);
  header.writeUInt32LE(sessionId >>> 0, 8);
  header.writeUInt32LE(Math.max(0, payloadBytes) >>> 0, 12);
  return header;
};

const createFrame = (type, sessionId, payload = Buffer.alloc(0)) =>
  payload.length > 0
    ? Buffer.concat([createFrameHeader(type, sessionId, payload.length), payload])
    : createFrameHeader(type, sessionId, 0);

const createPcm = ({ sampleRate = 48000, seconds = 0.1, channels = 2 } = {}) => {
  const frames = Math.floor(seconds * sampleRate);
  const pcm = Buffer.alloc(frames * channels * Float32Array.BYTES_PER_ELEMENT);

  for (let frame = 0; frame < frames; frame += 1) {
    const sample = Math.sin((frame / sampleRate) * Math.PI * 2 * 440) * 0.02;
    for (let channel = 0; channel < channels; channel += 1) {
      pcm.writeFloatLE(sample, (frame * channels + channel) * Float32Array.BYTES_PER_ELEMENT);
    }
  }

  return pcm;
};

const runPcmHost = async (args, { timeoutMs = 15000, sampleRate = 48000, seconds = 0.1, env = undefined } = {}) => {
  const startedAt = Date.now();
  const child = spawn(hostPath, args, {
    cwd: projectRoot,
    env: env ? { ...process.env, ...env } : process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  let stdinError = '';

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  child.stdin.on('error', (error) => {
    stdinError = error instanceof Error ? error.message : String(error);
  });

  const pcm = createPcm({ sampleRate, seconds });

  child.stdin.write(pcm, (error) => {
    if (error) {
      stdinError = error.message;
    }
  });
  child.stdin.end();

  const exitCode = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve(-1);
    }, timeoutMs);

    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve(code ?? 0);
    });
  });

  return {
    exitCode,
    elapsedMs: Date.now() - startedAt,
    stdout,
    stderr,
    stdinError,
    events: parseJsonLines(stdout),
  };
};

const runFramedPcmHost = async (args, { timeoutMs = 15000, sampleRate = 48000, seconds = 0.1 } = {}) => {
  const child = spawn(hostPath, [...args, '-framed-stdin'], {
    cwd: projectRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  let stdinError = '';
  let shutdownSent = false;

  const sendShutdown = () => {
    if (shutdownSent || child.stdin.destroyed || child.stdin.writableEnded || !child.stdin.writable) {
      return;
    }

    shutdownSent = true;
    child.stdin.write(createFrame(frameTypeShutdown, 0), (error) => {
      if (error) {
        stdinError = error.message;
      }
      child.stdin.end();
    });
  };

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    if (stdout.includes('"event":"ended"')) {
      sendShutdown();
    }
  });

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  child.stdin.on('error', (error) => {
    stdinError = error instanceof Error ? error.message : String(error);
  });

  const sessionId = 1;
  const pcm = createPcm({ sampleRate, seconds });
  child.stdin.write(createFrame(frameTypeBeginSession, sessionId), (error) => {
    if (error) {
      stdinError = error.message;
    }
  });
  child.stdin.write(createFrame(frameTypePcmF32Le, sessionId, pcm), (error) => {
    if (error) {
      stdinError = error.message;
    }
  });
  child.stdin.write(createFrame(frameTypeEndSession, sessionId), (error) => {
    if (error) {
      stdinError = error.message;
    }
  });

  const exitCode = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve(-1);
    }, timeoutMs);

    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve(code ?? 0);
    });
  });

  return {
    exitCode,
    stdout,
    stderr,
    stdinError,
    shutdownSent,
    events: parseJsonLines(stdout),
  };
};

const assertNoSharedFallback = (label, result) => {
  if (result.stdout.includes('"backend":"wasapi-shared"') || result.stdout.includes('"exclusive":false,"backend":"wasapi-shared"')) {
    fail(`${label} fell back to shared output; stderr=${result.stderr}; stdout=${result.stdout}`);
  }
};

const hasAdvancedPosition = (events) => events.some((event) => typeof event.pos === 'number' && event.pos > 0);

const hasReadyBufferTelemetry = (event) =>
  event &&
  typeof event.deviceBufferFrames === 'number' &&
  typeof event.nativeActualBufferFrames === 'number' &&
  typeof event.actualBufferFrames === 'number' &&
  typeof event.requestedDeviceBufferFrames === 'number' &&
  typeof event.openedDeviceBufferFrames === 'number' &&
  typeof event.bufferSizeFallback === 'boolean';

const listResult = runList(['-list']);

if (listResult.status !== 0) {
  fail(`-list failed: ${listResult.stderr || listResult.stdout}`);
}

const devices = parseDeviceLines(listResult.stdout);

if (devices.length === 0) {
  fail('-list returned no output devices');
}

console.log(`[smoke:audio-host] listed ${devices.length} output devices`);

if (process.platform === 'win32') {
  const initTimeoutResult = await runPcmHost(['-sr', '48000', '-ch', '2'], {
    timeoutMs: 6000,
    sampleRate: 48000,
    seconds: 0.01,
    env: { ECHO_TEST_WASAPI_INITIALIZE_HANG_MS: '5000' },
  });
  const initTimeoutExitCode = normalizeExitCode(initTimeoutResult.exitCode);

  if (initTimeoutExitCode !== -3) {
    fail(`WASAPI initialize timeout exited with ${initTimeoutResult.exitCode}; stderr=${initTimeoutResult.stderr}; stdout=${initTimeoutResult.stdout}`);
  }

  if (initTimeoutResult.elapsedMs >= 3500) {
    fail(`WASAPI initialize timeout took ${initTimeoutResult.elapsedMs}ms; stderr=${initTimeoutResult.stderr}; stdout=${initTimeoutResult.stdout}`);
  }

  if (!/WASAPI Initialize timed out after 3000ms phase=initialize/u.test(initTimeoutResult.stderr)) {
    fail(`WASAPI initialize timeout missing diagnostic; stderr=${initTimeoutResult.stderr}; stdout=${initTimeoutResult.stdout}`);
  }

  console.log(`[smoke:audio-host] WASAPI initialize timeout fail-fast OK (${initTimeoutResult.elapsedMs}ms)`);
}

const sharedResult = await runPcmHost(['-sr', '48000', '-ch', '2'], {
  timeoutMs: 10000,
  sampleRate: 48000,
  seconds: 0.25,
});

if (sharedResult.exitCode !== 0) {
  fail(`shared host exited with ${sharedResult.exitCode}; stdin=${sharedResult.stdinError || 'ok'}; stderr=${sharedResult.stderr}; stdout=${sharedResult.stdout}`);
}

const sharedReady = sharedResult.events.find((event) => event.ready === true);
let ready = Boolean(sharedReady);
let position = sharedResult.events.some((event) => typeof event.pos === 'number');
let ended = sharedResult.events.some((event) => event.event === 'ended');
let telemetry = sharedResult.events.some((event) =>
  typeof event.pos === 'number' &&
  typeof event.bufferedFrames === 'number' &&
  typeof event.underrunCallbacks === 'number' &&
  typeof event.underrunFrames === 'number'
);

if (!ready || !position || !telemetry || !ended || !hasReadyBufferTelemetry(sharedReady)) {
  fail(`missing expected shared events ready=${ready} bufferTelemetry=${hasReadyBufferTelemetry(sharedReady)} position=${position} telemetry=${telemetry} ended=${ended}; stderr=${sharedResult.stderr}; stdout=${sharedResult.stdout}`);
}

console.log('[smoke:audio-host] shared ready/position/telemetry/ended OK');

const framedSharedResult = await runFramedPcmHost(['-sr', '48000', '-ch', '2'], {
  timeoutMs: 10000,
  sampleRate: 48000,
  seconds: 0.25,
});

if (framedSharedResult.exitCode !== 0) {
  fail(`framed shared host exited with ${framedSharedResult.exitCode}; stdin=${framedSharedResult.stdinError || 'ok'}; stderr=${framedSharedResult.stderr}; stdout=${framedSharedResult.stdout}`);
}

const framedSharedReady = framedSharedResult.events.find((event) => event.ready === true);
ready = Boolean(framedSharedReady);
position = framedSharedResult.events.some((event) => typeof event.pos === 'number');
ended = framedSharedResult.events.some((event) => event.event === 'ended');
const shutdownAck = framedSharedResult.events.some((event) => event.event === 'shutdown-ack');
telemetry = framedSharedResult.events.some((event) =>
  typeof event.pos === 'number' &&
  typeof event.bufferedFrames === 'number' &&
  typeof event.underrunCallbacks === 'number' &&
  typeof event.underrunFrames === 'number'
);

if (!ready || !position || !telemetry || !ended || !shutdownAck || !hasReadyBufferTelemetry(framedSharedReady)) {
  fail(`missing expected framed shared events ready=${ready} bufferTelemetry=${hasReadyBufferTelemetry(framedSharedReady)} position=${position} telemetry=${telemetry} ended=${ended} shutdownAck=${shutdownAck}; stdin=${framedSharedResult.stdinError || 'ok'}; stderr=${framedSharedResult.stderr}; stdout=${framedSharedResult.stdout}`);
}

console.log('[smoke:audio-host] framed stdin ready/position/telemetry/ended/shutdown OK');

if (process.platform === 'win32') {
  const directSoundResult = await runPcmHost(['-sr', '48000', '-ch', '2', '-shared-backend', 'directsound'], {
    timeoutMs: 10000,
    sampleRate: 48000,
    seconds: 0.25,
  });
  const directSoundReady = directSoundResult.events.find((event) => event.ready === true);
  const directSoundPosition = directSoundResult.events.some((event) => typeof event.pos === 'number');
  const directSoundEnded = directSoundResult.events.some((event) => event.event === 'ended');

  if (directSoundResult.exitCode !== 0) {
    fail(`DirectSound shared host exited with ${directSoundResult.exitCode}; stdin=${directSoundResult.stdinError || 'ok'}; stderr=${directSoundResult.stderr}; stdout=${directSoundResult.stdout}`);
  }

  if (
    !directSoundReady ||
    directSoundReady.backend !== 'directsound-shared' ||
    !directSoundPosition ||
    !directSoundEnded ||
    !hasReadyBufferTelemetry(directSoundReady)
  ) {
    fail(`missing expected DirectSound shared events ready=${Boolean(directSoundReady)} bufferTelemetry=${hasReadyBufferTelemetry(directSoundReady)} position=${directSoundPosition} ended=${directSoundEnded}; stderr=${directSoundResult.stderr}; stdout=${directSoundResult.stdout}`);
  }

  console.log('[smoke:audio-host] DirectSound shared ready/position/ended OK');
}

const asioListResult = runList(['-list', '-asio']);
const asioDevices = parseDeviceLines(asioListResult.stdout);

if (asioListResult.status === 0) {
  console.log(`[smoke:audio-host] ASIO list returned ${asioDevices.length} device(s)`);
} else {
  const diagnostic = `${asioListResult.stderr || ''}${asioListResult.stdout || ''}`;
  if (!/ASIO/i.test(diagnostic)) {
    fail(`-list -asio failed without ASIO diagnostic: ${diagnostic}`);
  }
  console.log(`[smoke:audio-host] ASIO list diagnostic OK: ${diagnostic.trim()}`);
}

const exclusiveResult = await runPcmHost(['-sr', '44100', '-ch', '2', '-exclusive'], {
  timeoutMs: 60000,
  sampleRate: 44100,
  seconds: 0.1,
});
const exclusiveReady = exclusiveResult.events.find((event) => event.ready === true);
assertNoSharedFallback('exclusive smoke', exclusiveResult);

if (exclusiveResult.exitCode === 0) {
  if (!exclusiveReady || exclusiveReady.exclusive !== true || exclusiveReady.backend !== 'wasapi-exclusive') {
    fail(`exclusive ready metadata invalid; stderr=${exclusiveResult.stderr}; stdout=${exclusiveResult.stdout}`);
  }
  if (!hasReadyBufferTelemetry(exclusiveReady)) {
    fail(`exclusive ready buffer telemetry invalid; stderr=${exclusiveResult.stderr}; stdout=${exclusiveResult.stdout}`);
  }
  if (!hasAdvancedPosition(exclusiveResult.events)) {
    fail(`exclusive did not consume PCM frames; stderr=${exclusiveResult.stderr}; stdout=${exclusiveResult.stdout}`);
  }
  console.log(`[smoke:audio-host] exclusive ready OK (${exclusiveReady.deviceType ?? 'unknown device type'})`);
} else if (!/WASAPI exclusive open failed/i.test(exclusiveResult.stderr)) {
  fail(`exclusive failed without explicit diagnostic; exit=${exclusiveResult.exitCode}; stderr=${exclusiveResult.stderr}; stdout=${exclusiveResult.stdout}`);
} else {
  console.log('[smoke:audio-host] exclusive failure diagnostic OK');
}

if (asioListResult.status === 0 && asioDevices.length > 0) {
  const asioResult = await runPcmHost(['-sr', '44100', '-ch', '2', '-asio'], {
    timeoutMs: 30000,
    sampleRate: 44100,
    seconds: 0.1,
  });
  const asioReady = asioResult.events.find((event) => event.ready === true);
  assertNoSharedFallback('ASIO smoke', asioResult);

  if (asioResult.exitCode === 0) {
    if (!asioReady || asioReady.backend !== 'asio' || asioReady.exclusive !== false) {
      fail(`ASIO ready metadata invalid; stderr=${asioResult.stderr}; stdout=${asioResult.stdout}`);
    }
    if (!hasReadyBufferTelemetry(asioReady)) {
      fail(`ASIO ready buffer telemetry invalid; stderr=${asioResult.stderr}; stdout=${asioResult.stdout}`);
    }
    if (!hasAdvancedPosition(asioResult.events)) {
      fail(`ASIO did not consume PCM frames; stderr=${asioResult.stderr}; stdout=${asioResult.stdout}`);
    }
    console.log(`[smoke:audio-host] ASIO ready OK (${asioReady.deviceName ?? 'unknown device'})`);
  } else if (!/ASIO open failed/i.test(asioResult.stderr)) {
    fail(`ASIO failed without explicit diagnostic; exit=${asioResult.exitCode}; stderr=${asioResult.stderr}; stdout=${asioResult.stdout}`);
  } else {
    console.log('[smoke:audio-host] ASIO failure diagnostic OK');
  }
}

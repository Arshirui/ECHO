import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AudioWaveform, CheckCircle2, Clock3, FileAudio, Gauge, Headphones, Info, RadioTower, RotateCcw, Route, ShieldCheck, SlidersHorizontal, Waves, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AudioStatus, ChannelBalanceMonoMode, ChannelBalanceState } from '../../shared/types/audio';
import type { EqState, RoomCorrectionState } from '../../shared/types/eq';
import { channelBalanceMaxDelayMs, channelBalanceMaxGainDb, channelBalanceMinDelayMs, channelBalanceMinGainDb } from '../../shared/types/audio';
import { dspHeadroomMaxDb, dspHeadroomMinDb, roomCorrectionMaxTrimDb, roomCorrectionMinTrimDb } from '../../shared/types/eq';
import { EqPanel } from '../components/audio/EqPanel';
import { useI18n } from '../i18n/I18nProvider';
import type { TranslationKey } from '../i18n/locales';
import { refreshPlaybackStatus, useSharedPlaybackStatus } from '../stores/playbackStatusStore';
import { getEqBridge } from '../utils/echoBridge';

type DspModuleId = 'headroom' | 'eq' | 'room' | 'channel' | 'safety';

type DspModule = {
  id: DspModuleId;
  stageKey: string;
  title: string;
  subtitle: string;
  description: string;
  icon: LucideIcon;
  enabled: boolean;
  accent: 'blue' | 'violet' | 'green' | 'amber';
};

const fallbackEqState: EqState = {
  enabled: false,
  preampDb: 0,
  dspHeadroomDb: 0,
  presetId: 'flat',
  presetName: 'Flat',
  clippingRisk: false,
  bands: [],
};

const fallbackRoomCorrection: RoomCorrectionState = {
  enabled: false,
  status: 'empty',
  irId: null,
  irName: null,
  channelMode: 'none',
  sampleRate: null,
  tapCount: 0,
  trimDb: 0,
  latencySamples: 0,
  clippingRisk: false,
  error: null,
};

const fallbackChannelBalance: ChannelBalanceState = {
  enabled: false,
  balance: 0,
  leftGainDb: 0,
  rightGainDb: 0,
  leftDelayMs: 0,
  rightDelayMs: 0,
  swapLeftRight: false,
  monoMode: 'off',
  invertLeft: false,
  invertRight: false,
  constantPower: true,
  clippingRisk: false,
};

const monoModeKeyMap: Record<ChannelBalanceMonoMode, string> = {
  off: 'dsp.panel.channel.mono.off',
  sum: 'dsp.panel.channel.mono.sum',
  left: 'dsp.panel.channel.mono.left',
  right: 'dsp.panel.channel.mono.right',
};

const dspLocalText: Record<string, string> = {
  'dsp.action.clear': '清除',
  'dsp.action.disableChannel': '关闭声道',
  'dsp.action.disableFir': '关闭 FIR',
  'dsp.action.enableChannel': '启用声道',
  'dsp.action.enableFir': '启用 FIR',
  'dsp.action.importIr': '导入 IR',
  'dsp.action.refresh': '刷新状态',
  'dsp.action.reset': '重置',
  'dsp.aria.chain': 'DSP 模块链',
  'dsp.aria.modules': 'DSP 模块',
  'dsp.aria.pipeline': 'DSP 路径',
  'dsp.aria.workspace': 'DSP 工作区',
  'dsp.brand.subtitle': 'Signal Control',
  'dsp.error.channelBridge': '声道工具不可用。',
  'dsp.error.desktopBridge': '桌面桥接不可用。',
  'dsp.error.dspBridge': 'DSP 桥接不可用。',
  'dsp.error.firBridge': 'FIR 桥接不可用。',
  'dsp.label.bitPerfect': 'Bit-perfect',
  'dsp.label.currentModule': '当前模块',
  'dsp.label.module': 'DSP 模块',
  'dsp.label.moduleStatus': '模块状态',
  'dsp.label.output': '输出',
  'dsp.metric.bitPerfect': 'Bit-perfect',
  'dsp.metric.clipping': '削波',
  'dsp.metric.dsp': 'DSP',
  'dsp.metric.inputPeak': '输入峰值',
  'dsp.metric.ir': 'IR',
  'dsp.metric.latency': '延迟',
  'dsp.metric.liveHeadroom': '实时余量',
  'dsp.metric.mode': '模式',
  'dsp.metric.outputEstimate': '输出估算',
  'dsp.metric.reason': '原因',
  'dsp.metric.sampleRate': '采样率',
  'dsp.metric.taps': 'Taps',
  'dsp.module.channel.description': '平衡、延迟、Mono',
  'dsp.module.channel.title': '声道工具',
  'dsp.module.eq.description': '频段、前级、预设',
  'dsp.module.eq.title': '参数 EQ',
  'dsp.module.headroom.description': 'DSP 前余量预留',
  'dsp.module.headroom.title': 'Headroom',
  'dsp.module.room.description': '只处理 IR 卷积',
  'dsp.module.room.title': 'FIR / 房间校正',
  'dsp.module.safety.description': '只监控输出链',
  'dsp.module.safety.title': '输出安全',
  'dsp.panel.channel.balance': '声像平衡',
  'dsp.panel.channel.constantPower': '恒功率',
  'dsp.panel.channel.invertLeft': '左声道反相',
  'dsp.panel.channel.invertRight': '右声道反相',
  'dsp.panel.channel.kicker': '声道工具',
  'dsp.panel.channel.leftDelay': '左声道延迟',
  'dsp.panel.channel.leftGain': '左声道增益',
  'dsp.panel.channel.mono.left': '只听左声道',
  'dsp.panel.channel.mono.off': '关闭 Mono',
  'dsp.panel.channel.mono.right': '只听右声道',
  'dsp.panel.channel.mono.sum': '合并 Mono',
  'dsp.panel.channel.note': '声道工具已从参数 EQ 中分离，适合检查声像、左右耳差异和单声道兼容。',
  'dsp.panel.channel.rightDelay': '右声道延迟',
  'dsp.panel.channel.rightGain': '右声道增益',
  'dsp.panel.channel.swap': '交换左右',
  'dsp.panel.headroom.applyRecommended': '应用建议',
  'dsp.panel.headroom.budgetAria': 'Headroom 预算',
  'dsp.panel.headroom.clipCount': '削波次数',
  'dsp.panel.headroom.clipCountValue': '{count} 次',
  'dsp.panel.headroom.guardActive': '已启用',
  'dsp.panel.headroom.guardDirect': '直通',
  'dsp.panel.headroom.guardStandby': '待命',
  'dsp.panel.headroom.guardState': '保护状态',
  'dsp.panel.headroom.kicker': 'Headroom 管理',
  'dsp.panel.headroom.lastClip': '最近削波',
  'dsp.panel.headroom.makeConservative': '设为 -6 dB',
  'dsp.panel.headroom.makeSafe': '设为 {value}',
  'dsp.panel.headroom.modeAria': 'Headroom 模式',
  'dsp.panel.headroom.modeDaily': '日常',
  'dsp.panel.headroom.modeDailyDetail': '轻量 DSP 预留。',
  'dsp.panel.headroom.modeDirect': '直通',
  'dsp.panel.headroom.modeDirectDetail': '不额外降低电平。',
  'dsp.panel.headroom.modeDsp': 'DSP',
  'dsp.panel.headroom.modeDspDetail': '给 EQ/FIR 留出安全空间。',
  'dsp.panel.headroom.nextDirect': '保持直通',
  'dsp.panel.headroom.nextDirectDetail': '当前没有需要预留的 DSP 风险。',
  'dsp.panel.headroom.nextHoldRisk': '先降低余量',
  'dsp.panel.headroom.nextHoldRiskDetail': '检测到削波风险，建议先预留 Headroom。',
  'dsp.panel.headroom.nextProtect': '应用保护余量',
  'dsp.panel.headroom.nextProtectDetail': '当前输出接近满幅，建议立即降低。',
  'dsp.panel.headroom.nextReady': '继续监听',
  'dsp.panel.headroom.nextReadyDetail': 'DSP 已有安全余量。',
  'dsp.panel.headroom.nextStandby': '保持待命',
  'dsp.panel.headroom.nextStandbyDetail': '有 DSP 模块开启，但暂未检测到风险。',
  'dsp.panel.headroom.nextStep': '下一步',
  'dsp.panel.headroom.nextWatch': '观察输出',
  'dsp.panel.headroom.nextWatchDetail': '输出接近上限，建议留意削波。',
  'dsp.panel.headroom.noClip': '无记录',
  'dsp.panel.headroom.note': 'Headroom 只负责预留电平空间，不再混进 EQ 或 FIR 的具体调音。',
  'dsp.panel.headroom.presetsAria': 'Headroom 预设',
  'dsp.panel.headroom.primaryAction': '应用 {value}',
  'dsp.panel.headroom.reasonChannel': '声道工具可能提高电平。',
  'dsp.panel.headroom.reasonClipping': '检测到削波。',
  'dsp.panel.headroom.reasonEq': 'EQ 曲线可能提高电平。',
  'dsp.panel.headroom.reasonLive': '实时余量偏低。',
  'dsp.panel.headroom.reasonOutput': '输出估算接近满幅。',
  'dsp.panel.headroom.reasonRoom': 'FIR / 房间校正可能提高电平。',
  'dsp.panel.headroom.reasonSafe': '当前信号安全。',
  'dsp.panel.headroom.recommendation': '建议',
  'dsp.panel.headroom.recommendationSafe': '安全',
  'dsp.panel.headroom.reserve': '预留余量',
  'dsp.panel.headroom.safePolicy': '安全优先',
  'dsp.panel.headroom.safetyActions': '快速保护',
  'dsp.panel.headroom.status': '状态',
  'dsp.panel.headroom.statusClose': '接近上限',
  'dsp.panel.headroom.statusRisk': '存在风险',
  'dsp.panel.headroom.statusSafe': '安全',
  'dsp.panel.room.future.recent': '最近 IR',
  'dsp.panel.room.future.response': '响应预览',
  'dsp.panel.room.hero.activeDetail': '卷积正在参与输出链。',
  'dsp.panel.room.hero.activeTitle': 'FIR 已启用',
  'dsp.panel.room.hero.emptyDetail': '导入 IR 后才能启用房间校正。',
  'dsp.panel.room.hero.emptyTitle': '未载入 IR',
  'dsp.panel.room.hero.loadedDetail': 'IR 已载入，可以启用。',
  'dsp.panel.room.hero.loadedTitle': 'IR 已载入',
  'dsp.panel.room.hero.state': '状态',
  'dsp.panel.room.kicker': '空间处理',
  'dsp.panel.room.nextEnable': '启用 FIR',
  'dsp.panel.room.nextEnableDetail': 'IR 已准备好，可以试听。',
  'dsp.panel.room.nextImport': '导入 IR',
  'dsp.panel.room.nextImportDetail': '先选择一个卷积文件。',
  'dsp.panel.room.nextListen': '继续试听',
  'dsp.panel.room.nextListenDetail': '确认校正后音量和相位正常。',
  'dsp.panel.room.nextTrim': '降低 Trim',
  'dsp.panel.room.nextTrimDetail': 'FIR 输出存在削波风险。',
  'dsp.panel.room.note': 'FIR / 房间校正只处理卷积和 IR，不再和 EQ 预设混在一起。',
  'dsp.panel.room.routeTitle': '路径',
  'dsp.panel.room.safetyRisk': '请降低 Trim 或 Headroom。',
  'dsp.panel.room.safetySafe': '输出链当前安全。',
  'dsp.panel.room.safetyTitle': '安全',
  'dsp.panel.room.trim': 'Trim',
  'dsp.panel.safety.kicker': '输出安全',
  'dsp.panel.safety.note': '输出安全只负责最终链路状态，不改变 EQ、FIR 或声道参数。',
  'dsp.room.status.active': '已启用',
  'dsp.room.status.empty': '未载入',
  'dsp.room.status.error': '错误',
  'dsp.room.status.loaded': '已载入',
  'dsp.stage.input': '输入',
  'dsp.stage.output': '输出',
  'dsp.stage.shape': '塑形',
  'dsp.stage.space': '空间',
  'dsp.stage.stereo': '声道',
  'dsp.status.active': '已启用',
  'dsp.status.auto': '自动',
  'dsp.status.balanceActive': '声道处理中',
  'dsp.status.bypassed': '已旁路',
  'dsp.status.candidate': '候选',
  'dsp.status.clear': '正常',
  'dsp.status.direct': '直通',
  'dsp.status.disabledByDsp': 'DSP 路径',
  'dsp.status.dspPath': 'DSP 路径',
  'dsp.status.flat': 'Flat',
  'dsp.status.headroomRisk': '余量风险',
  'dsp.status.limiterArmed': '待命',
  'dsp.status.modulesActive': '{count} 个模块启用',
  'dsp.status.nativeDirect': 'Bit-perfect 路径',
  'dsp.status.noIr': '无 IR',
  'dsp.status.none': '无',
  'dsp.status.protected': '已保护',
  'dsp.status.ready': '就绪',
  'dsp.status.risk': '风险',
  'dsp.status.riskDetected': '检测到风险',
  'dsp.status.shared': 'shared',
  'dsp.status.signalProtected': '信号安全',
  'dsp.status.stereoDirect': '立体声直通',
  'dsp.status.systemOutput': '系统输出',
};

type DspTranslate = (key: string, options?: Parameters<ReturnType<typeof useI18n>['t']>[1]) => string;

const useDspI18n = (): { t: DspTranslate } => {
  const { t } = useI18n();
  return {
    t: useCallback((key, options) => {
      if (dspLocalText[key]) {
        return Object.entries(options ?? {}).reduce(
          (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
          dspLocalText[key],
        );
      }

      return t(key as TranslationKey, options);
    }, [t]),
  };
};

const formatDb = (value: number | null | undefined): string => {
  if (!Number.isFinite(value)) {
    return '0 dB';
  }

  const rounded = Math.round(Number(value) * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(Math.abs(rounded) % 1 > 0 ? 1 : 0)} dB`;
};

const formatLevel = (value: number | null | undefined): string => (Number.isFinite(value) ? formatDb(value) : '--');

const formatRate = (value: number | null | undefined, autoLabel: string): string => (value ? `${Math.round(value / 1000)} kHz` : autoLabel);

const clampNumber = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const finiteLevel = (value: number | null | undefined): number | null => (Number.isFinite(value) ? Number(value) : null);

const roundHeadroomDb = (value: number): number => Math.round(clampNumber(value, dspHeadroomMinDb, dspHeadroomMaxDb) * 10) / 10;

const formatTime = (value: string | null | undefined, emptyLabel: string): string => {
  if (!value) {
    return emptyLabel;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return emptyLabel;
  }

  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const getRecommendedHeadroomDb = (audioStatus: AudioStatus | null, currentHeadroomDb: number): number => {
  const targetHeadroomDb = 1;
  const outputPeakDb = finiteLevel(audioStatus?.audioLevels?.estimatedOutputPeakDb);
  const liveHeadroomDb = finiteLevel(audioStatus?.audioLevels?.headroomDb);
  const reductionFromOutput = outputPeakDb === null ? 0 : Math.max(0, outputPeakDb + targetHeadroomDb);
  const reductionFromLive = liveHeadroomDb === null ? 0 : Math.max(0, targetHeadroomDb - liveHeadroomDb);
  const fallbackReduction = audioStatus?.clippingRisk ? 6 : 0;
  const neededReductionDb = Math.max(reductionFromOutput, reductionFromLive, fallbackReduction);

  if (neededReductionDb <= 0.05) {
    return roundHeadroomDb(currentHeadroomDb);
  }

  return roundHeadroomDb(currentHeadroomDb - neededReductionDb);
};

type HeadroomTone = 'good' | 'warn' | 'risk';

type ModulePanelProps = {
  audioStatus: AudioStatus | null;
  eqState: EqState;
  roomCorrection: RoomCorrectionState;
  channelBalance: ChannelBalanceState;
  busyKey: string | null;
  onHeadroomChange: (headroomDb: number) => void;
  onImportRoomCorrection: () => void;
  onToggleRoomCorrection: () => void;
  onRoomTrimChange: (trimDb: number) => void;
  onClearRoomCorrection: () => void;
  onChannelPatch: (patch: Partial<ChannelBalanceState>) => void;
  onChannelReset: () => void;
  onRefresh: () => void;
};

const DspMetric = ({ label, value, tone }: { label: string; value: string; tone?: HeadroomTone }): JSX.Element => (
  <span className="dsp-module-metric" data-tone={tone}>
    <em>{label}</em>
    <strong>{value}</strong>
  </span>
);

const HeadroomPanel = ({ audioStatus, eqState, roomCorrection, channelBalance, busyKey, onHeadroomChange, onRefresh }: ModulePanelProps): JSX.Element => {
  const { t } = useDspI18n();
  const headroomDb = eqState.dspHeadroomDb ?? 0;
  const recommendedHeadroomDb = getRecommendedHeadroomDb(audioStatus, headroomDb);
  const hasRecommendation = Math.abs(recommendedHeadroomDb - headroomDb) > 0.05;
  const liveHeadroomDb = finiteLevel(audioStatus?.audioLevels?.headroomDb);
  const outputPeakDb = finiteLevel(audioStatus?.audioLevels?.estimatedOutputPeakDb);
  const inputPeakDb = finiteLevel(audioStatus?.audioLevels?.inputPeakDb);
  const clippingRisk = audioStatus?.clippingRisk === true || eqState.clippingRisk || roomCorrection.clippingRisk || channelBalance.clippingRisk === true;
  const clipCount = audioStatus?.audioLevels?.clipCount ?? 0;
  const lastClipAt = audioStatus?.audioLevels?.lastClipAt ?? null;
  const headroomArmed = Math.abs(headroomDb) > 0.05;
  const headroomActive = audioStatus?.dspActive === true && headroomArmed;
  const guardStateKey: string =
    headroomActive ? 'dsp.panel.headroom.guardActive' :
    headroomArmed ? 'dsp.panel.headroom.guardStandby' :
    'dsp.panel.headroom.guardDirect';
  const statusTone: HeadroomTone = clippingRisk || clipCount > 0 ? 'risk' : liveHeadroomDb !== null && liveHeadroomDb <= 1 ? 'warn' : 'good';
  const statusKey: string =
    statusTone === 'risk' ? 'dsp.panel.headroom.statusRisk' :
    statusTone === 'warn' ? 'dsp.panel.headroom.statusClose' :
    'dsp.panel.headroom.statusSafe';
  const reasonKey: string =
    clipCount > 0 || audioStatus?.clippingRisk ? 'dsp.panel.headroom.reasonClipping' :
    eqState.clippingRisk ? 'dsp.panel.headroom.reasonEq' :
    roomCorrection.clippingRisk ? 'dsp.panel.headroom.reasonRoom' :
    channelBalance.clippingRisk ? 'dsp.panel.headroom.reasonChannel' :
    outputPeakDb !== null && outputPeakDb >= -1 ? 'dsp.panel.headroom.reasonOutput' :
    liveHeadroomDb !== null && liveHeadroomDb <= 1 ? 'dsp.panel.headroom.reasonLive' :
    'dsp.panel.headroom.reasonSafe';
  const modeOptions = [
    { value: 0, title: t('dsp.panel.headroom.modeDirect'), detail: t('dsp.panel.headroom.modeDirectDetail') },
    { value: -3, title: t('dsp.panel.headroom.modeDaily'), detail: t('dsp.panel.headroom.modeDailyDetail') },
    { value: -6, title: t('dsp.panel.headroom.modeDsp'), detail: t('dsp.panel.headroom.modeDspDetail') },
  ];
  const protectiveFloorDb = statusTone === 'risk' ? -6 : statusTone === 'warn' ? -3 : headroomDb;
  const protectiveHeadroomDb = roundHeadroomDb(Math.min(headroomDb, recommendedHeadroomDb, protectiveFloorDb));
  const conservativeHeadroomDb = roundHeadroomDb(Math.min(headroomDb, -6));
  const canApplyProtective = protectiveHeadroomDb < headroomDb - 0.05;
  const canApplyConservative = conservativeHeadroomDb < headroomDb - 0.05;
  const nextStepKey: string =
    canApplyProtective ? 'dsp.panel.headroom.nextProtect' :
    statusTone === 'risk' ? 'dsp.panel.headroom.nextHoldRisk' :
    statusTone === 'warn' ? 'dsp.panel.headroom.nextWatch' :
    headroomActive ? 'dsp.panel.headroom.nextReady' :
    headroomArmed ? 'dsp.panel.headroom.nextStandby' :
    'dsp.panel.headroom.nextDirect';
  const nextStepDetailKey: string =
    canApplyProtective ? 'dsp.panel.headroom.nextProtectDetail' :
    statusTone === 'risk' ? 'dsp.panel.headroom.nextHoldRiskDetail' :
    statusTone === 'warn' ? 'dsp.panel.headroom.nextWatchDetail' :
    headroomActive ? 'dsp.panel.headroom.nextReadyDetail' :
    headroomArmed ? 'dsp.panel.headroom.nextStandbyDetail' :
    'dsp.panel.headroom.nextDirectDetail';

  return (
    <section className="dsp-module-panel dsp-module-panel--headroom">
      <div className="dsp-headroom-main">
        <div className="dsp-headroom-control">
          <p className="dsp-module-kicker">{t('dsp.panel.headroom.kicker')}</p>
          <div className="dsp-module-heading">
            <span><Gauge size={18} />{t('dsp.module.headroom.title')}</span>
            <strong>{formatDb(headroomDb)}</strong>
          </div>
          <div className="dsp-headroom-status" data-tone={statusTone}>
            <span>
              <em>{t('dsp.panel.headroom.status')}</em>
              <strong>{t(statusKey)}</strong>
            </span>
            <p>{t(reasonKey)}</p>
          </div>
          <div className="dsp-module-metrics dsp-headroom-metrics">
            <DspMetric label={t('dsp.metric.inputPeak')} value={formatLevel(inputPeakDb)} />
            <DspMetric label={t('dsp.metric.outputEstimate')} value={formatLevel(outputPeakDb)} />
            <DspMetric label={t('dsp.metric.liveHeadroom')} value={formatLevel(liveHeadroomDb)} tone={statusTone === 'risk' ? 'risk' : 'good'} />
            <DspMetric label={t('dsp.panel.headroom.guardState')} value={t(guardStateKey)} tone={headroomActive ? 'good' : headroomArmed ? 'warn' : undefined} />
            <DspMetric label={t('dsp.panel.headroom.clipCount')} value={t('dsp.panel.headroom.clipCountValue', { count: String(clipCount) })} tone={clipCount > 0 ? 'risk' : 'good'} />
            <DspMetric label={t('dsp.panel.headroom.lastClip')} value={formatTime(lastClipAt, t('dsp.panel.headroom.noClip'))} tone={clipCount > 0 ? 'risk' : undefined} />
          </div>
          <label className="dsp-module-range">
            <span>{t('dsp.panel.headroom.reserve')}</span>
            <input
              type="range"
              min={dspHeadroomMinDb}
              max={dspHeadroomMaxDb}
              step="0.1"
              value={headroomDb}
              onChange={(event) => onHeadroomChange(Number(event.currentTarget.value))}
            />
            <strong>{formatDb(headroomDb)}</strong>
          </label>
          <div className="dsp-headroom-budget" aria-label={t('dsp.panel.headroom.budgetAria')}>
            <span style={{ width: `${Math.max(6, Math.min(100, ((inputPeakDb ?? -18) + 24) * 3.3))}%` }}>
              <em>{t('dsp.metric.inputPeak')}</em>
              <strong>{formatLevel(inputPeakDb)}</strong>
            </span>
            <span style={{ width: `${Math.max(6, Math.min(100, ((outputPeakDb ?? -18) + 24) * 3.3))}%` }}>
              <em>{t('dsp.metric.outputEstimate')}</em>
              <strong>{formatLevel(outputPeakDb)}</strong>
            </span>
            <span data-tone={statusTone}>
              <em>{t('dsp.metric.liveHeadroom')}</em>
              <strong>{formatLevel(liveHeadroomDb)}</strong>
            </span>
          </div>
        </div>

        <aside className="dsp-headroom-assist">
          <div className="dsp-headroom-next-step" data-tone={statusTone}>
            <span>
              <em>{t('dsp.panel.headroom.nextStep')}</em>
              <strong>{t(nextStepKey)}</strong>
            </span>
            <p>{t(nextStepDetailKey)}</p>
            <div>
              <button type="button" disabled={!canApplyProtective || busyKey === 'headroom'} onClick={() => onHeadroomChange(protectiveHeadroomDb)}>
                <ShieldCheck size={14} aria-hidden="true" />
                {t('dsp.panel.headroom.primaryAction', { value: formatDb(protectiveHeadroomDb) })}
              </button>
              <button type="button" onClick={onRefresh}>
                <Activity size={14} aria-hidden="true" />
                {t('dsp.action.refresh')}
              </button>
            </div>
          </div>
          <div className="dsp-headroom-recommendation" data-active={hasRecommendation}>
            <em>{t('dsp.panel.headroom.recommendation')}</em>
            <strong>{hasRecommendation ? formatDb(recommendedHeadroomDb) : t('dsp.panel.headroom.recommendationSafe')}</strong>
            <button type="button" disabled={!hasRecommendation || busyKey === 'headroom'} onClick={() => onHeadroomChange(recommendedHeadroomDb)}>
              <Gauge size={14} aria-hidden="true" />
              {t('dsp.panel.headroom.applyRecommended')}
            </button>
          </div>
          <div className="dsp-headroom-safe-actions">
            <span>
              <em>{t('dsp.panel.headroom.safetyActions')}</em>
              <strong>{t('dsp.panel.headroom.safePolicy')}</strong>
            </span>
            <button type="button" disabled={!canApplyProtective || busyKey === 'headroom'} onClick={() => onHeadroomChange(protectiveHeadroomDb)}>
              <ShieldCheck size={14} aria-hidden="true" />
              {t('dsp.panel.headroom.makeSafe', { value: formatDb(protectiveHeadroomDb) })}
            </button>
            <button type="button" disabled={!canApplyConservative || busyKey === 'headroom'} onClick={() => onHeadroomChange(conservativeHeadroomDb)}>
              <ShieldCheck size={14} aria-hidden="true" />
              {t('dsp.panel.headroom.makeConservative')}
            </button>
          </div>
          <div className="dsp-headroom-modes" role="group" aria-label={t('dsp.panel.headroom.modeAria')}>
            {modeOptions.map((option) => (
              <button type="button" data-active={Math.abs(headroomDb - option.value) <= 0.05} disabled={busyKey === 'headroom'} key={option.value} onClick={() => onHeadroomChange(option.value)}>
                <strong>{option.title}</strong>
                <span>{option.detail}</span>
                <em>{formatDb(option.value)}</em>
              </button>
            ))}
          </div>
          <div className="dsp-module-actions" role="group" aria-label={t('dsp.panel.headroom.presetsAria')}>
            {[0, -3, -6, -9].map((value) => (
              <button type="button" data-active={Math.abs(headroomDb - value) <= 0.05} disabled={busyKey === 'headroom'} key={value} onClick={() => onHeadroomChange(value)}>
                {formatDb(value)}
              </button>
            ))}
          </div>
          <p className="dsp-module-note">{t('dsp.panel.headroom.note')}</p>
        </aside>
      </div>
    </section>
  );
};

const RoomCorrectionPanel = ({
  roomCorrection,
  eqState,
  audioStatus,
  busyKey,
  onImportRoomCorrection,
  onToggleRoomCorrection,
  onRoomTrimChange,
  onClearRoomCorrection,
}: ModulePanelProps): JSX.Element => {
  const { t } = useDspI18n();
  const status = roomCorrection.enabled ? t('dsp.status.active') : t(`dsp.room.status.${roomCorrection.status}` as TranslationKey);
  const hasIr = Boolean(roomCorrection.irId);
  const roomTone: HeadroomTone = roomCorrection.clippingRisk || roomCorrection.status === 'error' ? 'risk' : roomCorrection.enabled ? 'good' : hasIr ? 'warn' : 'good';
  const heroTitleKey: string =
    roomCorrection.enabled ? 'dsp.panel.room.hero.activeTitle' :
    hasIr ? 'dsp.panel.room.hero.loadedTitle' :
    'dsp.panel.room.hero.emptyTitle';
  const heroDetailKey: string =
    roomCorrection.enabled ? 'dsp.panel.room.hero.activeDetail' :
    hasIr ? 'dsp.panel.room.hero.loadedDetail' :
    'dsp.panel.room.hero.emptyDetail';
  const nextTitleKey: string =
    roomCorrection.clippingRisk ? 'dsp.panel.room.nextTrim' :
    roomCorrection.enabled ? 'dsp.panel.room.nextListen' :
    hasIr ? 'dsp.panel.room.nextEnable' :
    'dsp.panel.room.nextImport';
  const nextDetailKey: string =
    roomCorrection.clippingRisk ? 'dsp.panel.room.nextTrimDetail' :
    roomCorrection.enabled ? 'dsp.panel.room.nextListenDetail' :
    hasIr ? 'dsp.panel.room.nextEnableDetail' :
    'dsp.panel.room.nextImportDetail';
  const dspHeadroomDb = eqState.dspHeadroomDb ?? 0;
  const bitPerfectValue = roomCorrection.enabled ? t('dsp.status.disabledByDsp') : t('dsp.status.ready');
  const clippingValue = roomCorrection.clippingRisk ? t('dsp.status.riskDetected') : t('dsp.status.clear');
  const latencyValue = roomCorrection.latencySamples > 0 ? `${roomCorrection.latencySamples} samples` : t('dsp.status.none');
  const outputPeakDb = finiteLevel(audioStatus?.audioLevels?.estimatedOutputPeakDb);

  return (
    <section className="dsp-module-panel dsp-module-panel--room" data-enabled={roomCorrection.enabled} data-tone={roomTone}>
      <div className="dsp-room-main">
        <div className="dsp-room-hero">
          <p className="dsp-module-kicker">{t('dsp.panel.room.kicker')}</p>
          <div className="dsp-module-heading">
            <span><Waves size={18} />{t('dsp.module.room.title')}</span>
            <strong>{status}</strong>
          </div>
          <p>{t(heroDetailKey)}</p>
          <div className="dsp-room-primary">
            <span>
              <em>{t('dsp.panel.room.hero.state')}</em>
              <strong>{t(heroTitleKey)}</strong>
            </span>
            <div className="dsp-module-actions">
              <button type="button" disabled={busyKey === 'room-import'} onClick={onImportRoomCorrection}>
                <FileAudio size={14} aria-hidden="true" />
                {t('dsp.action.importIr')}
              </button>
              <button type="button" data-active={roomCorrection.enabled} disabled={!hasIr || busyKey === 'room-toggle'} onClick={onToggleRoomCorrection}>
                <Zap size={14} aria-hidden="true" />
                {roomCorrection.enabled ? t('dsp.action.disableFir') : t('dsp.action.enableFir')}
              </button>
              <button type="button" disabled={!hasIr || busyKey === 'room-clear'} onClick={onClearRoomCorrection}>
                {t('dsp.action.clear')}
              </button>
            </div>
          </div>
        </div>

        <label className="dsp-module-range dsp-room-trim">
          <span>{t('dsp.panel.room.trim')}</span>
          <input
            type="range"
            min={roomCorrectionMinTrimDb}
            max={roomCorrectionMaxTrimDb}
            step="0.1"
            value={roomCorrection.trimDb}
            disabled={!hasIr}
            onChange={(event) => onRoomTrimChange(Number(event.currentTarget.value))}
          />
          <strong>{formatDb(roomCorrection.trimDb)}</strong>
        </label>

        <div className="dsp-module-metrics dsp-room-metrics">
          <DspMetric label={t('dsp.metric.ir')} value={roomCorrection.irName ?? t('dsp.status.noIr')} tone={hasIr ? 'good' : undefined} />
          <DspMetric label={t('dsp.metric.mode')} value={roomCorrection.channelMode} />
          <DspMetric label={t('dsp.metric.taps')} value={roomCorrection.tapCount > 0 ? String(roomCorrection.tapCount) : '--'} />
          <DspMetric label={t('dsp.metric.sampleRate')} value={roomCorrection.sampleRate ? `${roomCorrection.sampleRate} Hz` : '--'} />
          <DspMetric label={t('dsp.metric.latency')} value={latencyValue} />
          <DspMetric label={t('dsp.metric.outputEstimate')} value={formatLevel(outputPeakDb)} tone={roomCorrection.clippingRisk ? 'risk' : undefined} />
        </div>

        {roomCorrection.error ? <p className="dsp-module-error">{roomCorrection.error}</p> : null}
        <p className="dsp-module-note">{t('dsp.panel.room.note')}</p>
      </div>

      <aside className="dsp-room-side">
        <div className="dsp-room-status" data-tone={roomTone}>
          <span>
            <ShieldCheck size={17} aria-hidden="true" />
            <em>{t('dsp.panel.room.safetyTitle')}</em>
          </span>
          <strong>{roomTone === 'risk' ? t('dsp.status.riskDetected') : t('dsp.status.signalProtected')}</strong>
          <p>{roomTone === 'risk' ? t('dsp.panel.room.safetyRisk') : t('dsp.panel.room.safetySafe')}</p>
        </div>

        <div className="dsp-room-route">
          <span>
            <Route size={16} aria-hidden="true" />
            <em>{t('dsp.panel.room.routeTitle')}</em>
          </span>
          <dl>
            <div>
              <dt>{t('dsp.metric.bitPerfect')}</dt>
              <dd>{bitPerfectValue}</dd>
            </div>
            <div>
              <dt>{t('dsp.panel.headroom.reserve')}</dt>
              <dd>{formatDb(dspHeadroomDb)}</dd>
            </div>
            <div>
              <dt>{t('dsp.metric.clipping')}</dt>
              <dd>{clippingValue}</dd>
            </div>
            <div>
              <dt>{t('dsp.metric.latency')}</dt>
              <dd>{latencyValue}</dd>
            </div>
          </dl>
        </div>

        <div className="dsp-room-next">
          <span>
            <Info size={16} aria-hidden="true" />
            <em>{t('dsp.panel.headroom.nextStep')}</em>
          </span>
          <strong>{t(nextTitleKey)}</strong>
          <p>{t(nextDetailKey)}</p>
        </div>

        <div className="dsp-room-expansion">
          <span><Clock3 size={15} aria-hidden="true" />{t('dsp.panel.room.future.recent')}</span>
          <span><AudioWaveform size={15} aria-hidden="true" />{t('dsp.panel.room.future.response')}</span>
        </div>
      </aside>
    </section>
  );
};

const ChannelPanel = ({ channelBalance, busyKey, onChannelPatch, onChannelReset }: ModulePanelProps): JSX.Element => {
  const { t } = useDspI18n();

  return (
    <section className="dsp-module-panel dsp-module-panel--channel">
      <p className="dsp-module-kicker">{t('dsp.panel.channel.kicker')}</p>
      <div className="dsp-module-heading">
        <span><Headphones size={18} />{t('dsp.module.channel.title')}</span>
        <strong>{channelBalance.enabled ? t('dsp.status.active') : t('dsp.status.bypassed')}</strong>
      </div>
      <div className="dsp-module-actions">
        <button type="button" data-active={channelBalance.enabled} disabled={busyKey === 'channel'} onClick={() => onChannelPatch({ enabled: !channelBalance.enabled })}>
          {channelBalance.enabled ? t('dsp.action.disableChannel') : t('dsp.action.enableChannel')}
        </button>
        <button type="button" disabled={busyKey === 'channel-reset'} onClick={onChannelReset}>
          <RotateCcw size={14} />{t('dsp.action.reset')}
        </button>
      </div>
      <label className="dsp-module-range">
        <span>{t('dsp.panel.channel.balance')}</span>
        <input
          type="range"
          min="-100"
          max="100"
          step="1"
          value={Math.round(channelBalance.balance * 100)}
          onChange={(event) => onChannelPatch({ balance: clampNumber(Number(event.currentTarget.value) / 100, -1, 1), enabled: true })}
        />
        <strong>{`${Math.round(channelBalance.balance * 100)}%`}</strong>
      </label>
      <div className="dsp-module-grid">
        <label>
          <span>{t('dsp.panel.channel.leftGain')}</span>
          <input type="number" min={channelBalanceMinGainDb} max={channelBalanceMaxGainDb} step="0.1" value={channelBalance.leftGainDb} onChange={(event) => onChannelPatch({ leftGainDb: Number(event.currentTarget.value), enabled: true })} />
        </label>
        <label>
          <span>{t('dsp.panel.channel.rightGain')}</span>
          <input type="number" min={channelBalanceMinGainDb} max={channelBalanceMaxGainDb} step="0.1" value={channelBalance.rightGainDb} onChange={(event) => onChannelPatch({ rightGainDb: Number(event.currentTarget.value), enabled: true })} />
        </label>
        <label>
          <span>{t('dsp.panel.channel.leftDelay')}</span>
          <input type="number" min={channelBalanceMinDelayMs} max={channelBalanceMaxDelayMs} step="0.1" value={channelBalance.leftDelayMs ?? 0} onChange={(event) => onChannelPatch({ leftDelayMs: Number(event.currentTarget.value), enabled: true })} />
        </label>
        <label>
          <span>{t('dsp.panel.channel.rightDelay')}</span>
          <input type="number" min={channelBalanceMinDelayMs} max={channelBalanceMaxDelayMs} step="0.1" value={channelBalance.rightDelayMs ?? 0} onChange={(event) => onChannelPatch({ rightDelayMs: Number(event.currentTarget.value), enabled: true })} />
        </label>
      </div>
      <div className="dsp-module-actions">
        {(['off', 'sum', 'left', 'right'] as const).map((mode) => (
          <button type="button" data-active={channelBalance.monoMode === mode} key={mode} onClick={() => onChannelPatch({ monoMode: mode, enabled: mode !== 'off' || channelBalance.enabled })}>
            {t(monoModeKeyMap[mode])}
          </button>
        ))}
      </div>
      <div className="dsp-module-actions">
        <button type="button" data-active={channelBalance.swapLeftRight} onClick={() => onChannelPatch({ swapLeftRight: !channelBalance.swapLeftRight, enabled: true })}>{t('dsp.panel.channel.swap')}</button>
        <button type="button" data-active={channelBalance.invertLeft} onClick={() => onChannelPatch({ invertLeft: !channelBalance.invertLeft, enabled: true })}>{t('dsp.panel.channel.invertLeft')}</button>
        <button type="button" data-active={channelBalance.invertRight} onClick={() => onChannelPatch({ invertRight: !channelBalance.invertRight, enabled: true })}>{t('dsp.panel.channel.invertRight')}</button>
        <button type="button" data-active={channelBalance.constantPower} onClick={() => onChannelPatch({ constantPower: !channelBalance.constantPower })}>{t('dsp.panel.channel.constantPower')}</button>
      </div>
      <p className="dsp-module-note">{t('dsp.panel.channel.note')}</p>
    </section>
  );
};

const SafetyPanel = ({ audioStatus, eqState, roomCorrection, channelBalance, onRefresh }: ModulePanelProps): JSX.Element => {
  const { t } = useDspI18n();
  const dspActive = audioStatus?.dspActive === true;
  const clippingRisk = audioStatus?.clippingRisk === true || eqState.clippingRisk || roomCorrection.clippingRisk || channelBalance.clippingRisk === true;

  return (
    <section className="dsp-module-panel dsp-module-panel--safety">
      <p className="dsp-module-kicker">{t('dsp.panel.safety.kicker')}</p>
      <div className="dsp-module-heading">
        <span><ShieldCheck size={18} />{t('dsp.module.safety.title')}</span>
        <strong>{clippingRisk ? t('dsp.status.risk') : dspActive ? t('dsp.status.protected') : t('dsp.status.direct')}</strong>
      </div>
      <div className="dsp-module-metrics">
        <DspMetric label={t('dsp.metric.dsp')} value={dspActive ? t('dsp.status.active') : t('dsp.status.bypassed')} tone={dspActive ? 'good' : undefined} />
        <DspMetric label={t('dsp.metric.clipping')} value={clippingRisk ? t('dsp.status.riskDetected') : t('dsp.status.clear')} tone={clippingRisk ? 'risk' : 'good'} />
        <DspMetric label={t('dsp.metric.bitPerfect')} value={dspActive ? t('dsp.status.disabledByDsp') : t('dsp.status.candidate')} />
        <DspMetric label={t('dsp.metric.reason')} value={audioStatus?.bitPerfectDisabledReason ?? t('dsp.status.none')} />
      </div>
      <div className="dsp-module-actions">
        <button type="button" onClick={onRefresh}>{t('dsp.action.refresh')}</button>
      </div>
      <p className="dsp-module-note">{t('dsp.panel.safety.note')}</p>
    </section>
  );
};

export const DspPage = (): JSX.Element => {
  const { t } = useDspI18n();
  const { audioStatus, error } = useSharedPlaybackStatus();
  const [selectedModuleId, setSelectedModuleId] = useState<DspModuleId>('eq');
  const [eqState, setEqState] = useState<EqState>(fallbackEqState);
  const [roomCorrection, setRoomCorrection] = useState<RoomCorrectionState>(fallbackRoomCorrection);
  const [channelBalance, setChannelBalance] = useState<ChannelBalanceState>(fallbackChannelBalance);
  const [moduleError, setModuleError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const loadModuleStates = useCallback(async (): Promise<void> => {
    const eq = getEqBridge();
    if (!eq) {
      setModuleError(t('dsp.error.desktopBridge'));
      return;
    }

    try {
      const [nextEqState, nextRoomCorrection, nextChannelBalance] = await Promise.all([
        eq.getState(),
        eq.getRoomCorrectionState?.() ?? Promise.resolve(fallbackRoomCorrection),
        eq.getChannelBalanceState(),
      ]);
      setEqState(nextEqState);
      setRoomCorrection(nextRoomCorrection);
      setChannelBalance(nextChannelBalance);
      setModuleError(null);
    } catch (stateError) {
      setModuleError(stateError instanceof Error ? stateError.message : String(stateError));
    }
  }, [t]);

  useEffect(() => {
    void loadModuleStates();
  }, [loadModuleStates]);

  const runModuleAction = useCallback(async (key: string, action: () => Promise<void>): Promise<void> => {
    setBusyKey(key);
    setModuleError(null);
    try {
      await action();
      await refreshPlaybackStatus();
    } catch (actionError) {
      setModuleError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setBusyKey(null);
    }
  }, []);

  const handleHeadroomChange = useCallback(
    (headroomDb: number): void => {
      const eq = getEqBridge();
      if (!eq?.setDspHeadroom) {
        setModuleError(t('dsp.error.dspBridge'));
        return;
      }

      const safeHeadroomDb = Math.round(clampNumber(headroomDb, dspHeadroomMinDb, dspHeadroomMaxDb) * 10) / 10;
      setEqState((current) => ({ ...current, dspHeadroomDb: safeHeadroomDb }));
      void runModuleAction('headroom', async () => {
        setEqState(await eq.setDspHeadroom(safeHeadroomDb));
      });
    },
    [runModuleAction, t],
  );

  const handleImportRoomCorrection = useCallback((): void => {
    const eq = getEqBridge();
    if (!eq?.importRoomCorrectionIr) {
      setModuleError(t('dsp.error.firBridge'));
      return;
    }

    void runModuleAction('room-import', async () => {
      const imported = await eq.importRoomCorrectionIr();
      if (imported) {
        setRoomCorrection(imported);
      }
    });
  }, [runModuleAction, t]);

  const handleToggleRoomCorrection = useCallback((): void => {
    const eq = getEqBridge();
    if (!eq?.setRoomCorrectionEnabled) {
      setModuleError(t('dsp.error.firBridge'));
      return;
    }

    void runModuleAction('room-toggle', async () => {
      setRoomCorrection(await eq.setRoomCorrectionEnabled(!roomCorrection.enabled));
    });
  }, [roomCorrection.enabled, runModuleAction, t]);

  const handleRoomTrimChange = useCallback(
    (trimDb: number): void => {
      const eq = getEqBridge();
      if (!eq?.setRoomCorrectionTrim) {
        setModuleError(t('dsp.error.firBridge'));
        return;
      }

      const safeTrimDb = Math.round(clampNumber(trimDb, roomCorrectionMinTrimDb, roomCorrectionMaxTrimDb) * 10) / 10;
      setRoomCorrection((current) => ({ ...current, trimDb: safeTrimDb }));
      void runModuleAction('room-trim', async () => {
        setRoomCorrection(await eq.setRoomCorrectionTrim(safeTrimDb));
      });
    },
    [runModuleAction, t],
  );

  const handleClearRoomCorrection = useCallback((): void => {
    const eq = getEqBridge();
    if (!eq?.clearRoomCorrection) {
      setModuleError(t('dsp.error.firBridge'));
      return;
    }

    void runModuleAction('room-clear', async () => {
      setRoomCorrection(await eq.clearRoomCorrection());
    });
  }, [runModuleAction, t]);

  const handleChannelPatch = useCallback(
    (patch: Partial<ChannelBalanceState>): void => {
      const eq = getEqBridge();
      if (!eq?.setChannelBalanceState) {
        setModuleError(t('dsp.error.channelBridge'));
        return;
      }

      setChannelBalance((current) => ({ ...current, ...patch }));
      void runModuleAction('channel', async () => {
        setChannelBalance(await eq.setChannelBalanceState(patch));
      });
    },
    [runModuleAction, t],
  );

  const handleChannelReset = useCallback((): void => {
    const eq = getEqBridge();
    if (!eq?.resetChannelBalance) {
      setModuleError(t('dsp.error.channelBridge'));
      return;
    }

    void runModuleAction('channel-reset', async () => {
      setChannelBalance(await eq.resetChannelBalance());
    });
  }, [runModuleAction, t]);

  const dspActive = audioStatus?.dspActive === true;
  const eqEnabled = audioStatus?.eqEnabled ?? eqState.enabled;
  const channelBalanceEnabled = audioStatus?.channelBalanceEnabled ?? channelBalance.enabled;
  const clippingRisk = audioStatus?.clippingRisk === true || eqState.clippingRisk || roomCorrection.clippingRisk || channelBalance.clippingRisk === true;
  const dspHeadroomDb = eqState.dspHeadroomDb ?? 0;
  const outputName = audioStatus?.outputDeviceName || t('dsp.status.systemOutput');
  const sampleRate = audioStatus?.actualDeviceSampleRate ?? audioStatus?.requestedOutputSampleRate ?? audioStatus?.fileSampleRate ?? null;

  const modules = useMemo<DspModule[]>(
    () => [
      {
        id: 'headroom',
        stageKey: 'dsp.stage.input',
        title: t('dsp.module.headroom.title'),
        subtitle: formatDb(dspHeadroomDb),
        description: t('dsp.module.headroom.description'),
        icon: Gauge,
        enabled: Math.abs(dspHeadroomDb) > 0.05,
        accent: 'blue',
      },
      {
        id: 'eq',
        stageKey: 'dsp.stage.shape',
        title: t('dsp.module.eq.title'),
        subtitle: audioStatus?.eqPresetName || eqState.presetName || t('dsp.status.flat'),
        description: t('dsp.module.eq.description'),
        icon: SlidersHorizontal,
        enabled: eqEnabled,
        accent: 'violet',
      },
      {
        id: 'room',
        stageKey: 'dsp.stage.space',
        title: t('dsp.module.room.title'),
        subtitle: roomCorrection.irName ?? t('dsp.status.noIr'),
        description: t('dsp.module.room.description'),
        icon: Waves,
        enabled: roomCorrection.enabled,
        accent: 'green',
      },
      {
        id: 'channel',
        stageKey: 'dsp.stage.stereo',
        title: t('dsp.module.channel.title'),
        subtitle: channelBalanceEnabled ? t('dsp.status.balanceActive') : t('dsp.status.stereoDirect'),
        description: t('dsp.module.channel.description'),
        icon: Headphones,
        enabled: channelBalanceEnabled,
        accent: 'amber',
      },
      {
        id: 'safety',
        stageKey: 'dsp.stage.output',
        title: t('dsp.module.safety.title'),
        subtitle: clippingRisk ? t('dsp.status.riskDetected') : t('dsp.status.limiterArmed'),
        description: t('dsp.module.safety.description'),
        icon: ShieldCheck,
        enabled: clippingRisk || dspActive,
        accent: clippingRisk ? 'amber' : 'green',
      },
    ],
    [audioStatus?.eqPresetName, channelBalanceEnabled, clippingRisk, dspActive, dspHeadroomDb, eqEnabled, eqState.presetName, roomCorrection.enabled, roomCorrection.irName, t],
  );

  const activeCount = modules.filter((module) => module.enabled).length;
  const selectedModule = modules.find((module) => module.id === selectedModuleId) ?? modules[1];
  const SelectedIcon = selectedModule.icon;
  const pipelineNodes = modules.map((module) => ({
    id: module.id,
    label: t(module.stageKey),
    value: module.enabled ? module.subtitle : t('dsp.status.bypassed'),
    enabled: module.enabled,
    selected: module.id === selectedModuleId,
    risk: module.id === 'safety' && clippingRisk,
  }));
  const panelProps: ModulePanelProps = {
    audioStatus,
    eqState,
    roomCorrection,
    channelBalance,
    busyKey,
    onHeadroomChange: handleHeadroomChange,
    onImportRoomCorrection: handleImportRoomCorrection,
    onToggleRoomCorrection: handleToggleRoomCorrection,
    onRoomTrimChange: handleRoomTrimChange,
    onClearRoomCorrection: handleClearRoomCorrection,
    onChannelPatch: handleChannelPatch,
    onChannelReset: handleChannelReset,
    onRefresh: () => {
      void loadModuleStates();
      void refreshPlaybackStatus();
    },
  };

  return (
    <div className="dsp-page">
      <div className="dsp-stage">
        <aside className="dsp-rail" aria-label={t('dsp.aria.modules')}>
          <div className="dsp-brand">
            <span>DSP</span>
            <strong>ECHO</strong>
            <em>{t('dsp.brand.subtitle')}</em>
          </div>

          <div className="dsp-output-card">
            <RadioTower size={17} aria-hidden="true" />
            <div>
              <span>{t('dsp.label.output')}</span>
              <strong>{outputName}</strong>
              <small>{formatRate(sampleRate, t('dsp.status.auto'))} / {audioStatus?.outputMode ?? t('dsp.status.shared')}</small>
            </div>
          </div>

          <nav className="dsp-chain" aria-label={t('dsp.aria.chain')}>
            {modules.map((module, index) => {
              const Icon = module.icon;
              const isSelected = module.id === selectedModuleId;
              const previousModule = modules[index - 1];
              const showStage = !previousModule || previousModule.stageKey !== module.stageKey;

              return (
                <div className="dsp-chain-group" key={module.id}>
                  {showStage ? <span className="dsp-chain-stage">{t(module.stageKey)}</span> : null}
                  <button
                    type="button"
                    className="dsp-chain-item"
                    data-active={module.enabled}
                    data-selected={isSelected}
                    data-accent={module.accent}
                    onClick={() => setSelectedModuleId(module.id)}
                  >
                    <span className="dsp-chain-handle" aria-hidden="true" />
                    <span className="dsp-chain-icon">
                      <Icon size={17} aria-hidden="true" />
                    </span>
                    <span className="dsp-chain-copy">
                      <strong>{module.title}</strong>
                      <small>{module.description}</small>
                    </span>
                    <span className="dsp-chain-state" aria-hidden="true">
                      {module.enabled ? <CheckCircle2 size={14} /> : null}
                    </span>
                  </button>
                </div>
              );
            })}
          </nav>
        </aside>

        <section className="dsp-workspace" aria-label={t('dsp.aria.workspace')}>
          <header className="dsp-topbar">
            <div className="dsp-topbar-title">
              <span className="dsp-selected-icon">
                <SelectedIcon size={22} aria-hidden="true" />
              </span>
              <div>
                <p>{t('dsp.label.module')}</p>
                <h1>{selectedModule.title}</h1>
                <span className="dsp-topbar-subtitle">{t(selectedModule.stageKey)} / {selectedModule.description}</span>
              </div>
            </div>
            <div className="dsp-topbar-status">
              <span data-active={dspActive}>
                <Activity size={14} aria-hidden="true" />
                {dspActive ? t('dsp.status.modulesActive', { count: activeCount }) : t('dsp.status.nativeDirect')}
              </span>
              <span data-risk={clippingRisk}>
                <AudioWaveform size={14} aria-hidden="true" />
                {clippingRisk ? t('dsp.status.headroomRisk') : t('dsp.status.signalProtected')}
              </span>
            </div>
          </header>

          <div className="dsp-pipeline-map" aria-label={t('dsp.aria.pipeline')}>
            {pipelineNodes.map((node) => (
              <span key={node.id} data-active={node.enabled} data-selected={node.selected} data-risk={node.risk}>
                <em>{node.label}</em>
                <strong>{node.value}</strong>
              </span>
            ))}
          </div>

          <div className="dsp-focus-strip" data-risk={clippingRisk}>
            <span>
              <em>{t('dsp.label.currentModule')}</em>
              <strong>{selectedModule.title}</strong>
            </span>
            <span>
              <em>{t('dsp.label.moduleStatus')}</em>
              <strong>{selectedModule.enabled ? t('dsp.status.active') : t('dsp.status.bypassed')}</strong>
            </span>
            <span>
              <em>{t('dsp.label.bitPerfect')}</em>
              <strong>{dspActive ? t('dsp.status.dspPath') : t('dsp.status.ready')}</strong>
            </span>
            <button type="button" onClick={panelProps.onRefresh}>
              {t('dsp.action.refresh')}
            </button>
          </div>

          {error || moduleError ? <p className="dsp-status-error">{moduleError ?? error}</p> : null}

          <div className="dsp-editor-shell" data-module={selectedModuleId}>
            {selectedModuleId === 'headroom' ? <HeadroomPanel {...panelProps} /> : null}
            {selectedModuleId === 'eq' ? <EqPanel audioStatus={audioStatus} onAudioStatusRefresh={() => void refreshPlaybackStatus()} surface="eq-only" /> : null}
            {selectedModuleId === 'room' ? <RoomCorrectionPanel {...panelProps} /> : null}
            {selectedModuleId === 'channel' ? <ChannelPanel {...panelProps} /> : null}
            {selectedModuleId === 'safety' ? <SafetyPanel {...panelProps} /> : null}
          </div>
        </section>
      </div>
    </div>
  );
};

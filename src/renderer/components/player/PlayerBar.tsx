import {
  ChevronUp,
  Gauge,
  Heart,
  ListMusic,
  Mic2,
  MoreHorizontal,
  Play,
  Repeat2,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Volume2,
} from 'lucide-react';

export const PlayerBar = (): JSX.Element => {
  return (
    <footer className="player-bar" aria-label="播放控制">
      <div className="player-now">
        <div className="player-cover" aria-hidden="true">
          <div className="cover-sheen" />
        </div>
        <div className="player-track-copy">
          <strong>vous</strong>
          <span>SennaRin feat. suis from ヨルシカ</span>
          <div className="tag-row player-tags" aria-label="音频规格">
            <span className="hifi-tag tag-bpm">BPM 152</span>
            <span className="hifi-tag tag-flac">FLAC</span>
            <span className="hifi-tag tag-lossless">Lossless</span>
            <span className="hifi-tag tag-depth">24bit / 48kHz</span>
          </div>
        </div>
      </div>

      <div className="player-center">
        <div className="transport">
          <button className="icon-button" type="button" aria-label="队列" title="队列">
            <ListMusic size={17} />
          </button>
          <button className="icon-button" type="button" aria-label="随机播放" title="随机播放">
            <Shuffle size={17} />
          </button>
          <button className="icon-button" type="button" aria-label="上一首" title="上一首">
            <SkipBack size={18} />
          </button>
          <button className="play-button" type="button" aria-label="播放" title="播放">
            <Play size={24} fill="currentColor" />
          </button>
          <button className="icon-button" type="button" aria-label="下一首" title="下一首">
            <SkipForward size={18} />
          </button>
          <button className="icon-button is-soft-active" type="button" aria-label="循环播放" title="循环播放">
            <Repeat2 size={17} />
          </button>
          <button className="icon-button" type="button" aria-label="歌词" title="歌词">
            <Mic2 size={17} />
          </button>
          <button className="icon-button" type="button" aria-label="喜欢" title="喜欢">
            <Heart size={17} />
          </button>
        </div>

        <div className="progress-row" aria-label="播放进度">
          <span>0:00</span>
          <div className="progress-track">
            <div className="progress-fill" />
            <div className="progress-thumb" />
          </div>
          <span>2:51</span>
        </div>
      </div>

      <div className="output-status">
        <button className="icon-button" type="button" aria-label="音量" title="音量">
          <Volume2 size={18} />
        </button>
        <button className="icon-button" type="button" aria-label="输出设备" title="输出设备">
          <Gauge size={17} />
        </button>
        <button className="icon-button" type="button" aria-label="音频控制" title="音频控制">
          <SlidersHorizontal size={17} />
        </button>
        <button className="icon-button" type="button" aria-label="更多" title="更多">
          <MoreHorizontal size={18} />
        </button>
        <button className="icon-button" type="button" aria-label="展开播放器" title="展开播放器">
          <ChevronUp size={18} />
        </button>
      </div>
    </footer>
  );
};

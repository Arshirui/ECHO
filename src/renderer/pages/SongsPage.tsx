import {
  ChevronDown,
  Download,
  FolderPlus,
  RefreshCw,
  RotateCw,
  Search,
  Trash2,
} from 'lucide-react';
import { TrackList } from '../components/library/TrackList';
import type { TrackListItem } from '../components/library/TrackRow';

const demoTracks: TrackListItem[] = [
  {
    id: 'heroic-advent',
    title: '-HEROIC ADVENT-14',
    artist: 'Roselia',
    album: 'Anfang',
    duration: '3:39',
    cover: { from: '#332018', to: '#e1a348' },
    tags: [
      { label: 'FLAC', kind: 'flac' },
      { label: 'Hi-Res', kind: 'hires' },
      { label: '24bit / 96kHz', kind: 'depth' },
    ],
  },
  {
    id: 'vampire-live',
    title: 'ヴァンパイア (Live)',
    artist: '東京フィルハーモニー交響楽団',
    album: '初音ミクシンフォニー Miku Symphony 2022 オーケストラライブ',
    duration: '3:03',
    cover: { from: '#d8c9a6', to: '#587ba4' },
    tags: [
      { label: 'FLAC', kind: 'flac' },
      { label: 'Lossless', kind: 'lossless' },
    ],
  },
  {
    id: 'utsukushiki',
    title: '美しきもの',
    artist: 'Sound Horizon',
    album: 'Roman (Re:Master Production)',
    duration: '6:33',
    cover: { from: '#74c4d0', to: '#e5d17a' },
    tags: [
      { label: 'FLAC', kind: 'flac' },
      { label: 'Lossless', kind: 'lossless' },
      { label: '24bit / 48kHz', kind: 'depth' },
    ],
  },
  {
    id: 'hoshiakari',
    title: '星灯',
    artist: 'Suara',
    album: 'うたわれるもの 偽りの仮面 二人の白皇 歌集 (DSD 2.8MHz/1bit)',
    duration: '4:14',
    cover: { from: '#1d3e73', to: '#f15f7f' },
    tags: [
      { label: 'DSF', kind: 'dsf' },
      { label: 'Lossless', kind: 'lossless' },
    ],
  },
  {
    id: 'aizai',
    title: '愛在西元前',
    artist: '周杰伦',
    album: '范特西',
    duration: '3:54',
    cover: { from: '#22242d', to: '#b3b6c5' },
    tags: [
      { label: 'FLAC', kind: 'flac' },
      { label: 'Lossless', kind: 'lossless' },
    ],
  },
  {
    id: 'get-over',
    title: 'Get Over the World',
    artist: 'ヴェリタスイチヒロ(CV:山村響)、コタマ(CV:高川みな)',
    album: 'ブルーアーカイブ 青春あんさんぶる Vol.2「ヴェリタス」',
    duration: '3:12',
    cover: { from: '#71a5df', to: '#8b6ad9' },
    tags: [
      { label: 'FLAC', kind: 'flac' },
      { label: 'Lossless', kind: 'lossless' },
      { label: '24bit / 48kHz', kind: 'depth' },
    ],
  },
  {
    id: 'killkiss',
    title: 'KiLLKiSS',
    artist: 'Ave Mujica',
    album: 'KiLLKiSS',
    duration: '3:28',
    cover: { from: '#20143d', to: '#d54d9c' },
    tags: [
      { label: 'FLAC', kind: 'flac' },
      { label: 'Lossless', kind: 'lossless' },
    ],
  },
  {
    id: 'baba',
    title: '爸我回来了',
    artist: '周杰伦',
    album: '范特西',
    duration: '3:55',
    tags: [
      { label: 'FLAC', kind: 'flac' },
      { label: 'Lossless', kind: 'lossless' },
      { label: '16bit / 44.1kHz', kind: 'depth' },
      { label: 'BPM 152', kind: 'bpm' },
    ],
  },
  {
    id: 'simple-love',
    title: '简单爱',
    artist: '周杰伦',
    album: '范特西',
    duration: '4:30',
    tags: [
      { label: 'FLAC', kind: 'flac' },
      { label: 'Lossless', kind: 'lossless' },
      { label: '16bit / 44.1kHz', kind: 'depth' },
      { label: 'BPM 97', kind: 'bpm' },
    ],
  },
  {
    id: 'merry-christmas',
    title: 'Merry Christmas Mr. Lawrence',
    artist: '坂本龍一',
    album: "The Best of 'Playing the Orchestra 2014' 2nd",
    duration: '5:43',
    cover: { from: '#161616', to: '#e9e6de' },
    tags: [
      { label: 'DSF', kind: 'dsf' },
      { label: 'Lossless', kind: 'lossless' },
    ],
  },
  {
    id: 'vous',
    title: 'vous',
    artist: 'SennaRin feat. suis from ヨルシカ',
    album: 'Music',
    duration: '2:51',
    cover: { from: '#24446a', to: '#f26d4f' },
    tags: [
      { label: 'FLAC', kind: 'flac' },
      { label: 'Lossless', kind: 'lossless' },
      { label: '24bit / 48kHz', kind: 'depth' },
      { label: '1669kbps', kind: 'bitrate' },
      { label: 'BPM 152', kind: 'bpm' },
    ],
  },
  {
    id: 'ten-yowai',
    title: '天ノ弱',
    artist: '164 feat. GUMI',
    album: 'EXIT TUNES PRESENTS GUMish',
    duration: '3:11',
    cover: { from: '#a7d7c9', to: '#5b8a72' },
    tags: [
      { label: 'FLAC', kind: 'flac' },
      { label: 'Lossless', kind: 'lossless' },
    ],
  },
];

const currentTrackId = 'vous';

export const SongsPage = (): JSX.Element => {
  return (
    <div className="songs-page">
      <header className="songs-header">
        <div className="songs-title-group">
          <h1>歌曲</h1>
          <span>3543 首</span>
        </div>

        <div className="songs-tools" aria-label="歌曲工具">
          <button className="tool-button" type="button" aria-label="导入文件夹" title="导入文件夹">
            <FolderPlus size={17} />
          </button>
          <button className="tool-button" type="button" aria-label="扫描" title="扫描">
            <RotateCw size={17} />
          </button>
          <button className="tool-button" type="button" aria-label="下载" title="下载">
            <Download size={17} />
          </button>
          <button className="tool-button" type="button" aria-label="刷新" title="刷新">
            <RefreshCw size={17} />
          </button>
          <button className="tool-button danger" type="button" aria-label="删除" title="删除">
            <Trash2 size={17} />
          </button>
        </div>
      </header>

      <div className="songs-control-row">
        <label className="search-box">
          <Search size={18} aria-hidden="true" />
          <input type="search" placeholder="搜索曲目 / 艺人 / 专辑" />
        </label>

        <button className="sort-button" type="button">
          <span>默认排序</span>
          <ChevronDown size={15} />
        </button>
      </div>

      <TrackList tracks={demoTracks} currentTrackId={currentTrackId} />
    </div>
  );
};

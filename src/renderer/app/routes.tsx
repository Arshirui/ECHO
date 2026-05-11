import {
  Captions,
  Cloud,
  Disc3,
  FilePlus2,
  Folder,
  FolderPlus,
  Headphones,
  Heart,
  History,
  Library,
  ListMusic,
  Mic2,
  Music2,
  Radio,
  Settings,
  SlidersHorizontal,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AlbumsPage } from '../pages/AlbumsPage';
import { ArtistsPage } from '../pages/ArtistsPage';
import { PlaylistsPage } from '../pages/PlaylistsPage';
import { SettingsPage } from '../pages/SettingsPage';
import { SongsPage } from '../pages/SongsPage';
import { EmptyState } from '../components/ui/EmptyState';

export type AppRouteId =
  | 'songs'
  | 'albums'
  | 'artists'
  | 'folders'
  | 'remote'
  | 'streaming'
  | 'queue'
  | 'history'
  | 'playlists'
  | 'liked'
  | 'audio-settings'
  | 'lyrics-settings'
  | 'import-folder'
  | 'import-file'
  | 'settings';

export type AppRoute = {
  id: AppRouteId;
  label: string;
  description: string;
  icon: LucideIcon;
  placement: 'main' | 'utility';
  element: JSX.Element;
};

const PlaceholderPage = ({
  icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}): JSX.Element => (
  <div className="page-stack">
    <EmptyState icon={icon} title={title} description={description} meta="这个视图会沿用同一套浅色 ECHO 框架。" />
  </div>
);

export const appRoutes: AppRoute[] = [
  {
    id: 'songs',
    label: '歌曲',
    description: '本地 HiFi 曲库列表。',
    icon: Music2,
    placement: 'main',
    element: <SongsPage />,
  },
  {
    id: 'albums',
    label: '专辑',
    description: '按专辑整理的曲库。',
    icon: Disc3,
    placement: 'main',
    element: <AlbumsPage />,
  },
  {
    id: 'artists',
    label: '艺人',
    description: '按艺人浏览音乐。',
    icon: Mic2,
    placement: 'main',
    element: <ArtistsPage />,
  },
  {
    id: 'folders',
    label: '文件夹',
    description: '本地导入路径。',
    icon: Folder,
    placement: 'main',
    element: <PlaceholderPage icon={Folder} title="文件夹" description="导入目录和扫描状态会在这里集中管理。" />,
  },
  {
    id: 'remote',
    label: '网盘 / 远程',
    description: '远程音乐来源。',
    icon: Cloud,
    placement: 'main',
    element: <PlaceholderPage icon={Cloud} title="网盘 / 远程" description="远程挂载、网盘和同步来源会放在这个入口。" />,
  },
  {
    id: 'streaming',
    label: '流媒体',
    description: '流媒体连接。',
    icon: Radio,
    placement: 'main',
    element: <PlaceholderPage icon={Radio} title="流媒体" description="流媒体服务连接会复用当前播放器与队列模型。" />,
  },
  {
    id: 'queue',
    label: '队列',
    description: '当前播放队列。',
    icon: ListMusic,
    placement: 'main',
    element: <PlaceholderPage icon={ListMusic} title="队列" description="播放队列会独立于歌曲页面更新，避免列表跟随播放进度重渲染。" />,
  },
  {
    id: 'history',
    label: '历史',
    description: '播放历史。',
    icon: History,
    placement: 'main',
    element: <PlaceholderPage icon={History} title="历史" description="播放记录、最近加入和最近播放会在这里汇总。" />,
  },
  {
    id: 'playlists',
    label: '歌单',
    description: '用户歌单。',
    icon: Library,
    placement: 'main',
    element: <PlaylistsPage />,
  },
  {
    id: 'liked',
    label: '喜欢的曲目',
    description: '收藏曲目。',
    icon: Heart,
    placement: 'utility',
    element: <PlaceholderPage icon={Heart} title="喜欢的曲目" description="收藏曲目会保持紧凑列表视图，便于快速回到常听音乐。" />,
  },
  {
    id: 'audio-settings',
    label: '音频设置',
    description: '输出和解码设置。',
    icon: Headphones,
    placement: 'utility',
    element: <PlaceholderPage icon={Headphones} title="音频设置" description="输出设备、独占模式、采样率策略会集中放在这里。" />,
  },
  {
    id: 'lyrics-settings',
    label: '歌词设置',
    description: '歌词偏好。',
    icon: Captions,
    placement: 'utility',
    element: <PlaceholderPage icon={Captions} title="歌词设置" description="歌词源、时间轴和显示偏好会放在这个视图。" />,
  },
  {
    id: 'import-folder',
    label: '导入文件夹',
    description: '导入本地目录。',
    icon: FolderPlus,
    placement: 'utility',
    element: <PlaceholderPage icon={FolderPlus} title="导入文件夹" description="选择音乐目录后会触发扫描任务并写入曲库索引。" />,
  },
  {
    id: 'import-file',
    label: '导入文件',
    description: '导入单个音频文件。',
    icon: FilePlus2,
    placement: 'utility',
    element: <PlaceholderPage icon={FilePlus2} title="导入文件" description="单文件导入会复用同一套元数据解析和封面缓存。" />,
  },
  {
    id: 'settings',
    label: '设置',
    description: '应用设置。',
    icon: Settings,
    placement: 'utility',
    element: <SettingsPage />,
  },
];

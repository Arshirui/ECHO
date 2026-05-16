import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Download, FileImage, Heart, ListEnd, Play, Tag, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { LibraryAlbum } from '../../../shared/types/library';

export type AlbumMenuAction =
  | 'play-album'
  | 'add-to-queue'
  | 'toggle-liked'
  | 'edit-tags'
  | 'copy-info'
  | 'copy-cover'
  | 'save-cover'
  | 'delete-album';

type AlbumContextMenuProps = {
  album: LibraryAlbum;
  position: { x: number; y: number };
  liked?: boolean;
  onAction: (action: AlbumMenuAction, album: LibraryAlbum) => void;
  onClose: () => void;
};

type MenuItem = {
  action: AlbumMenuAction;
  label: string;
  icon: LucideIcon;
  danger?: boolean;
};

const viewportPadding = 8;
const pointerOffset = 6;
const remoteHiddenActions = new Set<AlbumMenuAction>(['edit-tags', 'delete-album']);

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(value, max));

export const AlbumContextMenu = ({ album, position, liked = false, onAction, onClose }: AlbumContextMenuProps): JSX.Element => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPosition, setMenuPosition] = useState(() => ({
    x: position.x + pointerOffset,
    y: position.y + pointerOffset,
  }));

  useLayoutEffect(() => {
    const menu = menuRef.current;

    if (!menu) {
      return;
    }

    const rect = menu.getBoundingClientRect();
    setMenuPosition({
      x: clamp(position.x + pointerOffset, viewportPadding, window.innerWidth - rect.width - viewportPadding),
      y: clamp(position.y + pointerOffset, viewportPadding, window.innerHeight - rect.height - viewportPadding),
    });
  }, [position.x, position.y]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onClose, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);

  const allItems: MenuItem[] = [
    { action: 'play-album', label: '播放专辑', icon: Play },
    { action: 'add-to-queue', label: '加入队列', icon: ListEnd },
    { action: 'toggle-liked', label: liked ? '取消喜欢专辑' : '喜欢专辑', icon: Heart },
    { action: 'edit-tags', label: '编辑标签', icon: Tag },
    { action: 'copy-info', label: '复制专辑信息', icon: Copy },
    { action: 'copy-cover', label: '复制专辑封面', icon: FileImage },
    { action: 'save-cover', label: '保存专辑封面', icon: Download },
    { action: 'delete-album', label: '删除专辑', icon: Trash2, danger: true },
  ];
  const items = allItems.filter((item) => album.mediaType !== 'remote' || !remoteHiddenActions.has(item.action));

  return createPortal(
    <div className="album-menu-layer" role="presentation" onMouseDown={onClose}>
      <div
        ref={menuRef}
        className="album-context-menu"
        role="menu"
        style={{ left: menuPosition.x, top: menuPosition.y }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              className="album-menu-item"
              data-danger={item.danger ? 'true' : undefined}
              key={item.action}
              role="menuitem"
              type="button"
              onClick={() => onAction(item.action, album)}
            >
              <Icon size={16} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  );
};

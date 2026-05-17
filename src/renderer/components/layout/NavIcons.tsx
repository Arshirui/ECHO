import { forwardRef, type ReactNode } from 'react';
import type { LucideIcon, LucideProps } from 'lucide-react';

const getStrokeWidth = (strokeWidth: LucideProps['strokeWidth'], size: LucideProps['size'], absoluteStrokeWidth?: boolean) => {
  if (!absoluteStrokeWidth || typeof size !== 'number') {
    return strokeWidth;
  }

  return (Number(strokeWidth) * 24) / size;
};

const createNavIcon = (displayName: string, paths: ReactNode): LucideIcon => {
  const Icon = forwardRef<SVGSVGElement, LucideProps>(
    ({ absoluteStrokeWidth, children, color = 'currentColor', size = 24, strokeWidth = 1.75, ...props }, ref) => (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={getStrokeWidth(strokeWidth, size, absoluteStrokeWidth)}
        {...props}
      >
        {paths}
        {children}
      </svg>
    ),
  );

  Icon.displayName = displayName;
  return Icon as LucideIcon;
};

export const EchoSongsIcon = createNavIcon(
  'EchoSongsIcon',
  <>
    <path d="M9.1 16.8c0 1.1-1 1.9-2.2 1.9s-2.2-.8-2.2-1.9 1-1.9 2.2-1.9 2.2.8 2.2 1.9Z" />
    <path d="M18.2 14.9c0 1.1-1 1.9-2.2 1.9s-2.2-.8-2.2-1.9 1-1.9 2.2-1.9 2.2.8 2.2 1.9Z" />
    <path d="M9.1 16.8V5.3h9.1v9.6" />
    <path d="M9.1 8.9h9.1" />
  </>,
);

export const EchoDownloadsIcon = createNavIcon(
  'EchoDownloadsIcon',
  <>
    <path d="M12 4.8v8.2" />
    <path d="M8.8 10.1 12 13.3l3.2-3.2" />
    <path d="M6.5 16.1v1.4c0 1.1.9 2 2 2h7c1.1 0 2-.9 2-2v-1.4" />
    <path d="M8.4 16.1h7.2" />
  </>,
);

export const EchoAlbumsIcon = createNavIcon(
  'EchoAlbumsIcon',
  <>
    <rect x="5" y="5" width="14" height="14" rx="3" />
    <circle cx="12" cy="12" r="3.3" />
    <circle cx="12" cy="12" r="0.55" fill="currentColor" stroke="none" />
    <path d="M15.4 8.1h0.1" />
  </>,
);

export const EchoArtistsIcon = createNavIcon(
  'EchoArtistsIcon',
  <>
    <path d="M12 4.6a3 3 0 0 1 3 3v3.1a3 3 0 0 1-6 0V7.6a3 3 0 0 1 3-3Z" />
    <path d="M6.8 10.7a5.2 5.2 0 0 0 10.4 0" />
    <path d="M12 16v3.5" />
    <path d="M9.2 19.5h5.6" />
  </>,
);

export const EchoFoldersIcon = createNavIcon(
  'EchoFoldersIcon',
  <>
    <path d="M4.6 8.1c0-1.2.9-2.1 2.1-2.1h3l1.8 2h5.8c1.2 0 2.1.9 2.1 2.1v6.2c0 1.2-.9 2.1-2.1 2.1H6.7c-1.2 0-2.1-.9-2.1-2.1V8.1Z" />
    <path d="M10 14.7c-.4.6-1.4.7-2 .4-.7-.4-.7-1.2 0-1.6.6-.4 1.6-.3 2 .2" />
    <path d="M10 9.9v4.3" />
    <path d="M10 9.9l3.2.7" />
  </>,
);

export const EchoRemoteIcon = createNavIcon(
  'EchoRemoteIcon',
  <>
    <path d="M7.6 15.1h8.7a3.3 3.3 0 0 0 .4-6.6 5 5 0 0 0-9.3-1.3 3.9 3.9 0 0 0 .2 7.9Z" />
    <path d="M8.4 17.1 12 19.1l3.6-2" />
    <circle cx="8.4" cy="17.1" r="0.7" fill="currentColor" stroke="none" />
    <circle cx="12" cy="19.1" r="0.7" fill="currentColor" stroke="none" />
    <circle cx="15.6" cy="17.1" r="0.7" fill="currentColor" stroke="none" />
  </>,
);

export const EchoConnectIcon = createNavIcon(
  'EchoConnectIcon',
  <>
    <path d="M6.1 17.9a8.2 8.2 0 0 1 11.8 0" />
    <path d="M8.8 15.2a4.5 4.5 0 0 1 6.4 0" />
    <path d="M11 12.9a1.5 1.5 0 0 1 2 0" />
    <rect x="4.8" y="4.9" width="14.4" height="7.6" rx="2.2" />
    <path d="M8.3 8.7h7.4" />
  </>,
);

export const EchoStreamingIcon = createNavIcon(
  'EchoStreamingIcon',
  <>
    <circle cx="12" cy="13" r="1.35" />
    <path d="M9.1 15.8a4.1 4.1 0 0 1 0-5.6" />
    <path d="M14.9 10.2a4.1 4.1 0 0 1 0 5.6" />
    <path d="M6.8 18a7.3 7.3 0 0 1 0-10" />
    <path d="M17.2 8a7.3 7.3 0 0 1 0 10" />
  </>,
);

export const EchoQueueIcon = createNavIcon(
  'EchoQueueIcon',
  <>
    <path d="M6 8.1 8.6 6.5v3.2L6 8.1Z" />
    <path d="M11 8.1h7" />
    <path d="M6 13h12" />
    <path d="M6 17.9h8.6" />
  </>,
);

export const EchoHistoryIcon = createNavIcon(
  'EchoHistoryIcon',
  <>
    <path d="M7.7 7.2A7 7 0 1 1 5 12.7" />
    <path d="M5 7.2h2.7V4.6" />
    <path d="M12 8.3v4.1l2.8 1.7" />
  </>,
);

export const EchoPlaylistsIcon = createNavIcon(
  'EchoPlaylistsIcon',
  <>
    <path d="M7.3 5.2h8.3c1.1 0 2 .9 2 2v9.6c0 1.1-.9 2-2 2H7.3c-.5 0-.9-.4-.9-.9V6.1c0-.5.4-.9.9-.9Z" />
    <path d="M9.4 9h5.9" />
    <path d="M9.4 12.2h5.9" />
    <path d="M9.4 15.4h3.5" />
    <path d="M6.4 7.3h-1" />
    <path d="M6.4 12h-1" />
    <path d="M6.4 16.7h-1" />
  </>,
);

export const EchoLikedIcon = createNavIcon(
  'EchoLikedIcon',
  <>
    <path d="M12 18.9s-6.7-4-6.7-8.7A3.7 3.7 0 0 1 12 8a3.7 3.7 0 0 1 6.7 2.2c0 4.7-6.7 8.7-6.7 8.7Z" />
  </>,
);

export const EchoAudioSettingsIcon = createNavIcon(
  'EchoAudioSettingsIcon',
  <>
    <path d="M5.3 13.5v-1.4a6.7 6.7 0 0 1 13.4 0v1.4" />
    <path d="M7.4 13.1h1.2c.6 0 1 .4 1 1v2.5c0 .6-.4 1-1 1H7.4c-.6 0-1-.4-1-1v-2.5c0-.6.4-1 1-1Z" />
    <path d="M16.6 13.1h1.2c.6 0 1 .4 1 1v2.5c0 .6-.4 1-1 1h-1.2c-.6 0-1-.4-1-1v-2.5c0-.6.4-1 1-1Z" />
    <circle cx="12" cy="17" r="1.45" />
  </>,
);

export const EchoLyricsSettingsIcon = createNavIcon(
  'EchoLyricsSettingsIcon',
  <>
    <rect x="4.8" y="6" width="14.4" height="11.8" rx="2.4" />
    <path d="M8.1 10.1h7.8" />
    <path d="M8.1 13.8h4.1" />
    <circle cx="16" cy="13.8" r="1.25" />
  </>,
);

export const EchoImportFolderIcon = createNavIcon(
  'EchoImportFolderIcon',
  <>
    <path d="M4.6 8.1c0-1.2.9-2.1 2.1-2.1h3l1.8 2h5.8c1.2 0 2.1.9 2.1 2.1v6.2c0 1.2-.9 2.1-2.1 2.1H6.7c-1.2 0-2.1-.9-2.1-2.1V8.1Z" />
    <path d="M12 11.3v4.6" />
    <path d="M9.7 13.6h4.6" />
  </>,
);

export const EchoImportFileIcon = createNavIcon(
  'EchoImportFileIcon',
  <>
    <path d="M7.2 4.9h6.1l3.5 3.6v10.6H7.2V4.9Z" />
    <path d="M13.2 4.9v3.7h3.6" />
    <path d="M12 11.6v4.8" />
    <path d="M9.6 14h4.8" />
  </>,
);

export const EchoSettingsIcon = createNavIcon(
  'EchoSettingsIcon',
  <>
    <path d="M5.2 7.4h5" />
    <circle cx="13" cy="7.4" r="1.6" />
    <path d="M14.6 7.4h4.2" />
    <path d="M5.2 12h8.2" />
    <circle cx="16.2" cy="12" r="1.6" />
    <path d="M17.8 12h1" />
    <path d="M5.2 16.6h2.6" />
    <circle cx="10.6" cy="16.6" r="1.6" />
    <path d="M12.2 16.6h6.6" />
  </>,
);

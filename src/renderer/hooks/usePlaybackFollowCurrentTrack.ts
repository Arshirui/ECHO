import { useEffect, useState } from 'react';
import type { AppSettings } from '../../shared/types/appSettings';

export const usePlaybackFollowCurrentTrack = (): boolean => {
  const [followCurrentTrack, setFollowCurrentTrack] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const refresh = (): void => {
      void window.echo?.app
        ?.getSettings?.()
        .then((settings) => {
          if (isMounted) {
            setFollowCurrentTrack(settings.playbackFollowCurrentTrack === true);
          }
        })
        .catch(() => undefined);
    };

    const handleSettingsChanged = (event: Event): void => {
      const patch = (event as CustomEvent<Partial<AppSettings>>).detail;

      if (patch && typeof patch === 'object' && 'playbackFollowCurrentTrack' in patch) {
        setFollowCurrentTrack(patch.playbackFollowCurrentTrack === true);
        return;
      }

      refresh();
    };

    refresh();
    window.addEventListener('settings:changed', handleSettingsChanged);

    return () => {
      isMounted = false;
      window.removeEventListener('settings:changed', handleSettingsChanged);
    };
  }, []);

  return followCurrentTrack;
};

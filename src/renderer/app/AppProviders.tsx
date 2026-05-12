import type { PropsWithChildren } from 'react';
import { I18nProvider } from '../i18n/I18nProvider';
import { PlaybackQueueProvider } from '../stores/PlaybackQueueProvider';

export const AppProviders = ({ children }: PropsWithChildren): JSX.Element => {
  return (
    <I18nProvider>
      <PlaybackQueueProvider>{children}</PlaybackQueueProvider>
    </I18nProvider>
  );
};

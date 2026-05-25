import { useEffect, useState } from 'react';
import { Cloud } from 'lucide-react';
import type { RemoteSource } from '../../../shared/types/remoteSources';
import { useI18n } from '../../i18n/I18nProvider';
import { getRemoteSourcesBridge } from '../../utils/echoBridge';

type RemoteSourceFilterProps = {
  value: string | null;
  onChange: (sourceId: string | null) => void;
};

export const RemoteSourceFilter = ({ value, onChange }: RemoteSourceFilterProps): JSX.Element | null => {
  const { t } = useI18n();
  const [sources, setSources] = useState<RemoteSource[]>([]);

  useEffect(() => {
    const remoteApi = getRemoteSourcesBridge();
    if (!remoteApi?.list) {
      return undefined;
    }

    let cancelled = false;
    void remoteApi.list()
      .then((items) => {
        if (!cancelled) {
          setSources(items.filter((source) => source.status !== 'disabled'));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSources([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (sources.length === 0) {
    return null;
  }

  return (
    <label className="remote-source-filter">
      <Cloud size={15} aria-hidden="true" />
      <select value={value ?? ''} onChange={(event) => onChange(event.target.value || null)}>
        <option value="">{t('library.source.allRemote')}</option>
        {sources.map((source) => (
          <option key={source.id} value={source.id}>
            {source.displayName}
          </option>
        ))}
      </select>
    </label>
  );
};

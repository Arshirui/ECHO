import { ChevronDown, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { EqPreset } from '../../../shared/types/eq';
import { useI18n } from '../../i18n/I18nProvider';
import { describePreset, type PresetCategory } from './eqPanelUtils';

type EqPresetSelectorProps = {
  presets: EqPreset[];
  value: string;
  onChange: (presetId: string) => void;
};

export const EqPresetSelector = ({ presets, value, onChange }: EqPresetSelectorProps): JSX.Element => {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<PresetCategory | 'all' | 'built-in'>('all');
  const normalizedQuery = query.trim().toLowerCase();
  const visiblePresets = useMemo(
    () =>
      presets.filter((preset) => {
        const metadata = describePreset(preset.id);
        const matchesQuery = !normalizedQuery || preset.name.toLowerCase().includes(normalizedQuery) || preset.id.includes(normalizedQuery);
        const matchesFilter =
          filter === 'all' ||
          (filter === 'built-in' && preset.readonly) ||
          (filter === 'user' && !preset.readonly) ||
          metadata?.category === filter;
        return matchesQuery && matchesFilter;
      }),
    [filter, normalizedQuery, presets],
  );
  const selectedPreset = presets.find((preset) => preset.id === value);
  const safeVisiblePresets = selectedPreset && !visiblePresets.some((preset) => preset.id === selectedPreset.id)
    ? [selectedPreset, ...visiblePresets]
    : visiblePresets;
  const builtInPresets = safeVisiblePresets.filter((preset) => preset.readonly);
  const userPresets = safeVisiblePresets.filter((preset) => !preset.readonly);

  return (
    <div className="eq-preset-browser">
      <label className="eq-preset-search">
        <Search size={14} aria-hidden="true" />
        <input
          aria-label={t('settings.eq.preset.searchAria')}
          value={query}
          placeholder={t('settings.eq.preset.searchPlaceholder')}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </label>
      <label className="eq-preset-selector eq-preset-filter">
        <select aria-label={t('settings.eq.preset.filterAria')} value={filter} onChange={(event) => setFilter(event.currentTarget.value as PresetCategory | 'all' | 'built-in')}>
          <option value="all">{t('settings.eq.preset.filter.all')}</option>
          <option value="built-in">{t('settings.eq.preset.filter.builtIn')}</option>
          <option value="user">{t('settings.eq.preset.filter.user')}</option>
          <option value="target">{t('settings.eq.preset.filter.target')}</option>
          <option value="genre">{t('settings.eq.preset.filter.genre')}</option>
          <option value="utility">{t('settings.eq.preset.filter.utility')}</option>
        </select>
        <ChevronDown size={16} aria-hidden="true" />
      </label>
      <label className="eq-preset-selector">
        <select aria-label={t('settings.eq.preset.selectorAria')} value={value} onChange={(event) => onChange(event.currentTarget.value)}>
          {builtInPresets.length > 0 ? (
            <optgroup label={t('settings.eq.preset.builtIn')}>
              {builtInPresets.map((preset) => (
                <option value={preset.id} key={preset.id}>
                  {preset.name}
                </option>
              ))}
            </optgroup>
          ) : null}
          {userPresets.length > 0 ? (
            <optgroup label={t('settings.eq.preset.user')}>
              {userPresets.map((preset) => (
                <option value={preset.id} key={preset.id}>
                  {preset.name}
                </option>
              ))}
            </optgroup>
          ) : null}
          {value === 'custom' ? <option value="custom">{t('settings.eq.preset.modified')}</option> : null}
        </select>
        <ChevronDown size={16} aria-hidden="true" />
      </label>
    </div>
  );
};

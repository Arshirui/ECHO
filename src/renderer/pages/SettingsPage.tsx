import { Settings } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';

export const SettingsPage = (): JSX.Element => {
  return (
    <div className="settings-preview page-stack">
      <div className="settings-row">
        <span>Theme</span>
        <strong>Dark</strong>
      </div>
      <div className="settings-row">
        <span>Output mode</span>
        <strong>Shared</strong>
      </div>
      <div className="settings-row">
        <span>Library scan</span>
        <strong>Manual</strong>
      </div>
      <EmptyState
        icon={Settings}
        title="Settings will become a typed API surface."
        description="Library folders, audio devices, and interface preferences should flow through grouped preload APIs."
        meta="Renderer controls settings; it does not own system integration."
      />
    </div>
  );
};

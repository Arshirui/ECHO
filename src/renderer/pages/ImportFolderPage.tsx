import { FolderPlus } from 'lucide-react';
import { LibraryFoldersPanel } from '../components/library/LibraryFoldersPanel';

export const ImportFolderPage = (): JSX.Element => {
  return (
    <div className="page-stack">
      <div className="empty-state import-folder-hero">
        <div className="empty-icon">
          <FolderPlus size={26} />
        </div>
        <div>
          <h2>Import Folder</h2>
          <p>Choose a local music folder, add it to the library, and start scanning right away.</p>
          <span>This page is only for local library import and scan status.</span>
        </div>
      </div>

      <LibraryFoldersPanel autoFocus />
    </div>
  );
};

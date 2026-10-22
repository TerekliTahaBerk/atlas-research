'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Archive,
  ArrowUpRight,
  Blocks,
  CopyPlus,
  Ellipsis,
  FileDown,
  FolderInput,
  History,
  Pencil,
  Share2,
  Trash2,
  Type,
  Users,
} from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import {
  Menu,
  MenuContent,
  MenuFooter,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '@/components/atlas/overlay';
import { useToast } from '@/components/atlas/toast';
import { VersionHistoryDialog } from './version-history-dialog';
function usePreviewAction() {
  const flash = useToast();
  return (what: string) => () =>
    flash(`${what} is a preview — nothing was changed`);
}
/** Card / row context menu (handoff `ContextMenu`, 220px). */
export function ResourceMenu({
  title,
  href,
  className,
}: {
  title: string;
  href: string;
  className?: string;
}) {
  const router = useRouter();
  const preview = usePreviewAction();
  const [history, setHistory] = useState(false);
  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <button
            type="button"
            aria-label={`More actions for ${title}`}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'grid h-[22px] w-6 place-items-center rounded-sm text-tx2 hover:bg-hov hover:text-tx',
              className,
            )}
          >
            <Ellipsis aria-hidden="true" className="size-[15px]" />
          </button>
        </MenuTrigger>
        <MenuContent
          width={220}
          align="end"
          onClick={(e) => e.stopPropagation()}
        >
          <MenuItem icon={<ArrowUpRight />} onSelect={() => router.push(href)}>
            Open
          </MenuItem>
          <MenuItem icon={<Pencil />} onSelect={preview('Rename')}>
            Rename
          </MenuItem>
          <MenuItem icon={<CopyPlus />} onSelect={preview('Duplicate')}>
            Duplicate
          </MenuItem>
          <MenuItem icon={<FolderInput />} onSelect={preview('Move')}>
            Move to…
          </MenuItem>
          <MenuItem
            icon={<Share2 />}
            onSelect={() => router.push(href)}
            sub="Opens the item to share it"
          >
            Share
          </MenuItem>
          <MenuItem icon={<History />} onSelect={() => setHistory(true)}>
            Version history
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Archive />} onSelect={preview('Archive')}>
            Archive
          </MenuItem>
          <MenuItem icon={<Trash2 />} destructive onSelect={preview('Delete')}>
            Delete
          </MenuItem>
        </MenuContent>
      </Menu>
      <VersionHistoryDialog
        open={history}
        onOpenChange={setHistory}
        title={title}
      />
    </>
  );
}
/** Document/manuscript "More" menu (handoff `MoreMenu`, 240px). */
export function MoreMenu({
  onHistory,
  onManageAccess,
  wordCount,
}: {
  onHistory: () => void;
  onManageAccess: () => void;
  wordCount?: string;
}) {
  const preview = usePreviewAction();
  const flash = useToast();
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          aria-label="More"
          className="grid size-7 place-items-center rounded-md text-tx2 hover:bg-hov hover:text-tx"
        >
          <Ellipsis aria-hidden="true" className="size-4" />
        </button>
      </MenuTrigger>
      <MenuContent width={240} align="end">
        <MenuItem
          icon={<Type />}
          sub="Lora (serif)"
          chevron
          onSelect={() => flash('Font options are UI-only in this preview')}
        >
          Font
        </MenuItem>
        <MenuItem
          icon={<Blocks />}
          sub="Zotero, ORCID, GitHub"
          chevron
          onSelect={() =>
            flash('Integrations are not connected in this preview')
          }
        >
          Integrations
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={<Pencil />} onSelect={preview('Rename')}>
          Rename
        </MenuItem>
        <MenuItem icon={<CopyPlus />} onSelect={preview('Duplicate')}>
          Duplicate
        </MenuItem>
        <MenuItem icon={<FolderInput />} onSelect={preview('Move')}>
          Move to…
        </MenuItem>
        <MenuItem
          icon={<FileDown />}
          sub="PDF, Markdown, LaTeX"
          chevron
          onSelect={() => flash('Export is not connected in this preview')}
        >
          Export
        </MenuItem>
        <MenuItem icon={<History />} onSelect={onHistory}>
          Version history
        </MenuItem>
        <MenuItem icon={<Users />} onSelect={onManageAccess}>
          Manage access
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={<Archive />} onSelect={preview('Archive')}>
          Archive
        </MenuItem>
        <MenuItem
          icon={<Trash2 />}
          destructive
          onSelect={preview('Move to trash')}
        >
          Move to trash
        </MenuItem>
        {wordCount ? (
          <>
            <MenuSeparator />
            <MenuFooter label="Word count" value={wordCount} />
          </>
        ) : null}
      </MenuContent>
    </Menu>
  );
}

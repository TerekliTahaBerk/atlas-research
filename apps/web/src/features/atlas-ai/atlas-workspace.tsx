'use client';
import { SampleTag } from '@/components/atlas/chips';
import { Crumb, Topbar } from '@/features/shell/topbar';
import { useAtlas } from './atlas-provider';
import { AtlasSurface } from './atlas-surface';
/**
 * Full research mode (handoff "full research mode"): the same composer and
 * conversation as every other placement, given the whole canvas.
 */
export function AtlasWorkspace() {
  const atlas = useAtlas();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Topbar>
        <Crumb
          parent={atlas.live ? 'Project' : 'Sparse Evoformer'}
          title="Atlas AI"
          as="span"
        />
      </Topbar>
      <div className="mx-auto flex min-h-0 w-full max-w-[780px] flex-1 flex-col px-6 pt-6 pb-4 max-sm:px-3">
        <div className="mb-4 flex flex-wrap items-baseline gap-3">
          <h1 className="font-serif text-[34px] leading-[1.1] font-medium">
            Research mode
          </h1>
          {atlas.live ? (
            <span className="text-xs text-tx3">
              Grounded research · exact source locations
            </span>
          ) : (
            <SampleTag>
              Prewritten sample answers · no model is called
            </SampleTag>
          )}
        </div>
        <div className="min-h-0 flex-1">
          <AtlasSurface placement="page" />
        </div>
      </div>
    </div>
  );
}

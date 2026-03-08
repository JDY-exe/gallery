import React from 'react'
import { Grid, Maximize2 } from 'lucide-react'
import { SearchBar } from '../SearchBar'

export function GalleryHeader({
  onToggleAdminPanel,
  activeTags,
  onTagsChange,
  allTags,
  viewMode,
  onSetViewMode,
}) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-12 py-6 bg-gradient-to-b from-[#0a0a0a]/90 to-transparent pointer-events-none">
      <div className="pointer-events-auto">
        <button
          onClick={onToggleAdminPanel}
          type="button"
          className="text-4xl font-serif tracking-tighter text-white italic"
          title="Toggle admin panel (Shift + A)"
        >
          Taito
        </button>
      </div>

      <SearchBar activeTags={activeTags} onTagsChange={onTagsChange} allTags={allTags} />

      <nav className="pointer-events-auto flex items-center gap-2 bg-white/5 backdrop-blur-md rounded-full p-1 border border-white/10">
        <button
          onClick={() => onSetViewMode('single')}
          className={`p-2 rounded-full transition-all duration-300 ${viewMode === 'single' ? 'bg-white text-black shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
          aria-label="Single View"
        >
          <Maximize2 size={14} strokeWidth={1.5} />
        </button>
        <button
          onClick={() => onSetViewMode('grid')}
          className={`p-2 rounded-full transition-all duration-300 ${viewMode === 'grid' ? 'bg-white text-black shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
          aria-label="Grid View"
        >
          <Grid size={14} strokeWidth={1.5} />
        </button>
      </nav>
    </header>
  )
}

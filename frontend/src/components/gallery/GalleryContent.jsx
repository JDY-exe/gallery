import React from 'react'
import { LoaderCircle } from 'lucide-react'
import { GridGalleryView } from '../GridGalleryView'
import { SingleImageView } from '../SingleImageView'

export function GalleryContent({
  viewMode,
  isLoading,
  hasBoards,
  hasItems,
  hasFilteredItems,
  isSignedIn,
  filteredItems,
  currentIndex,
  onNext,
  onPrev,
  onSelectFromGrid,
}) {
  const mainClassName =
    viewMode === 'single' ? 'flex-1 min-h-0' : 'flex-1 pt-24 pb-44 md:pb-36'

  return (
    <main className={mainClassName}>
      {isLoading ? (
        <div className="h-full min-h-[50vh] flex items-center justify-center px-6">
          <div className="flex items-center gap-3 text-gray-300">
            <LoaderCircle size={18} className="animate-spin" />
            <span>Loading boards and images from backend...</span>
          </div>
        </div>
      ) : !hasBoards ? (
        <div className="h-full min-h-[50vh] flex items-center justify-center px-6">
          <div className="max-w-xl text-center">
            <h2 className="text-2xl md:text-3xl font-serif mb-3">No Boards Yet</h2>
            <p className="text-gray-400 text-sm md:text-base">
              {isSignedIn
                ? 'Your moodboard is being initialized. Refresh if it does not appear.'
                : 'No public moodboard is available yet.'}
            </p>
          </div>
        </div>
      ) : !hasFilteredItems ? (
        <div className="h-full min-h-[50vh] flex items-center justify-center px-6">
          <div className="max-w-xl text-center">
            <h2 className="text-2xl md:text-3xl font-serif mb-3">
              {hasItems ? 'No Matches' : 'Board Is Empty'}
            </h2>
            <p className="text-gray-400 text-sm md:text-base">
              {hasItems
                ? 'Clear or change the active tags to see images again.'
                : 'Run X sync to import likes into your moodboard.'}
            </p>
          </div>
        </div>
      ) : viewMode === 'single' ? (
        <div className="h-full w-full min-h-0">
          <SingleImageView
            item={filteredItems[currentIndex]}
            onNext={onNext}
            onPrev={onPrev}
            currentIndex={currentIndex}
            totalItems={filteredItems.length}
          />
        </div>
      ) : (
        <div className="min-h-screen w-full">
          <GridGalleryView items={filteredItems} onSelect={onSelectFromGrid} />
        </div>
      )}
    </main>
  )
}

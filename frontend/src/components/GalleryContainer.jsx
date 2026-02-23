import React, { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Grid, Maximize2 } from 'lucide-react'
import { galleryItems } from './data'
import { SingleImageView } from './SingleImageView'
import { GridGalleryView } from './GridGalleryView'
import { SearchBar } from './SearchBar'

export function GalleryContainer() {
  const [viewMode, setViewMode] = useState('single')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [activeTags, setActiveTags] = useState([])

  // Get all unique tags from gallery items
  const allTags = useMemo(() => {
    const tagSet = new Set()
    galleryItems.forEach((item) => {
      item.tags?.forEach((tag) => tagSet.add(tag))
    })
    return Array.from(tagSet).sort()
  }, [])

  // Filter items based on active tags
  const filteredItems = useMemo(() => {
    if (activeTags.length === 0) return galleryItems
    return galleryItems.filter((item) =>
      activeTags.every((tag) =>
        item.tags?.some((itemTag) =>
          itemTag.toLowerCase().includes(tag.toLowerCase())
        )
      )
    )
  }, [activeTags])

  // Handle tag changes - auto-switch to grid view when searching from single view
  const handleTagsChange = (newTags) => {
    setActiveTags(newTags)
    if (newTags.length > 0 && viewMode === 'single') {
      setViewMode('grid')
    }
  }

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % filteredItems.length)
  }
  const handlePrev = () => {
    setCurrentIndex(
      (prev) => (prev - 1 + filteredItems.length) % filteredItems.length,
    )
  }
  const handleSelectFromGrid = (item) => {
    // Find the index in filteredItems (since we're navigating the filtered list)
    const filteredIndex = filteredItems.findIndex((fi) => fi.id === item.id)
    setCurrentIndex(filteredIndex)
    setViewMode('single')
    // We NO LONGER clear activeTags here, so the filter persists
  }
  return (
    <div className={`bg-neutral-900 text-white flex flex-col ${viewMode === 'single' ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
      {/* Header / Navigation Bar */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-12 py-6 bg-gradient-to-b from-[#0a0a0a]/90 to-transparent pointer-events-none">
        <div className="pointer-events-auto">
          <h1 className="text-4xl font-serif tracking-tighter text-white italic">
            るみれ
          </h1>
        </div>

        {/* Search Bar - Center */}
        <SearchBar
          activeTags={activeTags}
          onTagsChange={handleTagsChange}
          allTags={allTags}
        />

        <nav className="pointer-events-auto flex items-center gap-2 bg-white/5 backdrop-blur-md rounded-full p-1 border border-white/10">
          <button
            onClick={() => setViewMode('single')}
            className={`p-2 rounded-full transition-all duration-300 ${viewMode === 'single' ? 'bg-white text-black shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
            aria-label="Single View"
          >
            <Maximize2 size={14} strokeWidth={1.5} />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-full transition-all duration-300 ${viewMode === 'grid' ? 'bg-white text-black shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
            aria-label="Grid View"
          >
            <Grid size={14} strokeWidth={1.5} />
          </button>
        </nav>
      </header>

      {/* Main Content Area */}
      <main className={`flex-1 ${viewMode === 'single' ? '' : 'pt-24'}`}>
        <AnimatePresence mode="wait">
          {viewMode === 'single' ? (
            <motion.div
              key="single-view"
              initial={{
                opacity: 0,
              }}
              animate={{
                opacity: 1,
              }}
              exit={{
                opacity: 0,
              }}
              transition={{
                duration: 0.2,
              }}
              className="h-full w-full"
            >
              <SingleImageView
                item={filteredItems[currentIndex]}
                onNext={handleNext}
                onPrev={handlePrev}
                currentIndex={currentIndex}
                totalItems={filteredItems.length}
              />
            </motion.div>
          ) : (
            <motion.div
              key="grid-view"
              initial={{
                opacity: 0,
              }}
              animate={{
                opacity: 1,
              }}
              exit={{
                opacity: 0,
              }}
              transition={{
                duration: 0.2,
              }}
              className="min-h-screen w-full"
            >
              <GridGalleryView
                items={filteredItems}
                onSelect={handleSelectFromGrid}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}

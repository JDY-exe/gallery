import React, { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const MotionDiv = motion.div

export function SingleImageView({
  item,
  onNext,
  onPrev,
  currentIndex,
  totalItems,
}) {
  // Keyboard navigation
  useEffect(() => {
    if (!item || totalItems <= 0) return undefined
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight') onNext()
      if (e.key === 'ArrowLeft') onPrev()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [item, onNext, onPrev, totalItems])

  if (!item) {
    return (
      <div className="relative w-full h-full flex items-center justify-center px-4 md:px-12">
        <div className="text-center max-w-xl">
          <h2 className="text-2xl md:text-3xl font-serif text-white mb-3">
            No Images Yet
          </h2>
          <p className="text-sm md:text-base text-gray-400">
            Connect X and run a likes sync, or create a board and add items later.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden px-4 md:px-12">
      {/* Main Image Area */}
      <div className="relative w-full h-full max-w-7xl max-h-[85vh] flex items-center justify-center">
        <AnimatePresence mode="wait">
          <MotionDiv
            key={item.id}
            initial={{
              opacity: 0,
              scale: 0.98,
            }}
            animate={{
              opacity: 1,
              scale: 1,
            }}
            exit={{
              opacity: 0,
              scale: 1.02,
            }}
            transition={{
              duration: 0.2,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="relative w-full h-full flex items-center justify-center"
          >
            <img
              src={item.src}
              alt={item.title}
              loading="eager"
              decoding="async"
              className="max-w-[90%] max-h-[90%] object-contain shadow-2xl"
              style={{
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              }}
            />
          </MotionDiv>
        </AnimatePresence>

        {/* Navigation Arrows - Floating */}
        <button
          onClick={onPrev}
          className="absolute left-0 md:-left-8 top-1/2 -translate-y-1/2 p-4 text-white/50 hover:text-[#d4af37] transition-colors duration-300 z-10 focus:outline-none"
          aria-label="Previous image"
        >
          <ChevronLeft size={48} strokeWidth={0.5} />
        </button>

        <button
          onClick={onNext}
          className="absolute right-0 md:-right-8 top-1/2 -translate-y-1/2 p-4 text-white/50 hover:text-[#d4af37] transition-colors duration-300 z-10 focus:outline-none"
          aria-label="Next image"
        >
          <ChevronRight size={48} strokeWidth={0.5} />
        </button>
      </div>

      {/* Info / Caption */}
      <MotionDiv
        key={`info-${item.id}`}
        initial={{
          opacity: 0,
          y: 20,
        }}
        animate={{
          opacity: 1,
          y: 0,
        }}
        transition={{
          duration: 0.1,
        }}
        className="mt-8 text-center max-w-xl"
      >
        <h2 className="text-3xl md:text-4xl font-serif text-white mb-2 tracking-wide">
          {item?.source?.postUrl ? (
            <a
              href={item.source.postUrl}
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-[#d4af37]"
              title="Open original X post"
            >
              {item.title}
            </a>
          ) : (
            item.title
          )}
        </h2>
        <div className="flex items-center justify-center gap-4 text-sm tracking-widest text-gray-400 uppercase">
          <span>{item.artist}</span>
          <span className="w-1 h-1 bg-[#d4af37] rounded-full"></span>
          <span>{item.year}</span>
        </div>
      </MotionDiv>

      {/* Counter */}
      <div className="absolute bottom-8 right-8 md:right-12 font-mono text-xs text-gray-500 tracking-widest">
        {String(currentIndex + 1).padStart(2, '0')} /{' '}
        {String(totalItems).padStart(2, '0')}
      </div>
    </div>
  )
}

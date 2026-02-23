import React, { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X } from 'lucide-react'

export function SearchBar({ activeTags, onTagsChange, allTags }) {
  const [inputValue, setInputValue] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const inputRef = useRef(null)

  // Filter suggestions based on input
  const suggestions = inputValue.trim()
    ? allTags.filter(
      (tag) =>
        tag.toLowerCase().includes(inputValue.toLowerCase()) &&
        !activeTags.includes(tag)
    )
    : []

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault()
      const newTag = inputValue.trim().toLowerCase()
      if (!activeTags.includes(newTag)) {
        onTagsChange([...activeTags, newTag])
      }
      setInputValue('')
    } else if (e.key === 'Backspace' && !inputValue && activeTags.length > 0) {
      // Remove last tag when backspace is pressed on empty input
      onTagsChange(activeTags.slice(0, -1))
    }
  }

  const removeTag = (tagToRemove) => {
    onTagsChange(activeTags.filter((tag) => tag !== tagToRemove))
  }

  const addTag = (tag) => {
    if (!activeTags.includes(tag)) {
      onTagsChange([...activeTags, tag])
    }
    setInputValue('')
    inputRef.current?.focus()
  }

  const clearAll = () => {
    onTagsChange([])
    setInputValue('')
  }

  return (
    <div className="relative pointer-events-auto">
      <div
        className={`flex items-center gap-2 bg-white/5 backdrop-blur-md rounded-full px-4 py-2 border transition-all duration-300 min-w-[280px] max-w-[500px] ${isFocused
          ? 'border-white/50 bg-white/10 shadow-lg shadow-white/10'
          : 'border-white/10 hover:border-white/20'
          }`}
      >
        <Search
          size={16}
          className={`flex-shrink-0 transition-colors duration-300 ${isFocused ? 'text-white' : 'text-gray-400'
            }`}
        />

        {/* Active Tags */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <AnimatePresence mode="popLayout">
            {activeTags.map((tag) => (
              <motion.span
                key={tag}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
                className="inline-flex items-center gap-1 bg-[#d4af37]/20 text-[#d4af37] px-2 py-0.5 rounded-full text-xs font-medium"
              >
                {tag}
                <button
                  onClick={() => removeTag(tag)}
                  className="hover:text-white transition-colors"
                  aria-label={`Remove ${tag} tag`}
                >
                  <X size={14} />
                </button>
              </motion.span>
            ))}
          </AnimatePresence>

          {/* Input */}
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 25)}
            placeholder={activeTags.length === 0 ? 'Search by tags...' : ''}
            className="bg-transparent outline-none text-sm text-white placeholder-gray-500 min-w-[100px] flex-1"
          />
        </div>

        {/* Clear All Button */}
        {activeTags.length > 0 && (
          <button
            onClick={clearAll}
            className="flex-shrink-0 text-gray-400 hover:text-white transition-colors p-1"
            aria-label="Clear all tags"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Suggestions Dropdown */}
      <AnimatePresence>
        {isFocused && suggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 right-0 mt-2 bg-neutral-800/95 backdrop-blur-md rounded-xl border border-white/10 py-2 shadow-xl z-50 overflow-hidden"
          >
            {suggestions.slice(0, 6).map((tag) => (
              <button
                key={tag}
                onMouseDown={(e) => {
                  e.preventDefault()
                  addTag(tag)
                }}
                className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
              >
                {tag}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

import React, { Children } from 'react'
import { motion } from 'framer-motion'
export function GridGalleryView({ items, onSelect }) {
  return (
    <div className="w-full max-w-[1800px] mx-auto px-4 md:px-12 py-12">
      <motion.div
        key={items.map((i) => i.id).join(',')}
        className="columns-1 md:columns-2 lg:columns-3 xl:columns-4 gap-4 md:gap-6"
        initial="hidden"
        animate="show"
        variants={{
          hidden: {
            opacity: 0,
          },
          show: {
            opacity: 1,
            transition: {
              staggerChildren: 0.08,
            },
          },
        }}
      >
        {items.map((item, index) => (
          <motion.div
            key={item.id}
            variants={{
              hidden: {
                opacity: 0,
                y: 20,
              },
              show: {
                opacity: 1,
                y: 0,
                transition: {
                  duration: 0.2,
                  ease: 'easeOut',
                },
              },
            }}
            className="group cursor-pointer mb-8 md:mb-12 break-inside-avoid"
            onClick={() => onSelect(item)}
          >
            <div className="relative overflow-hidden bg-gray-900">
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-500 z-10" />
              <img
                src={item.src}
                alt={item.title}
                className="w-full h-auto object-cover transform group-hover:scale-105 transition-transform duration-700 ease-out"
              />
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}

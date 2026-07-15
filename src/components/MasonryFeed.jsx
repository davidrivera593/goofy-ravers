import { useEffect, useState } from 'react'

// 3 columns on desktop, 2 on tablet, 1 on phone.
function columnsForWidth(width) {
  if (width <= 768) return 1
  if (width <= 1024) return 2
  return 3
}

/**
 * Pinterest-style masonry feed. Cards keep their natural (varying) heights,
 * and items are distributed round-robin across the columns so the newest
 * posts read left-to-right across the top row (post 0 → col 0, post 1 → col 1,
 * post 2 → col 2, post 3 → col 0, …) — unlike CSS `columns`, which fills the
 * first column top-to-bottom before starting the next.
 */
export default function MasonryFeed({ items, renderItem }) {
  const [columnCount, setColumnCount] = useState(() =>
    columnsForWidth(typeof window === 'undefined' ? 1200 : window.innerWidth),
  )

  useEffect(() => {
    let raf = 0
    function onResize() {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() =>
        setColumnCount(columnsForWidth(window.innerWidth)),
      )
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      cancelAnimationFrame(raf)
    }
  }, [])

  const columns = Array.from({ length: columnCount }, () => [])
  items.forEach((item, i) => {
    columns[i % columnCount].push(item)
  })

  return (
    <div className="feed">
      {columns.map((col, ci) => (
        <div className="feed-col" key={ci}>
          {col.map((item) => renderItem(item))}
        </div>
      ))}
    </div>
  )
}

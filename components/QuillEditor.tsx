'use client'

import { useState, useEffect, useRef } from 'react'
import 'react-quill-new/dist/quill.snow.css'

interface Props {
  value: string
  onChange: (val: string) => void
  placeholder?: string
  minHeight?: number
}

export default function QuillEditor({ value, onChange, placeholder, minHeight = 200 }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [ReactQuill, setReactQuill] = useState<any>(null)
  const [toolbarHeight, setToolbarHeight] = useState(42)
  const containerRef = useRef<HTMLDivElement>(null)

  const isEmpty = !value || value === '<p><br></p>'

  useEffect(() => {
    import('react-quill-new').then(m => setReactQuill(() => m.default))
  }, [])

  useEffect(() => {
    if (!containerRef.current) return
    const toolbar = containerRef.current.querySelector('.ql-toolbar')
    if (toolbar) setToolbarHeight(toolbar.getBoundingClientRect().height)
  }, [ReactQuill])

  const modules = {
    toolbar: [
      [{ header: [2, 3, false] }],
      ['bold', 'italic', 'underline'],
      [{ color: [] }],
      [{ list: 'ordered' }, { list: 'bullet' }],
      ['blockquote', 'link', 'image'],
      ['clean'],
    ],
  }

  if (!ReactQuill) {
    return (
      <div style={{
        minHeight,
        border: '1px solid #E7E5E4',
        borderRadius: '8px',
        background: '#FAFAF9',
      }} />
    )
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <ReactQuill
        theme="snow"
        value={value}
        onChange={onChange}
        modules={modules}
        style={{ minHeight }}
      />
      {isEmpty && placeholder && (
        <div style={{
          position: 'absolute',
          top: `${toolbarHeight + 12}px`,
          left: '15px',
          color: 'rgba(0,0,0,0.4)',
          fontStyle: 'italic',
          pointerEvents: 'none',
          fontSize: '13px',
          lineHeight: '1.42',
          zIndex: 1,
        }}>
          {placeholder}
        </div>
      )}
    </div>
  )
}

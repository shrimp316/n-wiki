'use client'

import { useState, useEffect } from 'react'
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

  useEffect(() => {
    import('react-quill-new').then(m => setReactQuill(() => m.default))
  }, [])

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
    <ReactQuill
      theme="snow"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      modules={modules}
      style={{ minHeight }}
    />
  )
}

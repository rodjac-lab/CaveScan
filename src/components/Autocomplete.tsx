import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Input } from '@/components/ui/input'

interface AutocompleteProps {
  value: string
  onChange: (value: string) => void
  suggestions: string[]
  placeholder?: string
  id?: string
  className?: string
}

interface DropdownPosition {
  top: number
  left: number
  width: number
}

export function Autocomplete({
  value,
  onChange,
  suggestions,
  placeholder,
  id,
  className,
}: AutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([])
  const [dropdownPosition, setDropdownPosition] = useState<DropdownPosition>({ top: 0, left: 0, width: 0 })
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const isFocused = useRef(false)

  useEffect(() => {
    if (value.length >= 2) {
      const filtered = suggestions.filter((s) =>
        s.toLowerCase().includes(value.toLowerCase())
      )
      setFilteredSuggestions(filtered.slice(0, 5))
      setIsOpen(filtered.length > 0 && isFocused.current)
    } else {
      setFilteredSuggestions([])
      setIsOpen(false)
    }
  }, [value, suggestions])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Update dropdown position when open
  useEffect(() => {
    function updatePosition() {
      if (inputRef.current && isOpen) {
        const rect = inputRef.current.getBoundingClientRect()
        setDropdownPosition({
          top: rect.bottom,
          left: rect.left,
          width: rect.width,
        })
      }
    }

    updatePosition()

    // Close dropdown on scroll (standard mobile UX)
    function handleScroll() {
      setIsOpen(false)
    }

    if (isOpen) {
      window.addEventListener('scroll', handleScroll, true)
      window.addEventListener('resize', updatePosition)
      return () => {
        window.removeEventListener('scroll', handleScroll, true)
        window.removeEventListener('resize', updatePosition)
      }
    }
  }, [isOpen])

  function handleSelect(suggestion: string): void {
    onChange(suggestion)
    setIsOpen(false)
  }

  const dropdown = isOpen && filteredSuggestions.length > 0 && (
    <ul
      className="fixed z-[9999] max-h-48 overflow-auto rounded-md border bg-popover p-1 shadow-lg"
      style={{
        top: dropdownPosition.top,
        left: dropdownPosition.left,
        width: dropdownPosition.width,
      }}
    >
      {filteredSuggestions.map((suggestion, index) => (
        <li
          key={index}
          onClick={() => handleSelect(suggestion)}
          className="cursor-pointer rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
        >
          {suggestion}
        </li>
      ))}
    </ul>
  )

  return (
    <div ref={wrapperRef}>
      <Input
        ref={inputRef}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          isFocused.current = true
          if (filteredSuggestions.length > 0) setIsOpen(true)
        }}
        onBlur={() => {
          isFocused.current = false
        }}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      {createPortal(dropdown, document.body)}
    </div>
  )
}

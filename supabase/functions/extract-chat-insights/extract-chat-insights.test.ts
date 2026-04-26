import { describe, expect, it } from 'vitest'
import { EXTRACTION_PROMPT } from './prompt'

describe('EXTRACTION_PROMPT', () => {
  it('matches snapshot', () => {
    expect(EXTRACTION_PROMPT).toMatchSnapshot()
  })
})

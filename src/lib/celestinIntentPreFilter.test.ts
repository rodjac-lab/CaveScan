import { describe, expect, test } from 'vitest'
import { isObviouslyConversational } from './celestinIntentPreFilter'

describe('isObviouslyConversational', () => {
  test.each([
    'merci', 'Merci', 'merci!', 'merci !', 'MERCI', 'Merci.',
    'ok', 'ok.', 'okay', 'Oui', 'non',
    'salut', 'bonjour', 'bonsoir', 'hello', 'hi', 'coucou',
    'cool', 'super', 'top', 'nickel', 'parfait',
    'ah', 'oh', 'hmm',
    '', '   ', '   !!!   ',
    'genial', 'génial',
    'au revoir', 'bye',
  ])('skips classifier on "%s"', (msg) => {
    expect(isObviouslyConversational(msg)).toBe(true)
  })

  test.each([
    'mes meilleurs 2015',
    'combien de Brunello',
    'accord pour un poulet roti',
    'parle-moi du Savagnin',
    'merci pour les 2015',
    'top Chianti',
    'super, et mes 2015 ?',
    'salut Celestin',
    'qu ai je bu hier',
    'top 10 Bourgogne',
    'mes pires Bordeaux',
    'ok et sinon',
    'que boire ce soir',
    'bonjour, quel vin pour ce soir',
  ])('does NOT skip on "%s"', (msg) => {
    expect(isObviouslyConversational(msg)).toBe(false)
  })
})

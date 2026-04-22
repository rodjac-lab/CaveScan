const TRIVIAL_MESSAGES = new Set<string>([
  // Remerciements
  'merci', 'mercii', 'merciii', 'merci beaucoup', 'thanks', 'thx', 'ty', 'thank you',
  // Acquiescement / refus
  'ok', 'okay', 'oki', 'kk', 'd accord', 'daccord',
  'oui', 'ouais', 'ouai', 'yep', 'yes',
  'non', 'nope', 'no',
  // Salutations
  'salut', 'bonjour', 'bonsoir', 'coucou', 'hey', 'yo', 'ciao', 'hi', 'hello', 'hola',
  // Au revoir
  'bye', 'bye bye', 'au revoir', 'a plus', 'a bientot', 'bonne soiree', 'bonne nuit',
  // Reactions courtes
  'cool', 'super', 'top', 'nickel', 'parfait', 'genial', 'excellent',
  'ah', 'oh', 'eh', 'hmm', 'mmh', 'mouais', 'mdr', 'lol',
])

export function isObviouslyConversational(message: string | null | undefined): boolean {
  if (!message) return true
  const normalized = message
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/[!?.,;:…\s]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return true
  return TRIVIAL_MESSAGES.has(normalized)
}

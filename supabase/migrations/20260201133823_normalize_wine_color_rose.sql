-- Normalize wine color values and constraints (rosé -> rose)

ALTER TABLE bottles DROP CONSTRAINT IF EXISTS bottles_couleur_check;

UPDATE bottles
SET couleur = 'rose'
WHERE couleur = 'rosé';

ALTER TABLE bottles
ADD CONSTRAINT bottles_couleur_check
CHECK (couleur IN ('rouge', 'blanc', 'rose', 'bulles'));

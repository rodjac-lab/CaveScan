-- CaveScan Seed Data
-- Run this after the migration to create default zones

-- Insert 4 default zones
INSERT INTO zones (name, description, rows, columns) VALUES
  ('Cave principale', 'Zone de stockage principale', 10, 10),
  ('Réfrigérateur à vin', 'Casier réfrigéré pour les blancs', 6, 4),
  ('Étagère murale', 'Stockage mural pour consommation rapide', 3, 8),
  ('Cartons', 'Stockage temporaire en cartons', 5, 6);

-- Optionally insert some sample bottles for testing
-- Uncomment the following if you want test data

/*
INSERT INTO bottles (zone_id, row_position, column_position, wine_name, appellation, producer, vintage, color, quantity, purchase_price, drink_from, drink_until, notes)
SELECT
  z.id,
  1,
  1,
  'Château Margaux',
  'Margaux',
  'Château Margaux',
  2018,
  'red',
  2,
  350.00,
  2028,
  2060,
  'Grand cru exceptionnel, à garder pour une occasion spéciale'
FROM zones z WHERE z.name = 'Cave principale';

INSERT INTO bottles (zone_id, row_position, column_position, wine_name, appellation, producer, vintage, color, quantity, purchase_price, drink_from, drink_until, notes)
SELECT
  z.id,
  1,
  1,
  'Chablis Premier Cru',
  'Chablis',
  'Domaine William Fèvre',
  2022,
  'white',
  6,
  35.00,
  2024,
  2030,
  'Frais et minéral, parfait avec des fruits de mer'
FROM zones z WHERE z.name = 'Réfrigérateur à vin';

INSERT INTO bottles (zone_id, row_position, column_position, wine_name, appellation, producer, vintage, color, quantity, purchase_price, drink_from, drink_until)
SELECT
  z.id,
  1,
  1,
  'Côtes du Rhône',
  'Côtes du Rhône',
  'E. Guigal',
  2021,
  'red',
  12,
  12.00,
  2023,
  2027
FROM zones z WHERE z.name = 'Étagère murale';
*/

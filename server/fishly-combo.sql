-- Fishly Combo (₱90), product descriptions, and category cleanup
-- Open in HeidiSQL, select the fishly_pos database, then run the whole file.
-- Safe to re-run: existing categories/products/descriptions are not duplicated,
-- and descriptions written by the admin are never overwritten.

CREATE TABLE IF NOT EXISTS menu_migrations (
  version VARCHAR(80) PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 1. Add the product description column if the server migration has not yet.
SET @sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `products` ADD COLUMN `description` VARCHAR(255) NULL AFTER `name`',
    'SELECT ''products.description already exists'' AS result')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'products'
    AND COLUMN_NAME = 'description'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

START TRANSACTION;

-- 2. Add the Fishly Combo category if it is missing.
INSERT INTO categories (name, sort_order)
SELECT 'Fishly Combo', 2 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Fishly Combo');

SET @combo = (SELECT id FROM categories WHERE name = 'Fishly Combo' ORDER BY id LIMIT 1);

-- 3. Put Fishly Combo after the rice cup, then Drinks and Pastillas.
UPDATE categories SET sort_order = 2 WHERE id = @combo;
UPDATE categories SET sort_order = 3 WHERE name = 'Drinks';
UPDATE categories SET sort_order = 4 WHERE name = 'Pastillas';

-- 4. Add the three ₱90 flavors. New items start at zero stock;
--    set their stock in Products after running this.
INSERT IGNORE INTO products (category_id, code, name, description, price, stock) VALUES
  (@combo, 'FC-C',   'Fishly Combo - Classic',  'Fishly Snack + rice + a drink',          90, 0),
  (@combo, 'FC-S',   'Fishly Combo - Spicy',    'Fishly Snack + rice + a drink',          90, 0),
  (@combo, 'FC-BBQ', 'Fishly Combo - Barbecue', 'Fishly Snack + rice + a drink',          90, 0);

-- 5. Fill starter descriptions only where a product has none yet.
UPDATE products SET description = '5 pcs popper fish with rice cup'
  WHERE code = 'RC-R' AND (description IS NULL OR description = '');
UPDATE products SET description = '5 pcs spicy popper fish with rice cup'
  WHERE code = 'RC-S' AND (description IS NULL OR description = '');
UPDATE products SET description = '5 pcs barbecue popper fish with rice cup'
  WHERE code = 'RC-BBQ' AND (description IS NULL OR description = '');
UPDATE products SET description = 'Chilled melon juice'
  WHERE code = 'MJ' AND (description IS NULL OR description = '');
UPDATE products SET description = 'Pastillas with coffee'
  WHERE code = 'PS-C' AND (description IS NULL OR description = '');
UPDATE products SET description = 'Pastillas with Oreo'
  WHERE code = 'PS-O' AND (description IS NULL OR description = '');
UPDATE products SET description = 'Pastillas with Milo'
  WHERE code = 'PS-M' AND (description IS NULL OR description = '');
UPDATE products SET description = 'Fishly Snack + rice + a drink'
  WHERE code = 'FC-C' AND (description IS NULL OR description = '');
UPDATE products SET description = 'Fishly Snack + rice + a drink'
  WHERE code = 'FC-S' AND (description IS NULL OR description = '');
UPDATE products SET description = 'Fishly Snack + rice + a drink'
  WHERE code = 'FC-BBQ' AND (description IS NULL OR description = '');

-- 6. Remove categories that no product uses. Categories that still hold
--    hidden products or sales history are kept.
DELETE c FROM categories c
LEFT JOIN products p ON p.category_id = c.id
WHERE p.id IS NULL;

-- 7. Mark these menu updates as applied.
INSERT IGNORE INTO menu_migrations (version) VALUES
  ('fishly-poppers-menu-v3'),
  ('fishly-poppers-menu-v4');

COMMIT;

-- 8. Confirm the result.
SELECT id, code, name, description, price, stock, active
FROM products WHERE code LIKE 'FC-%' ORDER BY id;
SELECT id, name, sort_order FROM categories ORDER BY sort_order, name;
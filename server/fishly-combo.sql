-- Fishly Combo (₱90) + category cleanup
-- Open in HeidiSQL, select the fishly_pos database, then run the whole file.
-- Safe to re-run: existing category/products are not duplicated or edited.

CREATE TABLE IF NOT EXISTS menu_migrations (
  version VARCHAR(80) PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

START TRANSACTION;

-- 1. Add the Fishly Combo category if it is missing.
INSERT INTO categories (name, sort_order)
SELECT 'Fishly Combo', 2 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Fishly Combo');

SET @combo = (SELECT id FROM categories WHERE name = 'Fishly Combo' ORDER BY id LIMIT 1);

-- 2. Put Fishly Combo after the rice cup, then Drinks and Pastillas.
UPDATE categories SET sort_order = 2 WHERE id = @combo;
UPDATE categories SET sort_order = 3 WHERE name = 'Drinks';
UPDATE categories SET sort_order = 4 WHERE name = 'Pastillas';

-- 3. Add the three ₱90 flavors. New items start at zero stock;
--    set their stock in Products after running this.
INSERT IGNORE INTO products (category_id, code, name, price, stock) VALUES
  (@combo, 'FC-C',   'Fishly Combo - Classic',  90, 0),
  (@combo, 'FC-S',   'Fishly Combo - Spicy',    90, 0),
  (@combo, 'FC-BBQ', 'Fishly Combo - Barbecue', 90, 0);

-- 4. Remove categories that no product uses. Categories that still hold
--    hidden products or sales history are kept.
DELETE c FROM categories c
LEFT JOIN products p ON p.category_id = c.id
WHERE p.id IS NULL;

-- 5. Mark this menu update as applied.
INSERT IGNORE INTO menu_migrations (version) VALUES ('fishly-poppers-menu-v3');

COMMIT;

-- 6. Confirm the result.
SELECT id, code, name, price, stock, active FROM products WHERE code LIKE 'FC-%' ORDER BY id;
SELECT id, name, sort_order FROM categories ORDER BY sort_order, name;
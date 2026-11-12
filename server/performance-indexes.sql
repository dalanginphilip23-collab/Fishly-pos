-- Fishly POS performance indexes
-- Open this file in HeidiSQL, select the fishly_pos database, and run it.
-- Each block is safe to re-run: an existing index is skipped, not duplicated.

-- 1. Check what already exists (optional, for your own reference).
SELECT TABLE_NAME, INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns_used
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('products', 'orders', 'expenses')
GROUP BY TABLE_NAME, INDEX_NAME
ORDER BY TABLE_NAME, INDEX_NAME;

-- 2. Prerequisite for the expenses index.
--    Run the line below only if this returns no rows.
SHOW COLUMNS FROM expenses LIKE 'voided_at';
-- ALTER TABLE expenses ADD COLUMN voided_at TIMESTAMP NULL;

-- 3. Register menu lookup: active products by category.
SET @sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `products` ADD INDEX `idx_products_active_category` (`active`, `category_id`, `id`)',
    'SELECT ''products.idx_products_active_category already exists'' AS result')
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'products'
    AND INDEX_NAME = 'idx_products_active_category'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4. Sales reports by date and status.
SET @sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `orders` ADD INDEX `idx_orders_created_status` (`created_at`, `status`)',
    'SELECT ''orders.idx_orders_created_status already exists'' AS result')
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orders'
    AND INDEX_NAME = 'idx_orders_created_status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 5. Expense reports by date, excluding voided rows.
SET @sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `expenses` ADD INDEX `idx_expenses_created_voided` (`created_at`, `voided_at`)',
    'SELECT ''expenses.idx_expenses_created_voided already exists'' AS result')
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'expenses'
    AND INDEX_NAME = 'idx_expenses_created_voided'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 6. Confirm all three now exist.
SELECT TABLE_NAME, INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns_used
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND INDEX_NAME IN ('idx_products_active_category', 'idx_orders_created_status', 'idx_expenses_created_voided')
GROUP BY TABLE_NAME, INDEX_NAME
ORDER BY TABLE_NAME;
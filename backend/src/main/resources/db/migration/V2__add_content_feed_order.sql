SET @feed_order_column_exists = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'contents'
      AND COLUMN_NAME = 'feed_order'
);

SET @feed_order_column_sql = IF(
    @feed_order_column_exists = 0,
    'ALTER TABLE contents ADD COLUMN feed_order INT NULL',
    'SELECT 1'
);

PREPARE feed_order_column_statement FROM @feed_order_column_sql;
EXECUTE feed_order_column_statement;
DEALLOCATE PREPARE feed_order_column_statement;

SET @feed_order_index_exists = (
    SELECT COUNT(*)
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'contents'
      AND INDEX_NAME = 'idx_contents_client_feed_order'
);

SET @feed_order_index_sql = IF(
    @feed_order_index_exists = 0,
    'CREATE INDEX idx_contents_client_feed_order ON contents (client_id, feed_order)',
    'SELECT 1'
);

PREPARE feed_order_index_statement FROM @feed_order_index_sql;
EXECUTE feed_order_index_statement;
DEALLOCATE PREPARE feed_order_index_statement;

-- MANUAL REVIEW / EXECUTION REQUIRED. Do not run if users.email is already nullable.
-- Client login uses username/password; email is optional profile data.
-- MySQL permits multiple NULL values in a UNIQUE index.
ALTER TABLE users MODIFY COLUMN email VARCHAR(150) NULL;

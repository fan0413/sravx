-- Rehearse on owned synthetic tables before applying to the approved database.
-- Existing warranty values remain unchanged. No inferred accessory warranty.
ALTER TABLE products MODIFY COLUMN warranty_months INT NULL DEFAULT NULL;

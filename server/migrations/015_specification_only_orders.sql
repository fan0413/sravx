-- Preconditions: no non-null legacy color values; ordinary order writer deployed
-- with selected_color=NULL. Preserve the nullable compatibility column and data.
ALTER TABLE order_items
  ADD CONSTRAINT ck_order_items_no_color CHECK (selected_color IS NULL);

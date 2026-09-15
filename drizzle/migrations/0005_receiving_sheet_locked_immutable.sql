-- Custom SQL migration file, put your code below! --

-- INV-008: Receiving Sheet once LOCKED is immutable. Same pattern as
-- migration 0001's stock_ledger append-only triggers, but conditional on
-- the row's own OLD status rather than unconditional, since a receiving
-- sheet is genuinely editable up through PENDING_WAREHOUSE/PENDING_PACKING
-- - only a LOCKED row becomes a legal, immutable document (NS-006).
CREATE TRIGGER receiving_sheets_locked_immutable
  BEFORE UPDATE ON receiving_sheets
  FOR EACH ROW
  WHEN OLD.status = 'LOCKED'
  BEGIN
    SELECT RAISE(ABORT, 'Locked sheets are immutable.');
  END;
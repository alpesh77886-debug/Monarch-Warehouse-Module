-- Custom SQL migration file, put your code below! --

-- INV-009: Stock Ledger is append-only. No application code path or
-- direct SQL statement may UPDATE or DELETE an existing row, enforced
-- at the database level so this cannot be bypassed by a bug or a
-- future developer, only by dropping the trigger itself (which the
-- protected-file/harness process should treat as a locked change).
CREATE TRIGGER stock_ledger_no_update
  BEFORE UPDATE ON stock_ledger
  FOR EACH ROW
  BEGIN
    SELECT RAISE(ABORT, 'stock_ledger is append-only. UPDATE is not allowed.');
  END;
--> statement-breakpoint
CREATE TRIGGER stock_ledger_no_delete
  BEFORE DELETE ON stock_ledger
  FOR EACH ROW
  BEGIN
    SELECT RAISE(ABORT, 'stock_ledger is append-only. DELETE is not allowed.');
  END;
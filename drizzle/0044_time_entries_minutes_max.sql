-- NOT VALID: rows logged before the 24 h cap are not rewritten or rejected; the check holds new writes.
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_minutes_max" CHECK ("time_entries"."minutes" <= 1440) NOT VALID;

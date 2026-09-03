ALTER TABLE automatic_time_release_batches
  DROP CONSTRAINT IF EXISTS automatic_time_release_batches_status_check;

ALTER TABLE automatic_time_release_batches
  ADD CONSTRAINT automatic_time_release_batches_status_check
  CHECK (status IN ('pending', 'released', 'reopening', 'reopened', 'partially_locked'));

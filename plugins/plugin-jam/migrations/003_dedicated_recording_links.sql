-- 0.3.0: each recording request gets its own Jam recording link (createRecordingLink), whose
-- reference Jam keeps with the link. Jam's recorder strips the jam-reference URL parameter that
-- url_parameter requests use, so a reload before recording lost it. Older rows keep that mode.
ALTER TABLE jam_recording_requests ADD COLUMN IF NOT EXISTS recording_link_url TEXT;

-- A Jam recorded through a request's link names the link's publicId, the fallback route to the
-- request when the reference is missing.
CREATE UNIQUE INDEX IF NOT EXISTS idx_jam_recording_requests_link
  ON jam_recording_requests (recording_link_public_id) WHERE recording_link_public_id IS NOT NULL;

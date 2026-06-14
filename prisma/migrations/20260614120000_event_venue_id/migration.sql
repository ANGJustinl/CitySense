-- Event.venueId links a damai (or other crawler) event to a confirmed AMap Venue,
-- so the event can inherit the venue's lat/lng/address and become route-eligible.
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "venueId" TEXT;

CREATE INDEX IF NOT EXISTS "Event_venueId_idx" ON "Event"("venueId");

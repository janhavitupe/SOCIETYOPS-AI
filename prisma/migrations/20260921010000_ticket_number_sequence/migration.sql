-- Ticket ids were derived from a row count: 'SOC-' || (1043 + count(*) - 4).
-- That races under concurrent inserts, and reuses an id after a soft delete
-- because the count drops back down. A sequence hands out each number once.
CREATE SEQUENCE IF NOT EXISTS ticket_number_seq;

-- Start above whatever the old scheme already handed out, so applying this to a
-- populated database cannot collide with an existing id.
SELECT setval(
  'ticket_number_seq',
  GREATEST(
    COALESCE(
      (SELECT MAX(CAST(substring(id FROM '^SOC-([0-9]+)$') AS BIGINT))
         FROM "Ticket"
        WHERE id ~ '^SOC-[0-9]+$'),
      1043
    ),
    1043
  )
);

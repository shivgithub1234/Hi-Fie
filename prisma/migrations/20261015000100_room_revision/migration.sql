-- Incrementing this field locks a room for the duration of an ORM transaction.
ALTER TABLE "hi_fie_rooms" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;

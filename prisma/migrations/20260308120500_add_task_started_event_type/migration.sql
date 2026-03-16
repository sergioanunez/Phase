-- Add new ActivityEventType value for when a task is started.

ALTER TYPE "ActivityEventType"
ADD VALUE IF NOT EXISTS 'task_started';


-- AlterEnum: Add assistant activity event types for Phase Assistant logging
ALTER TYPE "ActivityEventType" ADD VALUE 'assistant_scheduled_task';
ALTER TYPE "ActivityEventType" ADD VALUE 'assistant_created_punchlist';
ALTER TYPE "ActivityEventType" ADD VALUE 'assistant_created_material_request';

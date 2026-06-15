import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  // projects
  await db.schema
    .createTable('projects')
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', c => c.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('name', 'varchar(255)', c => c.notNull())
    .addColumn('description', 'text')
    .addColumn('color', 'varchar(7)')
    .addColumn('status', 'varchar(20)', c => c.notNull().defaultTo('ACTIVE'))
    .addColumn('health', 'varchar(20)', c => c.notNull().defaultTo('ON_TRACK'))
    .addColumn('start_date', 'date')
    .addColumn('end_date', 'date')
    .addColumn('created_by', 'uuid', c => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .execute()
  await db.schema.createIndex('idx_projects_workspace').on('projects').column('workspace_id').execute()

  // project_task_statuses
  await db.schema
    .createTable('project_task_statuses')
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('project_id', 'uuid', c => c.notNull().references('projects.id').onDelete('cascade'))
    .addColumn('name', 'varchar(100)', c => c.notNull())
    .addColumn('color', 'varchar(7)', c => c.notNull())
    .addColumn('position', 'integer', c => c.notNull().defaultTo(0))
    .addColumn('is_done', 'boolean', c => c.notNull().defaultTo(false))
    .execute()

  // project_tasks
  await db.schema
    .createTable('project_tasks')
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('project_id', 'uuid', c => c.notNull().references('projects.id').onDelete('cascade'))
    .addColumn('parent_id', 'uuid', c => c.references('project_tasks.id').onDelete('set null'))
    .addColumn('status_id', 'uuid', c => c.notNull().references('project_task_statuses.id').onDelete('restrict'))
    .addColumn('title', 'varchar(500)', c => c.notNull())
    .addColumn('description', 'text')
    .addColumn('priority', 'varchar(20)', c => c.notNull().defaultTo('NONE'))
    .addColumn('due_date', 'timestamptz')
    .addColumn('start_date', 'timestamptz')
    .addColumn('estimated_minutes', 'integer')
    .addColumn('client_visible', 'boolean', c => c.notNull().defaultTo(false))
    .addColumn('position', 'real', c => c.notNull().defaultTo(0))
    .addColumn('created_by', 'uuid', c => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .execute()
  await db.schema.createIndex('idx_project_tasks_project').on('project_tasks').column('project_id').execute()
  await db.schema.createIndex('idx_project_tasks_status').on('project_tasks').column('status_id').execute()

  // project_task_assignees
  await db.schema
    .createTable('project_task_assignees')
    .addColumn('task_id', 'uuid', c => c.notNull().references('project_tasks.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', c => c.notNull().references('users.id').onDelete('cascade'))
    .addPrimaryKeyConstraint('pk_task_assignees', ['task_id', 'user_id'])
    .execute()

  // project_task_dependencies
  await db.schema
    .createTable('project_task_dependencies')
    .addColumn('task_id', 'uuid', c => c.notNull().references('project_tasks.id').onDelete('cascade'))
    .addColumn('depends_on_task_id', 'uuid', c => c.notNull().references('project_tasks.id').onDelete('cascade'))
    .addColumn('type', 'varchar(20)', c => c.notNull().defaultTo('BLOCKS'))
    .addPrimaryKeyConstraint('pk_task_deps', ['task_id', 'depends_on_task_id'])
    .execute()

  // task_labels
  await db.schema
    .createTable('task_labels')
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('project_id', 'uuid', c => c.notNull().references('projects.id').onDelete('cascade'))
    .addColumn('name', 'varchar(100)', c => c.notNull())
    .addColumn('color', 'varchar(7)', c => c.notNull())
    .execute()

  // project_task_label_assignments
  await db.schema
    .createTable('project_task_label_assignments')
    .addColumn('task_id', 'uuid', c => c.notNull().references('project_tasks.id').onDelete('cascade'))
    .addColumn('label_id', 'uuid', c => c.notNull().references('task_labels.id').onDelete('cascade'))
    .addPrimaryKeyConstraint('pk_task_labels', ['task_id', 'label_id'])
    .execute()

  // custom_fields
  await db.schema
    .createTable('custom_fields')
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('project_id', 'uuid', c => c.notNull().references('projects.id').onDelete('cascade'))
    .addColumn('name', 'varchar(100)', c => c.notNull())
    .addColumn('field_type', 'varchar(20)', c => c.notNull())
    .addColumn('options', 'jsonb')
    .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .execute()

  // custom_field_values
  await db.schema
    .createTable('custom_field_values')
    .addColumn('task_id', 'uuid', c => c.notNull().references('project_tasks.id').onDelete('cascade'))
    .addColumn('custom_field_id', 'uuid', c => c.notNull().references('custom_fields.id').onDelete('cascade'))
    .addColumn('value', 'text')
    .addPrimaryKeyConstraint('pk_cfv', ['task_id', 'custom_field_id'])
    .execute()

  // project_task_checklists
  await db.schema
    .createTable('project_task_checklists')
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('task_id', 'uuid', c => c.notNull().references('project_tasks.id').onDelete('cascade'))
    .addColumn('title', 'varchar(500)', c => c.notNull())
    .addColumn('is_done', 'boolean', c => c.notNull().defaultTo(false))
    .addColumn('position', 'integer', c => c.notNull().defaultTo(0))
    .execute()

  // time_logs
  await db.schema
    .createTable('time_logs')
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('task_id', 'uuid', c => c.notNull().references('project_tasks.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', c => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('minutes', 'integer', c => c.notNull())
    .addColumn('logged_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .addColumn('note', 'varchar(500)')
    .execute()

  // project_task_attachments
  await db.schema
    .createTable('project_task_attachments')
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('task_id', 'uuid', c => c.notNull().references('project_tasks.id').onDelete('cascade'))
    .addColumn('filename', 'varchar(255)', c => c.notNull())
    .addColumn('url', 'varchar(1000)', c => c.notNull())
    .addColumn('size_bytes', 'integer')
    .addColumn('is_deliverable', 'boolean', c => c.notNull().defaultTo(false))
    .addColumn('uploaded_by', 'uuid', c => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('uploaded_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .execute()

  // project_task_comments
  await db.schema
    .createTable('project_task_comments')
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('task_id', 'uuid', c => c.notNull().references('project_tasks.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', c => c.references('users.id').onDelete('set null'))
    .addColumn('portal_session_id', 'uuid')
    .addColumn('body', 'text', c => c.notNull())
    .addColumn('parent_id', 'uuid', c => c.references('project_task_comments.id').onDelete('set null'))
    .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .execute()

  // milestones
  await db.schema
    .createTable('milestones')
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('project_id', 'uuid', c => c.notNull().references('projects.id').onDelete('cascade'))
    .addColumn('name', 'varchar(255)', c => c.notNull())
    .addColumn('description', 'text')
    .addColumn('due_date', 'date', c => c.notNull())
    .addColumn('status', 'varchar(20)', c => c.notNull().defaultTo('PENDING'))
    .addColumn('client_visible', 'boolean', c => c.notNull().defaultTo(false))
    .addColumn('position', 'integer', c => c.notNull().defaultTo(0))
    .execute()

  // milestone_tasks
  await db.schema
    .createTable('milestone_tasks')
    .addColumn('milestone_id', 'uuid', c => c.notNull().references('milestones.id').onDelete('cascade'))
    .addColumn('task_id', 'uuid', c => c.notNull().references('project_tasks.id').onDelete('cascade'))
    .addPrimaryKeyConstraint('pk_milestone_tasks', ['milestone_id', 'task_id'])
    .execute()

  // sprints
  await db.schema
    .createTable('sprints')
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('project_id', 'uuid', c => c.notNull().references('projects.id').onDelete('cascade'))
    .addColumn('name', 'varchar(255)', c => c.notNull())
    .addColumn('start_date', 'date', c => c.notNull())
    .addColumn('end_date', 'date', c => c.notNull())
    .addColumn('status', 'varchar(20)', c => c.notNull().defaultTo('PLANNED'))
    .addColumn('goal', 'text')
    .addColumn('velocity', 'integer')
    .execute()

  // sprint_tasks
  await db.schema
    .createTable('sprint_tasks')
    .addColumn('sprint_id', 'uuid', c => c.notNull().references('sprints.id').onDelete('cascade'))
    .addColumn('task_id', 'uuid', c => c.notNull().references('project_tasks.id').onDelete('cascade'))
    .addColumn('points', 'integer')
    .addPrimaryKeyConstraint('pk_sprint_tasks', ['sprint_id', 'task_id'])
    .execute()

  // project_members
  await db.schema
    .createTable('project_members')
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('project_id', 'uuid', c => c.notNull().references('projects.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', c => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('role', 'varchar(20)', c => c.notNull().defaultTo('MEMBER'))
    .addColumn('joined_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .execute()
  await db.schema.createIndex('idx_project_members_project').on('project_members').column('project_id').execute()

  // portal_access
  await db.schema
    .createTable('portal_access')
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('project_id', 'uuid', c => c.notNull().references('projects.id').onDelete('cascade'))
    .addColumn('label', 'varchar(255)', c => c.notNull())
    .addColumn('token', 'varchar(64)', c => c.notNull().unique())
    .addColumn('password_hash', 'varchar(255)')
    .addColumn('is_active', 'boolean', c => c.notNull().defaultTo(true))
    .addColumn('last_accessed', 'timestamptz')
    .addColumn('created_by', 'uuid', c => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .execute()

  // client_portal_sessions
  await db.schema
    .createTable('client_portal_sessions')
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('portal_id', 'uuid', c => c.notNull().references('portal_access.id').onDelete('cascade'))
    .addColumn('ip', 'varchar(45)')
    .addColumn('user_agent', 'varchar(500)')
    .addColumn('started_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .addColumn('last_seen', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .execute()

  // approval_requests
  await db.schema
    .createTable('approval_requests')
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('project_id', 'uuid', c => c.notNull().references('projects.id').onDelete('cascade'))
    .addColumn('portal_id', 'uuid', c => c.notNull().references('portal_access.id').onDelete('cascade'))
    .addColumn('task_id', 'uuid', c => c.references('project_tasks.id').onDelete('set null'))
    .addColumn('milestone_id', 'uuid', c => c.references('milestones.id').onDelete('set null'))
    .addColumn('attachment_id', 'uuid', c => c.references('project_task_attachments.id').onDelete('set null'))
    .addColumn('status', 'varchar(20)', c => c.notNull().defaultTo('PENDING'))
    .addColumn('note', 'text')
    .addColumn('responded_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .execute()

  // automation_rules
  await db.schema
    .createTable('automation_rules')
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('project_id', 'uuid', c => c.notNull().references('projects.id').onDelete('cascade'))
    .addColumn('name', 'varchar(255)', c => c.notNull())
    .addColumn('is_active', 'boolean', c => c.notNull().defaultTo(true))
    .addColumn('trigger', 'jsonb', c => c.notNull())
    .addColumn('actions', 'jsonb', c => c.notNull())
    .addColumn('created_by', 'uuid', c => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .execute()

  // automation_logs
  await db.schema
    .createTable('automation_logs')
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('rule_id', 'uuid', c => c.notNull().references('automation_rules.id').onDelete('cascade'))
    .addColumn('triggered_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .addColumn('success', 'boolean', c => c.notNull())
    .addColumn('detail', 'text')
    .execute()

  // project_docs
  await db.schema
    .createTable('project_docs')
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('project_id', 'uuid', c => c.notNull().references('projects.id').onDelete('cascade'))
    .addColumn('title', 'varchar(255)', c => c.notNull())
    .addColumn('content', 'jsonb')
    .addColumn('created_by', 'uuid', c => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .execute()

  // project_templates
  await db.schema
    .createTable('project_templates')
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', c => c.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('name', 'varchar(255)', c => c.notNull())
    .addColumn('description', 'text')
    .addColumn('is_public', 'boolean', c => c.notNull().defaultTo(false))
    .addColumn('template_data', 'jsonb', c => c.notNull())
    .addColumn('created_by', 'uuid', c => c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  const tables = [
    'project_templates', 'project_docs', 'automation_logs', 'automation_rules',
    'approval_requests', 'client_portal_sessions', 'portal_access',
    'project_members', 'sprint_tasks', 'sprints', 'milestone_tasks', 'milestones',
    'project_task_comments', 'project_task_attachments', 'time_logs',
    'project_task_checklists', 'custom_field_values', 'custom_fields',
    'project_task_label_assignments', 'task_labels', 'project_task_dependencies',
    'project_task_assignees', 'project_tasks', 'project_task_statuses', 'projects',
  ]
  for (const table of tables) {
    await db.schema.dropTable(table).ifExists().execute()
  }
}

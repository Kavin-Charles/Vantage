"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
const kysely_1 = require("kysely");
async function up(db) {
    await (0, kysely_1.sql) `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`.execute(db);
    await db.schema
        .createTable('workspaces')
        .addColumn('id', 'uuid', c => c.primaryKey().defaultTo((0, kysely_1.sql) `uuid_generate_v4()`))
        .addColumn('name', 'varchar(255)', c => c.notNull())
        .addColumn('domain', 'varchar(255)', c => c.notNull())
        .addColumn('plan', 'varchar(20)', c => c.notNull().defaultTo('trial'))
        .addColumn('stripe_customer_id', 'varchar(255)')
        .addColumn('stripe_subscription_id', 'varchar(255)')
        .addColumn('seat_count', 'integer', c => c.notNull().defaultTo(0))
        .addColumn('contact_count', 'integer', c => c.notNull().defaultTo(0))
        .addColumn('server_count', 'integer', c => c.notNull().defaultTo(0))
        .addColumn('db_count', 'integer', c => c.notNull().defaultTo(0))
        .addColumn('trial_ends_at', 'timestamptz')
        .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo((0, kysely_1.sql) `now()`))
        .addColumn('updated_at', 'timestamptz', c => c.notNull().defaultTo((0, kysely_1.sql) `now()`))
        .execute();
    await db.schema
        .createTable('users')
        .addColumn('id', 'uuid', c => c.primaryKey().defaultTo((0, kysely_1.sql) `uuid_generate_v4()`))
        .addColumn('workspace_id', 'uuid', c => c.notNull().references('workspaces.id'))
        .addColumn('clerk_user_id', 'varchar(255)', c => c.notNull().unique())
        .addColumn('name', 'varchar(255)', c => c.notNull())
        .addColumn('email', 'varchar(255)', c => c.notNull())
        .addColumn('role', 'varchar(20)', c => c.notNull().defaultTo('member'))
        .addColumn('last_login_at', 'timestamptz')
        .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo((0, kysely_1.sql) `now()`))
        .execute();
    await db.schema
        .createTable('companies')
        .addColumn('id', 'uuid', c => c.primaryKey().defaultTo((0, kysely_1.sql) `uuid_generate_v4()`))
        .addColumn('workspace_id', 'uuid', c => c.notNull().references('workspaces.id'))
        .addColumn('name', 'varchar(255)', c => c.notNull())
        .addColumn('industry', 'varchar(255)')
        .addColumn('location', 'varchar(255)')
        .addColumn('employee_count', 'integer')
        .addColumn('website', 'varchar(500)')
        .addColumn('deleted_at', 'timestamptz')
        .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo((0, kysely_1.sql) `now()`))
        .addColumn('updated_at', 'timestamptz', c => c.notNull().defaultTo((0, kysely_1.sql) `now()`))
        .execute();
    await db.schema
        .createTable('contacts')
        .addColumn('id', 'uuid', c => c.primaryKey().defaultTo((0, kysely_1.sql) `uuid_generate_v4()`))
        .addColumn('workspace_id', 'uuid', c => c.notNull().references('workspaces.id'))
        .addColumn('company_id', 'uuid', c => c.references('companies.id'))
        .addColumn('owner_id', 'uuid', c => c.notNull().references('users.id'))
        .addColumn('name', 'varchar(255)', c => c.notNull())
        .addColumn('email', 'varchar(255)', c => c.notNull())
        .addColumn('phone', 'varchar(50)')
        .addColumn('status', 'varchar(20)', c => c.notNull().defaultTo('prospect'))
        .addColumn('last_contacted_at', 'timestamptz')
        .addColumn('deleted_at', 'timestamptz')
        .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo((0, kysely_1.sql) `now()`))
        .addColumn('updated_at', 'timestamptz', c => c.notNull().defaultTo((0, kysely_1.sql) `now()`))
        .execute();
    await db.schema
        .createTable('deals')
        .addColumn('id', 'uuid', c => c.primaryKey().defaultTo((0, kysely_1.sql) `uuid_generate_v4()`))
        .addColumn('workspace_id', 'uuid', c => c.notNull().references('workspaces.id'))
        .addColumn('contact_id', 'uuid', c => c.references('contacts.id'))
        .addColumn('company_id', 'uuid', c => c.references('companies.id'))
        .addColumn('owner_id', 'uuid', c => c.notNull().references('users.id'))
        .addColumn('name', 'varchar(255)', c => c.notNull())
        .addColumn('value', (0, kysely_1.sql) `decimal(12,2)`, c => c.notNull().defaultTo(0))
        .addColumn('stage', 'varchar(20)', c => c.notNull().defaultTo('lead'))
        .addColumn('probability', 'integer', c => c.notNull().defaultTo(0))
        .addColumn('close_date', 'date')
        .addColumn('deleted_at', 'timestamptz')
        .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo((0, kysely_1.sql) `now()`))
        .addColumn('updated_at', 'timestamptz', c => c.notNull().defaultTo((0, kysely_1.sql) `now()`))
        .execute();
    await db.schema
        .createTable('tasks')
        .addColumn('id', 'uuid', c => c.primaryKey().defaultTo((0, kysely_1.sql) `uuid_generate_v4()`))
        .addColumn('workspace_id', 'uuid', c => c.notNull().references('workspaces.id'))
        .addColumn('assignee_id', 'uuid', c => c.notNull().references('users.id'))
        .addColumn('contact_id', 'uuid', c => c.references('contacts.id'))
        .addColumn('deal_id', 'uuid', c => c.references('deals.id'))
        .addColumn('title', 'varchar(500)', c => c.notNull())
        .addColumn('due_date', 'date')
        .addColumn('status', 'varchar(20)', c => c.notNull().defaultTo('todo'))
        .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo((0, kysely_1.sql) `now()`))
        .addColumn('updated_at', 'timestamptz', c => c.notNull().defaultTo((0, kysely_1.sql) `now()`))
        .execute();
    await db.schema
        .createTable('activities')
        .addColumn('id', 'uuid', c => c.primaryKey().defaultTo((0, kysely_1.sql) `uuid_generate_v4()`))
        .addColumn('workspace_id', 'uuid', c => c.notNull().references('workspaces.id'))
        .addColumn('user_id', 'uuid', c => c.notNull().references('users.id'))
        .addColumn('contact_id', 'uuid', c => c.references('contacts.id'))
        .addColumn('deal_id', 'uuid', c => c.references('deals.id'))
        .addColumn('type', 'varchar(30)', c => c.notNull())
        .addColumn('body', 'text')
        .addColumn('meta', 'jsonb')
        .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo((0, kysely_1.sql) `now()`))
        .execute();
    await db.schema
        .createTable('alerts')
        .addColumn('id', 'uuid', c => c.primaryKey().defaultTo((0, kysely_1.sql) `uuid_generate_v4()`))
        .addColumn('workspace_id', 'uuid', c => c.notNull().references('workspaces.id'))
        .addColumn('resource_type', 'varchar(20)', c => c.notNull())
        .addColumn('resource_id', 'uuid')
        .addColumn('severity', 'varchar(20)', c => c.notNull())
        .addColumn('message', 'varchar(500)', c => c.notNull())
        .addColumn('acknowledged', 'boolean', c => c.notNull().defaultTo(false))
        .addColumn('acknowledged_by', 'uuid', c => c.references('users.id'))
        .addColumn('resolved', 'boolean', c => c.notNull().defaultTo(false))
        .addColumn('resolved_at', 'timestamptz')
        .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo((0, kysely_1.sql) `now()`))
        .execute();
    await db.schema
        .createTable('usage_meters')
        .addColumn('id', 'uuid', c => c.primaryKey().defaultTo((0, kysely_1.sql) `uuid_generate_v4()`))
        .addColumn('workspace_id', 'uuid', c => c.notNull().references('workspaces.id'))
        .addColumn('period_start', 'date', c => c.notNull())
        .addColumn('period_end', 'date', c => c.notNull())
        .addColumn('contact_count_peak', 'integer', c => c.notNull().defaultTo(0))
        .addColumn('server_count_peak', 'integer', c => c.notNull().defaultTo(0))
        .addColumn('db_count_peak', 'integer', c => c.notNull().defaultTo(0))
        .addColumn('seat_count_peak', 'integer', c => c.notNull().defaultTo(0))
        .addColumn('base_fee', (0, kysely_1.sql) `decimal(10,2)`, c => c.notNull().defaultTo(0))
        .addColumn('overage_total', (0, kysely_1.sql) `decimal(10,2)`, c => c.notNull().defaultTo(0))
        .addColumn('total_bill', (0, kysely_1.sql) `decimal(10,2)`, c => c.notNull().defaultTo(0))
        .addColumn('stripe_invoice_id', 'varchar(255)')
        .addColumn('status', 'varchar(20)', c => c.notNull().defaultTo('pending'))
        .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo((0, kysely_1.sql) `now()`))
        .execute();
}
async function down(db) {
    const tables = [
        'usage_meters', 'alerts', 'activities', 'tasks',
        'deals', 'contacts', 'companies', 'users', 'workspaces',
    ];
    for (const table of tables) {
        await db.schema.dropTable(table).ifExists().execute();
    }
}
//# sourceMappingURL=20240101_001_initial_schema.js.map
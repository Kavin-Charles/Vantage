# Vencore Mail Plugin Design

## Overview
This document outlines the architecture and design for a complete rewrite of the `vencore-plugin-mail`. The new implementation will be a feature-packed email client with deep CRM integration and extensive customization capabilities.

We will fully utilize the `@vantage/plugin-sdk` to build a native-feeling experience within the Vantage platform.

## 1. Data Model & Manifest (`plugin.json`)

The plugin manifest will declare our tables, permissions, settings, and UI surfaces.

### Tables
*   **`mail_accounts`**: Stores SMTP/IMAP configurations, OAuth tokens, sync status (`idle`, `syncing`, `error`), and per-account settings (e.g., default signature).
*   **`mail_messages`**: Stores synced emails. Key columns include `account_id`, `message_id`, `thread_id`, `subject`, `from`, `to`, `folder`, `is_read`, and foreign keys `contact_id` / `deal_id` for CRM linking.

### Data Access Permissions
We will request the following core resource access:
*   `contacts:read`, `contacts:write` (for auto-creation)
*   `deals:read`
*   `activity:write` (to log email activity)
*   `http:fetch` (for OAuth and webhooks)
*   `storage:read`, `storage:write` (for local plugin state/preferences)

### Settings Schema
We will expose native settings via the manifest for admins to configure:
*   **Company Defaults**: Default email domains, global email signatures.
*   **Feature Flags**: Enable/disable automatic contact creation from incoming emails.
*   **Templates**: Settings for default reply templates.

### Surfaces
*   **Pages**: `/mail` (Main email client), `/mail/settings` (Account/Template configuration)
*   **Panels**: Injected into `contact` and `deal` records.
*   **Widgets**: E.g., "Unread Emails" widget for the dashboard.

## 2. Frontend Architecture (React)

The frontend will be a Single Page Application built with React, registered via `createFrontendPlugin()`.

### Core Views
1.  **Main App (`/mail`)**:
    *   **Sidebar**: Folder navigation and a prominent **Account Switcher** allowing users to jump between personal and shared/company inboxes.
    *   **List View**: Paginated list of emails for the selected folder.
    *   **Detail/Compose View**: Reading pane with rich-text reply/compose capabilities.
2.  **Settings App (`/mail/settings`)**:
    *   **User Settings**: Connect personal accounts (IMAP/OAuth).
    *   **Admin Settings**: Configure shared company accounts, define rich-text templates, manage permissions on who can send from company aliases.
3.  **Entity Panels**: Small React components that use `vantage.table('mail_messages').list(...)` to show emails related to the currently viewed Contact or Deal.

### State & SDK Integration
*   The UI will use the `VantageFrontendAPI` heavily for routing (`vantage.navigate`), notifications (`vantage.toast`), data reading (`vantage.table().list()`), and executing backend commands.

## 3. Backend & Sync Architecture

The backend will be implemented via `createPlugin()` and focuses on background synchronization, template hydration, and CRM hooks.

### Background Sync
*   **Cron Jobs**: We will register a cron job (`vantage.cron.register`) to poll active accounts for new messages.
*   **IMAP Fetching**: Use a library like `node-imap` to fetch headers and snippets, upserting them into the `mail_messages` table via `vantage.table().upsert()`.

### CRM Integration
*   **Auto-Linking**: During sync, the backend will query `vantage.list('contacts', { email: ... })` to automatically link emails to existing contacts.
*   **Activity Logging**: When an email is sent from the plugin, the backend will call `vantage.create('activity', ...)` to log the interaction on the contact's timeline.

### Sending & Templates
*   The backend will expose custom commands (or intercept bus events) for sending emails.
*   It will fetch the selected template, hydrate it with contact data (e.g., replacing `{{contact.name}}`), and dispatch it via SMTP using the appropriate `mail_account` credentials.

## Future Considerations
*   Migrating from polling (Cron) to Push (Webhooks) for providers that support it (e.g., Gmail Pub/Sub) to reduce latency and server load.
*   Rich text template builder UI in the settings page.

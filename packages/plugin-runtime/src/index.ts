export { checkPermission, pluginPermissionKey, isPluginPermissionKey, parsePluginPermissionKey, PLUGIN_PERMISSION_PREFIX } from './permissions';
export { dispatchBridgeCall } from './bridge-router';
export type { BridgeContext } from './bridge-router';
export { bridgeRegistry } from './bridge-registry';
export type { BridgeHandlerDef, BridgeHandlerFn } from './bridge-registry';
export { pluginEventBus, PluginEventBus } from './bus';
export { slugify, physicalTableName, dispatchTableCall } from './table-client';
export { runMigrations, dropPluginTables, ensureMigrationLog } from './migration-runner';

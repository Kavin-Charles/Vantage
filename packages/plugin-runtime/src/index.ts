export { checkPermission, pluginPermissionKey, isPluginPermissionKey, parsePluginPermissionKey, PLUGIN_PERMISSION_PREFIX } from './permissions';
export { dispatchBridgeCall } from './bridge-router';
export type { BridgeContext } from './bridge-router';
export { bridgeRegistry } from './bridge-registry';
export type { BridgeHandlerDef, BridgeHandlerFn } from './bridge-registry';
export { pluginEventBus, PluginEventBus } from './bus';
export { slugify, physicalTableName, dispatchTableCall } from './table-client';
export { runMigrations, dropPluginTables, ensureMigrationLog } from './migration-runner';
export {
  getContract, isKnownContract, listContracts, validateRecords,
  CONTRACT_ID_RE, crmContactV1, crmCompanyV1, crmDealV1, crmActivityV1,
} from './contracts';
export type { ContractDef, ContractViolation } from './contracts';
export { registerHubBridgeMethods, removeProviderHubData, hasHubPermission, HUB_LIMITS } from './hub';

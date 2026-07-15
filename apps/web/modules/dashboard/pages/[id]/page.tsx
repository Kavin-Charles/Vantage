'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { useDashboardWidgets } from '@/modules/shared/contexts/PluginRuntimeContext';
import {
  getDashboard,
  listDashboards,
  createDashboard,
  renameDashboard,
  deleteDashboard,
  saveLayout,
  assignGroups,
  type DashboardSummary,
  type LayoutWidget,
  type SaveLayoutWidget,
} from '../../lib/dashboard-api';
import { DashboardHeader } from '../../components/DashboardHeader';
import { DashboardGrid } from '../../components/DashboardGrid';
import { WidgetMarketplaceModal } from '../../components/WidgetMarketplaceModal';
import { GroupAssignModal } from '../../components/GroupAssignModal';
import { DashboardTabs } from '../../components/DashboardTabs';
import { CreateDashboardModal } from '../../components/CreateDashboardModal';
import type { DashboardWidgetDef, WidgetConfig } from '@/modules/shared/lib/dashboard-registry';
import '@/modules/shared/lib/register-all-widgets';
import { Icon } from '@/modules/shared/components/ui/Icon';
import { ContextMenu, useContextMenu, type ContextMenuItem } from '@/modules/shared/components/ui/ContextMenu';
import { useConfirm } from '@/modules/shared/components/ui/ConfirmDialog';

interface Props {
  dashboardId: string;
}

export function DashboardPage({ dashboardId }: Props) {
  const getToken = useApiToken();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pluginWidgets = useDashboardWidgets();
  const isAdmin = user?.role === 'admin';

  const [isEditMode, setIsEditMode] = useState(false);
  const [pendingLayout, setPendingLayout] = useState<LayoutWidget[] | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showAddWidget, setShowAddWidget] = useState(false);
  const [showGroupAssign, setShowGroupAssign] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();
  const { ask: askConfirm, el: confirmEl } = useConfirm();

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['dashboard', dashboardId],
    queryFn: async () => getDashboard(dashboardId, await getToken()),
  });

  const { data: allDashboards = [] } = useQuery({
    queryKey: ['dashboards'],
    queryFn: async () => listDashboards(await getToken()),
  });

  const currentLayout = pendingLayout ?? dashboard?.layout ?? [];
  const currentWidgetIds = new Set(currentLayout.map(r => r.widget_id));

  const configSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layoutRowsRef = useRef(currentLayout);
  useEffect(() => { layoutRowsRef.current = currentLayout; }, [currentLayout]);

  function handleConfigChange(widgetId: string, config: WidgetConfig) {
    setPendingLayout(prev =>
      (prev ?? currentLayout).map(r => r.widget_id === widgetId ? { ...r, config } : r)
    );
    if (configSaveTimer.current) clearTimeout(configSaveTimer.current);
    configSaveTimer.current = setTimeout(async () => {
      const token = await getToken();
      const rows = layoutRowsRef.current;
      await saveLayout(dashboardId, rows.map(r => ({
        widget_id: r.widget_id, x: r.x, y: r.y, w: r.w, h: r.h,
        min_w: r.min_w, min_h: r.min_h, permission_key: r.permission_key,
        config: r.config,
      })), token);
    }, 800);
  }

  function handleToggleEdit() {
    setIsEditMode(true);
    setPendingLayout(dashboard?.layout ?? []);
  }

  function handleCancel() {
    setIsEditMode(false);
    setPendingLayout(null);
  }

  async function handleSave() {
    if (!pendingLayout) return;
    setIsSaving(true);
    try {
      const token = await getToken();
      const widgets: SaveLayoutWidget[] = pendingLayout.map(r => ({
        widget_id: r.widget_id,
        x: r.x,
        y: r.y,
        w: r.w,
        h: r.h,
        min_w: r.min_w,
        min_h: r.min_h,
        permission_key: r.permission_key,
        config: r.config,
      }));
      await saveLayout(dashboardId, widgets, token);
      await queryClient.invalidateQueries({ queryKey: ['dashboard', dashboardId] });
      setIsEditMode(false);
      setPendingLayout(null);
    } finally {
      setIsSaving(false);
    }
  }

  function handleAddWidget(def: DashboardWidgetDef) {
    const newRow: LayoutWidget = {
      id: '',
      dashboard_id: dashboardId,
      widget_id: def.id,
      x: 0,
      y: Infinity,
      w: def.defaultW,
      h: def.defaultH,
      min_w: def.minW ?? null,
      min_h: def.minH ?? null,
      permission_key: def.permission ?? null,
      config: {},
    };
    setPendingLayout(prev => [...(prev ?? currentLayout), newRow]);
    setShowAddWidget(false);
  }

  function handleRemoveWidget(widgetId: string) {
    setPendingLayout(prev => (prev ?? currentLayout).filter(r => r.widget_id !== widgetId));
  }

  async function handleGroupSave(groupIds: string[]) {
    const token = await getToken();
    await assignGroups(dashboardId, groupIds, token);
    await queryClient.invalidateQueries({ queryKey: ['dashboard', dashboardId] });
  }

  async function handleRenameDashboard(id: string, name: string) {
    const token = await getToken();
    await renameDashboard(id, name, token);
    await queryClient.invalidateQueries({ queryKey: ['dashboards'] });
    if (id === dashboardId) await queryClient.invalidateQueries({ queryKey: ['dashboard', dashboardId] });
  }

  async function handleDuplicateDashboard(source: DashboardSummary) {
    const token = await getToken();
    const detail = await getDashboard(source.id, token);
    const created = await createDashboard(`${source.name} (copy)`, token);
    if (detail.layout.length > 0) {
      await saveLayout(created.id, detail.layout.map(r => ({
        widget_id: r.widget_id, x: r.x, y: r.y, w: r.w, h: r.h,
        min_w: r.min_w, min_h: r.min_h, permission_key: r.permission_key,
      })), token);
    }
    await queryClient.invalidateQueries({ queryKey: ['dashboards'] });
    router.push(`/dashboard/${created.id}`);
  }

  function handleDeleteDashboard(target: DashboardSummary) {
    askConfirm({
      title: 'Delete dashboard',
      message: `Delete "${target.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        const token = await getToken();
        await deleteDashboard(target.id, token);
        await queryClient.invalidateQueries({ queryKey: ['dashboards'] });
        if (target.id === dashboardId) {
          const remaining = allDashboards.filter(d => d.id !== target.id);
          router.push(remaining[0] ? `/dashboard/${remaining[0].id}` : '/dashboard');
        }
      },
    });
  }

  function handleCanvasContextMenu(e: React.MouseEvent) {
    const items: ContextMenuItem[] = [
      { icon: 'refresh', label: 'Refresh', onClick: () => void queryClient.invalidateQueries({ queryKey: ['dashboard', dashboardId] }) },
      { icon: 'plugin', label: 'Add widget', onClick: () => setShowAddWidget(true) },
      { type: 'separator' },
      { icon: 'edit', label: isEditMode ? 'Exit edit layout' : 'Edit layout', onClick: () => (isEditMode ? handleCancel() : handleToggleEdit()) },
      { icon: 'convert', label: 'Reset layout', disabled: !isEditMode, onClick: () => setPendingLayout(dashboard?.layout ?? []) },
      { type: 'separator' },
      { icon: 'settings', label: 'Dashboard settings', onClick: () => setShowGroupAssign(true) },
    ];
    openMenu(e, items);
  }

  if (isLoading || !dashboard) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 28px 16px' }}>
          <div className="skeleton" style={{ width: 180, height: 26 }} />
        </div>
        <div style={{ flex: 1, padding: '8px 20px 24px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div key={i} className="skeleton" style={{ height: 160 }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <DashboardHeader
        name={dashboard.name}
        isAdmin={isAdmin ?? false}
        isEditMode={isEditMode}
        onToggleEdit={handleToggleEdit}
        onSave={handleSave}
        onCancel={handleCancel}
        onOpenGroupAssign={() => setShowGroupAssign(true)}
        onAddWidget={() => setShowAddWidget(true)}
        onCreateNew={() => setShowCreate(true)}
        isSaving={isSaving}
      />

      <DashboardTabs
        dashboards={allDashboards}
        currentId={dashboardId}
        onRename={handleRenameDashboard}
        onDuplicate={handleDuplicateDashboard}
        onDelete={handleDeleteDashboard}
      />

      <div onContextMenu={handleCanvasContextMenu} style={{ flex: 1, overflowY: 'auto', padding: '8px 20px 24px' }}>
        {isEditMode && currentLayout.length === 0 && (
          <div
            className="fade-in"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              height: 200,
              border: '2px dashed var(--border)',
              borderRadius: 12,
              color: 'var(--text3)',
              fontSize: 14,
            }}
          >
            <Icon name="dashboard" size={28} color="var(--text3)" />
            Click &ldquo;+ Add Widget&rdquo; to add your first widget.
          </div>
        )}
        <DashboardGrid
          layoutRows={currentLayout}
          isEditMode={isEditMode}
          pluginWidgets={pluginWidgets}
          onLayoutChange={rows => setPendingLayout(rows)}
          onConfigChange={handleConfigChange}
          onRemoveWidget={handleRemoveWidget}
        />
      </div>

      <WidgetMarketplaceModal
        open={showAddWidget}
        onClose={() => setShowAddWidget(false)}
        currentWidgetIds={currentWidgetIds}
        pluginWidgets={pluginWidgets}
        onAdd={handleAddWidget}
      />

      <GroupAssignModal
        open={showGroupAssign}
        onClose={() => setShowGroupAssign(false)}
        currentGroupIds={dashboard.group_ids}
        onSave={handleGroupSave}
      />

      <CreateDashboardModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={async name => {
          const token = await getToken();
          const d = await createDashboard(name, token);
          await queryClient.invalidateQueries({ queryKey: ['dashboards'] });
          router.push(`/dashboard/${d.id}`);
        }}
      />
      <ContextMenu menu={menu} onClose={closeMenu} />
      {confirmEl}
    </div>
  );
}

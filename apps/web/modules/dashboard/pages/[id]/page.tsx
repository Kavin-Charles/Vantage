'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { useDashboardWidgets } from '@/modules/shared/contexts/PluginRuntimeContext';
import {
  getDashboard,
  listDashboards,
  createDashboard,
  saveLayout,
  assignGroups,
  type LayoutWidget,
  type SaveLayoutWidget,
} from '../../lib/dashboard-api';
import { DashboardHeader } from '../../components/DashboardHeader';
import { DashboardGrid } from '../../components/DashboardGrid';
import { AddWidgetPanel } from '../../components/AddWidgetPanel';
import { GroupAssignModal } from '../../components/GroupAssignModal';
import { DashboardTabs } from '../../components/DashboardTabs';
import { CreateDashboardModal } from '../../components/CreateDashboardModal';
import type { DashboardWidgetDef } from '@/modules/shared/lib/dashboard-registry';

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

  if (isLoading || !dashboard) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)' }}>
        Loading…
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
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px 24px' }}>
        {isEditMode && currentLayout.length === 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: 200,
              border: '2px dashed var(--border)',
              borderRadius: 12,
              color: 'var(--text3)',
              fontSize: 14,
            }}
          >
            Click &ldquo;+ Add Widget&rdquo; to add your first widget.
          </div>
        )}
        <DashboardGrid
          layoutRows={currentLayout}
          isEditMode={isEditMode}
          pluginWidgets={pluginWidgets}
          onLayoutChange={rows => setPendingLayout(rows)}
          onRemoveWidget={handleRemoveWidget}
        />
      </div>

      <AddWidgetPanel
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
    </div>
  );
}

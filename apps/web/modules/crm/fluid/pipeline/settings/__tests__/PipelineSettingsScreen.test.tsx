/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider } from 'react-redux';
import { PipelineSettingsScreen } from '@/modules/crm/fluid/pipeline/settings/PipelineSettingsScreen';
import { AuthProvider } from '@/modules/shared/lib/AuthContext';
import type { AuthUser } from '@/store/auth-slice';
import type { Pipeline } from '@/modules/crm/pipeline/lib/pipelines';

vi.mock('@/modules/crm/pipeline/lib/pipelines', () => ({
  getPipeline: vi.fn(),
  updatePipeline: vi.fn(),
  createStage: vi.fn(),
  updateStage: vi.fn(),
  deleteStage: vi.fn(),
  reorderStages: vi.fn(),
  createField: vi.fn(),
  updateField: vi.fn(),
  deleteField: vi.fn(),
  reorderFields: vi.fn(),
}));

import { getPipeline } from '@/modules/crm/pipeline/lib/pipelines';

const mockPipeline: Pipeline = {
  id: 'pipe-1',
  workspace_id: 'ws-1',
  name: 'Sales',
  description: null,
  is_default: true,
  position: 0,
  stages: [
    { id: 's1', pipeline_id: 'pipe-1', name: 'Lead', color: '#6366f1', is_won: false, is_lost: false, position: 0 },
    { id: 's2', pipeline_id: 'pipe-1', name: 'Qualified', color: '#0ea5e9', is_won: false, is_lost: false, position: 1 },
  ],
  fields: [],
};

const configUser: AuthUser = {
  id: 'user-1', name: 'Config User', email: 'config@example.com',
  isAdmin: false, permissions: ['pipelines:config'], theme: 'light',
};

const noPermissionUser: AuthUser = {
  id: 'user-2', name: 'No Permission User', email: 'noperm@example.com',
  isAdmin: false, permissions: [], theme: 'light',
};

// Minimal store matching RootState's shape (just the `auth` slice consumed
// by useApiToken and AuthContext) — avoids pulling in the real auth-slice,
// whose token initializer reaches for `localStorage` at module-eval time.
function createTestStore(user: AuthUser | null) {
  return configureStore({
    reducer: {
      auth: (state = { token: 'test-token', user }) => state,
    },
  });
}

function renderWithProviders(children: React.ReactNode, user: AuthUser | null = configUser) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <Provider store={createTestStore(user)}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    </Provider>,
  );
}

describe('PipelineSettingsScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders both stage names and an add-stage control', async () => {
    vi.mocked(getPipeline).mockResolvedValue(mockPipeline);

    renderWithProviders(<PipelineSettingsScreen pipelineId="pipe-1" />);

    expect(await screen.findByText('Lead')).toBeTruthy();
    expect(screen.getByText('Qualified')).toBeTruthy();
    expect(screen.getByPlaceholderText('Stage name')).toBeTruthy();
  });

  it('renders an access-restricted empty state for a user without pipelines:config', async () => {
    vi.mocked(getPipeline).mockResolvedValue(mockPipeline);

    renderWithProviders(<PipelineSettingsScreen pipelineId="pipe-1" />, noPermissionUser);

    expect(await screen.findByText('Access restricted')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Stage name')).toBeNull();
    expect(getPipeline).not.toHaveBeenCalled();
  });
});

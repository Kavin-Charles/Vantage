/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider } from 'react-redux';
import { PipelineSettingsScreen } from '@/modules/crm/fluid/pipeline/settings/PipelineSettingsScreen';
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

// Minimal store matching RootState's shape (just the `auth` slice consumed
// by useApiToken) — avoids pulling in the real auth-slice, whose token
// initializer reaches for `localStorage` at module-eval time.
function createTestStore() {
  return configureStore({
    reducer: {
      auth: (state = { token: 'test-token', user: null }) => state,
    },
  });
}

function renderWithProviders(children: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <Provider store={createTestStore()}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </Provider>,
  );
}

describe('PipelineSettingsScreen', () => {
  it('renders both stage names and an add-stage control', async () => {
    vi.mocked(getPipeline).mockResolvedValue(mockPipeline);

    renderWithProviders(<PipelineSettingsScreen pipelineId="pipe-1" />);

    expect(await screen.findByText('Lead')).toBeTruthy();
    expect(screen.getByText('Qualified')).toBeTruthy();
    expect(screen.getByPlaceholderText('Stage name')).toBeTruthy();
  });
});

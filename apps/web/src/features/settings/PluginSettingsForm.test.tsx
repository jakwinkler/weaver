// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PluginSettingsForm, type PluginSettingsSchema } from './PluginSettingsForm';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverStub);

afterEach(cleanup);

const schema: PluginSettingsSchema = {
  displayName: {
    type: 'string',
    label: 'Display name',
    required: true,
    description: 'Shown to teammates',
  },
  refreshInterval: {
    type: 'number',
    label: 'Refresh interval',
    default: 15,
  },
  enabled: {
    type: 'boolean',
    label: 'Enabled',
    default: true,
  },
  provider: {
    type: 'select',
    label: 'Provider',
    options: ['github', 'gitlab'],
    default: 'github',
  },
  notes: {
    type: 'textarea',
    label: 'Notes',
  },
};

describe('PluginSettingsForm', () => {
  it('renders every supported field type with labels, descriptions, and defaults', () => {
    render(<PluginSettingsForm schema={schema} values={{}} onSubmit={vi.fn()} />);

    expect(screen.getByLabelText('Display name')).toBeInTheDocument();
    expect(screen.getByText('Shown to teammates')).toBeInTheDocument();
    expect(screen.getByLabelText('Refresh interval')).toHaveValue(15);
    expect(screen.getByRole('switch', { name: 'Enabled' })).toBeChecked();
    expect(screen.getByRole('combobox', { name: 'Provider' })).toHaveTextContent('github');
    expect(screen.getByLabelText('Notes')).toBeInstanceOf(HTMLTextAreaElement);
  });

  it('shows required errors inline and does not submit invalid values', () => {
    const onSubmit = vi.fn();
    render(<PluginSettingsForm schema={schema} values={{}} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(screen.getByText('Display name is required')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('coerces number fields and submits typed settings', () => {
    const onSubmit = vi.fn();
    render(
      <PluginSettingsForm
        schema={schema}
        values={{ displayName: 'Repository links' }}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText('Refresh interval'), {
      target: { value: '30' },
    });
    fireEvent.click(screen.getByRole('switch', { name: 'Enabled' }));
    fireEvent.submit(screen.getByRole('form', { name: 'Plugin settings' }));

    expect(onSubmit).toHaveBeenCalledWith({
      displayName: 'Repository links',
      refreshInterval: 30,
      enabled: false,
      provider: 'github',
      notes: '',
    });
  });

  it('masks secret-like string fields', () => {
    render(
      <PluginSettingsForm
        schema={{ apiToken: { type: 'string', label: 'API token' } }}
        values={{ apiToken: 'sensitive-value' }}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('API token')).toHaveAttribute('type', 'password');
  });
});

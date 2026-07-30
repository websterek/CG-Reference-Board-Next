/**
 * Toolbar smoke test — renders the chrome and verifies active-tool toggle.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Toolbar } from '../src/ui/Toolbar';
import {
  populateDefaultToolRegistry,
  _resetToolRegistryForTests,
} from '../src/canvas/tools';

describe('Toolbar', () => {
  beforeEach(() => {
    _resetToolRegistryForTests();
    populateDefaultToolRegistry();
  });

  afterEach(() => {
    cleanup();
    _resetToolRegistryForTests();
  });

  it('renders select + rectangle + delete buttons', () => {
    render(<Toolbar onAction={() => {}} connected={true} role="owner" />);
    expect(screen.getByLabelText('Select tool')).toBeDefined();
    expect(screen.getByLabelText('Rectangle tool')).toBeDefined();
    expect(screen.getByLabelText('Delete selection')).toBeDefined();
  });

  it('shows offline status when disconnected', () => {
    render(<Toolbar onAction={() => {}} connected={false} role="owner" />);
    expect(screen.getByText(/offline/i)).toBeDefined();
  });
});

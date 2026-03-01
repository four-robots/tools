/**
 * SSR Safety Tests
 *
 * Tests that whiteboard utility functions handle server-side rendering
 * gracefully by checking for document/window availability.
 */

describe('SSR Safety - canvas-export', () => {
  const originalDocument = globalThis.document;

  afterEach(() => {
    // Restore document
    Object.defineProperty(globalThis, 'document', {
      value: originalDocument,
      writable: true,
      configurable: true,
    });
  });

  it('should return error when document is undefined during SSR', async () => {
    // Simulate SSR environment
    const savedDoc = globalThis.document;
    // @ts-ignore - simulating SSR
    delete globalThis.document;

    // Dynamic import to get fresh module
    const mod = await import('../../utils/canvas-export');

    const result = await mod.exportAsPng({ getSvg: async () => '<svg></svg>' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('server-side rendering');

    // Restore
    Object.defineProperty(globalThis, 'document', {
      value: savedDoc,
      writable: true,
      configurable: true,
    });
  });
});

describe('SSR Safety - workspace-theming', () => {
  it('should not throw when document is undefined during SSR', () => {
    const savedDoc = globalThis.document;
    // @ts-ignore - simulating SSR
    delete globalThis.document;

    const { applyWorkspaceTheme } = require('../../utils/workspace-theming');

    // Should not throw even without document
    expect(() => {
      applyWorkspaceTheme({
        primaryColor: '#000',
        backgroundColor: '#fff',
        textColor: '#333',
        borderColor: '#ccc',
        accentColor: '#0f0',
        isDark: false,
      });
    }).not.toThrow();

    // Restore
    Object.defineProperty(globalThis, 'document', {
      value: savedDoc,
      writable: true,
      configurable: true,
    });
  });

  it('should return correct theme from getWorkspaceTheme without settings', () => {
    const { getWorkspaceTheme, defaultWorkspaceTheme } = require('../../utils/workspace-theming');

    expect(getWorkspaceTheme()).toEqual(defaultWorkspaceTheme);
    expect(getWorkspaceTheme(null)).toEqual(defaultWorkspaceTheme);
    expect(getWorkspaceTheme({})).toEqual(defaultWorkspaceTheme);
  });
});

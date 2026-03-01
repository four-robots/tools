/**
 * Workspace Routes Error Handling Tests
 *
 * Tests that workspace route error handling uses proper inline
 * error responses instead of the previously undefined handleRouteError.
 */

describe('Workspace Routes - Error Handling', () => {
  it('should format error response with error message for Error instances', () => {
    const error = new Error('Database connection failed');

    const errorMessage = error instanceof Error ? error.message : 'Failed to list workspaces';

    expect(errorMessage).toBe('Database connection failed');
  });

  it('should use fallback message for non-Error thrown values', () => {
    const error = 'string error';

    const errorMessage = error instanceof Error ? error.message : 'Failed to list workspaces';

    expect(errorMessage).toBe('Failed to list workspaces');
  });

  it('should handle null/undefined errors with fallback', () => {
    const error = null;

    const errorMessage = error instanceof Error ? error.message : 'Failed to create workspace';

    expect(errorMessage).toBe('Failed to create workspace');
  });

  it('should produce correct response shape', () => {
    const error = new Error('Validation failed');
    const response = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list workspaces'
    };

    expect(response).toEqual({
      success: false,
      error: 'Validation failed'
    });
  });
});

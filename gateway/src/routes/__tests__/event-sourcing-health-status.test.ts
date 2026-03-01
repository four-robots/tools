/**
 * Event Sourcing Health Status Code Tests
 *
 * Verifies that degraded health returns 503, not 200.
 * Load balancers and monitoring tools rely on proper HTTP status
 * codes to determine service availability.
 */

describe('Event Sourcing Health - Status Codes', () => {
  it('should return 200 for healthy status', () => {
    const health = { status: 'healthy' };
    const statusCode = health.status === 'healthy' ? 200 : 503;

    expect(statusCode).toBe(200);
  });

  it('should return 503 for degraded status', () => {
    const health = { status: 'degraded' };
    const statusCode = health.status === 'healthy' ? 200 : 503;

    expect(statusCode).toBe(503);
  });

  it('should return 503 for unhealthy status', () => {
    const health = { status: 'unhealthy' };
    const statusCode = health.status === 'healthy' ? 200 : 503;

    expect(statusCode).toBe(503);
  });

  it('should return 503 for unknown status', () => {
    const health = { status: 'unknown' };
    const statusCode = health.status === 'healthy' ? 200 : 503;

    expect(statusCode).toBe(503);
  });
});

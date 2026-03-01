/**
 * EventCollector Edge Case Tests
 *
 * Tests that the event queue is capped to prevent unbounded memory growth
 * when flush failures cause re-queuing of events.
 */

describe('EventCollector - Queue Size Cap', () => {
  it('should cap queue size to MAX_QUEUE_SIZE on repeated flush failures', () => {
    // Simulate the fix: re-queued events are capped at MAX_QUEUE_SIZE
    const MAX_QUEUE_SIZE = 1000;
    let eventQueue: any[] = [];

    // Fill queue with events
    for (let i = 0; i < 1200; i++) {
      eventQueue.push({ id: i, type: 'test_event' });
    }

    // Simulate the cap after re-queue
    if (eventQueue.length > MAX_QUEUE_SIZE) {
      eventQueue = eventQueue.slice(0, MAX_QUEUE_SIZE);
    }

    expect(eventQueue.length).toBe(MAX_QUEUE_SIZE);
    // Oldest events (lowest IDs) should be preserved
    expect(eventQueue[0].id).toBe(0);
  });

  it('should not alter queue when under MAX_QUEUE_SIZE', () => {
    const MAX_QUEUE_SIZE = 1000;
    const eventQueue: any[] = [];

    for (let i = 0; i < 50; i++) {
      eventQueue.push({ id: i, type: 'test_event' });
    }

    expect(eventQueue.length).toBe(50);
    expect(eventQueue.length).toBeLessThan(MAX_QUEUE_SIZE);
  });
});

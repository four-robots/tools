/**
 * Tests verifying .sort() does not mutate input arrays.
 *
 * Bug: Array.sort() mutates the array in-place. When sorting function
 * parameters or shared data structures, the caller's array is unexpectedly
 * reordered.
 *
 * Fix: Use [...array].sort() to create a copy before sorting.
 */

describe('sort mutation safety', () => {
  it('should not mutate the original array when sorting a copy', () => {
    const original = [3, 1, 4, 1, 5, 9, 2, 6];
    const originalSnapshot = [...original];

    // This is the safe pattern: spread then sort
    const sorted = [...original].sort((a, b) => a - b);

    // Original should be unchanged
    expect(original).toEqual(originalSnapshot);

    // Sorted should be in order
    expect(sorted).toEqual([1, 1, 2, 3, 4, 5, 6, 9]);
  });

  it('demonstrates the mutation bug with direct .sort()', () => {
    const original = [3, 1, 4, 1, 5];
    const originalSnapshot = [...original];

    // Direct sort mutates the original — this is the bug pattern
    original.sort((a, b) => a - b);

    // Original IS mutated (this is the bug we're preventing)
    expect(original).not.toEqual(originalSnapshot);
    expect(original).toEqual([1, 1, 3, 4, 5]);
  });

  it('should correctly resolve last-write-wins without mutating operations', () => {
    const operations = [
      { id: 'op1', timestamp: '2025-01-01T10:00:00Z', type: 'update' },
      { id: 'op3', timestamp: '2025-01-01T12:00:00Z', type: 'update' },
      { id: 'op2', timestamp: '2025-01-01T11:00:00Z', type: 'update' },
    ];
    const originalOrder = operations.map(op => op.id);

    // Safe pattern: copy before sort
    const winner = [...operations].sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )[0];

    // Winner should be the most recent operation
    expect(winner.id).toBe('op3');

    // Original order should be preserved
    expect(operations.map(op => op.id)).toEqual(originalOrder);
  });
});

describe('regex /g flag for multiple matches', () => {
  it('should process all @mentions with /g flag', () => {
    const content = 'Hello @alice and @bob, meet @charlie';

    // Without /g — only first match
    const withoutG = content.replace(/@([a-zA-Z]+)/, '[$1]');
    expect(withoutG).toBe('Hello [alice] and @bob, meet @charlie');

    // With /g — all matches
    const withG = content.replace(/@([a-zA-Z]+)/g, '[$1]');
    expect(withG).toBe('Hello [alice] and [bob], meet [charlie]');
  });

  it('should sanitize all mentions, not just the first', () => {
    const content = '@user1 said hi to @user2';
    const mentions: string[] = [];

    content.replace(/@([a-zA-Z0-9._-]+)/g, (match, username) => {
      mentions.push(username);
      return match;
    });

    expect(mentions).toEqual(['user1', 'user2']);
  });
});

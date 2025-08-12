/**
 * Tests for sanitization utilities
 */

import { 
  sanitizeForDisplay, 
  sanitizeMetadata, 
  formatMetadataEntries,
  sanitizeStringArray,
  formatKeyValue 
} from '../sanitize';

describe('sanitizeForDisplay', () => {
  it('should escape HTML characters', () => {
    const maliciousInput = '<script>alert("XSS")</script>';
    const sanitized = sanitizeForDisplay(maliciousInput);
    expect(sanitized).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;&#x2F;script&gt;');
  });

  it('should handle null and undefined', () => {
    expect(sanitizeForDisplay(null)).toBe('');
    expect(sanitizeForDisplay(undefined)).toBe('');
  });

  it('should limit string length', () => {
    const longString = 'a'.repeat(300);
    const sanitized = sanitizeForDisplay(longString);
    expect(sanitized.length).toBe(200);
  });

  it('should escape all dangerous characters', () => {
    const dangerous = '&<>"\'\/';
    const sanitized = sanitizeForDisplay(dangerous);
    expect(sanitized).toBe('&amp;&lt;&gt;&quot;&#x27;&#x2F;');
  });
});

describe('sanitizeMetadata', () => {
  it('should sanitize object values', () => {
    const metadata = {
      normalKey: 'normalValue',
      '<script>': 'alert("xss")',
      'key': '<img src=x onerror=alert(1)>',
    };
    
    const sanitized = sanitizeMetadata(metadata);
    expect(sanitized['normalKey']).toBe('normalValue');
    expect(sanitized['&lt;script&gt;']).toBe('alert(&quot;xss&quot;)');
    expect(sanitized['key']).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('should limit number of entries', () => {
    const metadata: Record<string, string> = {};
    for (let i = 0; i < 20; i++) {
      metadata[`key${i}`] = `value${i}`;
    }
    
    const sanitized = sanitizeMetadata(metadata);
    expect(Object.keys(sanitized).length).toBe(10);
  });

  it('should handle null and undefined', () => {
    expect(sanitizeMetadata(null)).toEqual({});
    expect(sanitizeMetadata(undefined)).toEqual({});
    expect(sanitizeMetadata({} as any)).toEqual({});
  });
});

describe('formatMetadataEntries', () => {
  it('should format and sanitize metadata entries', () => {
    const metadata = {
      'tool': 'pen',
      'color': '<script>alert("xss")</script>',
    };
    
    const formatted = formatMetadataEntries(metadata, 2, ' • ');
    expect(formatted).toContain('tool: pen');
    expect(formatted).toContain('script');
    expect(formatted).not.toContain('<script>');
  });

  it('should limit entries and join with separator', () => {
    const metadata = {
      'key1': 'value1',
      'key2': 'value2', 
      'key3': 'value3',
    };
    
    const formatted = formatMetadataEntries(metadata, 2, ' | ');
    expect(formatted).toBe('key1: value1 | key2: value2');
  });
});

describe('sanitizeStringArray', () => {
  it('should sanitize array items', () => {
    const items = ['normal', '<script>alert(1)</script>', 'safe'];
    const sanitized = sanitizeStringArray(items);
    
    expect(sanitized).toEqual([
      'normal',
      '&lt;script&gt;alert(1)&lt;&#x2F;script&gt;',
      'safe'
    ]);
  });

  it('should limit array length', () => {
    const items = Array.from({ length: 10 }, (_, i) => `item${i}`);
    const sanitized = sanitizeStringArray(items, 3);
    expect(sanitized.length).toBe(3);
  });

  it('should handle null and undefined', () => {
    expect(sanitizeStringArray(null)).toEqual([]);
    expect(sanitizeStringArray(undefined)).toEqual([]);
    expect(sanitizeStringArray([])).toEqual([]);
  });
});

describe('formatKeyValue', () => {
  it('should format and sanitize key-value pairs', () => {
    const formatted = formatKeyValue('<script>', 'alert("xss")');
    expect(formatted).toBe('&lt;script&gt;: alert(&quot;xss&quot;)');
  });

  it('should return empty string for invalid input', () => {
    expect(formatKeyValue('', 'value')).toBe('');
    expect(formatKeyValue('key', '')).toBe('');
    expect(formatKeyValue('', '')).toBe('');
  });
});
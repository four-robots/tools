/**
 * Tests for decodeURIComponent safety patterns.
 *
 * Bug: `decodeURIComponent(str)` throws a URIError when the input
 * contains malformed percent-encoding (e.g., `%ZZ`, trailing `%`).
 * Without try/catch, this crashes the MCP resource handler.
 *
 * Fix: Wrap decodeURIComponent in try/catch with descriptive error.
 */

describe('decodeURIComponent safety', () => {
  describe('malformed percent-encoding throws URIError', () => {
    it('should throw on incomplete percent-encoding', () => {
      expect(() => decodeURIComponent('%')).toThrow(URIError);
      expect(() => decodeURIComponent('%2')).toThrow(URIError);
      expect(() => decodeURIComponent('hello%')).toThrow(URIError);
    });

    it('should throw on invalid hex digits', () => {
      expect(() => decodeURIComponent('%ZZ')).toThrow(URIError);
      expect(() => decodeURIComponent('%GG')).toThrow(URIError);
      expect(() => decodeURIComponent('test%XY')).toThrow(URIError);
    });

    it('should throw on malformed UTF-8 sequences', () => {
      // %C0 is an overlong UTF-8 encoding — invalid
      expect(() => decodeURIComponent('%C0%AF')).toThrow(URIError);
    });
  });

  describe('safe decodeURIComponent wrapper pattern', () => {
    const safeDecodeURI = (encoded: string): string | null => {
      try {
        return decodeURIComponent(encoded);
      } catch {
        return null;
      }
    };

    it('should decode valid percent-encoding', () => {
      expect(safeDecodeURI('hello%20world')).toBe('hello world');
      expect(safeDecodeURI('%E2%9C%93')).toBe('✓');
      expect(safeDecodeURI('normal-text')).toBe('normal-text');
    });

    it('should return null for malformed input', () => {
      expect(safeDecodeURI('%')).toBeNull();
      expect(safeDecodeURI('%ZZ')).toBeNull();
      expect(safeDecodeURI('%C0%AF')).toBeNull();
    });
  });

  describe('MCP URI parsing with decodeURIComponent', () => {
    const parseSearchURI = (uriString: string): { query: string } | { error: string } => {
      const match = uriString.match(/memory:\/\/search\/(.+)/);
      if (!match) {
        return { error: 'Invalid search URI format' };
      }

      let query: string;
      try {
        query = decodeURIComponent(match[1]);
      } catch {
        return { error: 'Invalid search URI: malformed percent-encoding' };
      }

      return { query };
    };

    it('should parse valid URIs', () => {
      const result = parseSearchURI('memory://search/hello%20world');
      expect(result).toEqual({ query: 'hello world' });
    });

    it('should parse plain-text URIs', () => {
      const result = parseSearchURI('memory://search/simple-query');
      expect(result).toEqual({ query: 'simple-query' });
    });

    it('should return error for malformed encoding', () => {
      const result = parseSearchURI('memory://search/bad%ZZquery');
      expect(result).toEqual({ error: 'Invalid search URI: malformed percent-encoding' });
    });

    it('should return error for invalid URI format', () => {
      const result = parseSearchURI('invalid://uri');
      expect(result).toEqual({ error: 'Invalid search URI format' });
    });
  });
});

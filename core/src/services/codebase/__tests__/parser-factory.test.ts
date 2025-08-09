/**
 * Parser Factory Tests
 * 
 * Tests for the parser factory including language detection,
 * parser creation, and extension mapping.
 */

import { ParserFactory } from '../parsers/parser-factory.js';
import { 
  SupportedLanguage, 
  UnsupportedLanguageError,
  LanguageParser 
} from '../../../shared/types/codebase.js';

describe('ParserFactory', () => {
  let parserFactory: ParserFactory;

  beforeEach(() => {
    parserFactory = new ParserFactory();
  });

  describe('createParser', () => {
    it('should create TypeScript parser', () => {
      const parser = parserFactory.createParser(SupportedLanguage.TYPESCRIPT);
      expect(parser).toBeDefined();
      expect(parser?.language).toBe(SupportedLanguage.TYPESCRIPT);
    });

    it('should create JavaScript parser', () => {
      const parser = parserFactory.createParser(SupportedLanguage.JAVASCRIPT);
      expect(parser).toBeDefined();
      expect(parser?.language).toBe(SupportedLanguage.TYPESCRIPT); // Uses same parser
    });

    it('should create Python parser', () => {
      const parser = parserFactory.createParser(SupportedLanguage.PYTHON);
      expect(parser).toBeDefined();
      expect(parser?.language).toBe(SupportedLanguage.PYTHON);
    });

    it('should create Java parser', () => {
      const parser = parserFactory.createParser(SupportedLanguage.JAVA);
      expect(parser).toBeDefined();
      expect(parser?.language).toBe(SupportedLanguage.JAVA);
    });

    it('should create Go parser', () => {
      const parser = parserFactory.createParser(SupportedLanguage.GO);
      expect(parser).toBeDefined();
      expect(parser?.language).toBe(SupportedLanguage.GO);
    });

    it('should create C++ parser', () => {
      const parser = parserFactory.createParser(SupportedLanguage.CPP);
      expect(parser).toBeDefined();
      expect(parser?.language).toBe(SupportedLanguage.CPP);
    });

    it('should create Rust parser', () => {
      const parser = parserFactory.createParser(SupportedLanguage.RUST);
      expect(parser).toBeDefined();
      expect(parser?.language).toBe(SupportedLanguage.RUST);
    });

    it('should throw error for unsupported language', () => {
      expect(() => {
        parserFactory.createParser('unsupported' as SupportedLanguage);
      }).toThrow(UnsupportedLanguageError);
    });
  });

  describe('detectLanguage', () => {
    describe('by file extension', () => {
      it('should detect TypeScript from .ts extension', () => {
        const language = parserFactory.detectLanguage('file.ts');
        expect(language).toBe(SupportedLanguage.TYPESCRIPT);
      });

      it('should detect TypeScript from .tsx extension', () => {
        const language = parserFactory.detectLanguage('component.tsx');
        expect(language).toBe(SupportedLanguage.TYPESCRIPT);
      });

      it('should detect TypeScript from .d.ts extension', () => {
        const language = parserFactory.detectLanguage('types.d.ts');
        expect(language).toBe(SupportedLanguage.TYPESCRIPT);
      });

      it('should detect JavaScript from .js extension', () => {
        const language = parserFactory.detectLanguage('script.js');
        expect(language).toBe(SupportedLanguage.JAVASCRIPT);
      });

      it('should detect JavaScript from .jsx extension', () => {
        const language = parserFactory.detectLanguage('component.jsx');
        expect(language).toBe(SupportedLanguage.JAVASCRIPT);
      });

      it('should detect Python from .py extension', () => {
        const language = parserFactory.detectLanguage('script.py');
        expect(language).toBe(SupportedLanguage.PYTHON);
      });

      it('should detect Java from .java extension', () => {
        const language = parserFactory.detectLanguage('Main.java');
        expect(language).toBe(SupportedLanguage.JAVA);
      });

      it('should detect Go from .go extension', () => {
        const language = parserFactory.detectLanguage('main.go');
        expect(language).toBe(SupportedLanguage.GO);
      });

      it('should detect C++ from various extensions', () => {
        expect(parserFactory.detectLanguage('main.cpp')).toBe(SupportedLanguage.CPP);
        expect(parserFactory.detectLanguage('header.hpp')).toBe(SupportedLanguage.CPP);
        expect(parserFactory.detectLanguage('source.cxx')).toBe(SupportedLanguage.CPP);
      });

      it('should detect C from .c/.h extensions', () => {
        expect(parserFactory.detectLanguage('main.c')).toBe(SupportedLanguage.C);
        expect(parserFactory.detectLanguage('header.h')).toBe(SupportedLanguage.C);
      });

      it('should detect Rust from .rs extension', () => {
        const language = parserFactory.detectLanguage('main.rs');
        expect(language).toBe(SupportedLanguage.RUST);
      });

      it('should return null for unknown extension', () => {
        const language = parserFactory.detectLanguage('file.unknown');
        expect(language).toBeNull();
      });

      it('should return null for file without extension', () => {
        const language = parserFactory.detectLanguage('README');
        expect(language).toBeNull();
      });
    });

    describe('by content patterns', () => {
      it('should detect TypeScript by interface keyword', () => {
        const content = `
          interface User {
            id: string;
            name: string;
          }
        `;
        const language = parserFactory.detectLanguage('', content);
        expect(language).toBe(SupportedLanguage.TYPESCRIPT);
      });

      it('should detect TypeScript by type alias', () => {
        const content = 'type UserId = string;';
        const language = parserFactory.detectLanguage('', content);
        expect(language).toBe(SupportedLanguage.TYPESCRIPT);
      });

      it('should detect JavaScript by function declaration', () => {
        const content = `
          function greet(name) {
            return "Hello " + name;
          }
        `;
        const language = parserFactory.detectLanguage('', content);
        expect(language).toBe(SupportedLanguage.JAVASCRIPT);
      });

      it('should detect JavaScript by const declaration', () => {
        const content = 'const message = "Hello World";';
        const language = parserFactory.detectLanguage('', content);
        expect(language).toBe(SupportedLanguage.JAVASCRIPT);
      });

      it('should detect Python by def keyword', () => {
        const content = `
          def greet(name):
              return f"Hello {name}"
        `;
        const language = parserFactory.detectLanguage('', content);
        expect(language).toBe(SupportedLanguage.PYTHON);
      });

      it('should detect Python by class keyword', () => {
        const content = `
          class User:
              def __init__(self, name):
                  self.name = name
        `;
        const language = parserFactory.detectLanguage('', content);
        expect(language).toBe(SupportedLanguage.PYTHON);
      });

      it('should detect Java by public class', () => {
        const content = `
          public class Main {
              public static void main(String[] args) {
                  System.out.println("Hello World");
              }
          }
        `;
        const language = parserFactory.detectLanguage('', content);
        expect(language).toBe(SupportedLanguage.JAVA);
      });

      it('should detect Go by package declaration', () => {
        const content = `
          package main
          
          func main() {
              fmt.Println("Hello World")
          }
        `;
        const language = parserFactory.detectLanguage('', content);
        expect(language).toBe(SupportedLanguage.GO);
      });

      it('should detect C++ by namespace usage', () => {
        const content = `
          #include <iostream>
          using namespace std;
          
          int main() {
              cout << "Hello World" << endl;
              return 0;
          }
        `;
        const language = parserFactory.detectLanguage('', content);
        expect(language).toBe(SupportedLanguage.CPP);
      });

      it('should detect C by main function', () => {
        const content = `
          #include <stdio.h>
          
          int main() {
              printf("Hello World\\n");
              return 0;
          }
        `;
        const language = parserFactory.detectLanguage('', content);
        expect(language).toBe(SupportedLanguage.C);
      });

      it('should detect Rust by fn keyword', () => {
        const content = `
          fn main() {
              println!("Hello World");
          }
        `;
        const language = parserFactory.detectLanguage('', content);
        expect(language).toBe(SupportedLanguage.RUST);
      });

      it('should return null for content without clear patterns', () => {
        const content = 'This is just plain text without any programming patterns.';
        const language = parserFactory.detectLanguage('', content);
        expect(language).toBeNull();
      });

      it('should prefer file extension over content when both available', () => {
        const jsContent = 'function test() {}';
        const language = parserFactory.detectLanguage('file.py', jsContent);
        expect(language).toBe(SupportedLanguage.PYTHON); // Extension wins
      });

      it('should use content when extension is unknown', () => {
        const pythonContent = 'def test(): pass';
        const language = parserFactory.detectLanguage('unknown_file', pythonContent);
        expect(language).toBe(SupportedLanguage.PYTHON);
      });
    });
  });

  describe('getSupportedLanguages', () => {
    it('should return all supported languages', () => {
      const languages = parserFactory.getSupportedLanguages();
      expect(languages).toContain(SupportedLanguage.TYPESCRIPT);
      expect(languages).toContain(SupportedLanguage.JAVASCRIPT);
      expect(languages).toContain(SupportedLanguage.PYTHON);
      expect(languages).toContain(SupportedLanguage.JAVA);
      expect(languages).toContain(SupportedLanguage.GO);
      expect(languages).toContain(SupportedLanguage.CPP);
      expect(languages).toContain(SupportedLanguage.C);
      expect(languages).toContain(SupportedLanguage.RUST);
    });
  });

  describe('isLanguageSupported', () => {
    it('should return true for supported languages', () => {
      expect(parserFactory.isLanguageSupported('typescript')).toBe(true);
      expect(parserFactory.isLanguageSupported('python')).toBe(true);
      expect(parserFactory.isLanguageSupported('java')).toBe(true);
    });

    it('should return false for unsupported languages', () => {
      expect(parserFactory.isLanguageSupported('php')).toBe(false);
      expect(parserFactory.isLanguageSupported('ruby')).toBe(false);
      expect(parserFactory.isLanguageSupported('swift')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(parserFactory.isLanguageSupported('TYPESCRIPT')).toBe(true);
      expect(parserFactory.isLanguageSupported('Python')).toBe(true);
    });
  });

  describe('getSupportedExtensions', () => {
    it('should return correct extensions for TypeScript', () => {
      const extensions = parserFactory.getSupportedExtensions(SupportedLanguage.TYPESCRIPT);
      expect(extensions).toContain('.ts');
      expect(extensions).toContain('.tsx');
      expect(extensions).toContain('.d.ts');
    });

    it('should return correct extensions for JavaScript', () => {
      const extensions = parserFactory.getSupportedExtensions(SupportedLanguage.JAVASCRIPT);
      expect(extensions).toContain('.js');
      expect(extensions).toContain('.jsx');
      expect(extensions).toContain('.mjs');
    });

    it('should return correct extensions for Python', () => {
      const extensions = parserFactory.getSupportedExtensions(SupportedLanguage.PYTHON);
      expect(extensions).toContain('.py');
      expect(extensions).toContain('.pyi');
    });

    it('should return correct extensions for C++', () => {
      const extensions = parserFactory.getSupportedExtensions(SupportedLanguage.CPP);
      expect(extensions).toContain('.cpp');
      expect(extensions).toContain('.hpp');
      expect(extensions).toContain('.cxx');
    });

    it('should return empty array for unsupported language', () => {
      const extensions = parserFactory.getSupportedExtensions('unsupported' as SupportedLanguage);
      expect(extensions).toEqual([]);
    });
  });

  describe('getAllSupportedExtensions', () => {
    it('should return all supported file extensions', () => {
      const extensions = parserFactory.getAllSupportedExtensions();
      expect(extensions).toContain('.ts');
      expect(extensions).toContain('.js');
      expect(extensions).toContain('.py');
      expect(extensions).toContain('.java');
      expect(extensions).toContain('.go');
      expect(extensions).toContain('.cpp');
      expect(extensions).toContain('.rs');
    });

    it('should not contain duplicates', () => {
      const extensions = parserFactory.getAllSupportedExtensions();
      const uniqueExtensions = [...new Set(extensions)];
      expect(extensions).toEqual(uniqueExtensions);
    });
  });

  describe('edge cases', () => {
    it('should handle empty filename', () => {
      const language = parserFactory.detectLanguage('');
      expect(language).toBeNull();
    });

    it('should handle empty content', () => {
      const language = parserFactory.detectLanguage('', '');
      expect(language).toBeNull();
    });

    it('should handle filename with multiple dots', () => {
      const language = parserFactory.detectLanguage('config.test.ts');
      expect(language).toBe(SupportedLanguage.TYPESCRIPT);
    });

    it('should handle special TypeScript declaration files', () => {
      const language = parserFactory.detectLanguage('types.d.ts');
      expect(language).toBe(SupportedLanguage.TYPESCRIPT);
    });

    it('should score languages correctly for mixed content', () => {
      // Content that has both JS and TS patterns but more TS
      const mixedContent = `
        interface User { id: string; }
        type UserList = User[];
        const users: UserList = [];
        function getUser() {}
      `;
      const language = parserFactory.detectLanguage('', mixedContent);
      expect(language).toBe(SupportedLanguage.TYPESCRIPT); // Should prefer TS due to more TS patterns
    });
  });
});
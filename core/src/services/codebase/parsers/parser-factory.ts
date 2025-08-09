/**
 * Parser Factory
 * 
 * Factory class for creating language-specific parsers and detecting
 * programming languages from file content and names.
 */

import { 
  SupportedLanguage, 
  LanguageParser,
  UnsupportedLanguageError 
} from '../../../shared/types/codebase.js';
import { TypeScriptParser } from './typescript-parser.js';
import { PythonParser } from './python-parser.js';
import { JavaParser } from './java-parser.js';
import { GoParser } from './go-parser.js';
import { CppParser } from './cpp-parser.js';
import { RustParser } from './rust-parser.js';

export class ParserFactory {
  private parsers = new Map<SupportedLanguage, LanguageParser>();
  private extensionToLanguage = new Map<string, SupportedLanguage>();
  private languagePatterns = new Map<SupportedLanguage, RegExp[]>();

  constructor() {
    this.initializeParsers();
    this.initializeExtensionMapping();
    this.initializeLanguagePatterns();
  }

  /**
   * Create a parser instance for the specified language
   */
  createParser(language: SupportedLanguage): LanguageParser | null {
    const parser = this.parsers.get(language);
    if (!parser) {
      throw new UnsupportedLanguageError(language);
    }
    return parser;
  }

  /**
   * Get all supported languages
   */
  getSupportedLanguages(): SupportedLanguage[] {
    return Array.from(this.parsers.keys());
  }

  /**
   * Detect language from filename and optionally content
   */
  detectLanguage(filename: string, content?: string): SupportedLanguage | null {
    // First, try detection by file extension
    const extension = this.getFileExtension(filename);
    if (extension) {
      const langFromExt = this.extensionToLanguage.get(extension.toLowerCase());
      if (langFromExt) {
        return langFromExt;
      }
    }

    // If no content provided or extension didn't match, return null
    if (!content) {
      return null;
    }

    // Try detection by content patterns
    return this.detectLanguageByContent(content);
  }

  /**
   * Check if a language is supported
   */
  isLanguageSupported(language: string): boolean {
    const normalizedLang = language.toLowerCase() as SupportedLanguage;
    return this.parsers.has(normalizedLang);
  }

  /**
   * Get supported extensions for a language
   */
  getSupportedExtensions(language: SupportedLanguage): string[] {
    const parser = this.parsers.get(language);
    return parser ? parser.supportedExtensions : [];
  }

  /**
   * Get all supported file extensions
   */
  getAllSupportedExtensions(): string[] {
    return Array.from(this.extensionToLanguage.keys());
  }

  // ===================
  // PRIVATE INITIALIZATION METHODS
  // ===================

  private initializeParsers(): void {
    try {
      // Initialize TypeScript/JavaScript parser
      this.parsers.set(SupportedLanguage.TYPESCRIPT, new TypeScriptParser());
      this.parsers.set(SupportedLanguage.JAVASCRIPT, new TypeScriptParser());

      // Initialize Python parser
      this.parsers.set(SupportedLanguage.PYTHON, new PythonParser());

      // Initialize Java parser
      this.parsers.set(SupportedLanguage.JAVA, new JavaParser());

      // Initialize Go parser
      this.parsers.set(SupportedLanguage.GO, new GoParser());

      // Initialize C/C++ parser
      this.parsers.set(SupportedLanguage.CPP, new CppParser());
      this.parsers.set(SupportedLanguage.C, new CppParser());

      // Initialize Rust parser
      this.parsers.set(SupportedLanguage.RUST, new RustParser());
    } catch (error) {
      console.warn('Some parsers failed to initialize:', error);
    }
  }

  private initializeExtensionMapping(): void {
    // TypeScript
    ['.ts', '.tsx', '.d.ts'].forEach(ext => {
      this.extensionToLanguage.set(ext, SupportedLanguage.TYPESCRIPT);
    });

    // JavaScript
    ['.js', '.jsx', '.mjs', '.cjs'].forEach(ext => {
      this.extensionToLanguage.set(ext, SupportedLanguage.JAVASCRIPT);
    });

    // Python
    ['.py', '.pyx', '.pyi', '.pyw'].forEach(ext => {
      this.extensionToLanguage.set(ext, SupportedLanguage.PYTHON);
    });

    // Java
    ['.java'].forEach(ext => {
      this.extensionToLanguage.set(ext, SupportedLanguage.JAVA);
    });

    // Go
    ['.go'].forEach(ext => {
      this.extensionToLanguage.set(ext, SupportedLanguage.GO);
    });

    // C++
    ['.cpp', '.cxx', '.cc', '.C', '.c++', '.hpp', '.hxx', '.hh', '.H', '.h++'].forEach(ext => {
      this.extensionToLanguage.set(ext, SupportedLanguage.CPP);
    });

    // C
    ['.c', '.h'].forEach(ext => {
      this.extensionToLanguage.set(ext, SupportedLanguage.C);
    });

    // Rust
    ['.rs'].forEach(ext => {
      this.extensionToLanguage.set(ext, SupportedLanguage.RUST);
    });
  }

  private initializeLanguagePatterns(): void {
    // TypeScript patterns
    this.languagePatterns.set(SupportedLanguage.TYPESCRIPT, [
      /interface\s+\w+/,
      /type\s+\w+\s*=/,
      /:\s*\w+(\[\]|\<.*\>)?/,
      /enum\s+\w+/,
      /namespace\s+\w+/,
      /declare\s+/,
      /export\s+default/,
      /import\s+.*from\s+['"].*['"]/
    ]);

    // JavaScript patterns
    this.languagePatterns.set(SupportedLanguage.JAVASCRIPT, [
      /function\s+\w+\s*\(/,
      /const\s+\w+\s*=/,
      /let\s+\w+\s*=/,
      /var\s+\w+\s*=/,
      /=>\s*[{(]/,
      /require\s*\(\s*['"].*['"]\s*\)/,
      /module\.exports\s*=/,
      /export\s+/
    ]);

    // Python patterns
    this.languagePatterns.set(SupportedLanguage.PYTHON, [
      /def\s+\w+\s*\(/,
      /class\s+\w+/,
      /import\s+\w+/,
      /from\s+\w+\s+import/,
      /if\s+__name__\s*==\s*['"]__main__['"]/,
      /print\s*\(/,
      /@\w+/,
      /:\s*$/m
    ]);

    // Java patterns
    this.languagePatterns.set(SupportedLanguage.JAVA, [
      /public\s+class\s+\w+/,
      /private\s+\w+/,
      /public\s+static\s+void\s+main/,
      /import\s+[\w.]+;/,
      /package\s+[\w.]+;/,
      /@Override/,
      /System\.out\.println/
    ]);

    // Go patterns
    this.languagePatterns.set(SupportedLanguage.GO, [
      /package\s+\w+/,
      /func\s+\w+\s*\(/,
      /import\s*\(\s*$/m,
      /type\s+\w+\s+struct/,
      /var\s+\w+\s+\w+/,
      /fmt\.Print/,
      /:=\s*/
    ]);

    // C++ patterns
    this.languagePatterns.set(SupportedLanguage.CPP, [
      /#include\s*<.*>/,
      /using\s+namespace\s+std;?/,
      /std::/,
      /class\s+\w+/,
      /template\s*<.*>/,
      /cout\s*<<|cin\s*>>/,
      /public:|private:|protected:/
    ]);

    // C patterns
    this.languagePatterns.set(SupportedLanguage.C, [
      /#include\s*<.*>/,
      /int\s+main\s*\(/,
      /printf\s*\(/,
      /malloc\s*\(/,
      /free\s*\(/,
      /struct\s+\w+/,
      /typedef\s+/
    ]);

    // Rust patterns
    this.languagePatterns.set(SupportedLanguage.RUST, [
      /fn\s+\w+\s*\(/,
      /let\s+mut\s+/,
      /let\s+\w+\s*=/,
      /struct\s+\w+/,
      /impl\s+\w+/,
      /use\s+\w+::/,
      /println!/,
      /match\s+\w+\s*{/
    ]);
  }

  // ===================
  // PRIVATE HELPER METHODS
  // ===================

  private getFileExtension(filename: string): string | null {
    if (!filename) return null;
    
    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1 || lastDot === filename.length - 1) {
      return null;
    }

    // Handle special cases like .d.ts
    if (filename.endsWith('.d.ts')) {
      return '.d.ts';
    }

    return filename.substring(lastDot);
  }

  private detectLanguageByContent(content: string): SupportedLanguage | null {
    const normalizedContent = content.slice(0, 10000); // Check first 10KB only for performance
    const scores = new Map<SupportedLanguage, number>();

    // Score each language based on pattern matches
    for (const [language, patterns] of this.languagePatterns) {
      let score = 0;
      for (const pattern of patterns) {
        const matches = normalizedContent.match(pattern);
        if (matches) {
          score += matches.length;
        }
      }
      if (score > 0) {
        scores.set(language, score);
      }
    }

    // Return language with highest score
    if (scores.size === 0) {
      return null;
    }

    let bestLanguage: SupportedLanguage | null = null;
    let bestScore = 0;
    
    for (const [language, score] of scores) {
      if (score > bestScore) {
        bestScore = score;
        bestLanguage = language;
      }
    }

    return bestLanguage;
  }
}
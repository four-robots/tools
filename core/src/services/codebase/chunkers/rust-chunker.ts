/**
 * Rust Chunker
 * 
 * Simplified chunker for Rust files using universal patterns.
 * Focuses on basic function, struct, and impl block detection.
 */

import { SupportedLanguage } from '../../../shared/types/codebase.js';
import { UniversalChunker } from './universal-chunker.js';

export class RustChunker extends UniversalChunker {
  readonly language = SupportedLanguage.RUST;

  constructor() {
    super(SupportedLanguage.RUST);
  }
}
/**
 * C++ Chunker
 * 
 * Simplified chunker for C++ files using universal patterns.
 * Focuses on basic function and class detection.
 */

import { SupportedLanguage } from '../../../shared/types/codebase.js';
import { UniversalChunker } from './universal-chunker.js';

export class CppChunker extends UniversalChunker {
  readonly language = SupportedLanguage.CPP;

  constructor() {
    super(SupportedLanguage.CPP);
  }
}
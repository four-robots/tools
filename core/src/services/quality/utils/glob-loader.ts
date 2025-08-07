/**
 * Dynamic glob import wrapper to handle different glob package versions and bundlers
 */

import { createRequire } from 'module';

export async function getGlob() {
  try {
    // First try CommonJS require for bundled environments
    const require = createRequire(import.meta.url);
    const globModule = require('glob');
    
    // Handle different export patterns
    if (typeof globModule.glob === 'function') {
      return globModule.glob;
    }
    
    if (typeof globModule === 'function') {
      return globModule;
    }
    
    if (typeof globModule.default === 'function') {
      return globModule.default;
    }
    
    throw new Error('No glob function found via require');
  } catch (requireError) {
    try {
      // Fallback to dynamic import
      const globModule = await import('glob');
      
      // Handle both named and default exports
      if (typeof globModule.glob === 'function') {
        return globModule.glob;
      }
      
      if (typeof globModule.default === 'function') {
        return globModule.default;
      }
      
      // Handle case where entire module is the function
      if (typeof globModule === 'function') {
        return globModule;
      }
      
      throw new Error('No glob function found via import');
    } catch (importError) {
      console.warn('Failed to load glob module via both require and import:', { requireError, importError });
      throw new Error('glob module not available');
    }
  }
}
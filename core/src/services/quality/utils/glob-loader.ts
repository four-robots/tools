/**
 * Dynamic glob import wrapper to handle different glob package versions
 */

export async function getGlob() {
  try {
    // Try to import glob v10 first
    const { glob } = await import('glob');
    return glob;
  } catch {
    // Fallback to default export for older versions
    const globModule = await import('glob');
    return globModule.default || globModule;
  }
}
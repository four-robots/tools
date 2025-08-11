'use client';

/**
 * Serialize tldraw canvas data for database storage
 */
export const serializeCanvasData = (snapshot: any): any => {
  if (!snapshot) return null;

  try {
    // Convert tldraw snapshot to JSON-serializable format
    return {
      store: snapshot.store || {},
      schema: snapshot.schema || {},
      meta: {
        timestamp: Date.now(),
        version: '3.15.1', // tldraw version
      },
    };
  } catch (error) {
    console.error('Failed to serialize canvas data:', error);
    return null;
  }
};

/**
 * Deserialize canvas data from database to tldraw format
 */
export const deserializeCanvasData = (data: any): any => {
  if (!data) return null;

  try {
    // Validate required fields
    if (!data.store || typeof data.store !== 'object') {
      console.warn('Invalid canvas data: missing store');
      return null;
    }

    return {
      store: data.store,
      schema: data.schema || {},
    };
  } catch (error) {
    console.error('Failed to deserialize canvas data:', error);
    return null;
  }
};

/**
 * Export canvas to different formats
 */
export const exportCanvas = async (
  editor: any,
  format: 'png' | 'svg' | 'json',
  options?: {
    scale?: number;
    padding?: number;
    background?: boolean;
  }
): Promise<Blob | string | null> => {
  if (!editor) return null;

  try {
    switch (format) {
      case 'png':
        return await editor.getSvg({
          scale: options?.scale || 1,
          padding: options?.padding || 16,
          background: options?.background !== false,
        });
      
      case 'svg':
        const svg = await editor.getSvg({
          scale: options?.scale || 1,
          padding: options?.padding || 16,
          background: options?.background !== false,
        });
        return svg ? new XMLSerializer().serializeToString(svg) : null;
      
      case 'json':
        const snapshot = editor.getSnapshot();
        return JSON.stringify(serializeCanvasData(snapshot), null, 2);
      
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  } catch (error) {
    console.error(`Failed to export canvas as ${format}:`, error);
    return null;
  }
};

/**
 * Import canvas data from various formats
 */
export const importCanvas = async (
  editor: any,
  data: string | File,
  format: 'json' | 'image'
): Promise<boolean> => {
  if (!editor) return false;

  try {
    switch (format) {
      case 'json':
        const jsonData = typeof data === 'string' ? data : await data.text();
        const parsed = JSON.parse(jsonData);
        const deserialized = deserializeCanvasData(parsed);
        
        if (deserialized) {
          editor.loadSnapshot(deserialized);
          return true;
        }
        return false;
      
      case 'image':
        // Handle image import
        if (data instanceof File) {
          const imageUrl = URL.createObjectURL(data);
          // Add image to canvas
          // This would require additional tldraw API usage
          console.log('Image import not fully implemented yet');
          URL.revokeObjectURL(imageUrl);
        }
        return false;
      
      default:
        throw new Error(`Unsupported import format: ${format}`);
    }
  } catch (error) {
    console.error(`Failed to import canvas data:`, error);
    return false;
  }
};

/**
 * Validate canvas data integrity
 */
export const validateCanvasData = (data: any): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!data) {
    errors.push('Canvas data is null or undefined');
    return { isValid: false, errors };
  }

  if (typeof data !== 'object') {
    errors.push('Canvas data must be an object');
    return { isValid: false, errors };
  }

  if (!data.store || typeof data.store !== 'object') {
    errors.push('Canvas data must have a store property');
  }

  if (data.meta && typeof data.meta !== 'object') {
    errors.push('Canvas meta must be an object if present');
  }

  return { isValid: errors.length === 0, errors };
};

/**
 * Calculate canvas statistics
 */
export const getCanvasStats = (data: any): {
  elementCount: number;
  lastModified: Date | null;
  version: string | null;
  size: number;
} => {
  if (!data) {
    return {
      elementCount: 0,
      lastModified: null,
      version: null,
      size: 0,
    };
  }

  const elementCount = data.store ? Object.keys(data.store).length : 0;
  const lastModified = data.meta?.timestamp ? new Date(data.meta.timestamp) : null;
  const version = data.meta?.version || null;
  const size = JSON.stringify(data).length;

  return {
    elementCount,
    lastModified,
    version,
    size,
  };
};
'use client';

/**
 * Export canvas utilities for different formats
 */

export interface ExportOptions {
  scale?: number;
  padding?: number;
  background?: boolean;
  darkMode?: boolean;
}

export interface ExportResult {
  success: boolean;
  data?: Blob | string;
  error?: string;
  filename?: string;
}

/**
 * Export canvas as PNG image
 */
export const exportAsPng = async (
  editor: any,
  options: ExportOptions = {}
): Promise<ExportResult> => {
  try {
    if (!editor) {
      return { success: false, error: 'Editor not available' };
    }

    const svg = await editor.getSvg({
      scale: options.scale || 2,
      padding: options.padding || 16,
      background: options.background !== false,
      darkMode: options.darkMode || false,
    });

    if (!svg) {
      return { success: false, error: 'Failed to generate SVG' };
    }

    // Guard against SSR — document is not available on server
    if (typeof document === 'undefined') {
      return { success: false, error: 'Canvas export is not available during server-side rendering' };
    }

    // Convert SVG to PNG using canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { success: false, error: 'Canvas context not available' };
    }

    const img = new Image();
    const svgBlob = new Blob([new XMLSerializer().serializeToString(svg)], { 
      type: 'image/svg+xml;charset=utf-8' 
    });
    const svgUrl = URL.createObjectURL(svgBlob);

    return new Promise((resolve) => {
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(svgUrl);
          if (blob) {
            resolve({ 
              success: true, 
              data: blob,
              filename: `whiteboard-${Date.now()}.png`
            });
          } else {
            resolve({ success: false, error: 'Failed to create PNG blob' });
          }
        }, 'image/png');
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(svgUrl);
        resolve({ success: false, error: 'Failed to load SVG image' });
      };
      
      img.src = svgUrl;
    });
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown export error' 
    };
  }
};

/**
 * Export canvas as SVG
 */
export const exportAsSvg = async (
  editor: any,
  options: ExportOptions = {}
): Promise<ExportResult> => {
  try {
    if (!editor) {
      return { success: false, error: 'Editor not available' };
    }

    const svg = await editor.getSvg({
      scale: options.scale || 1,
      padding: options.padding || 16,
      background: options.background !== false,
      darkMode: options.darkMode || false,
    });

    if (!svg) {
      return { success: false, error: 'Failed to generate SVG' };
    }

    const svgString = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });

    return {
      success: true,
      data: blob,
      filename: `whiteboard-${Date.now()}.svg`
    };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown export error' 
    };
  }
};

/**
 * Export canvas as PDF
 */
export const exportAsPdf = async (
  editor: any,
  options: ExportOptions = {}
): Promise<ExportResult> => {
  try {
    if (!editor) {
      return { success: false, error: 'Editor not available' };
    }

    // Note: This is a simplified implementation
    // For production, you might want to use a library like jsPDF
    const svg = await editor.getSvg({
      scale: options.scale || 1,
      padding: options.padding || 16,
      background: options.background !== false,
      darkMode: options.darkMode || false,
    });

    if (!svg) {
      return { success: false, error: 'Failed to generate SVG' };
    }

    // Convert to PNG first, then embed in PDF
    const pngResult = await exportAsPng(editor, options);
    
    if (!pngResult.success || !pngResult.data) {
      return { success: false, error: 'Failed to generate PDF' };
    }

    // For now, return PNG with PDF extension as placeholder
    // In production, implement proper PDF generation
    return {
      success: true,
      data: pngResult.data,
      filename: `whiteboard-${Date.now()}.pdf`
    };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown export error' 
    };
  }
};

/**
 * Export canvas as JSON
 */
export const exportAsJson = async (editor: any): Promise<ExportResult> => {
  try {
    if (!editor) {
      return { success: false, error: 'Editor not available' };
    }

    const snapshot = editor.getSnapshot();
    const jsonString = JSON.stringify(snapshot, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });

    return {
      success: true,
      data: blob,
      filename: `whiteboard-${Date.now()}.json`
    };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown export error' 
    };
  }
};

/**
 * Download exported file
 */
export const downloadFile = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * Share exported file (if Web Share API is available)
 */
export const shareFile = async (blob: Blob, filename: string): Promise<boolean> => {
  if (!navigator.share || !navigator.canShare) {
    return false;
  }

  try {
    const file = new File([blob], filename, { type: blob.type });
    
    if (navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: 'Whiteboard Export',
        text: 'Shared from collaborative whiteboard',
      });
      return true;
    }
  } catch (error) {
    console.error('Failed to share file:', error);
  }
  
  return false;
};
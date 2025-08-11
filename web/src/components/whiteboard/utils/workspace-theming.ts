'use client';

/**
 * Workspace theming utilities for tldraw integration
 */

export interface WorkspaceTheme {
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  borderColor: string;
  accentColor: string;
  isDark: boolean;
}

export const defaultWorkspaceTheme: WorkspaceTheme = {
  primaryColor: '#3B82F6',
  backgroundColor: '#FFFFFF',
  textColor: '#1F2937',
  borderColor: '#E5E7EB',
  accentColor: '#10B981',
  isDark: false,
};

export const darkWorkspaceTheme: WorkspaceTheme = {
  primaryColor: '#60A5FA',
  backgroundColor: '#111827',
  textColor: '#F9FAFB',
  borderColor: '#374151',
  accentColor: '#34D399',
  isDark: true,
};

/**
 * Apply workspace theme to tldraw
 */
export const applyWorkspaceTheme = (theme: WorkspaceTheme): void => {
  // Apply CSS custom properties for tldraw theming
  const root = document.documentElement;
  
  root.style.setProperty('--workspace-primary', theme.primaryColor);
  root.style.setProperty('--workspace-background', theme.backgroundColor);
  root.style.setProperty('--workspace-text', theme.textColor);
  root.style.setProperty('--workspace-border', theme.borderColor);
  root.style.setProperty('--workspace-accent', theme.accentColor);

  // Apply tldraw-specific theme variables
  root.style.setProperty('--color-background', theme.backgroundColor);
  root.style.setProperty('--color-text', theme.textColor);
  root.style.setProperty('--color-primary', theme.primaryColor);
  root.style.setProperty('--color-border', theme.borderColor);
  
  // Set dark/light mode class
  if (theme.isDark) {
    root.classList.add('tldraw-theme-dark');
    root.classList.remove('tldraw-theme-light');
  } else {
    root.classList.add('tldraw-theme-light');
    root.classList.remove('tldraw-theme-dark');
  }
};

/**
 * Get workspace theme from workspace settings
 */
export const getWorkspaceTheme = (workspaceSettings?: any): WorkspaceTheme => {
  if (!workspaceSettings?.theme) {
    return defaultWorkspaceTheme;
  }

  return {
    primaryColor: workspaceSettings.theme.primaryColor || defaultWorkspaceTheme.primaryColor,
    backgroundColor: workspaceSettings.theme.backgroundColor || defaultWorkspaceTheme.backgroundColor,
    textColor: workspaceSettings.theme.textColor || defaultWorkspaceTheme.textColor,
    borderColor: workspaceSettings.theme.borderColor || defaultWorkspaceTheme.borderColor,
    accentColor: workspaceSettings.theme.accentColor || defaultWorkspaceTheme.accentColor,
    isDark: workspaceSettings.theme.isDark || false,
  };
};

/**
 * Generate tldraw theme CSS
 */
export const generateTldrawThemeCSS = (theme: WorkspaceTheme): string => {
  return `
    .tldraw-workspace-theme {
      --color-background: ${theme.backgroundColor};
      --color-text: ${theme.textColor};
      --color-primary: ${theme.primaryColor};
      --color-border: ${theme.borderColor};
      --color-accent: ${theme.accentColor};
    }

    .tldraw-workspace-theme .tl-ui-button {
      border-color: ${theme.borderColor};
      color: ${theme.textColor};
    }

    .tldraw-workspace-theme .tl-ui-button:hover {
      background-color: ${theme.primaryColor}20;
    }

    .tldraw-workspace-theme .tl-ui-button--primary {
      background-color: ${theme.primaryColor};
      color: white;
    }

    .tldraw-workspace-theme .tl-canvas {
      background-color: ${theme.backgroundColor};
    }

    .tldraw-workspace-theme .tl-ui-panel {
      background-color: ${theme.backgroundColor};
      border-color: ${theme.borderColor};
    }

    .tldraw-workspace-theme .tl-ui-toolbar {
      background-color: ${theme.backgroundColor};
      border-color: ${theme.borderColor};
    }

    ${theme.isDark ? `
      .tldraw-workspace-theme {
        color-scheme: dark;
      }
    ` : `
      .tldraw-workspace-theme {
        color-scheme: light;
      }
    `}
  `;
};

/**
 * Apply custom branding to tldraw UI
 */
export const applyWorkspaceBranding = (workspaceName: string, logoUrl?: string): void => {
  // Inject custom styles for workspace branding
  let styleElement = document.getElementById('workspace-branding-styles');
  if (!styleElement) {
    styleElement = document.createElement('style');
    styleElement.id = 'workspace-branding-styles';
    document.head.appendChild(styleElement);
  }

  styleElement.textContent = `
    .tldraw-workspace-branding::after {
      content: "${workspaceName}";
      position: absolute;
      bottom: 8px;
      left: 8px;
      font-size: 12px;
      opacity: 0.6;
      pointer-events: none;
      z-index: 1000;
    }

    ${logoUrl ? `
      .tldraw-workspace-logo::before {
        content: "";
        position: absolute;
        top: 8px;
        left: 8px;
        width: 32px;
        height: 32px;
        background-image: url("${logoUrl}");
        background-size: contain;
        background-repeat: no-repeat;
        background-position: center;
        opacity: 0.6;
        pointer-events: none;
        z-index: 1000;
      }
    ` : ''}
  `;
};

/**
 * Remove workspace theming
 */
export const removeWorkspaceTheme = (): void => {
  const root = document.documentElement;
  
  // Remove custom properties
  root.style.removeProperty('--workspace-primary');
  root.style.removeProperty('--workspace-background');
  root.style.removeProperty('--workspace-text');
  root.style.removeProperty('--workspace-border');
  root.style.removeProperty('--workspace-accent');
  
  // Remove theme classes
  root.classList.remove('tldraw-theme-dark', 'tldraw-theme-light');
  
  // Remove branding styles
  const brandingStyles = document.getElementById('workspace-branding-styles');
  if (brandingStyles) {
    brandingStyles.remove();
  }
};
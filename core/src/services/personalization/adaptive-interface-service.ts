/**
 * AdaptiveInterfaceService - Intelligent UI customization and layout adaptation
 * 
 * Provides comprehensive interface personalization:
 * - Dynamic layout adaptation based on user behavior
 * - Device-specific interface optimizations
 * - Usage pattern-based UI customization
 * - Cross-device personalization synchronization
 * - Accessibility adaptations
 * - Performance-optimized interface rendering
 */

import {
  InterfacePreferences,
  SearchPreferences,
  UserPersonalizationProfile,
  AdaptiveInterfaceService as IAdaptiveInterfaceService
} from '@shared/types/personalization.js';
import { Database } from '@shared/utils/database.js';
import { logger } from '@shared/utils/logger.js';

export interface AdaptiveInterfaceConfig {
  enableLayoutAdaptation: boolean;
  enableDeviceOptimization: boolean;
  enableUsagePatternAdaptation: boolean;
  enableAccessibilityAdaptations: boolean;
  enablePerformanceOptimization: boolean;
  enableCrossDeviceSync: boolean;
  cacheAdaptationResults: boolean;
  adaptationRefreshInterval: number; // minutes
  maxLayoutVariants: number;
}

interface DeviceCapabilities {
  screenWidth: number;
  screenHeight: number;
  pixelRatio: number;
  touchCapable: boolean;
  connectionSpeed: 'slow' | 'medium' | 'fast';
  performanceLevel: 'low' | 'medium' | 'high';
  batteryLevel?: number;
  reducedMotion?: boolean;
}

interface UsagePattern {
  primaryFeatures: string[];
  averageSessionDuration: number;
  peakUsageHours: number[];
  commonTasks: string[];
  interactionStyle: 'keyboard' | 'mouse' | 'touch' | 'mixed';
  navigationPreference: 'hierarchical' | 'search' | 'recent';
  errorPatterns: string[];
}

interface LayoutAdaptation {
  layoutId: string;
  componentOrder: string[];
  componentVisibility: Record<string, boolean>;
  componentSizes: Record<string, string>;
  densityLevel: 'compact' | 'comfortable' | 'spacious';
  navigationStyle: 'sidebar' | 'topbar' | 'minimal';
  colorScheme: 'light' | 'dark' | 'auto' | 'high-contrast';
  animations: boolean;
  shortcuts: Record<string, string>;
}

export class AdaptiveInterfaceService implements IAdaptiveInterfaceService {
  private db: Database;
  private config: AdaptiveInterfaceConfig;
  private layoutCache = new Map<string, LayoutAdaptation>();
  private deviceCache = new Map<string, DeviceCapabilities>();

  constructor(database: Database, config: AdaptiveInterfaceConfig) {
    this.db = database;
    this.config = config;
  }

  /**
   * Get adaptive layout configuration for user
   */
  async getAdaptiveLayout(userId: string, context?: Record<string, any>): Promise<Record<string, any>> {
    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(userId, context);
      if (this.layoutCache.has(cacheKey)) {
        const cached = this.layoutCache.get(cacheKey)!;
        if (this.isLayoutCacheFresh(cached)) {
          logger.debug(`Using cached adaptive layout for user ${userId}`);
          return this.layoutAdaptationToInterface(cached);
        }
      }

      // Get user profile and preferences
      const profile = await this.getUserPersonalizationProfile(userId);
      
      // Get device capabilities from context
      const deviceCapabilities = this.extractDeviceCapabilities(context);
      
      // Get usage patterns
      const usagePatterns = await this.getUserUsagePatterns(userId);

      // Generate adaptive layout
      const adaptation = await this.generateAdaptiveLayout(
        profile, 
        deviceCapabilities, 
        usagePatterns, 
        context
      );

      // Cache the adaptation
      this.layoutCache.set(cacheKey, adaptation);

      const interfaceConfig = this.layoutAdaptationToInterface(adaptation);
      
      logger.debug(`Generated adaptive layout for user ${userId}`);
      return interfaceConfig;

    } catch (error) {
      logger.error(`Error getting adaptive layout for user ${userId}:`, error);
      return this.getDefaultInterface();
    }
  }

  /**
   * Customize search interface based on user preferences
   */
  async customizeSearchInterface(userId: string, preferences: InterfacePreferences): Promise<void> {
    try {
      // Update user preferences in profile
      await this.updateUserInterfacePreferences(userId, preferences);

      // Clear layout cache to force regeneration
      this.clearUserLayoutCache(userId);

      // Apply immediate customizations if needed
      if (this.config.enableLayoutAdaptation) {
        await this.applySearchInterfaceCustomizations(userId, preferences);
      }

      logger.info(`Customized search interface for user ${userId}`);

    } catch (error) {
      logger.error(`Error customizing search interface for user ${userId}:`, error);
      throw new Error(`Failed to customize search interface: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Synchronize personalization settings across devices
   */
  async syncPersonalizationAcrossDevices(userId: string): Promise<void> {
    try {
      if (!this.config.enableCrossDeviceSync) {
        return;
      }

      // Get primary device preferences (most recently used)
      const primaryProfile = await this.getUserPersonalizationProfile(userId);
      
      // Get all user sessions from different devices
      const deviceSessions = await this.getUserDeviceSessions(userId);

      // Sync core preferences across devices
      const syncablePreferences = this.extractSyncablePreferences(primaryProfile);

      // Apply to all devices with device-specific adaptations
      for (const session of deviceSessions) {
        await this.applySyncedPreferences(userId, session.deviceId, syncablePreferences);
      }

      logger.info(`Synchronized personalization across ${deviceSessions.length} devices for user ${userId}`);

    } catch (error) {
      logger.error(`Error syncing personalization across devices for user ${userId}:`, error);
      throw new Error(`Failed to sync personalization across devices: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Adapt interface based on accessibility needs
   */
  async adaptForAccessibility(
    userId: string, 
    accessibilityNeeds: Record<string, any>,
    context?: Record<string, any>
  ): Promise<Record<string, any>> {
    try {
      if (!this.config.enableAccessibilityAdaptations) {
        return {};
      }

      const adaptations: Record<string, any> = {};

      // High contrast mode
      if (accessibilityNeeds.highContrast) {
        adaptations.colorScheme = 'high-contrast';
        adaptations.colors = this.getHighContrastColors();
      }

      // Reduced motion
      if (accessibilityNeeds.reducedMotion) {
        adaptations.animations = false;
        adaptations.transitions = 'none';
        adaptations.autoPlay = false;
      }

      // Large text
      if (accessibilityNeeds.largeText) {
        adaptations.fontSize = 'large';
        adaptations.lineHeight = 1.6;
        adaptations.buttonSize = 'large';
      }

      // Keyboard navigation
      if (accessibilityNeeds.keyboardNavigation) {
        adaptations.focusIndicators = 'enhanced';
        adaptations.skipLinks = true;
        adaptations.keyboardShortcuts = this.getKeyboardShortcuts();
      }

      // Screen reader optimizations
      if (accessibilityNeeds.screenReader) {
        adaptations.ariaLabels = 'verbose';
        adaptations.landmarks = 'enhanced';
        adaptations.announcements = true;
      }

      // Voice control
      if (accessibilityNeeds.voiceControl) {
        adaptations.voiceCommands = true;
        adaptations.speechRecognition = true;
      }

      // Store accessibility preferences
      await this.storeAccessibilityPreferences(userId, accessibilityNeeds);

      logger.info(`Applied accessibility adaptations for user ${userId}`);
      return adaptations;

    } catch (error) {
      logger.error(`Error adapting for accessibility for user ${userId}:`, error);
      return {};
    }
  }

  /**
   * Optimize interface for performance based on device capabilities
   */
  async optimizeForPerformance(
    userId: string,
    deviceCapabilities: DeviceCapabilities,
    context?: Record<string, any>
  ): Promise<Record<string, any>> {
    try {
      if (!this.config.enablePerformanceOptimization) {
        return {};
      }

      const optimizations: Record<string, any> = {};

      // Low-performance device optimizations
      if (deviceCapabilities.performanceLevel === 'low') {
        optimizations.animations = false;
        optimizations.lazyLoading = true;
        optimizations.imageQuality = 'low';
        optimizations.bundleSize = 'minimal';
        optimizations.polling = false;
        optimizations.backgroundUpdates = false;
      }

      // Slow connection optimizations
      if (deviceCapabilities.connectionSpeed === 'slow') {
        optimizations.prefetch = false;
        optimizations.compression = 'high';
        optimizations.imageFormat = 'webp';
        optimizations.batchRequests = true;
        optimizations.offlineMode = true;
      }

      // Battery level optimizations
      if (deviceCapabilities.batteryLevel && deviceCapabilities.batteryLevel < 20) {
        optimizations.darkMode = true; // Save battery on OLED screens
        optimizations.refreshRate = 'low';
        optimizations.backgroundSync = false;
        optimizations.locationTracking = false;
      }

      // Touch device optimizations
      if (deviceCapabilities.touchCapable) {
        optimizations.buttonSize = 'large';
        optimizations.spacing = 'comfortable';
        optimizations.swipeGestures = true;
        optimizations.contextMenus = 'touch-friendly';
      }

      // Small screen optimizations
      if (deviceCapabilities.screenWidth < 768) {
        optimizations.layout = 'mobile';
        optimizations.navigation = 'bottom-tabs';
        optimizations.sidebar = 'overlay';
        optimizations.density = 'compact';
      }

      logger.debug(`Applied performance optimizations for user ${userId}`);
      return optimizations;

    } catch (error) {
      logger.error(`Error optimizing for performance for user ${userId}:`, error);
      return {};
    }
  }

  // =====================
  // PRIVATE METHODS
  // =====================

  /**
   * Get user personalization profile
   */
  private async getUserPersonalizationProfile(userId: string): Promise<UserPersonalizationProfile | null> {
    try {
      const profile = await this.db.selectFrom('user_personalization_profiles')
        .selectAll()
        .where('user_id', '=', userId)
        .where('is_active', '=', true)
        .where('is_default', '=', true)
        .executeTakeFirst();

      return profile ? this.mapDatabaseProfileToType(profile) : null;

    } catch (error) {
      logger.error(`Error getting personalization profile for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Extract device capabilities from context
   */
  private extractDeviceCapabilities(context?: Record<string, any>): DeviceCapabilities {
    const defaultCapabilities: DeviceCapabilities = {
      screenWidth: 1920,
      screenHeight: 1080,
      pixelRatio: 1,
      touchCapable: false,
      connectionSpeed: 'fast',
      performanceLevel: 'high'
    };

    if (!context) return defaultCapabilities;

    return {
      screenWidth: context.screen?.width || defaultCapabilities.screenWidth,
      screenHeight: context.screen?.height || defaultCapabilities.screenHeight,
      pixelRatio: context.screen?.pixelRatio || defaultCapabilities.pixelRatio,
      touchCapable: context.device?.touchCapable || defaultCapabilities.touchCapable,
      connectionSpeed: context.connection?.speed || defaultCapabilities.connectionSpeed,
      performanceLevel: context.device?.performance || defaultCapabilities.performanceLevel,
      batteryLevel: context.device?.batteryLevel,
      reducedMotion: context.accessibility?.reducedMotion
    };
  }

  /**
   * Get user usage patterns from behavior data
   */
  private async getUserUsagePatterns(userId: string): Promise<UsagePattern | null> {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // Get recent behavior events
      const events = await this.db.selectFrom('user_behavior_events')
        .selectAll()
        .where('user_id', '=', userId)
        .where('event_timestamp', '>', thirtyDaysAgo)
        .orderBy('event_timestamp', 'desc')
        .limit(500)
        .execute();

      if (events.length === 0) return null;

      return this.analyzeUsagePatterns(events);

    } catch (error) {
      logger.error(`Error getting usage patterns for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Analyze usage patterns from behavior events
   */
  private analyzeUsagePatterns(events: any[]): UsagePattern {
    const featureUsage = new Map<string, number>();
    const sessionDurations: number[] = [];
    const hourUsage = new Array(24).fill(0);
    const taskCounts = new Map<string, number>();
    const deviceTypes = new Map<string, number>();

    for (const event of events) {
      // Track feature usage
      const feature = event.event_category || 'search';
      featureUsage.set(feature, (featureUsage.get(feature) || 0) + 1);

      // Track hour usage
      const hour = new Date(event.event_timestamp).getHours();
      hourUsage[hour]++;

      // Track task types
      const task = event.event_action || 'query';
      taskCounts.set(task, (taskCounts.get(task) || 0) + 1);

      // Track device types from user agent
      if (event.user_agent) {
        const deviceType = this.inferDeviceType(event.user_agent);
        deviceTypes.set(deviceType, (deviceTypes.get(deviceType) || 0) + 1);
      }

      // Track session duration (simplified)
      if (event.interaction_duration_ms) {
        sessionDurations.push(event.interaction_duration_ms);
      }
    }

    // Extract primary features
    const primaryFeatures = Array.from(featureUsage.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([feature]) => feature);

    // Calculate average session duration
    const averageSessionDuration = sessionDurations.length > 0 
      ? sessionDurations.reduce((sum, duration) => sum + duration, 0) / sessionDurations.length
      : 300000; // 5 minutes default

    // Find peak usage hours
    const peakUsageHours = hourUsage
      .map((count, hour) => ({ hour, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map(({ hour }) => hour);

    // Extract common tasks
    const commonTasks = Array.from(taskCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([task]) => task);

    // Infer interaction style
    const mostUsedDevice = Array.from(deviceTypes.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'desktop';
    
    const interactionStyle = this.inferInteractionStyle(mostUsedDevice, events);

    return {
      primaryFeatures,
      averageSessionDuration,
      peakUsageHours,
      commonTasks,
      interactionStyle,
      navigationPreference: this.inferNavigationPreference(events),
      errorPatterns: this.extractErrorPatterns(events)
    };
  }

  /**
   * Generate adaptive layout based on user data
   */
  private async generateAdaptiveLayout(
    profile: UserPersonalizationProfile | null,
    deviceCapabilities: DeviceCapabilities,
    usagePatterns: UsagePattern | null,
    context?: Record<string, any>
  ): Promise<LayoutAdaptation> {
    const adaptation: LayoutAdaptation = {
      layoutId: crypto.randomUUID(),
      componentOrder: this.getDefaultComponentOrder(),
      componentVisibility: this.getDefaultComponentVisibility(),
      componentSizes: this.getDefaultComponentSizes(),
      densityLevel: 'comfortable',
      navigationStyle: 'sidebar',
      colorScheme: 'light',
      animations: true,
      shortcuts: {}
    };

    // Apply profile-based adaptations
    if (profile?.interfacePreferences) {
      this.applyProfilePreferences(adaptation, profile.interfacePreferences);
    }

    // Apply device-based adaptations
    this.applyDeviceAdaptations(adaptation, deviceCapabilities);

    // Apply usage pattern adaptations
    if (usagePatterns) {
      this.applyUsagePatternAdaptations(adaptation, usagePatterns);
    }

    // Apply performance optimizations
    if (this.config.enablePerformanceOptimization) {
      this.applyPerformanceOptimizations(adaptation, deviceCapabilities);
    }

    return adaptation;
  }

  /**
   * Apply profile preferences to layout adaptation
   */
  private applyProfilePreferences(adaptation: LayoutAdaptation, preferences: InterfacePreferences): void {
    if (preferences.theme) {
      adaptation.colorScheme = preferences.theme === 'auto' ? 'light' : preferences.theme;
    }

    if (preferences.density) {
      adaptation.densityLevel = preferences.density;
    }

    if (typeof preferences.animation === 'boolean') {
      adaptation.animations = preferences.animation;
    }

    // Adjust component sizes based on density
    if (preferences.density === 'compact') {
      adaptation.componentSizes = { ...adaptation.componentSizes, searchBar: 'small', filters: 'small' };
    } else if (preferences.density === 'spacious') {
      adaptation.componentSizes = { ...adaptation.componentSizes, searchBar: 'large', filters: 'large' };
    }
  }

  /**
   * Apply device-based adaptations
   */
  private applyDeviceAdaptations(adaptation: LayoutAdaptation, capabilities: DeviceCapabilities): void {
    // Mobile adaptations
    if (capabilities.screenWidth < 768) {
      adaptation.navigationStyle = 'topbar';
      adaptation.densityLevel = 'compact';
      adaptation.componentOrder = this.getMobileComponentOrder();
      adaptation.componentVisibility.sidebar = false;
      adaptation.componentVisibility.quickActions = true;
    }

    // Tablet adaptations
    if (capabilities.screenWidth >= 768 && capabilities.screenWidth < 1024) {
      adaptation.navigationStyle = 'topbar';
      adaptation.componentVisibility.sidebar = false;
    }

    // Touch device adaptations
    if (capabilities.touchCapable) {
      adaptation.componentSizes.buttons = 'large';
      adaptation.shortcuts = this.getTouchShortcuts();
    }

    // High DPI adaptations
    if (capabilities.pixelRatio > 2) {
      adaptation.componentSizes.icons = 'high-res';
    }

    // Reduced motion
    if (capabilities.reducedMotion) {
      adaptation.animations = false;
    }
  }

  /**
   * Apply usage pattern adaptations
   */
  private applyUsagePatternAdaptations(adaptation: LayoutAdaptation, patterns: UsagePattern): void {
    // Reorder components based on primary features
    if (patterns.primaryFeatures.includes('filters')) {
      adaptation.componentOrder = this.moveComponentToTop(adaptation.componentOrder, 'filters');
    }

    if (patterns.primaryFeatures.includes('analytics')) {
      adaptation.componentVisibility.analytics = true;
    }

    // Adapt navigation based on preference
    if (patterns.navigationPreference === 'search') {
      adaptation.componentVisibility.searchBar = true;
      adaptation.componentSizes.searchBar = 'large';
    }

    // Keyboard shortcuts for keyboard users
    if (patterns.interactionStyle === 'keyboard') {
      adaptation.shortcuts = { ...adaptation.shortcuts, ...this.getKeyboardShortcuts() };
    }

    // Long session users get more dense layouts
    if (patterns.averageSessionDuration > 600000) { // 10 minutes
      adaptation.densityLevel = 'compact';
      adaptation.componentVisibility.advanced = true;
    }
  }

  /**
   * Apply performance optimizations to layout
   */
  private applyPerformanceOptimizations(adaptation: LayoutAdaptation, capabilities: DeviceCapabilities): void {
    if (capabilities.performanceLevel === 'low') {
      adaptation.animations = false;
      adaptation.componentVisibility.preview = false;
      adaptation.componentVisibility.charts = false;
    }

    if (capabilities.connectionSpeed === 'slow') {
      adaptation.componentVisibility.images = false;
      adaptation.componentVisibility.preview = false;
    }
  }

  // =====================
  // HELPER METHODS
  // =====================

  private generateCacheKey(userId: string, context?: Record<string, any>): string {
    const deviceHash = context ? this.hashObject(context) : 'default';
    return `${userId}:${deviceHash}`;
  }

  private isLayoutCacheFresh(adaptation: LayoutAdaptation): boolean {
    // Simple freshness check - in production, implement proper cache invalidation
    return true; // For now, always consider cache fresh
  }

  private layoutAdaptationToInterface(adaptation: LayoutAdaptation): Record<string, any> {
    return {
      layoutId: adaptation.layoutId,
      components: {
        order: adaptation.componentOrder,
        visibility: adaptation.componentVisibility,
        sizes: adaptation.componentSizes
      },
      appearance: {
        density: adaptation.densityLevel,
        navigation: adaptation.navigationStyle,
        colorScheme: adaptation.colorScheme,
        animations: adaptation.animations
      },
      shortcuts: adaptation.shortcuts
    };
  }

  private getDefaultInterface(): Record<string, any> {
    return {
      layoutId: 'default',
      components: {
        order: this.getDefaultComponentOrder(),
        visibility: this.getDefaultComponentVisibility(),
        sizes: this.getDefaultComponentSizes()
      },
      appearance: {
        density: 'comfortable',
        navigation: 'sidebar',
        colorScheme: 'light',
        animations: true
      },
      shortcuts: {}
    };
  }

  private getDefaultComponentOrder(): string[] {
    return ['searchBar', 'filters', 'results', 'sidebar', 'pagination'];
  }

  private getDefaultComponentVisibility(): Record<string, boolean> {
    return {
      searchBar: true,
      filters: true,
      results: true,
      sidebar: true,
      pagination: true,
      preview: false,
      analytics: false,
      advanced: false
    };
  }

  private getDefaultComponentSizes(): Record<string, string> {
    return {
      searchBar: 'medium',
      filters: 'medium',
      buttons: 'medium',
      icons: 'standard'
    };
  }

  private getMobileComponentOrder(): string[] {
    return ['searchBar', 'quickActions', 'results', 'filters', 'pagination'];
  }

  private moveComponentToTop(order: string[], component: string): string[] {
    const filtered = order.filter(c => c !== component);
    return [component, ...filtered];
  }

  private getTouchShortcuts(): Record<string, string> {
    return {
      'swipeLeft': 'previousPage',
      'swipeRight': 'nextPage',
      'longPress': 'contextMenu'
    };
  }

  private getKeyboardShortcuts(): Record<string, string> {
    return {
      'Ctrl+F': 'focusSearch',
      'Ctrl+K': 'quickSearch',
      'Escape': 'clearSearch',
      'ArrowDown': 'nextResult',
      'ArrowUp': 'previousResult',
      'Enter': 'selectResult'
    };
  }

  private getHighContrastColors(): Record<string, string> {
    return {
      background: '#000000',
      foreground: '#FFFFFF',
      primary: '#FFFF00',
      secondary: '#00FFFF',
      accent: '#FF00FF'
    };
  }

  private inferDeviceType(userAgent: string): string {
    const ua = userAgent.toLowerCase();
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
      return 'mobile';
    } else if (ua.includes('tablet') || ua.includes('ipad')) {
      return 'tablet';
    }
    return 'desktop';
  }

  private inferInteractionStyle(deviceType: string, events: any[]): 'keyboard' | 'mouse' | 'touch' | 'mixed' {
    if (deviceType === 'mobile') return 'touch';
    if (deviceType === 'tablet') return 'mixed';
    
    // Analyze events for keyboard vs mouse usage patterns
    let keyboardEvents = 0;
    let mouseEvents = 0;

    for (const event of events) {
      if (event.event_action === 'keyboard_shortcut') keyboardEvents++;
      if (event.event_action === 'click') mouseEvents++;
    }

    if (keyboardEvents > mouseEvents * 2) return 'keyboard';
    if (mouseEvents > keyboardEvents * 2) return 'mouse';
    return 'mixed';
  }

  private inferNavigationPreference(events: any[]): 'hierarchical' | 'search' | 'recent' {
    // Simple heuristic based on event types
    let searchEvents = 0;
    let hierarchicalEvents = 0;

    for (const event of events) {
      if (event.event_type === 'search') searchEvents++;
      if (event.event_action === 'navigate') hierarchicalEvents++;
    }

    if (searchEvents > hierarchicalEvents * 2) return 'search';
    if (hierarchicalEvents > searchEvents) return 'hierarchical';
    return 'recent';
  }

  private extractErrorPatterns(events: any[]): string[] {
    const errorPatterns: string[] = [];
    
    for (const event of events) {
      if (event.event_category === 'error') {
        errorPatterns.push(event.event_action || 'unknown');
      }
    }

    return [...new Set(errorPatterns)];
  }

  private async updateUserInterfacePreferences(userId: string, preferences: InterfacePreferences): Promise<void> {
    await this.db.updateTable('user_personalization_profiles')
      .set({
        interface_preferences: JSON.stringify(preferences),
        updated_at: new Date()
      })
      .where('user_id', '=', userId)
      .where('is_active', '=', true)
      .execute();
  }

  private clearUserLayoutCache(userId: string): void {
    const keysToDelete = Array.from(this.layoutCache.keys()).filter(key => key.startsWith(userId));
    for (const key of keysToDelete) {
      this.layoutCache.delete(key);
    }
  }

  private async applySearchInterfaceCustomizations(userId: string, preferences: InterfacePreferences): Promise<void> {
    // Store immediate customizations that don't require layout regeneration
    // This could involve updating CSS custom properties or configuration flags
    logger.debug(`Applied search interface customizations for user ${userId}`);
  }

  private async getUserDeviceSessions(userId: string): Promise<Array<{ deviceId: string; lastSeen: Date }>> {
    try {
      const sessions = await this.db.selectFrom('user_behavior_events')
        .select(['device_info', 'event_timestamp'])
        .where('user_id', '=', userId)
        .where('event_timestamp', '>', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) // Last week
        .execute();

      const deviceMap = new Map<string, Date>();
      
      for (const session of sessions) {
        const deviceInfo = session.device_info || {};
        const deviceId = typeof deviceInfo === 'object' ? deviceInfo.id || 'unknown' : 'unknown';
        const timestamp = session.event_timestamp;
        
        if (!deviceMap.has(deviceId) || deviceMap.get(deviceId)! < timestamp) {
          deviceMap.set(deviceId, timestamp);
        }
      }

      return Array.from(deviceMap.entries()).map(([deviceId, lastSeen]) => ({
        deviceId,
        lastSeen
      }));

    } catch (error) {
      logger.error(`Error getting user device sessions:`, error);
      return [];
    }
  }

  private extractSyncablePreferences(profile: UserPersonalizationProfile): Record<string, any> {
    return {
      theme: profile.interfacePreferences?.theme,
      density: profile.interfacePreferences?.density,
      animations: profile.interfacePreferences?.animation,
      resultsPerPage: profile.searchPreferences?.resultsPerPage,
      displayFormat: profile.searchPreferences?.displayFormat,
      sortPreference: profile.searchPreferences?.sortPreference
    };
  }

  private async applySyncedPreferences(
    userId: string, 
    deviceId: string, 
    preferences: Record<string, any>
  ): Promise<void> {
    // In a real implementation, this would update device-specific preference storage
    logger.debug(`Applied synced preferences for user ${userId} on device ${deviceId}`);
  }

  private async storeAccessibilityPreferences(userId: string, needs: Record<string, any>): Promise<void> {
    try {
      await this.db.updateTable('user_personalization_profiles')
        .set({
          interface_preferences: this.db.fn('jsonb_set', [
            'interface_preferences',
            '{accessibility}',
            JSON.stringify(needs)
          ]),
          updated_at: new Date()
        })
        .where('user_id', '=', userId)
        .where('is_active', '=', true)
        .execute();

    } catch (error) {
      logger.error(`Error storing accessibility preferences:`, error);
    }
  }

  private hashObject(obj: any): string {
    // Simple hash function for cache key generation
    return Math.abs(JSON.stringify(obj).split('').reduce((hash, char) => {
      hash = ((hash << 5) - hash) + char.charCodeAt(0);
      return hash & hash;
    }, 0)).toString(36);
  }

  // Type mapping helper
  private mapDatabaseProfileToType(dbProfile: any): UserPersonalizationProfile {
    return {
      id: dbProfile.id,
      userId: dbProfile.user_id,
      profileName: dbProfile.profile_name,
      profileDescription: dbProfile.profile_description,
      isActive: dbProfile.is_active,
      isDefault: dbProfile.is_default,
      searchPreferences: dbProfile.search_preferences || {},
      resultPreferences: dbProfile.result_preferences || {},
      interfacePreferences: dbProfile.interface_preferences || {},
      personalizationLevel: dbProfile.personalization_level,
      learningEnabled: dbProfile.learning_enabled,
      suggestionEnabled: dbProfile.suggestion_enabled,
      recommendationEnabled: dbProfile.recommendation_enabled,
      behaviorWeights: dbProfile.behavior_weights || {},
      temporalFactors: dbProfile.temporal_factors || {},
      contextFactors: dbProfile.context_factors || {},
      createdAt: dbProfile.created_at,
      updatedAt: dbProfile.updated_at,
      lastUsedAt: dbProfile.last_used_at
    };
  }
}
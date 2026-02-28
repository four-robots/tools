'use client';

import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { EventCollector } from './EventCollector';
import { SessionManager } from './SessionManager';
import { PrivacyConsentModal } from './PrivacyConsentModal';

interface BehaviorEvent {
  userId: string;
  sessionId: string;
  eventType: string;
  eventCategory: string;
  eventAction: string;
  searchQuery?: string;
  pageUrl?: string;
  timestamp?: Date;
  metadata?: Record<string, any>;
}

interface BehaviorContextType {
  userId?: string;
  sessionId: string;
  trackingEnabled: boolean;
  consentGiven: boolean;
  trackEvent: (event: Partial<BehaviorEvent>) => Promise<void>;
  updatePrivacySettings: (settings: any) => Promise<void>;
}

const BehaviorContext = createContext<BehaviorContextType | null>(null);

export const useBehaviorTracking = () => {
  const context = useContext(BehaviorContext);
  if (!context) {
    throw new Error('useBehaviorTracking must be used within a BehaviorTracker');
  }
  return context;
};

interface BehaviorTrackerProps {
  children: ReactNode;
  userId?: string;
  apiUrl?: string;
  enableAutoTracking?: boolean;
  privacyPolicyUrl?: string;
  onConsentChange?: (consent: boolean) => void;
}

export const BehaviorTracker: React.FC<BehaviorTrackerProps> = ({
  children,
  userId,
  apiUrl = '/api/v1/behavior',
  enableAutoTracking = true,
  privacyPolicyUrl,
  onConsentChange,
}) => {
  const [sessionId] = useState(() => crypto.randomUUID());
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [consentGiven, setConsentGiven] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [eventCollector, setEventCollector] = useState<EventCollector | null>(null);
  const [sessionManager, setSessionManager] = useState<SessionManager | null>(null);

  // Initialize services
  useEffect(() => {
    const collector = new EventCollector(apiUrl);
    const manager = new SessionManager(sessionId);
    
    setEventCollector(collector);
    setSessionManager(manager);

    return () => {
      collector.shutdown();
      manager.shutdown();
    };
  }, [apiUrl, sessionId]);

  // Check for existing consent
  useEffect(() => {
    const checkConsent = () => {
      try {
        const stored = localStorage.getItem('behavior-tracking-consent');
        if (stored) {
          const consent = JSON.parse(stored);
          const now = new Date();
          const consentDate = new Date(consent.timestamp);
          const daysSinceConsent = Math.floor((now.getTime() - consentDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysSinceConsent < 365 && consent.granted) { // Consent valid for 1 year
            setConsentGiven(true);
            setTrackingEnabled(true);
            return;
          }
        }
        
        // Show consent modal if no valid consent
        setShowConsentModal(true);
      } catch (error) {
        console.error('Error checking consent:', error);
        setShowConsentModal(true);
      }
    };

    checkConsent();
  }, []);

  const handleConsentGranted = async (settings: any) => {
    try {
      setConsentGiven(true);
      setTrackingEnabled(settings.behaviorTrackingEnabled ?? true);
      setShowConsentModal(false);

      // Store consent locally
      localStorage.setItem('behavior-tracking-consent', JSON.stringify({
        granted: true,
        timestamp: new Date().toISOString(),
        settings,
      }));

      // Send consent to backend if user is logged in
      if (userId) {
        await updatePrivacySettings(settings);
      }

      onConsentChange?.(true);
    } catch (error) {
      console.error('Error handling consent:', error);
    }
  };

  const handleConsentDenied = () => {
    setConsentGiven(false);
    setTrackingEnabled(false);
    setShowConsentModal(false);

    localStorage.setItem('behavior-tracking-consent', JSON.stringify({
      granted: false,
      timestamp: new Date().toISOString(),
    }));

    onConsentChange?.(false);
  };

  const trackEvent = async (event: Partial<BehaviorEvent>) => {
    if (!trackingEnabled || !eventCollector || !userId) {
      return;
    }

    try {
      const enrichedEvent = {
        ...event,
        userId,
        sessionId,
        timestamp: new Date(),
        pageUrl: window.location.href,
        userAgent: navigator.userAgent,
        deviceInfo: {
          screenWidth: window.screen.width,
          screenHeight: window.screen.height,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          isMobile: /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
          language: navigator.language,
        },
      };

      await eventCollector.trackEvent(enrichedEvent);
    } catch (error) {
      console.error('Error tracking event:', error);
    }
  };

  const updatePrivacySettings = async (settings: any) => {
    if (!userId) {
      throw new Error('User ID required to update privacy settings');
    }

    try {
      const response = await fetch(`${apiUrl}/privacy?userId=${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          settings,
          metadata: {
            ipAddress: await getUserIP(),
            userAgent: navigator.userAgent,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update privacy settings');
      }

      return await response.json();
    } catch (error) {
      console.error('Error updating privacy settings:', error);
      throw error;
    }
  };

  // Auto-track page views
  const pageViewTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  useEffect(() => {
    if (!enableAutoTracking || !trackingEnabled) return;

    const handlePageView = () => {
      trackEvent({
        eventType: 'view',
        eventCategory: 'navigation',
        eventAction: 'page_view',
        pageUrl: window.location.href,
      });
    };

    // Track initial page view
    handlePageView();

    // Track route changes (for SPA)
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function(...args) {
      originalPushState.apply(this, args);
      const t = setTimeout(handlePageView, 100);
      pageViewTimeoutsRef.current.push(t);
    };

    history.replaceState = function(...args) {
      originalReplaceState.apply(this, args);
      const t = setTimeout(handlePageView, 100);
      pageViewTimeoutsRef.current.push(t);
    };

    window.addEventListener('popstate', handlePageView);

    return () => {
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
      window.removeEventListener('popstate', handlePageView);
      for (const t of pageViewTimeoutsRef.current) {
        clearTimeout(t);
      }
      pageViewTimeoutsRef.current = [];
    };
  }, [enableAutoTracking, trackingEnabled]);

  // Auto-track clicks
  useEffect(() => {
    if (!enableAutoTracking || !trackingEnabled) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target) return;

      const tagName = target.tagName.toLowerCase();
      const className = target.className;
      const id = target.id;
      
      trackEvent({
        eventType: 'click',
        eventCategory: 'interaction',
        eventAction: 'element_click',
        metadata: {
          tagName,
          className,
          id,
          text: target.textContent?.substring(0, 100),
          href: target.getAttribute('href'),
          clickPosition: {
            x: event.clientX,
            y: event.clientY,
          },
        },
      });
    };

    document.addEventListener('click', handleClick, { passive: true });

    return () => {
      document.removeEventListener('click', handleClick);
    };
  }, [enableAutoTracking, trackingEnabled]);

  const contextValue: BehaviorContextType = {
    userId,
    sessionId,
    trackingEnabled,
    consentGiven,
    trackEvent,
    updatePrivacySettings,
  };

  return (
    <BehaviorContext.Provider value={contextValue}>
      {children}
      {showConsentModal && (
        <PrivacyConsentModal
          onAccept={handleConsentGranted}
          onDecline={handleConsentDenied}
          privacyPolicyUrl={privacyPolicyUrl}
        />
      )}
    </BehaviorContext.Provider>
  );
};

// Helper function to get user IP (simplified)
async function getUserIP(): Promise<string | undefined> {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip;
  } catch {
    return undefined;
  }
}
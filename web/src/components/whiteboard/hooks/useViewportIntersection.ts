/**
 * Viewport Intersection Hook
 * 
 * Efficiently tracks which elements are visible in the viewport
 * using Intersection Observer API for performance optimization.
 */

import { useEffect, useRef, useCallback, useState } from 'react';

interface UseViewportIntersectionOptions {
  threshold?: number | number[];
  rootMargin?: string;
  root?: Element | null;
}

interface IntersectionEntry {
  id: string;
  isIntersecting: boolean;
  intersectionRatio: number;
  boundingClientRect: DOMRect;
}

export function useViewportIntersection(
  options: UseViewportIntersectionOptions = {}
) {
  const {
    threshold = [0, 0.25, 0.5, 0.75, 1],
    rootMargin = '50px',
    root = null,
  } = options;

  const [entries, setEntries] = useState<Map<string, IntersectionEntry>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const elementsRef = useRef<Map<string, Element>>(new Map());

  // Initialize Intersection Observer
  useEffect(() => {
    if (!window.IntersectionObserver) {
      console.warn('IntersectionObserver not supported');
      return;
    }

    const observer = new IntersectionObserver(
      (observerEntries) => {
        setEntries((prevEntries) => {
          const newEntries = new Map(prevEntries);
          
          for (const entry of observerEntries) {
            const element = entry.target as Element;
            const id = element.getAttribute('data-intersection-id');
            
            if (id) {
              newEntries.set(id, {
                id,
                isIntersecting: entry.isIntersecting,
                intersectionRatio: entry.intersectionRatio,
                boundingClientRect: entry.boundingClientRect,
              });
            }
          }
          
          return newEntries;
        });
      },
      {
        threshold,
        rootMargin,
        root,
      }
    );

    observerRef.current = observer;

    return () => {
      observer.disconnect();
    };
  }, [threshold, rootMargin, root]);

  // Observe an element
  const observe = useCallback((id: string, element: Element) => {
    if (!observerRef.current || !element) return;

    // Set ID attribute for tracking
    element.setAttribute('data-intersection-id', id);
    
    // Store element reference
    elementsRef.current.set(id, element);
    
    // Start observing
    observerRef.current.observe(element);
  }, []);

  // Stop observing an element
  const unobserve = useCallback((id: string) => {
    if (!observerRef.current) return;

    const element = elementsRef.current.get(id);
    if (element) {
      observerRef.current.unobserve(element);
      elementsRef.current.delete(id);
      
      // Remove from entries
      setEntries((prevEntries) => {
        const newEntries = new Map(prevEntries);
        newEntries.delete(id);
        return newEntries;
      });
    }
  }, []);

  // Check if element is intersecting
  const isIntersecting = useCallback((id: string): boolean => {
    return entries.get(id)?.isIntersecting || false;
  }, [entries]);

  // Get intersection ratio
  const getIntersectionRatio = useCallback((id: string): number => {
    return entries.get(id)?.intersectionRatio || 0;
  }, [entries]);

  // Get all visible element IDs
  const getVisibleIds = useCallback((): string[] => {
    return Array.from(entries.values())
      .filter(entry => entry.isIntersecting)
      .map(entry => entry.id);
  }, [entries]);

  // Get intersection entry for specific ID
  const getEntry = useCallback((id: string): IntersectionEntry | undefined => {
    return entries.get(id);
  }, [entries]);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }
    elementsRef.current.clear();
    setEntries(new Map());
  }, []);

  return {
    observe,
    unobserve,
    isIntersecting,
    getIntersectionRatio,
    getVisibleIds,
    getEntry,
    cleanup,
    entries: Array.from(entries.values()),
    visibleCount: Array.from(entries.values()).filter(entry => entry.isIntersecting).length,
  };
}

export default useViewportIntersection;
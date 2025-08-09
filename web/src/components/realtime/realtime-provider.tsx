'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRealtimeUpdates, useRealtimeConnection } from '@/hooks/use-realtime';
import { ConnectionStatusBanner } from './connection-status';

interface RealtimeContextType {
  connectionStatus: string;
  isConnected: boolean;
  sendMessage: (type: string, payload: any) => string | null;
  reconnect: () => void;
}

const RealtimeContext = createContext<RealtimeContextType | null>(null);

export function useRealtime() {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error('useRealtime must be used within a RealtimeProvider');
  }
  return context;
}

interface RealtimeProviderProps {
  children: React.ReactNode;
}

export function RealtimeProvider({ children }: RealtimeProviderProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Initialize real-time connection with delay to prevent suspension
  const connection = useRealtimeConnection();
  
  // Set up real-time update handlers
  useRealtimeUpdates();

  // Delay initialization to prevent synchronous suspension
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setIsInitialized(true);
    }, 100);
    
    return () => clearTimeout(timeoutId);
  }, []);

  const contextValue: RealtimeContextType = {
    connectionStatus: isInitialized ? connection.connectionStatus : 'disconnected',
    isConnected: isInitialized ? connection.isConnected : false,
    sendMessage: isInitialized ? connection.sendMessage : () => null,
    reconnect: isInitialized ? connection.connect : () => {},
  };

  return (
    <RealtimeContext.Provider value={contextValue}>
      {isInitialized && (
        <ConnectionStatusBanner 
          status={connection.connectionStatus}
          onReconnect={connection.connect}
        />
      )}
      {children}
    </RealtimeContext.Provider>
  );
}
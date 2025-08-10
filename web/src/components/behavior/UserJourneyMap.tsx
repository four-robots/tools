'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Badge } from '@/components/ui/badge';

interface UserJourneyMapProps {
  userId?: string;
  apiUrl: string;
  dateRange: {
    start: Date;
    end: Date;
  };
}

export const UserJourneyMap: React.FC<UserJourneyMapProps> = ({
  userId,
  apiUrl,
  dateRange,
}) => {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        if (!userId) {
          setLoading(false);
          return;
        }

        const params = new URLSearchParams({
          userId,
          startDate: dateRange.start.toISOString(),
          endDate: dateRange.end.toISOString(),
          limit: '50',
        });

        const response = await fetch(`${apiUrl}/events?${params}`);
        const result = await response.json();
        
        if (result.success) {
          setEvents(result.data.events || []);
        }
      } catch (error) {
        console.error('Failed to fetch user events:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [userId, apiUrl, dateRange]);

  if (loading) {
    return <LoadingSpinner />;
  }

  const groupEventsBySession = (events: any[]) => {
    const sessions = new Map();
    events.forEach(event => {
      if (!sessions.has(event.sessionId)) {
        sessions.set(event.sessionId, []);
      }
      sessions.get(event.sessionId).push(event);
    });
    return Array.from(sessions.entries()).map(([sessionId, sessionEvents]) => ({
      sessionId,
      events: sessionEvents.sort((a: any, b: any) => 
        new Date(a.eventTimestamp).getTime() - new Date(b.eventTimestamp).getTime()
      ),
    }));
  };

  const sessions = groupEventsBySession(events);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>User Journey Map</CardTitle>
          <CardDescription>
            Your interaction flow and navigation patterns
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sessions.length > 0 ? (
            <div className="space-y-6">
              {sessions.slice(0, 5).map((session, index) => (
                <div key={session.sessionId} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Session {index + 1}</h4>
                    <Badge variant="outline">{session.events.length} events</Badge>
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    {session.events.map((event: any, eventIndex: number) => (
                      <div key={eventIndex} className="flex items-center">
                        <div className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
                          {event.eventType}: {event.eventAction}
                        </div>
                        {eventIndex < session.events.length - 1 && (
                          <div className="mx-1 text-gray-400">→</div>
                        )}
                      </div>
                    ))}
                  </div>
                  
                  <div className="text-xs text-muted-foreground">
                    Duration: {Math.round((
                      new Date(session.events[session.events.length - 1].eventTimestamp).getTime() - 
                      new Date(session.events[0].eventTimestamp).getTime()
                    ) / 1000 / 60)} minutes
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No user journey data available for the selected time range.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
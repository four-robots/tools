/**
 * PersonalizationAnalytics - Analytics dashboard stub
 */

'use client';

import React from 'react';
import { Card } from '@/components/ui/card';

interface PersonalizationAnalyticsProps {
  analytics: any;
  interests: any[];
  profile: any;
}

export const PersonalizationAnalytics: React.FC<PersonalizationAnalyticsProps> = ({
  analytics,
  interests,
  profile
}) => (
  <Card className="p-6">
    <h3 className="text-lg font-semibold mb-4">Personalization Analytics</h3>
    <p className="text-gray-600">View detailed analytics about your personalization here.</p>
  </Card>
);
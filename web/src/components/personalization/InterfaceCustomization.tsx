/**
 * InterfaceCustomization - Interface preferences stub
 */

'use client';

import React from 'react';
import { Card } from '@/components/ui/card';

interface InterfaceCustomizationProps {
  profile: any;
  onPreferencesChange: (preferences: any) => void;
}

export const InterfaceCustomization: React.FC<InterfaceCustomizationProps> = ({
  profile,
  onPreferencesChange
}) => (
  <Card className="p-6">
    <h3 className="text-lg font-semibold mb-4">Interface Customization</h3>
    <p className="text-gray-600">Customize your interface preferences here.</p>
  </Card>
);
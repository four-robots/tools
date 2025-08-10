'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface PrivacyConsentModalProps {
  onAccept: (settings: PrivacySettings) => void;
  onDecline: () => void;
  privacyPolicyUrl?: string;
}

interface PrivacySettings {
  behaviorTrackingEnabled: boolean;
  analyticsConsent: boolean;
  personalizationConsent: boolean;
  dataRetentionConsent: boolean;
  eventTrackingTypes: string[];
  dataRetentionPeriodDays: number;
  anonymizationPreference: 'none' | 'partial' | 'full';
}

export const PrivacyConsentModal: React.FC<PrivacyConsentModalProps> = ({
  onAccept,
  onDecline,
  privacyPolicyUrl,
}) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [settings, setSettings] = useState<PrivacySettings>({
    behaviorTrackingEnabled: true,
    analyticsConsent: true,
    personalizationConsent: true,
    dataRetentionConsent: true,
    eventTrackingTypes: ['search', 'click', 'view', 'navigation'],
    dataRetentionPeriodDays: 365,
    anonymizationPreference: 'partial',
  });

  const handleSettingChange = (key: keyof PrivacySettings, value: any) => {
    setSettings(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleAcceptAll = () => {
    onAccept(settings);
  };

  const handleAcceptEssential = () => {
    onAccept({
      behaviorTrackingEnabled: false,
      analyticsConsent: false,
      personalizationConsent: false,
      dataRetentionConsent: true,
      eventTrackingTypes: [],
      dataRetentionPeriodDays: 90,
      anonymizationPreference: 'full',
    });
  };

  const handleCustomizeAndAccept = () => {
    onAccept(settings);
  };

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-2xl">🔒</span>
            Privacy & Data Usage Consent
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="tracking">Tracking</TabsTrigger>
            <TabsTrigger value="privacy">Privacy</TabsTrigger>
            <TabsTrigger value="data">Data Usage</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                We use behavioral analytics to improve your search experience and provide personalized recommendations. 
                You have full control over what data we collect and how we use it.
              </p>

              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      What We Collect
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs space-y-2">
                    <div>• Search queries and interactions</div>
                    <div>• Page navigation patterns</div>
                    <div>• Click and engagement data</div>
                    <div>• Device and browser information</div>
                    <div>• Usage timing and frequency</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <span className="text-blue-500">⚡</span>
                      How We Use It
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs space-y-2">
                    <div>• Improve search relevance</div>
                    <div>• Personalized recommendations</div>
                    <div>• Performance optimization</div>
                    <div>• Feature usage analytics</div>
                    <div>• Bug detection and fixes</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <span className="text-purple-500">🔐</span>
                      Your Privacy Rights
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs space-y-2">
                    <div>• Control data collection</div>
                    <div>• Request data deletion</div>
                    <div>• Export your data</div>
                    <div>• Adjust anonymization level</div>
                    <div>• Change settings anytime</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <span className="text-orange-500">🛡️</span>
                      Data Protection
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs space-y-2">
                    <div>• Encrypted data transmission</div>
                    <div>• Secure data storage</div>
                    <div>• No data selling to third parties</div>
                    <div>• GDPR & CCPA compliant</div>
                    <div>• Regular security audits</div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="tracking" className="space-y-4">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium mb-2">Behavior Tracking Preferences</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium">Enable Behavior Tracking</label>
                      <p className="text-xs text-muted-foreground">Track user interactions to improve experience</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.behaviorTrackingEnabled}
                      onChange={(e) => handleSettingChange('behaviorTrackingEnabled', e.target.checked)}
                      className="h-4 w-4"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium">Analytics Data</label>
                      <p className="text-xs text-muted-foreground">Usage statistics and performance metrics</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.analyticsConsent}
                      onChange={(e) => handleSettingChange('analyticsConsent', e.target.checked)}
                      className="h-4 w-4"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium">Personalization</label>
                      <p className="text-xs text-muted-foreground">Customize experience based on your preferences</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.personalizationConsent}
                      onChange={(e) => handleSettingChange('personalizationConsent', e.target.checked)}
                      className="h-4 w-4"
                    />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium mb-2">Event Types to Track</h3>
                <div className="grid grid-cols-2 gap-2">
                  {['search', 'click', 'view', 'navigation', 'scroll', 'hover'].map((type) => (
                    <div key={type} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={type}
                        checked={settings.eventTrackingTypes.includes(type)}
                        onChange={(e) => {
                          const types = e.target.checked
                            ? [...settings.eventTrackingTypes, type]
                            : settings.eventTrackingTypes.filter(t => t !== type);
                          handleSettingChange('eventTrackingTypes', types);
                        }}
                        className="h-4 w-4"
                      />
                      <label htmlFor={type} className="text-sm capitalize">
                        {type}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="privacy" className="space-y-4">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium mb-2">Data Anonymization</h3>
                <div className="space-y-2">
                  {[
                    { value: 'none', label: 'None', description: 'Store data as-is for full personalization' },
                    { value: 'partial', label: 'Partial', description: 'Remove identifying information but keep usage patterns' },
                    { value: 'full', label: 'Full', description: 'Fully anonymize all data for privacy' }
                  ].map((option) => (
                    <div key={option.value} className="flex items-start space-x-2">
                      <input
                        type="radio"
                        id={option.value}
                        name="anonymization"
                        value={option.value}
                        checked={settings.anonymizationPreference === option.value}
                        onChange={(e) => handleSettingChange('anonymizationPreference', e.target.value)}
                        className="h-4 w-4 mt-0.5"
                      />
                      <div>
                        <label htmlFor={option.value} className="text-sm font-medium">
                          {option.label}
                        </label>
                        <p className="text-xs text-muted-foreground">{option.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium mb-2">Privacy Features</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">IP Anonymization</Badge>
                    <span className="text-xs text-muted-foreground">Your IP address is automatically anonymized</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Session Encryption</Badge>
                    <span className="text-xs text-muted-foreground">All data is encrypted in transit and at rest</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">No Cross-Site Tracking</Badge>
                    <span className="text-xs text-muted-foreground">We don't track you across other websites</span>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="data" className="space-y-4">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium mb-2">Data Retention</h3>
                <div>
                  <label className="text-sm">Keep my data for:</label>
                  <select
                    value={settings.dataRetentionPeriodDays}
                    onChange={(e) => handleSettingChange('dataRetentionPeriodDays', parseInt(e.target.value))}
                    className="ml-2 text-sm border rounded px-2 py-1"
                  >
                    <option value={90}>3 months</option>
                    <option value={180}>6 months</option>
                    <option value={365}>1 year</option>
                    <option value={730}>2 years</option>
                  </select>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Data will be automatically deleted after this period
                </p>
              </div>

              <div>
                <h3 className="text-sm font-medium mb-2">Your Rights</h3>
                <div className="space-y-2 text-xs">
                  <div>• <strong>Access:</strong> Request a copy of all your data</div>
                  <div>• <strong>Portability:</strong> Export your data in a standard format</div>
                  <div>• <strong>Rectification:</strong> Correct any inaccurate data</div>
                  <div>• <strong>Erasure:</strong> Delete your data permanently</div>
                  <div>• <strong>Restriction:</strong> Limit how we process your data</div>
                  <div>• <strong>Objection:</strong> Opt out of specific data processing</div>
                </div>
              </div>

              {privacyPolicyUrl && (
                <div>
                  <a
                    href={privacyPolicyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Read our full Privacy Policy →
                  </a>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="flex gap-2 flex-wrap">
            <Button onClick={onDecline} variant="outline" size="sm">
              Decline All
            </Button>
            <Button onClick={handleAcceptEssential} variant="outline" size="sm">
              Essential Only
            </Button>
            <Button onClick={handleAcceptAll} size="sm">
              Accept All
            </Button>
            <Button onClick={handleCustomizeAndAccept} variant="default" size="sm">
              Save My Preferences
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            You can change these settings at any time in your privacy preferences.
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
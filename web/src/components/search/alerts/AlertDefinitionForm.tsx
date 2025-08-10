import React, { useState, useEffect } from 'react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Textarea } from '../../ui/textarea';
import { Select } from '../../ui/select';
import { Card } from '../../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { Badge } from '../../ui/badge';
import { PlusIcon, XIcon } from 'lucide-react';

interface SavedSearch {
  id: string;
  name: string;
  description?: string;
}

interface NotificationTemplate {
  id: string;
  name: string;
  templateType: string;
}

interface AlertDefinitionFormProps {
  savedSearches: SavedSearch[];
  templates: NotificationTemplate[];
  initialAlert?: any;
  onSubmit: (alertData: any) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export function AlertDefinitionForm({
  savedSearches,
  templates,
  initialAlert,
  onSubmit,
  onCancel,
  isLoading = false,
}: AlertDefinitionFormProps) {
  const [formData, setFormData] = useState({
    name: initialAlert?.name || '',
    description: initialAlert?.description || '',
    savedSearchId: initialAlert?.savedSearchId || '',
    
    // Trigger conditions
    resultThreshold: initialAlert?.triggerConditions?.resultThreshold || '',
    changeDetection: initialAlert?.triggerConditions?.changeDetection || false,
    resultIncrease: initialAlert?.triggerConditions?.resultIncrease || '',
    resultDecrease: initialAlert?.triggerConditions?.resultDecrease || '',
    newResults: initialAlert?.triggerConditions?.newResults || false,
    
    // Schedule configuration
    scheduleType: initialAlert?.scheduleConfig?.type || 'manual',
    intervalValue: initialAlert?.scheduleConfig?.interval?.value || '',
    intervalUnit: initialAlert?.scheduleConfig?.interval?.unit || 'hours',
    cronExpression: initialAlert?.scheduleConfig?.cronExpression || '',
    timezone: initialAlert?.scheduleConfig?.timezone || 'UTC',
    
    // Notification settings
    notificationTemplateId: initialAlert?.notificationTemplateId || '',
    maxAlertsPerDay: initialAlert?.maxAlertsPerDay || 10,
    maxAlertsPerHour: initialAlert?.maxAlertsPerHour || 2,
  });

  const [notificationChannels, setNotificationChannels] = useState<any[]>(
    initialAlert?.notificationChannels || [{ type: 'in_app', config: {} }]
  );

  const [customConditions, setCustomConditions] = useState<any[]>(
    initialAlert?.triggerConditions?.customConditions || []
  );

  const [activeHours, setActiveHours] = useState({
    enabled: false,
    start: '09:00',
    end: '17:00',
    days: [1, 2, 3, 4, 5], // Monday to Friday
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const addNotificationChannel = () => {
    setNotificationChannels(prev => [...prev, { type: 'email', config: {} }]);
  };

  const updateNotificationChannel = (index: number, updates: any) => {
    setNotificationChannels(prev =>
      prev.map((channel, i) => (i === index ? { ...channel, ...updates } : channel))
    );
  };

  const removeNotificationChannel = (index: number) => {
    if (notificationChannels.length > 1) {
      setNotificationChannels(prev => prev.filter((_, i) => i !== index));
    }
  };

  const addCustomCondition = () => {
    setCustomConditions(prev => [...prev, { field: '', operator: 'equals', value: '' }]);
  };

  const updateCustomCondition = (index: number, updates: any) => {
    setCustomConditions(prev =>
      prev.map((condition, i) => (i === index ? { ...condition, ...updates } : condition))
    );
  };

  const removeCustomCondition = (index: number) => {
    setCustomConditions(prev => prev.filter((_, i) => i !== index));
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Alert name is required';
    }

    if (!formData.savedSearchId) {
      newErrors.savedSearchId = 'Saved search is required';
    }

    if (formData.scheduleType === 'interval') {
      if (!formData.intervalValue || parseInt(formData.intervalValue) <= 0) {
        newErrors.intervalValue = 'Valid interval value is required';
      }
    }

    if (formData.scheduleType === 'cron') {
      if (!formData.cronExpression.trim()) {
        newErrors.cronExpression = 'Cron expression is required';
      }
    }

    if (notificationChannels.length === 0) {
      newErrors.notifications = 'At least one notification channel is required';
    }

    // Validate notification channel configurations
    notificationChannels.forEach((channel, index) => {
      if (channel.type === 'email' && !channel.config.recipient) {
        newErrors[`channel_${index}_recipient`] = 'Email recipient is required';
      }
      if (channel.type === 'webhook' && !channel.config.url) {
        newErrors[`channel_${index}_url`] = 'Webhook URL is required';
      }
      if (channel.type === 'sms' && !channel.config.phoneNumber) {
        newErrors[`channel_${index}_phone`] = 'Phone number is required';
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    const triggerConditions: any = {
      changeDetection: formData.changeDetection,
      newResults: formData.newResults,
    };

    if (formData.resultThreshold) {
      triggerConditions.resultThreshold = parseInt(formData.resultThreshold);
    }
    if (formData.resultIncrease) {
      triggerConditions.resultIncrease = parseFloat(formData.resultIncrease);
    }
    if (formData.resultDecrease) {
      triggerConditions.resultDecrease = parseFloat(formData.resultDecrease);
    }
    if (customConditions.length > 0) {
      triggerConditions.customConditions = customConditions;
    }

    const scheduleConfig: any = {
      type: formData.scheduleType,
      timezone: formData.timezone,
    };

    if (formData.scheduleType === 'interval') {
      scheduleConfig.interval = {
        value: parseInt(formData.intervalValue),
        unit: formData.intervalUnit,
      };
    }

    if (formData.scheduleType === 'cron') {
      scheduleConfig.cronExpression = formData.cronExpression;
    }

    if (activeHours.enabled) {
      scheduleConfig.activeHours = {
        start: activeHours.start,
        end: activeHours.end,
        days: activeHours.days,
      };
    }

    const alertData = {
      name: formData.name,
      description: formData.description,
      savedSearchId: formData.savedSearchId,
      triggerConditions,
      scheduleConfig,
      notificationChannels,
      notificationTemplateId: formData.notificationTemplateId || undefined,
      maxAlertsPerDay: parseInt(formData.maxAlertsPerDay.toString()),
      maxAlertsPerHour: parseInt(formData.maxAlertsPerHour.toString()),
    };

    try {
      await onSubmit(alertData);
    } catch (error) {
      console.error('Error submitting alert:', error);
    }
  };

  const renderNotificationChannelConfig = (channel: any, index: number) => {
    return (
      <Card key={index} className="p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <Label>Notification Channel {index + 1}</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => removeNotificationChannel(index)}
            disabled={notificationChannels.length === 1}
          >
            <XIcon className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="grid grid-cols-2 gap-4 mb-3">
          <div>
            <Label htmlFor={`channel-type-${index}`}>Channel Type</Label>
            <Select
              value={channel.type}
              onValueChange={(value) => updateNotificationChannel(index, { type: value, config: {} })}
            >
              <option value="email">Email</option>
              <option value="webhook">Webhook</option>
              <option value="sms">SMS</option>
              <option value="in_app">In-App</option>
            </Select>
          </div>
        </div>

        {channel.type === 'email' && (
          <div className="grid grid-cols-1 gap-4">
            <div>
              <Label htmlFor={`email-recipient-${index}`}>Email Recipient</Label>
              <Input
                id={`email-recipient-${index}`}
                type="email"
                value={channel.config.recipient || ''}
                onChange={(e) => updateNotificationChannel(index, {
                  config: { ...channel.config, recipient: e.target.value }
                })}
                placeholder="user@example.com"
              />
              {errors[`channel_${index}_recipient`] && (
                <span className="text-sm text-red-500">{errors[`channel_${index}_recipient`]}</span>
              )}
            </div>
          </div>
        )}

        {channel.type === 'webhook' && (
          <div className="grid grid-cols-1 gap-4">
            <div>
              <Label htmlFor={`webhook-url-${index}`}>Webhook URL</Label>
              <Input
                id={`webhook-url-${index}`}
                type="url"
                value={channel.config.url || ''}
                onChange={(e) => updateNotificationChannel(index, {
                  config: { ...channel.config, url: e.target.value }
                })}
                placeholder="https://api.example.com/webhook"
              />
              {errors[`channel_${index}_url`] && (
                <span className="text-sm text-red-500">{errors[`channel_${index}_url`]}</span>
              )}
            </div>
            <div>
              <Label htmlFor={`webhook-method-${index}`}>HTTP Method</Label>
              <Select
                value={channel.config.method || 'POST'}
                onValueChange={(value) => updateNotificationChannel(index, {
                  config: { ...channel.config, method: value }
                })}
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
              </Select>
            </div>
          </div>
        )}

        {channel.type === 'sms' && (
          <div className="grid grid-cols-1 gap-4">
            <div>
              <Label htmlFor={`sms-phone-${index}`}>Phone Number</Label>
              <Input
                id={`sms-phone-${index}`}
                type="tel"
                value={channel.config.phoneNumber || ''}
                onChange={(e) => updateNotificationChannel(index, {
                  config: { ...channel.config, phoneNumber: e.target.value }
                })}
                placeholder="+1234567890"
              />
              {errors[`channel_${index}_phone`] && (
                <span className="text-sm text-red-500">{errors[`channel_${index}_phone`]}</span>
              )}
            </div>
          </div>
        )}

        {channel.type === 'in_app' && (
          <div className="grid grid-cols-1 gap-4">
            <div>
              <Label htmlFor={`inapp-priority-${index}`}>Priority</Label>
              <Select
                value={channel.config.priority || 'normal'}
                onValueChange={(value) => updateNotificationChannel(index, {
                  config: { ...channel.config, priority: value }
                })}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </Select>
            </div>
          </div>
        )}
      </Card>
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 gap-6">
        {/* Basic Information */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Basic Information</h3>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <Label htmlFor="name">Alert Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="My Search Alert"
                className={errors.name ? 'border-red-500' : ''}
              />
              {errors.name && <span className="text-sm text-red-500">{errors.name}</span>}
            </div>
            
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Describe what this alert monitors..."
                rows={3}
              />
            </div>
            
            <div>
              <Label htmlFor="savedSearchId">Saved Search *</Label>
              <Select
                value={formData.savedSearchId}
                onValueChange={(value) => handleInputChange('savedSearchId', value)}
              >
                <option value="">Select a saved search...</option>
                {savedSearches.map((search) => (
                  <option key={search.id} value={search.id}>
                    {search.name}
                  </option>
                ))}
              </Select>
              {errors.savedSearchId && <span className="text-sm text-red-500">{errors.savedSearchId}</span>}
            </div>
          </div>
        </Card>

        {/* Configuration Tabs */}
        <Card className="p-6">
          <Tabs defaultValue="conditions" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="conditions">Trigger Conditions</TabsTrigger>
              <TabsTrigger value="schedule">Schedule</TabsTrigger>
              <TabsTrigger value="notifications">Notifications</TabsTrigger>
              <TabsTrigger value="limits">Rate Limits</TabsTrigger>
            </TabsList>
            
            {/* Trigger Conditions Tab */}
            <TabsContent value="conditions" className="space-y-4">
              <h4 className="text-md font-semibold">When should this alert trigger?</h4>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="resultThreshold">Minimum Result Count</Label>
                  <Input
                    id="resultThreshold"
                    type="number"
                    value={formData.resultThreshold}
                    onChange={(e) => handleInputChange('resultThreshold', e.target.value)}
                    placeholder="0"
                    min="0"
                  />
                </div>
                
                <div>
                  <Label htmlFor="resultIncrease">Result Increase (%)</Label>
                  <Input
                    id="resultIncrease"
                    type="number"
                    value={formData.resultIncrease}
                    onChange={(e) => handleInputChange('resultIncrease', e.target.value)}
                    placeholder="10"
                    min="0"
                    max="100"
                  />
                </div>
              </div>
              
              <div className="flex space-x-4">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={formData.changeDetection}
                    onChange={(e) => handleInputChange('changeDetection', e.target.checked)}
                  />
                  <span>Only trigger on changes</span>
                </label>
                
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={formData.newResults}
                    onChange={(e) => handleInputChange('newResults', e.target.checked)}
                  />
                  <span>Only trigger on new results</span>
                </label>
              </div>

              {/* Custom Conditions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Custom Conditions</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addCustomCondition}>
                    <PlusIcon className="h-4 w-4 mr-1" /> Add Condition
                  </Button>
                </div>
                
                {customConditions.map((condition, index) => (
                  <div key={index} className="flex items-center space-x-2 mb-2">
                    <Input
                      placeholder="Field"
                      value={condition.field}
                      onChange={(e) => updateCustomCondition(index, { field: e.target.value })}
                    />
                    <Select
                      value={condition.operator}
                      onValueChange={(value) => updateCustomCondition(index, { operator: value })}
                    >
                      <option value="equals">equals</option>
                      <option value="contains">contains</option>
                      <option value="greater_than">greater than</option>
                      <option value="less_than">less than</option>
                    </Select>
                    <Input
                      placeholder="Value"
                      value={condition.value}
                      onChange={(e) => updateCustomCondition(index, { value: e.target.value })}
                    />
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeCustomCondition(index)}>
                      <XIcon className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </TabsContent>
            
            {/* Schedule Tab */}
            <TabsContent value="schedule" className="space-y-4">
              <div>
                <Label htmlFor="scheduleType">Schedule Type</Label>
                <Select
                  value={formData.scheduleType}
                  onValueChange={(value) => handleInputChange('scheduleType', value)}
                >
                  <option value="manual">Manual Only</option>
                  <option value="interval">Interval Based</option>
                  <option value="cron">Cron Expression</option>
                  <option value="real_time">Real-time</option>
                </Select>
              </div>
              
              {formData.scheduleType === 'interval' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="intervalValue">Interval Value</Label>
                    <Input
                      id="intervalValue"
                      type="number"
                      value={formData.intervalValue}
                      onChange={(e) => handleInputChange('intervalValue', e.target.value)}
                      placeholder="1"
                      min="1"
                      className={errors.intervalValue ? 'border-red-500' : ''}
                    />
                    {errors.intervalValue && <span className="text-sm text-red-500">{errors.intervalValue}</span>}
                  </div>
                  <div>
                    <Label htmlFor="intervalUnit">Unit</Label>
                    <Select
                      value={formData.intervalUnit}
                      onValueChange={(value) => handleInputChange('intervalUnit', value)}
                    >
                      <option value="minutes">Minutes</option>
                      <option value="hours">Hours</option>
                      <option value="days">Days</option>
                    </Select>
                  </div>
                </div>
              )}
              
              {formData.scheduleType === 'cron' && (
                <div>
                  <Label htmlFor="cronExpression">Cron Expression</Label>
                  <Input
                    id="cronExpression"
                    value={formData.cronExpression}
                    onChange={(e) => handleInputChange('cronExpression', e.target.value)}
                    placeholder="0 9 * * 1-5"
                    className={errors.cronExpression ? 'border-red-500' : ''}
                  />
                  {errors.cronExpression && <span className="text-sm text-red-500">{errors.cronExpression}</span>}
                  <p className="text-sm text-gray-500 mt-1">
                    Example: "0 9 * * 1-5" = Every weekday at 9 AM
                  </p>
                </div>
              )}
              
              <div>
                <Label htmlFor="timezone">Timezone</Label>
                <Select
                  value={formData.timezone}
                  onValueChange={(value) => handleInputChange('timezone', value)}
                >
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">Eastern Time</option>
                  <option value="America/Chicago">Central Time</option>
                  <option value="America/Denver">Mountain Time</option>
                  <option value="America/Los_Angeles">Pacific Time</option>
                  <option value="Europe/London">London</option>
                  <option value="Europe/Paris">Paris</option>
                  <option value="Asia/Tokyo">Tokyo</option>
                </Select>
              </div>
            </TabsContent>
            
            {/* Notifications Tab */}
            <TabsContent value="notifications" className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-md font-semibold">Notification Channels</h4>
                <Button type="button" variant="outline" onClick={addNotificationChannel}>
                  <PlusIcon className="h-4 w-4 mr-1" /> Add Channel
                </Button>
              </div>
              
              {notificationChannels.map((channel, index) => renderNotificationChannelConfig(channel, index))}
              
              {errors.notifications && (
                <span className="text-sm text-red-500">{errors.notifications}</span>
              )}
              
              <div>
                <Label htmlFor="notificationTemplateId">Notification Template (Optional)</Label>
                <Select
                  value={formData.notificationTemplateId}
                  onValueChange={(value) => handleInputChange('notificationTemplateId', value)}
                >
                  <option value="">Use default template</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} ({template.templateType})
                    </option>
                  ))}
                </Select>
              </div>
            </TabsContent>
            
            {/* Rate Limits Tab */}
            <TabsContent value="limits" className="space-y-4">
              <h4 className="text-md font-semibold">Rate Limiting</h4>
              <p className="text-sm text-gray-600">
                Prevent notification spam by limiting alert frequency
              </p>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="maxAlertsPerHour">Max Alerts per Hour</Label>
                  <Input
                    id="maxAlertsPerHour"
                    type="number"
                    value={formData.maxAlertsPerHour}
                    onChange={(e) => handleInputChange('maxAlertsPerHour', e.target.value)}
                    min="1"
                  />
                </div>
                
                <div>
                  <Label htmlFor="maxAlertsPerDay">Max Alerts per Day</Label>
                  <Input
                    id="maxAlertsPerDay"
                    type="number"
                    value={formData.maxAlertsPerDay}
                    onChange={(e) => handleInputChange('maxAlertsPerDay', e.target.value)}
                    min="1"
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </Card>
      </div>

      {/* Form Actions */}
      <div className="flex justify-end space-x-3">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Saving...' : initialAlert ? 'Update Alert' : 'Create Alert'}
        </Button>
      </div>
    </form>
  );
}
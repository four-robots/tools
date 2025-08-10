'use client';

import React, { useState } from 'react';
import { FilterTree, SharePermission } from '@mcp-tools/core';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Badge } from '../../ui/badge';
import { Dialog } from '../../ui/dialog';
import { 
  Share2, 
  Copy, 
  Link, 
  QrCode, 
  Clock,
  Users,
  Eye,
  Edit,
  Shield,
  X,
  CheckCircle,
  Globe,
  ExternalLink
} from 'lucide-react';

interface FilterShareDialogProps {
  filterTree: FilterTree;
  shareUrl?: string;
  onClose: () => void;
  onShare: (permissions: SharePermission, expiresIn?: number) => Promise<string>;
}

export const FilterShareDialog: React.FC<FilterShareDialogProps> = ({
  filterTree,
  shareUrl: initialShareUrl,
  onClose,
  onShare
}) => {
  const [permissions, setPermissions] = useState<SharePermission>('view');
  const [expiresIn, setExpiresIn] = useState<number>(24); // hours
  const [customExpiry, setCustomExpiry] = useState(false);
  const [shareUrl, setShareUrl] = useState(initialShareUrl);
  const [isSharing, setIsSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);

  // Generate share URL
  const handleShare = async () => {
    setIsSharing(true);
    try {
      const url = await onShare(permissions, customExpiry ? expiresIn : undefined);
      setShareUrl(url);
    } catch (error) {
      console.error('Failed to share filter:', error);
    } finally {
      setIsSharing(false);
    }
  };

  // Copy to clipboard
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  // Generate QR code data URL (mock implementation)
  const generateQRCode = (url: string): string => {
    // In a real implementation, you'd use a QR code library
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
  };

  // Get permission icon and description
  const getPermissionInfo = (perm: SharePermission) => {
    switch (perm) {
      case 'view':
        return {
          icon: <Eye size={16} />,
          label: 'View Only',
          description: 'Recipients can view and apply the filter but cannot modify it'
        };
      case 'edit':
        return {
          icon: <Edit size={16} />,
          label: 'Can Edit',
          description: 'Recipients can view, apply, and modify the filter'
        };
      case 'admin':
        return {
          icon: <Shield size={16} />,
          label: 'Full Access',
          description: 'Recipients can view, edit, share, and delete the filter'
        };
      default:
        return {
          icon: <Eye size={16} />,
          label: 'View Only',
          description: 'Default permission'
        };
    }
  };

  const permissionInfo = getPermissionInfo(permissions);

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Share2 size={20} />
                Share Filter
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X size={16} />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Filter Preview */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Filter to Share</h3>
              <div className="text-sm text-gray-600">
                <code className="bg-white px-2 py-1 rounded text-xs">
                  {JSON.stringify(filterTree, null, 2).substring(0, 200)}...
                </code>
              </div>
            </div>

            {/* Permissions */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">Access Permissions</h3>
              <div className="grid grid-cols-1 gap-3">
                {(['view', 'edit', 'admin'] as SharePermission[]).map((perm) => {
                  const info = getPermissionInfo(perm);
                  return (
                    <label
                      key={perm}
                      className={`
                        flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors
                        ${permissions === perm 
                          ? 'border-blue-500 bg-blue-50' 
                          : 'border-gray-200 hover:border-gray-300'
                        }
                      `}
                    >
                      <input
                        type="radio"
                        name="permissions"
                        value={perm}
                        checked={permissions === perm}
                        onChange={(e) => setPermissions(e.target.value as SharePermission)}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {info.icon}
                          <span className="font-medium">{info.label}</span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{info.description}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Expiration */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">Link Expiration</h3>
              <div className="space-y-3">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="expiry"
                    checked={!customExpiry}
                    onChange={() => setCustomExpiry(false)}
                  />
                  <span className="text-sm">Never expires</span>
                </label>
                
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="expiry"
                    checked={customExpiry}
                    onChange={() => setCustomExpiry(true)}
                  />
                  <span className="text-sm">Expires in</span>
                  {customExpiry && (
                    <div className="flex items-center gap-2 ml-2">
                      <Input
                        type="number"
                        min="1"
                        max="8760" // 1 year in hours
                        value={expiresIn}
                        onChange={(e) => setExpiresIn(parseInt(e.target.value) || 24)}
                        className="w-20"
                      />
                      <span className="text-sm text-gray-600">hours</span>
                    </div>
                  )}
                </label>
              </div>
            </div>

            {/* Share Actions */}
            {!shareUrl ? (
              <Button
                onClick={handleShare}
                disabled={isSharing}
                className="w-full"
              >
                {isSharing ? (
                  <>
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                    Creating Share Link...
                  </>
                ) : (
                  <>
                    <Link size={16} className="mr-2" />
                    Generate Share Link
                  </>
                )}
              </Button>
            ) : (
              <div className="space-y-4">
                {/* Generated Link */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle size={16} className="text-green-600" />
                    <h3 className="text-sm font-medium text-green-700">Share Link Generated</h3>
                  </div>
                  
                  <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <Input
                      value={shareUrl}
                      readOnly
                      className="flex-1 bg-transparent border-0 text-sm"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(shareUrl)}
                    >
                      {copied ? (
                        <>
                          <CheckCircle size={14} className="mr-1" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy size={14} className="mr-1" />
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Share Options */}
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setShowQR(!showQR)}
                  >
                    <QrCode size={16} className="mr-2" />
                    QR Code
                  </Button>
                  
                  <Button
                    variant="outline"
                    onClick={() => window.open(shareUrl, '_blank')}
                  >
                    <ExternalLink size={16} className="mr-2" />
                    Test Link
                  </Button>
                </div>

                {/* QR Code */}
                {showQR && (
                  <div className="text-center p-4 bg-white border rounded-lg">
                    <img
                      src={generateQRCode(shareUrl)}
                      alt="QR Code"
                      className="mx-auto mb-3"
                      width={200}
                      height={200}
                    />
                    <p className="text-sm text-gray-600">Scan to access the shared filter</p>
                  </div>
                )}

                {/* Share Info */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-medium text-blue-800 mb-2">Share Details</h4>
                  <div className="text-sm text-blue-700 space-y-1">
                    <div className="flex items-center gap-2">
                      {permissionInfo.icon}
                      <span>Permission: {permissionInfo.label}</span>
                    </div>
                    {customExpiry && (
                      <div className="flex items-center gap-2">
                        <Clock size={14} />
                        <span>Expires in {expiresIn} hours</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Globe size={14} />
                      <span>Anyone with the link can access</span>
                    </div>
                  </div>
                </div>

                {/* Quick Share Actions */}
                <div className="border-t pt-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Quick Share</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const subject = 'Shared Filter';
                        const body = `I've shared a filter with you: ${shareUrl}`;
                        window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
                      }}
                    >
                      Email
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const text = `Check out this filter: ${shareUrl}`;
                        if (navigator.share) {
                          navigator.share({ title: 'Shared Filter', url: shareUrl });
                        } else {
                          copyToClipboard(text);
                        }
                      }}
                    >
                      Share
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Security Note */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <Shield size={16} className="text-yellow-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-yellow-800">Security Note</p>
                  <p className="text-yellow-700 mt-1">
                    Anyone with this link will be able to access the filter with the specified permissions.
                    Only share with trusted recipients.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Dialog>
  );
};

export default FilterShareDialog;
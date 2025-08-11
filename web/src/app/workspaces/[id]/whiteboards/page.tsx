'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { WhiteboardList } from '@/components/whiteboard';
import { PageWrapper } from '@/components/PageWrapper';

export default function WhiteboardsPage() {
  const params = useParams();
  const workspaceId = params.id as string;

  // TODO: Get workspace details from API or context
  const workspaceName = 'Workspace'; // This should come from workspace data
  const userRole = 'editor'; // This should come from user permissions

  return (
    <PageWrapper title="Whiteboards">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <WhiteboardList
          workspaceId={workspaceId}
          workspaceName={workspaceName}
          userRole={userRole}
        />
      </div>
    </PageWrapper>
  );
}
'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { WhiteboardEditor } from '@/components/whiteboard';

export default function WhiteboardPage() {
  const params = useParams();
  const workspaceId = params.id as string;
  const whiteboardId = params.whiteboardId as string;

  // TODO: Get workspace details from API or context
  const workspaceName = 'Workspace'; // This should come from workspace data
  const userRole = 'editor'; // This should come from user permissions

  return (
    <div className="h-screen flex flex-col">
      <WhiteboardEditor
        whiteboardId={whiteboardId}
        workspaceId={workspaceId}
        workspaceName={workspaceName}
        userRole={userRole}
      />
    </div>
  );
}
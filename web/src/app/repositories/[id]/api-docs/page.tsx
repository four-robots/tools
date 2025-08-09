'use client';

import React from 'react';
import { ApiDocumentationRecommendations } from '@/components/codebase/ApiDocumentationRecommendations';

interface RepositoryApiDocsPageProps {
  params: {
    id: string;
  };
}

export default function RepositoryApiDocsPage({ params }: RepositoryApiDocsPageProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ApiDocumentationRecommendations repositoryId={params.id} />
      </div>
    </div>
  );
}
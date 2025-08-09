'use client';

import React from 'react';
import Link from 'next/link';
import { 
  DocumentTextIcon, 
  BookOpenIcon,
  CodeBracketIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline';

interface RepositoryPageProps {
  params: {
    id: string;
  };
}

export default function RepositoryPage({ params }: RepositoryPageProps) {
  const repositoryId = params.id;

  const navigationItems = [
    {
      name: 'API Documentation Recommendations',
      description: 'Discover and index relevant API documentation based on project dependencies',
      href: `/repositories/${repositoryId}/api-docs`,
      icon: DocumentTextIcon,
      color: 'blue'
    },
    {
      name: 'Code Analysis',
      description: 'Analyze code quality, dependencies, and architecture patterns',
      href: `/repositories/${repositoryId}/analysis`,
      icon: CodeBracketIcon,
      color: 'green'
    },
    {
      name: 'Documentation',
      description: 'View and manage repository documentation and wikis',
      href: `/repositories/${repositoryId}/docs`,
      icon: BookOpenIcon,
      color: 'purple'
    },
    {
      name: 'Analytics',
      description: 'Repository metrics, activity, and performance insights',
      href: `/repositories/${repositoryId}/analytics`,
      icon: ChartBarIcon,
      color: 'yellow'
    }
  ];

  const getColorClasses = (color: string) => {
    const colorMap = {
      blue: 'text-blue-600 bg-blue-50 hover:bg-blue-100',
      green: 'text-green-600 bg-green-50 hover:bg-green-100',
      purple: 'text-purple-600 bg-purple-50 hover:bg-purple-100',
      yellow: 'text-yellow-600 bg-yellow-50 hover:bg-yellow-100'
    };
    return colorMap[color as keyof typeof colorMap] || colorMap.blue;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Repository Dashboard</h1>
          <p className="mt-2 text-lg text-gray-600">
            Repository ID: <span className="font-mono text-sm">{repositoryId}</span>
          </p>
        </div>

        {/* Navigation Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`block p-6 bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200 ${getColorClasses(item.color)}`}
              >
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0">
                    <Icon className="h-8 w-8" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      {item.name}
                    </h3>
                    <p className="text-sm text-gray-600 line-clamp-2">
                      {item.description}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Quick Actions */}
        <div className="mt-12 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
              Analyze Dependencies
            </button>
            <button className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500">
              Scan for Documentation
            </button>
            <button className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500">
              Generate Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
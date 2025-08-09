'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  FolderIcon,
  PlusIcon,
  MagnifyingGlassIcon
} from '@heroicons/react/24/outline';

export default function RepositoriesPage() {
  const [searchTerm, setSearchTerm] = useState('');

  // Mock data - in a real app, this would come from an API
  const repositories = [
    {
      id: 'repo-1',
      name: 'mcp-tools-frontend',
      description: 'React-based frontend for MCP Tools ecosystem',
      language: 'TypeScript',
      stars: 45,
      lastUpdated: '2 hours ago',
      status: 'active'
    },
    {
      id: 'repo-2', 
      name: 'api-gateway-service',
      description: 'Express.js API gateway with WebSocket support',
      language: 'TypeScript',
      stars: 23,
      lastUpdated: '1 day ago',
      status: 'active'
    },
    {
      id: 'repo-3',
      name: 'documentation-scraper',
      description: 'Service for scraping and indexing API documentation',
      language: 'Python',
      stars: 12,
      lastUpdated: '3 days ago',
      status: 'maintenance'
    }
  ];

  const filteredRepositories = repositories.filter(repo =>
    repo.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    repo.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'maintenance':
        return 'bg-yellow-100 text-yellow-800';
      case 'archived':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Repositories</h1>
            <p className="mt-2 text-lg text-gray-600">
              Manage and analyze your code repositories
            </p>
          </div>
          <button className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
            <PlusIcon className="h-4 w-4 mr-2" />
            Add Repository
          </button>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="Search repositories..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Repository Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRepositories.map((repo) => (
            <Link
              key={repo.id}
              href={`/repositories/${repo.id}`}
              className="block bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200"
            >
              <div className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center">
                    <FolderIcon className="h-6 w-6 text-blue-600 mr-3" />
                    <h3 className="text-lg font-semibold text-gray-900 truncate">
                      {repo.name}
                    </h3>
                  </div>
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(repo.status)}`}>
                    {repo.status}
                  </span>
                </div>
                
                <p className="mt-2 text-sm text-gray-600 line-clamp-2">
                  {repo.description}
                </p>
                
                <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
                  <div className="flex items-center space-x-4">
                    <span className="inline-flex items-center">
                      <span className="w-3 h-3 rounded-full bg-blue-500 mr-1"></span>
                      {repo.language}
                    </span>
                    <span>⭐ {repo.stars}</span>
                  </div>
                  <span>Updated {repo.lastUpdated}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Empty State */}
        {filteredRepositories.length === 0 && (
          <div className="text-center py-12">
            <FolderIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No repositories found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchTerm ? 'Try adjusting your search terms.' : 'Get started by adding your first repository.'}
            </p>
            {!searchTerm && (
              <div className="mt-6">
                <button className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Add Repository
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
'use client';

import { useAuth, useKanbanBoards, useMemories, useWikiPages } from '@/hooks/use-api';
import { PageWrapper } from '@/components/PageWrapper';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  BarChart3, 
  Users, 
  BookOpen, 
  Brain, 
  KanbanSquare,
  Plus,
  Activity,
  TrendingUp
} from 'lucide-react';
import Link from 'next/link';
import { LiveUpdates, LiveActivityIndicator } from '@/components/realtime/live-updates';
import { ConnectionStatusIndicator } from '@/components/realtime/connection-status';
import { useRealtime } from '@/components/realtime/realtime-provider';

function DashboardPageContent() {
  const { logout, isLoggingOut } = useAuth();
  const { data: kanbanData } = useKanbanBoards();
  const { data: memoriesData } = useMemories();
  const { data: wikiData } = useWikiPages();
  const { connectionStatus } = useRealtime();

  const stats = [
    {
      title: 'Kanban Boards',
      value: kanbanData?.data?.length || 0,
      description: 'Active project boards',
      icon: KanbanSquare,
      color: 'bg-blue-500',
      href: '/kanban',
    },
    {
      title: 'Memories',
      value: memoriesData?.data?.length || 0,
      description: 'Saved memories',
      icon: Brain,
      color: 'bg-purple-500',
      href: '/memory',
    },
    {
      title: 'Wiki Pages',
      value: wikiData?.data?.length || 0,
      description: 'Documentation pages',
      icon: BookOpen,
      color: 'bg-green-500',
      href: '/wiki',
    },
    {
      title: 'Analytics',
      value: '📊',
      description: 'View insights',
      icon: BarChart3,
      color: 'bg-indigo-500',
      href: '/dashboard/analytics',
    },
  ];

  const quickActions = [
    {
      title: 'New Kanban Board',
      description: 'Create a new project board',
      icon: KanbanSquare,
      href: '/kanban/new',
      color: 'bg-blue-50 text-blue-600 border-blue-200',
    },
    {
      title: 'Add Memory',
      description: 'Save a new memory',
      icon: Brain,
      href: '/memory/new',
      color: 'bg-purple-50 text-purple-600 border-purple-200',
    },
    {
      title: 'Create Wiki Page',
      description: 'Write documentation',
      icon: BookOpen,
      href: '/wiki/new',
      color: 'bg-green-50 text-green-600 border-green-200',
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center mr-3">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-xl font-semibold text-gray-900">MCP Tools</h1>
            </div>
            
            <div className="flex items-center space-x-4">
              <nav className="hidden md:flex space-x-6">
                <Link href="/kanban" className="text-gray-600 hover:text-gray-900">
                  Kanban
                </Link>
                <Link href="/memory" className="text-gray-600 hover:text-gray-900">
                  Memory
                </Link>
                <Link href="/wiki" className="text-gray-600 hover:text-gray-900">
                  Wiki
                </Link>
                <Link href="/dashboard/analytics" className="text-gray-600 hover:text-gray-900">
                  Analytics
                </Link>
              </nav>
              <ConnectionStatusIndicator 
                status={connectionStatus as any}
                showText={false}
              />
              <Button
                variant="outline"
                onClick={() => logout()}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? 'Logging out...' : 'Logout'}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Welcome back!
          </h2>
          <p className="text-gray-600">
            Here's what's happening with your productivity tools today.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat, index) => (
            <Link key={index} href={stat.href}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {stat.title}
                  </CardTitle>
                  <div className={`w-8 h-8 rounded-md ${stat.color} flex items-center justify-center`}>
                    <stat.icon className="w-4 h-4 text-white" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <p className="text-xs text-gray-600">{stat.description}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Quick Actions */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Plus className="w-5 h-5 mr-2" />
                  Quick Actions
                </CardTitle>
                <CardDescription>
                  Create new content and start working
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {quickActions.map((action, index) => (
                  <Link key={index} href={action.href}>
                    <div className={`p-4 rounded-lg border-2 border-dashed ${action.color} hover:bg-opacity-50 transition-colors cursor-pointer`}>
                      <div className="flex items-center">
                        <action.icon className="w-5 h-5 mr-3" />
                        <div>
                          <h3 className="font-medium">{action.title}</h3>
                          <p className="text-sm opacity-70">{action.description}</p>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <TrendingUp className="w-5 h-5 mr-2" />
                  Recent Activity
                </CardTitle>
                <CardDescription>
                  Your latest actions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-sm">
                  <div className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span className="text-gray-600">Welcome to MCP Tools!</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-gray-600">Account created successfully</span>
                  </div>
                  <div className="text-center py-4 text-gray-500">
                    <p>Start using the tools to see activity here</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Real-time updates */}
      <LiveUpdates />
      <LiveActivityIndicator />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <PageWrapper>
      <DashboardPageContent />
    </PageWrapper>
  );
}
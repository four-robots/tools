import { Metadata } from 'next';
import Link from 'next/link';
import { 
  ArrowRightIcon, 
  ClipboardListIcon, 
  BrainIcon, 
  BookOpenIcon,
  BarChart3Icon,
  UsersIcon,
  SparklesIcon
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'MCP Tools - Modern Productivity Suite',
  description: 'Streamline your workflow with our integrated kanban boards, memory management, and collaborative wiki.',
};

const features = [
  {
    name: 'Kanban Boards',
    description: 'Organize tasks and projects with intuitive drag-and-drop boards, custom workflows, and team collaboration.',
    icon: ClipboardListIcon,
    href: '/kanban',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
  {
    name: 'Memory Management',
    description: 'Capture and organize your thoughts, notes, and ideas with intelligent search and relationship mapping.',
    icon: BrainIcon,
    href: '/memory',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
  },
  {
    name: 'Knowledge Wiki',
    description: 'Build and maintain your team\'s knowledge base with collaborative editing and powerful organization.',
    icon: BookOpenIcon,
    href: '/wiki',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
  },
];

const stats = [
  { name: 'Core Features', value: '3' },
  { name: 'Development Status', value: 'Beta' },
  { name: 'Open Source', value: 'TypeScript' },
  { name: 'Real-time Updates', value: 'WebSocket' },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-200">
        <nav className="container-app flex h-16 items-center justify-between">
          <div className="flex items-center space-x-2">
            <SparklesIcon className="h-8 w-8 text-primary-600" />
            <span className="text-2xl font-bold text-gray-900">MCP Tools</span>
          </div>
          
          <div className="flex items-center space-x-4">
            <Link
              href="/dashboard"
              className="btn btn-secondary"
            >
              Dashboard
            </Link>
            <Link
              href="/auth/login"
              className="btn btn-primary"
            >
              Get Started
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary-50 via-white to-purple-50 py-20">
        <div className="container-app relative">
          <div className="mx-auto max-w-4xl text-center">
            <h1 className="text-5xl font-bold tracking-tight text-gray-900 lg:text-6xl">
              Streamline Your{' '}
              <span className="text-gradient">
                Workflow
              </span>
            </h1>
            <p className="mt-6 text-xl leading-8 text-gray-600">
              Integrate kanban boards, memory management, and collaborative wikis 
              in one powerful productivity suite. Built with TypeScript and modern web technologies.
            </p>
            <div className="mt-10 flex items-center justify-center gap-4">
              <Link
                href="/auth/signup"
                className="btn btn-primary px-8 py-3 text-base"
              >
                Try the Beta
                <ArrowRightIcon className="ml-2 h-4 w-4" />
              </Link>
              <Link
                href="/dashboard"
                className="btn btn-secondary px-8 py-3 text-base"
              >
                View Dashboard
              </Link>
            </div>
          </div>
        </div>
        
        {/* Background decoration */}
        <div className="absolute inset-x-0 top-0 -z-10 flex transform-gpu justify-center overflow-hidden blur-3xl">
          <div className="aspect-[1155/678] w-[72.1875rem] flex-none bg-gradient-to-tr from-primary-200 to-purple-200 opacity-20" />
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20">
        <div className="container-app">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 lg:text-4xl">
              Everything you need to stay productive
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Powerful tools designed to work together seamlessly
            </p>
          </div>
          
          <div className="mx-auto mt-16 grid max-w-6xl grid-cols-1 gap-8 md:grid-cols-3">
            {features.map((feature) => (
              <Link
                key={feature.name}
                href={feature.href}
                className="card card-hover group p-8 transition-all duration-200"
              >
                <div className={`inline-flex h-12 w-12 items-center justify-center rounded-lg ${feature.bgColor} group-hover:scale-110 transition-transform`}>
                  <feature.icon className={`h-6 w-6 ${feature.color}`} />
                </div>
                <h3 className="mt-6 text-xl font-semibold text-gray-900">
                  {feature.name}
                </h3>
                <p className="mt-2 text-gray-600">
                  {feature.description}
                </p>
                <div className="mt-4 flex items-center text-primary-600 group-hover:text-primary-700">
                  <span className="text-sm font-medium">Learn more</span>
                  <ArrowRightIcon className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="bg-gray-50 py-16">
        <div className="container-app">
          <div className="mx-auto max-w-4xl">
            <div className="text-center">
              <h2 className="text-3xl font-bold tracking-tight text-gray-900">
                Development Showcase
              </h2>
              <p className="mt-4 text-lg text-gray-600">
                Modern productivity suite built with cutting-edge technology
              </p>
            </div>
            
            <div className="mt-12 grid grid-cols-2 gap-8 md:grid-cols-4">
              {stats.map((stat) => (
                <div key={stat.name} className="text-center">
                  <div className="text-3xl font-bold text-primary-600">
                    {stat.value}
                  </div>
                  <div className="mt-1 text-sm text-gray-600">
                    {stat.name}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16">
        <div className="container-app">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900">
              Ready to explore the platform?
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Experience the integrated productivity suite in development.
            </p>
            <div className="mt-8">
              <Link
                href="/dashboard"
                className="btn btn-primary px-8 py-3 text-base"
              >
                Explore Features
                <ArrowRightIcon className="ml-2 h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-gray-50">
        <div className="container-app py-12">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <SparklesIcon className="h-6 w-6 text-primary-600" />
              <span className="text-lg font-semibold text-gray-900">MCP Tools</span>
            </div>
            
            <div className="flex space-x-6 text-sm text-gray-600">
              <Link href="/privacy" className="hover:text-gray-900">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-gray-900">
                Terms
              </Link>
              <Link href="/support" className="hover:text-gray-900">
                Support
              </Link>
            </div>
          </div>
          
          <div className="mt-8 border-t border-gray-200 pt-8 text-center text-sm text-gray-500">
            © 2024 MCP Tools. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
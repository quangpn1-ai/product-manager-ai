import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  User,
  Building2,
  Key,
  DollarSign,
  Bell,
  Shield,
  ChevronRight,
} from 'lucide-react';

import Profile from './Profile';
import Organization from './Organization';
import AISettings from './AISettings';
import BudgetSettings from './BudgetSettings';

const TABS = [
  { id: 'profile', name: 'Profile', icon: User, component: Profile },
  { id: 'organization', name: 'Organization', icon: Building2, component: Organization },
  { id: 'ai-providers', name: 'AI Providers', icon: Key, component: AISettings },
  { id: 'budget', name: 'Budget & Usage', icon: DollarSign, component: BudgetSettings },
];

export default function Settings() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const initialTab = searchParams.get('tab') || 'profile';
  const [activeTab, setActiveTab] = useState(initialTab);

  const ActiveComponent = TABS.find((t) => t.id === activeTab)?.component || Profile;

  return (
    <div className="flex gap-6">
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0">
        <div className="bg-white rounded-lg shadow-sm border">
          <nav className="p-2">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left ${
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon className={`h-5 w-5 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                  <span className="font-medium">{tab.name}</span>
                  {isActive && <ChevronRight className="h-4 w-4 ml-auto" />}
                </button>
              );
            })}
            <div className="border-t my-2" />
            <Link
              to="/audit"
              className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-left text-gray-700 hover:bg-gray-50"
            >
              <Shield className="h-5 w-5 text-gray-400" />
              <span className="font-medium">Audit Log</span>
              <ChevronRight className="h-4 w-4 ml-auto" />
            </Link>
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <ActiveComponent />
      </div>
    </div>
  );
}

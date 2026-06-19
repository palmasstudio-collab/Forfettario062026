import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export const NavigationMenu = () => {
  const location = useLocation();
  const tabs = [
    { name: 'Dashboard', path: '/dashboard' },
    { name: 'Fatture', path: '/invoices' },
    { name: 'Scenari', path: '/scenarios' },
    { name: 'Calendario', path: '/calendar' },
    { name: 'Documenti', path: '/docs' },
  ];

  return (
    <nav className="flex space-x-4 p-4 border-b">
      {tabs.map((tab) => (
        <Link
          key={tab.path}
          to={tab.path}
          className={`px-3 py-2 rounded-md ${
            location.pathname === tab.path ? 'bg-blue-500 text-white' : 'text-gray-700'
          }`}
        >
          {tab.name}
        </Link>
      ))}
    </nav>
  );
};

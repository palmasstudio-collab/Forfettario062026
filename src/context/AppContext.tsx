import React, { createContext, useContext, useState, ReactNode } from 'react';

interface AppContextType {
  positions: any[];
  setPositions: React.Dispatch<any>;
  activePositionId: string;
  setActivePositionId: React.Dispatch<string>;
  userId: string;
  setUserId: React.Dispatch<string>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [positions, setPositions] = useState<any[]>([]);
  const [activePositionId, setActivePositionId] = useState<string>('');
  const [userId, setUserId] = useState<string>('');

  return (
    <AppContext.Provider value={{ positions, setPositions, activePositionId, setActivePositionId, userId, setUserId }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
    const context = useContext(AppContext);
    if (!context) throw new Error('useAppContext must be used within AppProvider');
    return context;
};

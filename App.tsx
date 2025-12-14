import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Assistant from './pages/Assistant';
import ChatLog from './pages/ChatLog';
import { ROUTES } from './constants';

const Placeholder = ({ title }: { title: string }) => (
  <div className="flex items-center justify-center h-full text-stark-500 font-mono tracking-widest opacity-50">
    // MODULE: {title} NOT LOADED
  </div>
);

const App: React.FC = () => {
  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path={ROUTES.HOME} element={<Assistant />} />
          <Route path={ROUTES.CHAT} element={<ChatLog />} />
          <Route path={ROUTES.MEMORY} element={<Placeholder title="MEMORY_CORE" />} />
          <Route path={ROUTES.SETTINGS} element={<Placeholder title="SYSTEM_CONFIG" />} />
          <Route path="*" element={<Navigate to={ROUTES.HOME} replace />} />
        </Routes>
      </Layout>
    </HashRouter>
  );
};

export default App;

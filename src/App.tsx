import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/contexts/auth-context';
import { WorkflowProvider } from '@/contexts/workflow-context';
import Layout from '@/components/layout/layout';
import Dashboard from '@/pages/dashboard';
import Upload from '@/pages/upload';
import Workflows from '@/pages/workflows';
import Results from '@/pages/results';
import Settings from '@/pages/settings';
import Analytics from '@/pages/analytics';
import Agents from '@/pages/agents';
import Login from '@/pages/login';
import { ProtectedRoute } from '@/components/auth/protected-route';

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="excelflow-theme">
      <Router>
        <AuthProvider>
          <WorkflowProvider>
            <div className="min-h-screen bg-background">
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route
                  path="/*"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <Routes>
                          <Route path="/" element={<Dashboard />} />
                          <Route path="/upload" element={<Upload />} />
                          <Route path="/workflows" element={<Workflows />} />
                          <Route path="/results" element={<Results />} />
                          <Route path="/analytics" element={<Analytics />} />
                          <Route path="/agents" element={<Agents />} />
                          <Route path="/settings" element={<Settings />} />
                        </Routes>
                      </Layout>
                    </ProtectedRoute>
                  }
                />
              </Routes>
              <Toaster />
            </div>
          </WorkflowProvider>
        </AuthProvider>
      </Router>
    </ThemeProvider>
  );
}

export default App;
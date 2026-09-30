import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Login from '../features/report/pages/Login';
import Register from '../features/report/pages/Register';
import Home from '../features/report/pages/Home';
import Patient from '../features/report/pages/Patient';
import Analyzer from '../features/report/pages/Analyzer';
import Results from '../features/report/pages/Results';
import Reports from '../features/report/pages/Reports';
import Billing from '../features/report/pages/Billing';
import DailyBilling from '../features/report/pages/DailyBilling';
import BillingSummary from '../features/report/pages/BillingSummary';
import ReportPage from "../features/report/pages/ReportPage";
import Reagents from "../features/report/pages/Reagents";
import History from "../features/report/pages/History";
import MachineIntegration from "../features/machineIntegration/pages/MachineIntegration";
import MachineResults from "../features/machineIntegration/pages/MachineResults";
import RawMessages from "../features/machineIntegration/pages/RawMessages";
import './App.css'
// Private Route Component
const PrivateRoute = ({ children }) => {
  const user = localStorage.getItem('user');
  return user ? children : <Navigate to="/" />;
};

const RouteIndexing = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    const robots = document.querySelector('meta[name="robots"]');
    if (robots) {
      robots.content = pathname === '/' ? 'index, follow' : 'noindex, nofollow';
    }
  }, [pathname]);

  return null;
};

function App() {
  return (
    <BrowserRouter>
      <RouteIndexing />
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/home" element={
          <PrivateRoute>
            <Home />
          </PrivateRoute>
        } />
        <Route path="/patient" element={
          <PrivateRoute>
            <Patient />
          </PrivateRoute>
        } />
        <Route path="/analyzer" element={
          <PrivateRoute>
            <Analyzer />
          </PrivateRoute>
        } />
        <Route path="/results" element={
          <PrivateRoute>
            <Results />
          </PrivateRoute>
        } />
        <Route path="/reports" element={
          <PrivateRoute>
            <Reports />
          </PrivateRoute>
        } />
        <Route path="/billing" element={
          <PrivateRoute>
           <Billing />
          </PrivateRoute>
        } />
        <Route path="/billing/today" element={
          <PrivateRoute>
            <DailyBilling />
          </PrivateRoute>
        } />
        <Route path="/billing/summary/:period" element={
          <PrivateRoute>
            <BillingSummary />
          </PrivateRoute>
        } />
        <Route path="/reagents" element={
          <PrivateRoute>
            <Reagents />
          </PrivateRoute>
        } />
        <Route path="/history" element={
          <PrivateRoute>
            <History />
          </PrivateRoute>
        } />
        <Route path="/machine-integration" element={
          <PrivateRoute>
            <MachineIntegration />
          </PrivateRoute>
        } />
        <Route path="/machine-results" element={
          <PrivateRoute>
            <MachineResults />
          </PrivateRoute>
        } />
        <Route path="/raw-messages" element={
          <PrivateRoute>
            <RawMessages />
          </PrivateRoute>
        } />
        <Route path="/report" element={
          <PrivateRoute>
            <ReportPage />
          </PrivateRoute>
        } />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
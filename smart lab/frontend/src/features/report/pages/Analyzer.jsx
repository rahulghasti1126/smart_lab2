import { Navigate } from 'react-router-dom';

// The historic direct-COM screen bypassed configured adapters. Keep the old
// route for bookmarks while routing users to the audited analyzer module.
export default function Analyzer() {
  return <Navigate to="/machine-integration" replace />;
}

import React from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/useAuth'

interface ProtectedRouteProps {
  requireAdmin?: boolean
  children?: React.ReactNode
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ requireAdmin = false, children }) => {
  const { user, loading, isAdmin } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F5F1] flex flex-col items-center justify-center p-4">
        <div className="w-10 h-10 border-4 border-[#0F3D3E]/20 border-t-[#0F3D3E] rounded-full animate-spin mb-4"></div>
        <p className="text-sm font-medium text-[#1B2421]">Verifying clinical session...</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (requireAdmin && !isAdmin) {
    return (
      <div className="p-8">
        <div className="bg-white rounded-xl border border-[#D3D1C7] p-12 text-center max-w-lg mx-auto shadow-sm">
          <i className="ti ti-shield-x text-[#C1544C] block mx-auto mb-3" style={{ fontSize: '40px' }}></i>
          <h2 className="text-lg font-semibold text-[#1B2421] mb-2">Access Restricted</h2>
          <p className="text-sm text-[#5F5E5A] mb-6">
            You do not have administrative privileges to access this panel.
          </p>
          <a
            href="/dashboard"
            className="inline-flex items-center px-4 py-2 rounded-lg bg-[#0F3D3E] text-white text-sm font-medium hover:bg-[#0C2F30] transition-colors"
          >
            Return to Dashboard
          </a>
        </div>
      </div>
    )
  }

  return children ? <>{children}</> : <Outlet />
}

export default ProtectedRoute

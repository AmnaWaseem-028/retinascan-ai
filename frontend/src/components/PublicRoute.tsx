import React from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/useAuth'

interface PublicRouteProps {
  children?: React.ReactNode
}

export const PublicRoute: React.FC<PublicRouteProps> = ({ children }) => {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F5F1] flex flex-col items-center justify-center p-4">
        <div className="w-10 h-10 border-4 border-[#0F3D3E]/20 border-t-[#0F3D3E] rounded-full animate-spin mb-4"></div>
      </div>
    )
  }

  if (user) {
    return <Navigate to="/dashboard" replace />
  }

  return children ? <>{children}</> : <Outlet />
}

export default PublicRoute

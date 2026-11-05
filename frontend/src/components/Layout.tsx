import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import Logo from './Logo'

function Layout() {
  const navigate = useNavigate()
  const { user, role, isAdmin, signOut } = useAuth()

  const handleLogout = async () => {
    try {
      await signOut()
      navigate('/login', { replace: true })
    } catch (err) {
      console.error('Logout error:', err)
      navigate('/login', { replace: true })
    }
  }

  const navItems = [
    { to: '/upload', label: 'Upload screening', icon: 'ti-upload', show: true },
    { to: '/dashboard', label: 'Dashboard', icon: 'ti-layout-dashboard', show: true },
    { to: '/admin', label: 'Admin panel', icon: 'ti-shield-lock', show: isAdmin },
  ].filter((item) => item.show)

  return (
    <div className="min-h-screen flex bg-[#F7F5F1]">
      <aside className="w-64 bg-[#0F3D3E] flex flex-col justify-between py-6 px-4 shrink-0">
        <div>
          <div className="flex items-center gap-2 px-2 mb-8">
            <Logo size={30} />
            <span className="text-white font-semibold text-base">RetinaScan AI</span>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[#1A5654] text-white'
                      : 'text-[#9FC9C4] hover:bg-[#12474A] hover:text-white'
                  }`
                }
              >
                <i className={`ti ${item.icon}`} style={{ fontSize: '18px' }}></i>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="pt-4 border-t border-[#1A5654]/60 space-y-3">
          {user && (
            <div className="px-2">
              <p className="text-xs font-medium text-white truncate" title={user.email || ''}>
                {user.email}
              </p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="w-2 h-2 rounded-full bg-[#E8A33D]"></span>
                <span className="text-[11px] font-medium text-[#9FC9C4] uppercase tracking-wider">
                  {role === 'admin' ? 'Administrator' : 'Clinician'}
                </span>
              </div>
            </div>
          )}

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-[#9FC9C4] hover:bg-[#12474A] hover:text-white transition-colors text-left"
          >
            <i className="ti ti-logout" style={{ fontSize: '18px' }}></i>
            Log out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto min-w-0">
        <Outlet />
      </main>
    </div>
  )
}

export default Layout

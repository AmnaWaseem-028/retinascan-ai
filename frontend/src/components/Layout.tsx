import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

function Layout() {
  const navigate = useNavigate()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const navItems = [
    { to: '/upload', label: 'Upload screening' },
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/admin', label: 'Admin panel' },
  ]

  return (
    <div className="min-h-screen flex bg-[#F7F5F1]">
      <aside className="w-64 bg-[#0F3D3E] flex flex-col justify-between py-6 px-4">
        <div>
          <div className="flex items-center gap-2 px-2 mb-8">
            <div className="w-7 h-7 rounded-full border-2 border-[#E8A33D]"></div>
            <span className="text-white font-semibold text-base">RetinaScan AI</span>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[#1A5654] text-white'
                      : 'text-[#9FC9C4] hover:bg-[#12474A] hover:text-white'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <button
          onClick={handleLogout}
          className="px-3 py-2.5 rounded-lg text-sm font-medium text-[#9FC9C4] hover:bg-[#12474A] hover:text-white transition-colors text-left"
        >
          Log out
        </button>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}

export default Layout
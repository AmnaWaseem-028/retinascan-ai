import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import Logo from '../components/Logo'

function Landing() {
  const navigate = useNavigate()
  const { user, role, isAdmin, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.user_metadata?.username ||
    user?.email ||
    'User'

  const getInitials = (nameOrEmail: string): string => {
    const clean = nameOrEmail.includes('@') ? nameOrEmail.split('@')[0] : nameOrEmail
    const parts = clean.split(/[\s._-]+/).filter(Boolean)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase()
    }
    if (parts.length === 1 && parts[0].length >= 2) {
      const matches = parts[0].match(/[A-Z]/g)
      if (matches && matches.length >= 1) {
        return (parts[0][0] + matches[0]).toUpperCase()
      }
      return parts[0].slice(0, 2).toUpperCase()
    }
    return (clean[0] || 'U').toUpperCase()
  }

  const initials = user ? getInitials(displayName) : 'U'

  // Close dropdown on click outside or Escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false)
      }
    }

    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  const features = [
    { icon: 'ti-scan', title: '5-stage DR grading', desc: 'AI-powered classification from no DR to proliferative stage, trained on the APTOS dataset.' },
    { icon: 'ti-flame', title: 'Grad-CAM heatmaps', desc: 'Visual explanation showing exactly which regions of the retina influenced the grade.' },
    { icon: 'ti-file-text', title: 'Instant reports', desc: 'Plain-language screening reports generated automatically for every scan.' },
  ]

  const steps = [
    { number: '01', icon: 'ti-cloud-upload', title: 'Upload a fundus image', desc: 'Select a retinal photograph from any standard fundus camera. JPG or PNG, no special equipment needed.' },
    { number: '02', icon: 'ti-cpu', title: 'AI analyzes the scan', desc: 'A fine-tuned EfficientNet-B0 model grades the image across five DR severity stages in seconds.' },
    { number: '03', icon: 'ti-report-medical', title: 'Review grade and report', desc: 'Get the grade, a Grad-CAM heatmap of the affected regions, and a plain-language summary.' },
    { number: '04', icon: 'ti-history', title: 'Track over time', desc: 'Every screening is saved to your history, so progress and referrals are easy to follow.' },
  ]

  const stats = [
    { value: '5', label: 'DR severity stages' },
    { value: '<10s', label: 'Average grading time' },
    { value: 'APTOS', label: 'Training dataset' },
  ]

  return (
    <div className="min-h-screen bg-[#F7F5F1]">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 max-w-6xl mx-auto">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
          <Logo size={30} />
          <span className="font-semibold text-lg text-[#0F3D3E]">RetinaScan AI</span>
        </div>

        {user ? (
          <div className="relative" ref={menuRef}>
            {/* Circular Profile Avatar Button */}
            <button
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-expanded={menuOpen}
              aria-label="User profile menu"
              className="w-10 h-10 rounded-full bg-[#0F3D3E] text-white flex items-center justify-center text-xs font-bold tracking-wider hover:bg-[#1A5654] focus:outline-none focus:ring-2 focus:ring-[#0F3D3E] focus:ring-offset-2 transition-all shadow-sm cursor-pointer select-none"
            >
              {initials}
            </button>

            {/* Dropdown Menu */}
            {menuOpen && (
              <div className="absolute right-0 mt-2.5 w-64 bg-white rounded-xl border border-[#D3D1C7] shadow-xl py-1.5 z-50">
                {/* User Identity Header */}
                <div className="px-4 py-3 border-b border-[#E5E3DC] bg-[#FAF8F5] rounded-t-xl">
                  <p className="text-xs font-semibold text-[#1B2421] truncate" title={displayName}>
                    {displayName}
                  </p>
                  <p className="text-[11px] text-[#5F5E5A] truncate mt-0.5" title={user.email || ''}>
                    {user.email}
                  </p>
                  <div className="flex items-center gap-1.5 mt-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#E8A33D]"></span>
                    <span className="text-[10px] font-semibold text-[#0F3D3E] uppercase tracking-wider">
                      {role === 'admin' ? 'Administrator' : 'Clinician'}
                    </span>
                  </div>
                </div>

                {/* Navigation Options */}
                <div className="py-1">
                  <button
                    onClick={() => {
                      setMenuOpen(false)
                      navigate('/dashboard')
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#1B2421] hover:bg-[#F7F5F1] hover:text-[#0F3D3E] transition-colors text-left"
                  >
                    <i className="ti ti-layout-dashboard text-[#5F5E5A] text-base"></i>
                    <span>Dashboard</span>
                  </button>

                  <button
                    onClick={() => {
                      setMenuOpen(false)
                      navigate('/upload')
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#1B2421] hover:bg-[#F7F5F1] hover:text-[#0F3D3E] transition-colors text-left"
                  >
                    <i className="ti ti-upload text-[#5F5E5A] text-base"></i>
                    <span>Upload screening</span>
                  </button>

                  {isAdmin && (
                    <button
                      onClick={() => {
                        setMenuOpen(false)
                        navigate('/admin')
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#1B2421] hover:bg-[#F7F5F1] hover:text-[#0F3D3E] transition-colors text-left"
                    >
                      <i className="ti ti-shield-lock text-[#5F5E5A] text-base"></i>
                      <span>Admin panel</span>
                    </button>
                  )}
                </div>

                <div className="border-t border-[#E5E3DC] my-1"></div>

                {/* Logout Option */}
                <button
                  onClick={async () => {
                    setMenuOpen(false)
                    await signOut()
                    navigate('/login', { replace: true })
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#C1544C] hover:bg-[#FAECE7] transition-colors text-left font-medium"
                >
                  <i className="ti ti-logout text-base"></i>
                  <span>Log out</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => navigate('/login')}
            className="px-4 py-2 rounded-lg bg-[#0F3D3E] text-white text-sm font-medium hover:bg-[#0C2F30] transition-colors"
          >
            Sign in
          </button>
        )}
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-8 pt-16 pb-20 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#E1F5EE] text-[#04342C] text-xs font-medium mb-6">
          <i className="ti ti-sparkles" style={{ fontSize: '14px' }}></i>
          AI-assisted diabetic retinopathy screening
        </div>
        <h1 className="text-5xl font-bold text-[#1B2421] leading-tight tracking-tight mb-6">
          Early detection,<br />clearer outcomes.
        </h1>
        <p className="text-lg text-[#5F5E5A] max-w-xl mx-auto mb-8 leading-relaxed">
          Upload a fundus image and get an AI-graded diabetic retinopathy result — complete with a visual explanation and a plain-language report — in seconds.
        </p>
        <button
          onClick={() => navigate(user ? '/upload' : '/login')}
          className="px-6 py-3 rounded-lg bg-[#0F3D3E] text-white text-sm font-semibold hover:bg-[#0C2F30] transition-colors shadow-sm inline-flex items-center gap-2"
        >
          <span>{user ? 'Upload new screening' : 'Start screening'}</span>
          <i className="ti ti-arrow-right text-xs"></i>
        </button>

        {/* Stats strip */}
        <div className="flex items-center justify-center gap-12 mt-16 pt-10 border-t border-[#D3D1C7]">
          {stats.map((s) => (
            <div key={s.label}>
              <p className="text-3xl font-bold text-[#0F3D3E]">{s.value}</p>
              <p className="text-xs text-[#888780] mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-8 pb-24">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-[#1B2421] tracking-tight mb-2">Built for accurate screening</h2>
          <p className="text-[#5F5E5A] text-sm max-w-lg mx-auto">
            Every part of the pipeline is designed around clinical trust — from the model to the explanation.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((f) => (
            <div key={f.title} className="group bg-white rounded-xl border border-[#D3D1C7] p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
              <div className="relative w-12 h-12 rounded-xl bg-[#0F3D3E] flex items-center justify-center mb-5">
                <div className="absolute inset-0 rounded-xl bg-[#E8A33D] opacity-0 group-hover:opacity-10 transition-opacity"></div>
                <i className={`ti ${f.icon} text-[#E8A33D]`} style={{ fontSize: '22px' }}></i>
              </div>
              <h3 className="text-base font-semibold text-[#1B2421] mb-2">{f.title}</h3>
              <p className="text-sm text-[#5F5E5A] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-[#0F3D3E] py-24">
        <div className="max-w-5xl mx-auto px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-white tracking-tight mb-2">How it works</h2>
            <p className="text-[#9FC9C4] text-sm max-w-lg mx-auto">
              Four steps from fundus image to a graded, explainable result.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {steps.map((step) => (
              <div key={step.number} className="group bg-[#12474A] rounded-xl p-6 border border-[#1A5654] hover:border-[#E8A33D] transition-colors duration-200">
                <div className="flex items-start gap-4">
                  <div className="relative w-12 h-12 rounded-full bg-[#0F3D3E] border-2 border-[#E8A33D] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform duration-200">
                    <i className={`ti ${step.icon} text-[#E8A33D]`} style={{ fontSize: '20px' }}></i>
                  </div>
                  <div>
                    <p className="text-[#E8A33D] text-xs font-bold tracking-wider mb-1">STEP {step.number}</p>
                    <h3 className="text-white font-semibold text-base mb-1.5">{step.title}</h3>
                    <p className="text-[#9FC9C4] text-sm leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-3xl mx-auto px-8 py-24 text-center">
        <h2 className="text-3xl font-bold text-[#1B2421] tracking-tight mb-4">
          Ready to screen your first image?
        </h2>
        <p className="text-[#5F5E5A] text-sm mb-8 max-w-md mx-auto">
          Create an account and get your first AI-assisted diabetic retinopathy grade in under a minute.
        </p>
        <button
          onClick={() => navigate(user ? '/dashboard' : '/login')}
          className="px-6 py-3 rounded-lg bg-[#0F3D3E] text-white text-sm font-semibold hover:bg-[#0C2F30] transition-colors shadow-sm"
        >
          {user ? 'Go to Dashboard' : 'Get started'}
        </button>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#D3D1C7]">
        <div className="max-w-5xl mx-auto px-8 py-10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo size={22} />
            <span className="font-semibold text-sm text-[#0F3D3E]">RetinaScan AI</span>
          </div>
          <p className="text-xs text-[#888780]">Final year project · Diabetic retinopathy screening platform</p>
        </div>
      </footer>
    </div>
  )
}

export default Landing

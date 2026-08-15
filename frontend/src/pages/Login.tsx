import { useState } from 'react'
import { supabase } from '../supabaseClient'

function Login() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setError(error.message)
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#0F3D3E] flex-col justify-between p-12 relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full border-2 border-[#E8A33D]"></div>
            <span className="text-white font-semibold text-lg tracking-tight">RetinaScan AI</span>
          </div>
        </div>

        <div className="relative z-10">
          <h1 className="text-white text-4xl font-semibold leading-tight mb-4">
            Early detection,<br />clearer outcomes.
          </h1>
          <p className="text-[#9FC9C4] text-base leading-relaxed max-w-md">
            AI-assisted diabetic retinopathy screening — upload a fundus image and get a graded result with a visual explanation in seconds.
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-8 text-[#9FC9C4] text-sm">
          <span>5-stage DR grading</span>
          <span>·</span>
          <span>Grad-CAM heatmaps</span>
        </div>

        {/* Decorative rings, jaise fundus scan */}
        <div className="absolute -right-24 top-1/2 -translate-y-1/2 w-96 h-96 rounded-full border border-[#1A5654] opacity-60"></div>
        <div className="absolute -right-10 top-1/2 -translate-y-1/2 w-72 h-72 rounded-full border border-[#E8A33D] opacity-20"></div>
      </div>

      {/* Right panel — form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-6 py-12 bg-[#F7F5F1]">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8 flex items-center gap-2">
            <div className="w-7 h-7 rounded-full border-2 border-[#E8A33D]"></div>
            <span className="font-semibold text-lg text-[#0F3D3E]">RetinaScan AI</span>
          </div>

          <h2 className="text-2xl font-semibold text-[#1B2421] mb-1">
            {isSignUp ? 'Create your account' : 'Welcome back'}
          </h2>
          <p className="text-[#5F5E5A] text-sm mb-8">
            {isSignUp ? 'Sign up to start screening patients.' : 'Sign in to your RetinaScan AI account.'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#1B2421] mb-1.5">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@hospital.com"
                className="w-full px-3 py-2.5 rounded-lg border border-[#D3D1C7] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#0F3D3E] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1B2421] mb-1.5">Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2.5 rounded-lg border border-[#D3D1C7] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#0F3D3E] focus:border-transparent"
              />
            </div>

            {error && (
              <p className="text-sm text-[#C1544C] bg-[#FAECE7] px-3 py-2 rounded-lg">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-[#0F3D3E] text-white text-sm font-medium hover:bg-[#0C2F30] transition-colors disabled:opacity-50"
            >
              {loading ? 'Please wait...' : isSignUp ? 'Create account' : 'Sign in'}
            </button>
          </form>

          <p className="text-sm text-[#5F5E5A] mt-6 text-center">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              onClick={() => { setIsSignUp(!isSignUp); setError('') }}
              className="text-[#0F3D3E] font-medium hover:underline"
            >
              {isSignUp ? 'Sign in' : 'Sign up'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}

export default Login
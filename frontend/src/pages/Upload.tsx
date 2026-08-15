import { useState } from 'react'
import { supabase } from '../supabaseClient'

function Upload() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) {
      setFile(selected)
      setPreview(URL.createObjectURL(selected))
      setMessage('')
      setError('')
    }
  }

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setError('')
    setMessage('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('You must be signed in to upload.')
      setUploading(false)
      return
    }

    const filePath = `${user.id}/${Date.now()}-${file.name}`

    const { error: uploadError } = await supabase.storage
      .from('fundus-images')
      .upload(filePath, file)

    if (uploadError) {
      setError(uploadError.message)
      setUploading(false)
      return
    }

    setMessage('Image uploaded. Screening will begin shortly.')
    setUploading(false)
    setFile(null)
    setPreview(null)
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-semibold text-[#1B2421] mb-1">Upload screening</h1>
      <p className="text-[#5F5E5A] text-sm mb-8">
        Upload a fundus image to get an AI-assisted diabetic retinopathy grade.
      </p>

      <div className="bg-white rounded-xl border border-[#D3D1C7] p-8">
        {!preview ? (
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-[#D3D1C7] rounded-lg py-16 cursor-pointer hover:border-[#0F3D3E] transition-colors">
            <span className="text-sm font-medium text-[#1B2421] mb-1">Click to select a fundus image</span>
            <span className="text-xs text-[#888780]">JPG or PNG</span>
            <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
          </label>
        ) : (
          <div>
            <img src={preview} alt="Selected fundus scan" className="w-full max-h-80 object-contain rounded-lg mb-4" />
            <div className="flex gap-3">
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="flex-1 py-2.5 rounded-lg bg-[#0F3D3E] text-white text-sm font-medium hover:bg-[#0C2F30] transition-colors disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : 'Upload for screening'}
              </button>
              <button
                onClick={() => { setFile(null); setPreview(null) }}
                className="px-4 py-2.5 rounded-lg border border-[#D3D1C7] text-sm font-medium text-[#5F5E5A] hover:bg-[#F7F5F1] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {message && (
          <p className="mt-4 text-sm text-[#04342C] bg-[#E1F5EE] px-3 py-2 rounded-lg">{message}</p>
        )}
        {error && (
          <p className="mt-4 text-sm text-[#C1544C] bg-[#FAECE7] px-3 py-2 rounded-lg">{error}</p>
        )}
      </div>
    </div>
  )
}

export default Upload
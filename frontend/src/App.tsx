import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Layout from './components/Layout'
import Upload from './pages/Upload'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<Layout />}>
          <Route path="/upload" element={<Upload />} />
          <Route path="/dashboard" element={<div className="p-8">Dashboard page — coming next</div>} />
          <Route path="/admin" element={<div className="p-8">Admin page — coming next</div>} />
        </Route>
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
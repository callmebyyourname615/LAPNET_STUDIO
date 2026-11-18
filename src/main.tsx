import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { Toaster } from './components/ui/toaster'
import { InstallAppProvider } from './components/ui/install-app'
import {BrowserRouter} from 'react-router-dom'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter><InstallAppProvider><App /><Toaster /></InstallAppProvider></BrowserRouter>
  </React.StrictMode>,
)

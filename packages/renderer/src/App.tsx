import { MantineProvider } from '@mantine/core'
import '@mantine/core/styles.css'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { theme } from './theme'
import { AppLayout } from './components/Layout/AppLayout'
import { Dashboard } from './routes/Dashboard'
import { BrowserDetail } from './routes/BrowserDetail'
import { Settings } from './routes/Settings'
import { Automation } from './routes/Automation'
import { AIAssistant } from './routes/AIAssistant'

function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <BrowserRouter>
        <AppLayout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/browser/:browserId/:pageId" element={<BrowserDetail />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/automation" element={<Automation />} />
            <Route path="/ai-assistant" element={<AIAssistant />} />
          </Routes>
        </AppLayout>
      </BrowserRouter>
    </MantineProvider>
  )
}

export default App

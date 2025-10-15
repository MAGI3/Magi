import { useNavigate, useParams } from 'react-router-dom'

/**
 * 自定义导航 hook，封装路由导航逻辑
 */
export function useNavigation() {
  const navigate = useNavigate()
  const params = useParams<{ browserId?: string; pageId?: string }>()

  const goToDashboard = () => {
    navigate('/')
  }

  const goToBrowserDetail = (browserId: string, pageId?: string) => {
    if (pageId) {
      navigate(`/browser/${browserId}/${pageId}`)
    } else {
      navigate(`/browser/${browserId}`)
    }
  }

  const goToSettings = () => {
    navigate('/settings')
  }

  const goToAutomation = () => {
    navigate('/automation')
  }

  const goToAIAssistant = () => {
    navigate('/ai-assistant')
  }

  return {
    // 当前路由参数
    currentBrowserId: params.browserId,
    currentPageId: params.pageId,
    
    // 导航方法
    goToDashboard,
    goToBrowserDetail,
    goToSettings,
    goToAutomation,
    goToAIAssistant,
  }
}

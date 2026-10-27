import { createRoot } from 'react-dom/client'
import { useCallback, useEffect, useRef, useState } from 'react'

interface Status { id: string; title: string; url: string; entryUrl: string; source: string; ready: boolean }
const id = location.pathname.split('/').filter(Boolean)[1]
const title = id === 'media' ? 'AI短剧工作台' : 'AI剧工作台'
const button = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800'

/** 直接嵌入原应用，服务不可用时显示明确状态并提供重新连接入口。 */
function LaunchApp() {
  const [status, setStatus] = useState<Status>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const appFrame = useRef<HTMLIFrameElement>(null)
  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError('')
    try {
      const response = await fetch('/studio-projects/integrations', { signal, cache: 'no-store' })
      if (!response.ok) throw new Error('无法读取工作室应用状态。')
      const results: Status[] = await response.json()
      const current = results.find(item => item.id === id)
      if (!current || !['http:', 'https:'].includes(new URL(current.url).protocol)) throw new Error('应用连接配置无效。')
      setStatus(current)
    } catch (error) {
      if (!signal?.aborted) setError(error instanceof Error ? error.message : '应用连接失败。')
    } finally { if (!signal?.aborted) setLoading(false) }
  }, [])
  useEffect(() => { const controller = new AbortController(); void refresh(controller.signal); return () => controller.abort() }, [refresh])
  useEffect(() => {
    if (id !== 'media' || !status?.ready) return
    const appOrigin = new URL(status.url).origin
    const pending = new Set<string>()
    const receive = (event: MessageEvent) => {
      const data = event.data
      if (event.source === window.parent && event.origin === location.origin && ['dsh:studio:resume', 'dsh:studio:state'].includes(data?.type)) {
        appFrame.current?.contentWindow?.postMessage(data, appOrigin)
      } else if (event.source === appFrame.current?.contentWindow && event.origin === appOrigin && ['dsh:studio:discuss', 'dsh:studio:session'].includes(data?.type)
        && typeof data.requestId === 'string' && /^[a-f0-9-]{36}$/.test(data.requestId)
        && (data.type === 'dsh:studio:session' || (typeof data.text === 'string' && data.text.trim() && data.text.length <= 100000))) {
        if (pending.size >= 64) pending.delete(pending.values().next().value!)
        pending.add(data.requestId)
        window.parent.postMessage({ type: data.type, requestId: data.requestId, channelId: data.channelId, text: data.text, action: data.action, directory: data.directory, canvasId: data.canvasId, modelChoice: data.modelChoice }, location.origin)
      } else if (event.source === window.parent && event.origin === location.origin && ['dsh:studio:discussionResult', 'dsh:studio:sessionResult'].includes(data?.type) && pending.delete(data.requestId)) {
        appFrame.current?.contentWindow?.postMessage(data, appOrigin)
      }
    }
    window.addEventListener('message', receive)
    return () => { window.removeEventListener('message', receive); pending.clear() }
  }, [status])
  return <div data-studio-loading={loading ? 'true' : 'false'} className="relative flex h-screen flex-col overflow-hidden">
    {status?.ready && id !== 'media' && <details className="absolute right-28 top-3 z-10 text-sm">
      <summary aria-label="工作台菜单" className={button + ' list-none shadow-sm'}>⋯</summary>
      <nav aria-label="工作台操作" className="absolute right-0 mt-1 flex w-44 flex-col gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
        <button className={button} disabled={loading} onClick={() => { void refresh() }}>重新连接</button>
        <a className={button} href={status.url + (id === 'film' ? '/drama' : '/#/home')} target="_blank" rel="noreferrer">独立打开 ↗</a>
        {id === 'media' && <a className={button} href="/studio-projects/media?legacy=1">旧选题数据</a>}
      </nav>
    </details>}
    {status?.ready ? <iframe data-studio-app ref={appFrame} title={title + '原应用'} src={status.entryUrl} className="min-h-0 w-full flex-1 border-0 bg-white" allow="clipboard-read; clipboard-write; fullscreen; autoplay" /> :
      <main className="grid min-h-0 flex-1 place-items-center overflow-auto p-6"><section className="max-w-xl rounded-2xl border border-slate-200 bg-white p-7 dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-xl font-semibold">{loading ? '正在打开' + title : '工作台暂未连接'}</h1>
        <p className="mt-3 text-sm leading-7 text-slate-500">{error || '请确认本机工作室服务已经启动，再重新连接。'}</p>
        <button className={button + ' mt-4'} disabled={loading} onClick={() => { void refresh() }}>重新连接</button>
        <details className="mt-5 text-sm"><summary className="font-medium">启动帮助</summary><code className="mt-3 block overflow-auto rounded-lg bg-slate-100 p-3 dark:bg-slate-950">pnpm run studio:apps</code><p className="mt-3 text-xs leading-6 text-slate-500">在 Harness 项目目录运行。AI 生成需要配置有效模型。</p></details>
      </section></main>}
  </div>
}
createRoot(document.getElementById('root')!).render(<LaunchApp />)

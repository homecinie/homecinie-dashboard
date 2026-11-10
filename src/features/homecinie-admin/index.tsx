import { useCallback, useEffect, useState } from 'react'
import { Activity, Ban, RefreshCw, Server } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'

type Metrics = {
  status: string
  uptimeSeconds: number
  checkedAt: string
  services: Record<string, { status: string; latencyMs?: number | null }>
  streaming: { rangeRequests: boolean; acceptedRangeUnit: string }
  requests: { retainedLogs: number; blockedIps: number }
}
type Log = {
  id: string
  timestamp: string
  level: string
  method: string
  path: string
  status: number
  ip: string
  durationMs: number
}
type BlockedIp = { ip: string; createdAt: string; reason?: string }

const API_BASE = (import.meta.env.VITE_HOMECINIE_API_URL || '/api').replace(
  /\/$/,
  ''
)
const TOKEN_KEY = 'homecinie-admin-jwt'

export function HomecinieAdmin() {
  const [token, setToken] = useState(() =>
    typeof sessionStorage === 'undefined'
      ? ''
      : sessionStorage.getItem(TOKEN_KEY) || ''
  )
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [logs, setLogs] = useState<Log[]>([])
  const [blockedIps, setBlockedIps] = useState<BlockedIp[]>([])
  const [ip, setIp] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const request = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const response = await fetch(`${API_BASE}/admin${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...init?.headers,
        },
      })
      if (!response.ok)
        throw new Error(`API ${response.status}: ${await response.text()}`)
      return response.json() as Promise<T>
    },
    [token]
  )

  const refresh = useCallback(async () => {
    if (!token) return
    setBusy(true)
    try {
      const [nextMetrics, nextLogs, nextBlocked] = await Promise.all([
        request<Metrics>('/metrics'),
        request<Log[]>('/logs?limit=100'),
        request<BlockedIp[]>('/ip-blacklist'),
      ])
      setMetrics(nextMetrics)
      setLogs(nextLogs)
      setBlockedIps(nextBlocked)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Falha ao consultar API'
      )
    } finally {
      setBusy(false)
    }
  }, [request, token])

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0)
    return () => window.clearTimeout(timer)
  }, [refresh])

  async function addIp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      await request('/ip-blacklist', {
        method: 'POST',
        body: JSON.stringify({ ip, reason }),
      })
      setIp('')
      setReason('')
      toast.success('IP bloqueado')
      await refresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Falha ao bloquear IP'
      )
    }
  }

  async function removeIp(address: string) {
    try {
      await request(`/ip-blacklist/${encodeURIComponent(address)}`, {
        method: 'DELETE',
      })
      toast.success('IP desbloqueado')
      await refresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Falha ao desbloquear IP'
      )
    }
  }

  const saveToken = () => {
    if (token) sessionStorage.setItem(TOKEN_KEY, token)
    else sessionStorage.removeItem(TOKEN_KEY)
    void refresh()
  }

  return (
    <>
      <Header>
        <Search />
        <div className='ms-auto flex items-center gap-2'>
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>
      <Main>
        <div className='mb-5 flex flex-wrap items-center justify-between gap-3'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>
              HOME CINIE · Administração
            </h1>
            <p className='text-muted-foreground'>
              Métricas da API, logs de requisição e firewall de IP.
            </p>
          </div>
          <Button
            variant='outline'
            onClick={() => void refresh()}
            disabled={busy}
          >
            <RefreshCw className={busy ? 'animate-spin' : ''} /> Atualizar
          </Button>
        </div>
        <Card className='mb-5'>
          <CardHeader>
            <CardTitle>Conexão administrativa</CardTitle>
          </CardHeader>
          <CardContent className='flex flex-col gap-3 sm:flex-row sm:items-end'>
            <div className='grid flex-1 gap-2'>
              <Label htmlFor='api-url'>URL base da API</Label>
              <Input
                id='api-url'
                value={API_BASE || '(mesma origem /api)'}
                readOnly
              />
            </div>
            <div className='grid flex-[2] gap-2'>
              <Label htmlFor='admin-token'>
                JWT Supabase (mantido nesta aba)
              </Label>
              <Input
                id='admin-token'
                type='password'
                autoComplete='off'
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder='Cole um access token de administrador'
              />
            </div>
            <Button onClick={saveToken}>Conectar</Button>
          </CardContent>
        </Card>
        {!token ? (
          <Card>
            <CardContent className='py-8 text-center text-muted-foreground'>
              Informe um JWT de administrador para consultar os dados.
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue='overview' className='space-y-4'>
            <TabsList>
              <TabsTrigger value='overview'>Visão geral</TabsTrigger>
              <TabsTrigger value='logs'>Logs ({logs.length})</TabsTrigger>
              <TabsTrigger value='firewall'>
                Firewall ({blockedIps.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value='overview' className='space-y-4'>
              <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
                <Metric
                  title='API'
                  value={metrics?.status ?? '—'}
                  icon={<Activity />}
                />
                <Metric
                  title='Uptime'
                  value={
                    metrics
                      ? `${Math.floor(metrics.uptimeSeconds / 3600)}h ${Math.floor((metrics.uptimeSeconds % 3600) / 60)}m`
                      : '—'
                  }
                  icon={<Server />}
                />
                <Metric
                  title='Logs em memória'
                  value={metrics?.requests.retainedLogs ?? '—'}
                  icon={<Activity />}
                />
                <Metric
                  title='IPs bloqueados'
                  value={metrics?.requests.blockedIps ?? '—'}
                  icon={<Ban />}
                />
              </div>
              <Card>
                <CardHeader>
                  <CardTitle>Streaming</CardTitle>
                </CardHeader>
                <CardContent>
                  <p>
                    {metrics?.streaming.rangeRequests
                      ? `Range requests habilitados (${metrics.streaming.acceptedRangeUnit})`
                      : 'Range requests indisponíveis'}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Serviços</CardTitle>
                </CardHeader>
                <CardContent className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
                  {Object.entries(metrics?.services ?? {}).map(
                    ([name, service]) => (
                      <div className='rounded-lg border p-4' key={name}>
                        <p className='font-medium'>{serviceName(name)}</p>
                        <p className='text-sm text-muted-foreground'>
                          {service.status}
                          {service.latencyMs != null
                            ? ` · ${service.latencyMs} ms`
                            : ''}
                        </p>
                      </div>
                    )
                  )}
                  {!metrics && (
                    <p className='text-muted-foreground'>
                      Sem dados de monitoramento.
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value='logs'>
              <Card>
                <CardHeader>
                  <CardTitle>
                    Requisições recentes (máximo 1000 em RAM)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Nível</TableHead>
                        <TableHead>Método</TableHead>
                        <TableHead>Rota</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>IP</TableHead>
                        <TableHead>Duração</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell>
                            {new Date(log.timestamp).toLocaleString()}
                          </TableCell>
                          <TableCell>{log.level}</TableCell>
                          <TableCell>{log.method}</TableCell>
                          <TableCell className='max-w-72 truncate'>
                            {log.path}
                          </TableCell>
                          <TableCell>{log.status}</TableCell>
                          <TableCell>{log.ip}</TableCell>
                          <TableCell>{log.durationMs} ms</TableCell>
                        </TableRow>
                      ))}
                      {!logs.length && (
                        <TableRow>
                          <TableCell
                            colSpan={7}
                            className='text-center text-muted-foreground'
                          >
                            Nenhum log disponível.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value='firewall' className='space-y-4'>
              <Card>
                <CardHeader>
                  <CardTitle>Bloquear IP</CardTitle>
                </CardHeader>
                <CardContent>
                  <form
                    onSubmit={addIp}
                    className='grid gap-3 sm:grid-cols-[1fr_2fr_auto]'
                  >
                    <div className='grid gap-2'>
                      <Label htmlFor='ip'>Endereço IP</Label>
                      <Input
                        id='ip'
                        value={ip}
                        onChange={(event) => setIp(event.target.value)}
                        placeholder='203.0.113.10'
                        required
                      />
                    </div>
                    <div className='grid gap-2'>
                      <Label htmlFor='reason'>Motivo (opcional)</Label>
                      <Input
                        id='reason'
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                      />
                    </div>
                    <Button className='self-end' type='submit'>
                      Bloquear IP
                    </Button>
                  </form>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>IPs bloqueados</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>IP</TableHead>
                        <TableHead>Motivo</TableHead>
                        <TableHead>Bloqueado em</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {blockedIps.map((entry) => (
                        <TableRow key={entry.ip}>
                          <TableCell>{entry.ip}</TableCell>
                          <TableCell>{entry.reason || '—'}</TableCell>
                          <TableCell>
                            {new Date(entry.createdAt).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant='outline'
                              size='sm'
                              onClick={() => void removeIp(entry.ip)}
                            >
                              Desbloquear
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {!blockedIps.length && (
                        <TableRow>
                          <TableCell
                            colSpan={4}
                            className='text-center text-muted-foreground'
                          >
                            Nenhum IP bloqueado.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
        <p className='mt-4 text-xs text-muted-foreground'>
          Última atualização:{' '}
          {metrics?.checkedAt
            ? new Date(metrics.checkedAt).toLocaleString()
            : '—'}{' '}
          · Os dados de logs e firewall são voláteis e reiniciam com o processo
          da API.
        </p>
      </Main>
    </>
  )
}

function Metric({
  title,
  value,
  icon,
}: {
  title: string
  value: string | number
  icon: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between pb-2'>
        <CardTitle className='text-sm font-medium'>{title}</CardTitle>
        <span className='text-muted-foreground [&_svg]:size-4'>{icon}</span>
      </CardHeader>
      <CardContent>
        <p className='text-2xl font-bold'>{value}</p>
      </CardContent>
    </Card>
  )
}

function serviceName(key: string) {
  return (
    (
      {
        database: 'PostgreSQL / Prisma',
        storageVolume: 'Volume local',
        alexhost: 'VPS Alexhost',
        mediaStorage: 'Storage de mídia',
      } as Record<string, string>
    )[key] ?? key
  )
}

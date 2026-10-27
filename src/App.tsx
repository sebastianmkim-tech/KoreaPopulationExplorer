import { useEffect, useMemo, useState } from 'react'

type Region = {
  id: string
  name: string
  parent: string
  label: string
  values: Record<string, number | null>
}

const BLUE = '#356a9a'
const COLORS = ['#356a9a', '#8a6f52', '#5f8876', '#9a6572']
const majorSuffixes = ['특별시', '광역시', '특별자치시', '특별자치도', '도']
const number = new Intl.NumberFormat('ko-KR')

function parseCsv(text: string) {
  const rows = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => Array.from(line.matchAll(/(?:^|,)(?:"([^"]*)"|([^,]*))/g), (m) => m[1] ?? m[2]))
  const years = rows[0].slice(1).sort((a, b) => Number(a) - Number(b))
  let parent = ''
  const regions: Region[] = []
  rows.slice(1).forEach((row, index) => {
    const name = row[0]?.trim()
    const rawValues = Object.fromEntries(
      rows[0].slice(1).map((year, i) => {
        const raw = row[i + 1]?.replaceAll(',', '').trim()
        return [year, raw && raw !== '-' && !Number.isNaN(Number(raw)) ? Number(raw) : null]
      }),
    )
    if (!name || !Object.values(rawValues).some((value) => value !== null)) return
    const isMajor = name === '전국' || majorSuffixes.some((suffix) => name.endsWith(suffix))
    if (isMajor) parent = name
    const label = isMajor ? name : `${name} · ${parent}`
    regions.push({ id: `${index}-${parent}-${name}`, name, parent, label, values: rawValues })
  })
  return { years, regions }
}

function formatPeriod(period: string) {
  return period.includes('.') ? `${period.replace('.', '년 ')}월` : `${period}년`
}

function SearchSelect({
  regions,
  selected,
  onSelect,
}: {
  regions: Region[]
  selected: Region
  onSelect: (region: Region) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const matches = regions.filter((r) => r.label.toLowerCase().includes(query.toLowerCase())).slice(0, 10)
  return (
    <div className="search-select">
      <label htmlFor="region-search">지역 선택</label>
      <div className="search-wrap">
        <span className="search-icon" aria-hidden="true">⌕</span>
        <input
          id="region-search"
          value={open ? query : selected.label}
          onFocus={() => {
            setQuery('')
            setOpen(true)
          }}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          placeholder="시·군·구 검색"
          autoComplete="off"
        />
        <span className="chevron" aria-hidden="true">⌄</span>
        {open && (
          <div className="search-menu">
            {matches.length ? (
              matches.map((region) => (
                <button
                  key={region.id}
                  type="button"
                  onMouseDown={() => {
                    onSelect(region)
                    setOpen(false)
                  }}
                >
                  <span>{region.name}</span>
                  <small>{region.parent === region.name ? '광역 행정구역' : region.parent}</small>
                </button>
              ))
            ) : (
              <p>검색 결과가 없습니다.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function LineChart({
  series,
  years,
  normalized = false,
}: {
  series: { region: Region; color: string }[]
  years: string[]
  normalized?: boolean
}) {
  const width = 900
  const height = 310
  const pad = { left: 76, right: 22, top: 20, bottom: 52 }
  const allValues = series.flatMap(({ region }) => years.map((year) => region.values[year]).filter((v): v is number => v !== null))
  const min = normalized ? 0 : Math.min(...allValues) * 0.96
  const max = normalized ? 1 : Math.max(...allValues) * 1.04
  const x = (index: number) => pad.left + (index * (width - pad.left - pad.right)) / Math.max(years.length - 1, 1)
  const y = (value: number) => pad.top + ((max - value) * (height - pad.top - pad.bottom)) / Math.max(max - min, 1)
  const ticks = Array.from({ length: 5 }, (_, i) => min + ((max - min) * i) / 4)

  const normalizedValue = (region: Region, year: string) => {
    const values = years.map((item) => region.values[item]).filter((v): v is number => v !== null)
    const lo = Math.min(...values)
    const hi = Math.max(...values)
    const value = region.values[year]
    return value === null ? null : hi === lo ? 0.5 : (value - lo) / (hi - lo)
  }

  return (
    <div className="chart-scroller">
      <svg className="line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={normalized ? '지역별 정규화 인구 추이' : '선택 지역 인구 추이'}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} className="grid" />
            <text x={pad.left - 12} y={y(tick) + 4} textAnchor="end" className="axis">
              {normalized ? tick.toFixed(2) : tick >= 1_000_000 ? `${(tick / 1_000_000).toFixed(1)}M` : `${Math.round(tick / 1000)}K`}
            </text>
          </g>
        ))}
        {years.map((year, i) => (
          <text key={year} x={x(i)} y={height - 18} textAnchor="middle" className="axis">
            {year.includes('.') ? year.slice(2) : year}
          </text>
        ))}
        {series.map(({ region, color }) => {
          const points = years
            .map((year, i) => ({ year, value: normalized ? normalizedValue(region, year) : region.values[year], i }))
            .filter((point): point is { year: string; value: number; i: number } => point.value !== null)
          return (
            <g key={region.id}>
              <polyline points={points.map((p) => `${x(p.i)},${y(p.value)}`).join(' ')} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" />
              {points.map((point) => (
                <circle key={point.year} cx={x(point.i)} cy={y(point.value)} r="5" fill="white" stroke={color} strokeWidth="3" tabIndex={0}>
                  <title>{`${region.label} · ${formatPeriod(point.year)} · ${normalized ? point.value.toFixed(3) : `${number.format(point.value)}명`}`}</title>
                </circle>
              ))}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function BarChart({ regions, year }: { regions: Region[]; year: string }) {
  const data = regions
    .filter((region) => region.parent !== region.name && region.values[year] !== null)
    .sort((a, b) => (b.values[year] ?? 0) - (a.values[year] ?? 0))
    .slice(0, 12)
  const max = Math.max(...data.map((region) => region.values[year] ?? 0))
  return (
    <div className="bars" role="img" aria-label={`${formatPeriod(year)} 행정구역 인구 상위 12곳`}>
      {data.map((region, index) => (
        <div className="bar-row" key={region.id}>
          <span className="bar-rank">{String(index + 1).padStart(2, '0')}</span>
          <span className="bar-label" title={region.label}>{region.name}<small>{region.parent}</small></span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${((region.values[year] ?? 0) / max) * 100}%` }}>
              <span>{number.format(region.values[year] ?? 0)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function App() {
  const [data, setData] = useState<{ years: string[]; regions: Region[] } | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [year, setYear] = useState('')
  const [comparisonIds, setComparisonIds] = useState<string[]>([])

  useEffect(() => {
    fetch('/population.csv')
      .then((response) => response.text())
      .then((text) => {
        const parsed = parseCsv(text)
        const initial = parsed.regions.find((r) => r.name === '서울특별시') ?? parsed.regions[0]
        const second = parsed.regions.find((r) => r.name === '부산광역시')
        setData(parsed)
        setSelectedId(initial.id)
        setComparisonIds([initial.id, second?.id].filter(Boolean) as string[])
        setYear(parsed.years.at(-1) ?? '')
      })
  }, [])

  const selected = data?.regions.find((region) => region.id === selectedId)
  const available = useMemo(
    () => data && selected ? data.years.filter((item) => selected.values[item] !== null) : [],
    [data, selected],
  )
  if (!data || !selected) return <main className="loading">데이터를 불러오는 중입니다…</main>
  const firstYear = available[0]
  const lastYear = available.at(-1)!
  const first = selected.values[firstYear]!
  const latest = selected.values[lastYear]!
  const change = latest - first
  const comparisonSeries = comparisonIds
    .map((id, index) => ({ region: data.regions.find((r) => r.id === id)!, color: COLORS[index] }))
    .filter((item) => item.region)

  return (
    <main>
      <header className="topbar">
        <div className="brand-mark">KP</div>
        <div className="brand">Korea Population Explorer</div>
        <div className="source-pill"><span /> 주민등록 인구 데이터</div>
      </header>

      <section className="hero">
        <p className="eyebrow">대한민국 인구 데이터</p>
        <h1>숫자로 읽는<br /><em>우리 지역의 변화.</em></h1>
        <p className="intro">전국 시·군·구의 등록 인구 변화를 탐색하고,<br className="desktop-break" /> 지역별 흐름을 한눈에 비교해 보세요.</p>
        <SearchSelect regions={data.regions} selected={selected} onSelect={(region) => setSelectedId(region.id)} />
      </section>

      <section className="content">
        <div className="section-heading">
          <div><p className="section-number">01 / OVERVIEW</p><h2>{selected.label}</h2></div>
          <p>{formatPeriod(firstYear)} — {formatPeriod(lastYear)}</p>
        </div>
        <div className="stats">
          <article><p>최신 인구</p><strong>{number.format(latest)}</strong><span>명 · {formatPeriod(lastYear)}</span></article>
          <article><p>최초 인구</p><strong>{number.format(first)}</strong><span>명 · {formatPeriod(firstYear)}</span></article>
          <article><p>기간 내 변화</p><strong className={change < 0 ? 'negative' : ''}>{change > 0 ? '+' : ''}{number.format(change)}</strong><span>명 · {change >= 0 ? '증가' : '감소'} {Math.abs((change / first) * 100).toFixed(1)}%</span></article>
        </div>

        <article className="panel">
          <div className="panel-head"><div><p className="section-number">POPULATION TREND</p><h3>인구 변화 추이</h3></div><div className="legend"><i style={{ background: BLUE }} />{selected.name}</div></div>
          <LineChart series={[{ region: selected, color: BLUE }]} years={available} />
          <p className="chart-note">단위: 명 · 점에 마우스를 올리면 상세 값을 확인할 수 있습니다.</p>
        </article>

        <div className="section-heading comparison-title">
          <div><p className="section-number">02 / COMPARE</p><h2>지역별 인구 비교</h2></div>
          <label className="year-select">기준 시점<select value={year} onChange={(e) => setYear(e.target.value)}>{data.years.map((item) => <option key={item}>{item}</option>)}</select></label>
        </div>
        <article className="panel">
          <div className="panel-head"><div><p className="section-number">REGIONAL COMPARISON</p><h3>{formatPeriod(year)} 인구 상위 지역</h3></div><span className="muted">시·군·구 상위 12곳</span></div>
          <BarChart regions={data.regions} year={year} />
          <p className="chart-note">단위: 명 · 광역 행정구역 합계는 순위에서 제외했습니다.</p>
        </article>

        <div className="section-heading comparison-title">
          <div><p className="section-number">03 / NORMALIZED</p><h2>상대적 변화 비교</h2></div>
          <p>지역별 최솟값 0 · 최댓값 1</p>
        </div>
        <article className="panel">
          <div className="panel-head normalized-head">
            <div><p className="section-number">NORMALIZED TRENDS</p><h3>정규화 인구 추이</h3></div>
            <div className="region-chips">
              {comparisonSeries.map(({ region, color }) => <button key={region.id} onClick={() => setComparisonIds((ids) => ids.length > 1 ? ids.filter((id) => id !== region.id) : ids)}><i style={{ background: color }} />{region.name} ×</button>)}
              {comparisonIds.length < 4 && <select aria-label="비교 지역 추가" value="" onChange={(e) => e.target.value && setComparisonIds((ids) => [...ids, e.target.value])}><option value="">+ 지역 추가</option>{data.regions.filter((r) => !comparisonIds.includes(r.id)).map((r) => <option value={r.id} key={r.id}>{r.label}</option>)}</select>}
            </div>
          </div>
          <LineChart series={comparisonSeries} years={data.years} normalized />
          <p className="chart-note">각 지역의 관측 기간 내 최솟값과 최댓값을 기준으로 정규화했습니다.</p>
        </article>
      </section>

      <footer><div className="brand-mark">KP</div><p>출처: 업로드된 주민등록 인구 CSV · 결측값(–)은 시각화에서 제외</p><span>2019—2026</span></footer>
    </main>
  )
}

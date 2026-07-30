'use client'
import { useEffect, useRef } from 'react'
import { Chart, ChartConfiguration, registerables } from 'chart.js'

Chart.register(...registerables)

interface Props {
  config: ChartConfiguration
  height?: number
  ariaLabel: string
}

// Wrapper mỏng quanh Chart.js (không dùng react-chartjs-2 để khỏi thêm phụ thuộc) — tạo/instance
// lại chart mỗi khi `config` đổi tham chiếu, huỷ instance cũ trước để tránh rò rỉ canvas context.
export function ChartCanvas({ config, height = 220, ariaLabel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    chartRef.current = new Chart(canvasRef.current, config)
    return () => {
      chartRef.current?.destroy()
      chartRef.current = null
    }
  }, [config])

  return (
    <div style={{ position: 'relative', height }}>
      <canvas ref={canvasRef} role="img" aria-label={ariaLabel} />
    </div>
  )
}

import { NextResponse } from 'next/server'
import { generateTemplate } from '@/lib/excel'

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(arrayBuffer).set(bytes)
  return arrayBuffer
}

export async function GET() {
  const buffer = generateTemplate()
  return new NextResponse(toArrayBuffer(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="import_template.xlsx"',
    },
  })
}

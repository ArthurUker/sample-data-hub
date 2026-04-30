// Static page — ID read client-side via ?id= query param
import { Suspense } from 'react'
import SampleDetailClient from '../[id]/sample-detail-client'

export default function SampleDetailPage() {
  return (
    <Suspense>
      <SampleDetailClient />
    </Suspense>
  )
}

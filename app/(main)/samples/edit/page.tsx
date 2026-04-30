// Static page — ID read client-side via ?id= query param
import { Suspense } from 'react'
import EditSampleClient from '../[id]/edit/edit-sample-client'

export default function EditSamplePage() {
  return (
    <Suspense>
      <EditSampleClient />
    </Suspense>
  )
}

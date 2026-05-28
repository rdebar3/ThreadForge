import { Suspense } from 'react'
import SuccessContent from './SuccessContent'

function Loading() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
        <p className="text-zinc-400">Verifying your payment...</p>
      </div>
    </div>
  )
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SuccessContent />
    </Suspense>
  )
}

import Link from 'next/link'

export default function RefundPolicy() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/" className="text-sm text-zinc-400 hover:text-white">← Back to ThreadForge</Link>
        
        <h1 className="text-4xl font-semibold tracking-tighter mt-8 mb-8">Refund Policy</h1>
        
        <div className="prose prose-invert max-w-none text-zinc-300 space-y-6">
          <p className="text-sm text-zinc-500">Last updated: {new Date().toLocaleDateString()}</p>

          <h2 className="text-xl font-semibold text-white mt-8">One-Time Payment</h2>
          <p>ThreadForge offers a <strong>$9 one-time payment</strong> for unlimited access.</p>

          <h2 className="text-xl font-semibold text-white mt-8">Refund Eligibility</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>Refunds are available within <strong>7 days</strong> of purchase if you have not used the unlimited feature significantly.</li>
            <li>Once you have generated more than 10 threads after purchasing, you are no longer eligible for a refund.</li>
            <li>Technical issues preventing access may qualify for a refund at our discretion.</li>
          </ul>

          <h2 className="text-xl font-semibold text-white mt-8">How to Request a Refund</h2>
          <p>Email <a href="mailto:hello@threadforge.app" className="text-white underline">hello@threadforge.app</a> with your Stripe receipt or email address used for purchase.</p>

          <h2 className="text-xl font-semibold text-white mt-8">Contact</h2>
          <p>For any billing questions, reach out to us at the email above. We aim to respond within 48 hours.</p>
        </div>
      </div>
    </div>
  )
}
